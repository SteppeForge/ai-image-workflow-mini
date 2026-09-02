import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type {
  JobSnapshot,
  JobStatus,
  RunSnapshot,
  RunStatus,
  WorkflowGraph,
  WorkflowNode,
} from '@aiw/shared';
import { buildDependencyMap } from './graph.js';
import { ImageStore } from './image-store.js';
import { getPreset } from './presets.js';
import { buildGenerateRequest } from './request-builder.js';
import type { ImageProvider, ImageResult } from '../providers/types.js';

interface NodeOutput {
  text?: string;
  image?: string;
}

interface JobState {
  nodeId: string;
  status: JobStatus;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  output: NodeOutput | null;
}

export type RetryResult =
  | { ok: true }
  | { ok: false; code: 'not-found' | 'invalid-state'; error: string };

interface RunState {
  id: string;
  status: RunStatus;
  createdAt: string;
  graph: WorkflowGraph;
  deps: Map<string, string[]>;
  jobs: Map<string, JobState>;
  events: EventEmitter;
}

/**
 * Выполнение графа, управляемое зависимостями: нода стартует, когда все
 * её upstream в success. Независимые ветки запускаются в одном тике
 * без await — это и даёт параллелизм. Словари статусов job/run — из ТЗ
 * (idle — клиентское состояние ноды до первого запуска).
 */
export class RunManager {
  private readonly runs = new Map<string, RunState>();

  constructor(
    private readonly provider: ImageProvider,
    private readonly imageStore = new ImageStore(),
    private readonly jobTimeoutMs = envTimeoutMs(),
  ) {}

  createRun(graph: WorkflowGraph): string {
    const id = randomUUID();
    const run: RunState = {
      id,
      status: 'queued',
      createdAt: new Date().toISOString(),
      graph,
      deps: buildDependencyMap(graph),
      jobs: new Map(
        graph.nodes.map((node) => [
          node.id,
          { nodeId: node.id, status: 'queued', startedAt: null, finishedAt: null, error: null, output: null },
        ]),
      ),
      events: new EventEmitter(),
    };
    this.runs.set(id, run);
    // runId отдаётся сразу, выполнение — со следующего тика.
    queueMicrotask(() => this.start(run));
    return id;
  }

  getSnapshot(runId: string): RunSnapshot | undefined {
    const run = this.runs.get(runId);
    return run ? toSnapshot(run) : undefined;
  }

  subscribe(runId: string, listener: (snapshot: RunSnapshot) => void): (() => void) | undefined {
    const run = this.runs.get(runId);
    if (!run) return undefined;
    run.events.on('update', listener);
    return () => run.events.off('update', listener);
  }

  // Retry: error → queued, run снова running. Downstream так и ждёт в queued,
  // поэтому выполнение продолжается с места падения.
  retryNode(runId: string, nodeId: string): RetryResult {
    const run = this.runs.get(runId);
    if (!run) return { ok: false, code: 'not-found', error: `Run "${runId}" not found` };
    const job = run.jobs.get(nodeId);
    if (!job) return { ok: false, code: 'not-found', error: `Node "${nodeId}" not found in run` };
    if (job.status !== 'error') {
      return {
        ok: false,
        code: 'invalid-state',
        error: `Only failed nodes can be retried (current status: "${job.status}")`,
      };
    }
    Object.assign(job, { status: 'queued', startedAt: null, finishedAt: null, error: null });
    run.status = 'running';
    this.emit(run);
    this.tick(run);
    return { ok: true };
  }

  private start(run: RunState): void {
    run.status = 'running';
    this.emit(run);
    this.tick(run);
  }

  // Один проход планировщика: запустить все queued-ноды с готовыми
  // зависимостями. Запуски не ожидаются — ветки идут параллельно.
  private tick(run: RunState): void {
    const ready = run.graph.nodes.filter((node) => {
      const job = run.jobs.get(node.id);
      if (job?.status !== 'queued') return false;
      return (run.deps.get(node.id) ?? []).every((dep) => run.jobs.get(dep)?.status === 'success');
    });

    for (const node of ready) {
      void this.launch(run, node);
    }

    this.updateRunStatus(run);
  }

  private async launch(run: RunState, node: WorkflowNode): Promise<void> {
    const job = run.jobs.get(node.id);
    if (!job) return;
    Object.assign(job, { status: 'running', startedAt: new Date().toISOString() });
    this.emit(run);

    try {
      job.output = await this.executeNode(run, node);
      Object.assign(job, { status: 'success', finishedAt: new Date().toISOString() });
    } catch (err) {
      Object.assign(job, {
        status: 'error',
        finishedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
      });
    }
    this.emit(run);
    this.tick(run);
  }

  private async executeNode(run: RunState, node: WorkflowNode): Promise<NodeOutput> {
    switch (node.kind) {
      case 'prompt': {
        const text = node.data.text.trim();
        if (!text) throw new Error('Prompt text is empty');
        return { text };
      }
      case 'image-input': {
        const image = node.data.imageDataUrl;
        if (!image) throw new Error('No image uploaded');
        // В store — чтобы в снапшоты и SSE шла лёгкая ссылка, а не base64.
        const { bytes, contentType } = decodeDataUrl(image);
        return { image: `/images/${this.imageStore.save(bytes, contentType)}` };
      }
      case 'generate': {
        const prompt = this.inputFor(run, node.id, 'prompt')?.text;
        if (!prompt) throw new Error('Generate node received no prompt');
        const presetId = node.data.presetId;
        const preset = presetId ? getPreset(presetId) : null;
        if (presetId && !preset) throw new Error(`Preset "${presetId}" not found`);
        const request = buildGenerateRequest(prompt, preset ?? null, this.timeoutSignal());
        const result = await this.provider.generateImage(request);
        return { image: this.storeResult(result) };
      }
      case 'edit': {
        const image = this.inputFor(run, node.id, 'image')?.image;
        if (!image) throw new Error('Edit node received no image');
        const instruction = node.data.prompt.trim();
        if (!instruction) throw new Error('Edit instruction is empty');
        if (!this.provider.supportsEdit) {
          throw new Error(`Provider "${this.provider.name}" does not support image editing`);
        }
        const source = this.resolveImageBytes(image);
        const result = await this.provider.editImage({
          imageBytes: source.bytes,
          contentType: source.contentType,
          instruction,
          signal: this.timeoutSignal(),
        });
        return { image: this.storeResult(result) };
      }
      case 'result': {
        const image = this.inputFor(run, node.id, 'image')?.image;
        if (!image) throw new Error('Result node received no image');
        return { image };
      }
    }
  }

  private inputFor(run: RunState, nodeId: string, targetPort: string): NodeOutput | null {
    const edge = run.graph.edges.find((e) => e.target === nodeId && e.targetPort === targetPort);
    if (!edge) return null;
    return run.jobs.get(edge.source)?.output ?? null;
  }

  private timeoutSignal(): AbortSignal {
    return AbortSignal.timeout(this.jobTimeoutMs);
  }

  // Байты и data-URL (mock) сохраняются в ImageStore — снапшоты всегда несут
  // /images/<id>, не base64. Прочие URL (fake:// в тестах) проходят как есть.
  private storeResult(result: ImageResult): string {
    if (result.kind === 'url') {
      if (!result.url.startsWith('data:')) return result.url;
      const { bytes, contentType } = decodeDataUrl(result.url);
      return `/images/${this.imageStore.save(bytes, contentType)}`;
    }
    return `/images/${this.imageStore.save(result.bytes, result.contentType)}`;
  }

  private resolveImageBytes(image: string): { bytes: Buffer; contentType: string } {
    if (image.startsWith('data:')) return decodeDataUrl(image);
    const storeMatch = /^\/images\/(.+)$/.exec(image);
    if (storeMatch) {
      const stored = this.imageStore.get(storeMatch[1]);
      if (stored) return { bytes: stored.bytes, contentType: stored.contentType };
    }
    throw new Error('Unsupported image reference for editing');
  }

  private updateRunStatus(run: RunState): void {
    const jobs = [...run.jobs.values()];
    const previous = run.status;
    if (jobs.every((job) => job.status === 'success')) {
      run.status = 'completed';
    } else if (jobs.some((job) => job.status === 'error') && !jobs.some((job) => job.status === 'running')) {
      run.status = 'failed';
    }
    if (run.status !== previous) this.emit(run);
  }

  private emit(run: RunState): void {
    run.events.emit('update', toSnapshot(run));
  }
}

// Защита от NaN/отрицательного IMAGE_TIMEOUT_MS в окружении.
function envTimeoutMs(): number {
  const value = Number(process.env.IMAGE_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : 120_000;
}

function decodeDataUrl(dataUrl: string): { bytes: Buffer; contentType: string } {
  // data:[<mediatype>][;base64],<data>; mediatype может нести параметры (;charset=...).
  const match = /^data:([^,]*?)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error('Invalid data URL');
  const contentType = match[1]?.split(';')[0] || 'application/octet-stream';
  const bytes = match[2] ? Buffer.from(match[3], 'base64') : percentDecodeBytes(match[3]);
  return { bytes, contentType };
}

// Побайтовое percent-декодирование: decodeURIComponent трактует payload как
// UTF-8 и падает на бинарных последовательностях вроде %89 (первый байт PNG).
function percentDecodeBytes(text: string): Buffer {
  const out = Buffer.alloc(text.length);
  let length = 0;
  for (let i = 0; i < text.length; i += 1) {
    const hex = text.slice(i + 1, i + 3);
    if (text[i] === '%' && /^[0-9a-fA-F]{2}$/.test(hex)) {
      out[length] = Number.parseInt(hex, 16);
      i += 2;
    } else {
      out[length] = text.charCodeAt(i) & 0xff;
    }
    length += 1;
  }
  return out.subarray(0, length);
}

function toSnapshot(run: RunState): RunSnapshot {
  // Объект без прототипа: id нод — пользовательский ввод (__proto__ и т.п.).
  const jobs: Record<string, JobSnapshot> = Object.create(null) as Record<string, JobSnapshot>;
  for (const [nodeId, job] of run.jobs) {
    jobs[nodeId] = {
      nodeId,
      status: job.status,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      error: job.error,
      imageUrl: job.output?.image ?? null,
    };
  }
  return { runId: run.id, status: run.status, createdAt: run.createdAt, jobs };
}
