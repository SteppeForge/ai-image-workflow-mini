import { describe, expect, it } from 'vitest';
import { RunManager } from '../src/core/executor.js';
import { ImageStore } from '../src/core/image-store.js';
import { FakeProvider, branchingGraph, edge, linearGraph, node, waitForRun } from './helpers.js';

describe('RunManager', () => {
  it('executes scenario 1 (Prompt → Generate → Result) to completion', async () => {
    const manager = new RunManager(new FakeProvider());
    const runId = manager.createRun(linearGraph('a red apple'));

    const snapshot = await waitForRun(manager, runId);

    expect(snapshot.status).toBe('completed');
    expect(snapshot.jobs['p1']?.status).toBe('success');
    expect(snapshot.jobs['g1']?.status).toBe('success');
    expect(snapshot.jobs['r1']?.status).toBe('success');
    expect(snapshot.jobs['r1']?.imageUrl).toBe('fake://image(a red apple)');
  });

  it('respects dependencies: result starts only after generate finishes', async () => {
    const manager = new RunManager(new FakeProvider());
    const runId = manager.createRun(linearGraph());

    const snapshot = await waitForRun(manager, runId);

    const generate = snapshot.jobs['g1'];
    const result = snapshot.jobs['r1'];
    expect(generate?.finishedAt).not.toBeNull();
    expect(result?.startedAt).not.toBeNull();
    expect(Date.parse(result!.startedAt!)).toBeGreaterThanOrEqual(Date.parse(generate!.finishedAt!));
  });

  it('runs independent branches in parallel', async () => {
    const provider = new FakeProvider();
    provider.delayMs = 50;
    const manager = new RunManager(provider);
    const runId = manager.createRun(branchingGraph());

    const snapshot = await waitForRun(manager, runId);

    expect(snapshot.status).toBe('completed');
    // Оба вызова провайдера были в полёте одновременно.
    expect(provider.maxConcurrentCalls).toBe(2);
  });

  it('marks a failing node as error and the run as failed; downstream stays queued', async () => {
    const manager = new RunManager(new FakeProvider());
    const runId = manager.createRun(linearGraph('broken [fail] prompt'));

    const snapshot = await waitForRun(manager, runId, ['failed']);

    expect(snapshot.jobs['g1']?.status).toBe('error');
    expect(snapshot.jobs['g1']?.error).toContain('fake failure');
    expect(snapshot.jobs['r1']?.status).toBe('queued');
  });

  it('a failed branch does not block the parallel branch', async () => {
    const manager = new RunManager(new FakeProvider());
    const runId = manager.createRun(branchingGraph('ok branch', 'bad [fail] branch'));

    const snapshot = await waitForRun(manager, runId, ['failed']);

    expect(snapshot.jobs['ra']?.status).toBe('success');
    expect(snapshot.jobs['gb']?.status).toBe('error');
  });

  it('retry of a failed node resumes the run to completion', async () => {
    const provider = new FakeProvider();
    const manager = new RunManager(provider);
    const runId = manager.createRun(linearGraph('will [fail] first'));

    await waitForRun(manager, runId, ['failed']);

    // «Чиним» провайдер и повторяем только упавшую ноду.
    provider.failMarker = '\u0000never';
    const retry = manager.retryNode(runId, 'g1');
    expect(retry.ok).toBe(true);

    const snapshot = await waitForRun(manager, runId, ['completed']);
    expect(snapshot.jobs['g1']?.status).toBe('success');
    expect(snapshot.jobs['r1']?.status).toBe('success');
  });

  it('persists data-URL provider results as light /images links', async () => {
    const provider = new FakeProvider();
    provider.resultUrl = `data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}`;
    const imageStore = new ImageStore();
    const manager = new RunManager(provider, imageStore);
    const runId = manager.createRun(linearGraph('stored'));

    const snapshot = await waitForRun(manager, runId, ['completed']);

    const imageUrl = snapshot.jobs['g1']?.imageUrl ?? '';
    expect(imageUrl).toMatch(/^\/images\//);
    const stored = imageStore.get(imageUrl.replace('/images/', ''));
    expect(stored?.bytes.toString()).toBe('<svg/>');
    expect(stored?.contentType).toBe('image/svg+xml');
  });

  it('decodes percent-encoded (non-base64) data URLs, including binary bytes', async () => {
    const imageStore = new ImageStore();
    const manager = new RunManager(new FakeProvider(), imageStore);
    // %89 — первый байт PNG; decodeURIComponent на нём падает.
    const runId = manager.createRun({
      nodes: [node('i1', 'image-input', { imageDataUrl: 'data:image/png,%89PNG-rest' })],
      edges: [],
    });

    const snapshot = await waitForRun(manager, runId, ['completed']);

    const imageUrl = snapshot.jobs['i1']?.imageUrl ?? '';
    expect(imageUrl).toMatch(/^\/images\//);
    const stored = imageStore.get(imageUrl.replace('/images/', ''));
    expect(stored?.bytes[0]).toBe(0x89);
    expect(stored?.bytes.subarray(1).toString()).toBe('PNG-rest');
  });

  it('completes a graph made only of source nodes', async () => {
    const manager = new RunManager(new FakeProvider());
    const runId = manager.createRun({
      nodes: [node('p1', 'prompt', { text: 'alone' })],
      edges: [],
    });

    const snapshot = await waitForRun(manager, runId, ['completed']);
    expect(snapshot.jobs['p1']?.status).toBe('success');
  });

  it('a retry that fails again returns the run to failed', async () => {
    const manager = new RunManager(new FakeProvider());
    const runId = manager.createRun(linearGraph('still [fail] broken'));

    await waitForRun(manager, runId, ['failed']);
    // Провайдер не «починен» — повтор обязан упасть снова.
    expect(manager.retryNode(runId, 'g1').ok).toBe(true);

    const snapshot = await waitForRun(manager, runId, ['failed']);
    expect(snapshot.jobs['g1']?.status).toBe('error');
    expect(snapshot.jobs['r1']?.status).toBe('queued');
  });

  it('rejects retry of a node that is not in error state', async () => {
    const manager = new RunManager(new FakeProvider());
    const runId = manager.createRun(linearGraph());
    await waitForRun(manager, runId, ['completed']);

    const retry = manager.retryNode(runId, 'g1');
    expect(retry.ok).toBe(false);
    if (!retry.ok) expect(retry.error).toContain('Only failed nodes');
  });

  it('executes the edit scenario (Image Input → Edit → Result)', async () => {
    const manager = new RunManager(new FakeProvider());
    const runId = manager.createRun({
      nodes: [
        node('i1', 'image-input', { imageDataUrl: 'data:image/png;base64,AAA' }),
        node('e1', 'edit', { prompt: 'make it blue' }),
        node('r1', 'result', {}),
      ],
      edges: [edge('i1', 'image', 'e1', 'image'), edge('e1', 'image', 'r1', 'image')],
    });

    const snapshot = await waitForRun(manager, runId);
    expect(snapshot.status).toBe('completed');
    expect(snapshot.jobs['r1']?.imageUrl).toBe('fake://image(make it blue)');
  });

  it('fails the edit node when the provider does not support editing', async () => {
    const provider = new FakeProvider();
    provider.supportsEdit = false;
    const manager = new RunManager(provider);
    const runId = manager.createRun({
      nodes: [
        node('i1', 'image-input', { imageDataUrl: 'data:image/png;base64,AAA' }),
        node('e1', 'edit', { prompt: 'make it blue' }),
      ],
      edges: [edge('i1', 'image', 'e1', 'image')],
    });

    const snapshot = await waitForRun(manager, runId, ['failed']);
    expect(snapshot.jobs['e1']?.error).toContain('does not support image editing');
  });
});
