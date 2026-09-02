import type {
  NodeDataByKind,
  NodeKind,
  RunSnapshot,
  RunStatus,
  WorkflowEdge,
  WorkflowGraph,
  WorkflowNode,
} from '@aiw/shared';
import type { RunManager } from '../src/core/executor.js';
import type { EditImageInput, GenerateImageInput, ImageProvider, ImageResult } from '../src/providers/types.js';

export class FakeProvider implements ImageProvider {
  readonly name = 'fake';
  supportsEdit = true;
  delayMs = 20;
  failMarker = '[fail]';

  activeCalls = 0;
  maxConcurrentCalls = 0;
  resultUrl: string | null = null;

  async generateImage(input: GenerateImageInput): Promise<ImageResult> {
    return this.call(input.prompt);
  }

  async editImage(input: EditImageInput): Promise<ImageResult> {
    return this.call(input.instruction);
  }

  private async call(text: string): Promise<ImageResult> {
    this.activeCalls += 1;
    this.maxConcurrentCalls = Math.max(this.maxConcurrentCalls, this.activeCalls);
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    this.activeCalls -= 1;
    if (text.includes(this.failMarker)) {
      throw new Error(`fake failure for: ${text}`);
    }
    return { kind: 'url', url: this.resultUrl ?? `fake://image(${text})` };
  }
}

export function node<K extends NodeKind>(id: string, kind: K, data: NodeDataByKind[K]): WorkflowNode {
  return { id, kind, data } as WorkflowNode;
}

export function edge(source: string, sourcePort: string, target: string, targetPort: string): WorkflowEdge {
  return { id: `${source}->${target}`, source, sourcePort, target, targetPort };
}

export function linearGraph(promptText = 'a red apple'): WorkflowGraph {
  return {
    nodes: [
      node('p1', 'prompt', { text: promptText }),
      node('g1', 'generate', { presetId: null }),
      node('r1', 'result', {}),
    ],
    edges: [edge('p1', 'text', 'g1', 'prompt'), edge('g1', 'image', 'r1', 'image')],
  };
}

export function branchingGraph(promptA = 'variant A', promptB = 'variant B'): WorkflowGraph {
  return {
    nodes: [
      node('p1', 'prompt', { text: promptA }),
      node('p2', 'prompt', { text: promptB }),
      node('ga', 'generate', { presetId: null }),
      node('gb', 'generate', { presetId: null }),
      node('ra', 'result', {}),
      node('rb', 'result', {}),
    ],
    edges: [
      edge('p1', 'text', 'ga', 'prompt'),
      edge('p2', 'text', 'gb', 'prompt'),
      edge('ga', 'image', 'ra', 'image'),
      edge('gb', 'image', 'rb', 'image'),
    ],
  };
}

export function waitForRun(
  manager: RunManager,
  runId: string,
  statuses: RunStatus[] = ['completed', 'failed'],
  timeoutMs = 5000,
): Promise<RunSnapshot> {
  return new Promise((resolve, reject) => {
    const check = (snapshot: RunSnapshot | undefined): boolean => {
      if (snapshot && statuses.includes(snapshot.status)) {
        cleanup();
        resolve(snapshot);
        return true;
      }
      return false;
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Run ${runId} did not reach [${statuses.join(', ')}] within ${timeoutMs}ms`));
    }, timeoutMs);

    const unsubscribe = manager.subscribe(runId, (snapshot) => check(snapshot));
    const cleanup = () => {
      clearTimeout(timer);
      unsubscribe?.();
    };

    check(manager.getSnapshot(runId));
  });
}
