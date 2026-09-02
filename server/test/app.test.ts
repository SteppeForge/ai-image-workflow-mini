import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { RunManager } from '../src/core/executor.js';
import { ImageStore } from '../src/core/image-store.js';
import { FakeProvider, linearGraph, waitForRun } from './helpers.js';

interface TestContext {
  app: FastifyInstance;
  manager: RunManager;
  imageStore: ImageStore;
}

async function makeApp(): Promise<TestContext> {
  const imageStore = new ImageStore();
  const manager = new RunManager(new FakeProvider(), imageStore);
  const app = await buildApp(manager, imageStore, { logger: false });
  return { app, manager, imageStore };
}

describe('runs API', () => {
  it('POST /runs creates a run and GET /runs/:runId reports completion', async () => {
    const { app, manager } = await makeApp();

    const created = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: { graph: linearGraph('an apple') },
    });
    expect(created.statusCode).toBe(201);
    const { runId } = created.json<{ runId: string }>();
    expect(runId).toBeTruthy();

    await waitForRun(manager, runId, ['completed']);

    const snapshot = await app.inject({ method: 'GET', url: `/runs/${runId}` });
    expect(snapshot.statusCode).toBe(200);
    const body = snapshot.json<{ status: string; jobs: Record<string, { status: string }> }>();
    expect(body.status).toBe('completed');
    expect(body.jobs['r1']?.status).toBe('success');
  });

  it('POST /runs rejects an invalid graph with the error list', async () => {
    const { app } = await makeApp();

    const response = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: {
        graph: {
          nodes: [{ id: 'g1', kind: 'generate', data: { presetId: null } }],
          edges: [],
        },
      },
    });

    expect(response.statusCode).toBe(400);
    const { errors } = response.json<{ errors: string[] }>();
    expect(errors.some((e) => e.includes('required input "prompt"'))).toBe(true);
  });

  it('POST /runs rejects a body without a graph', async () => {
    const { app } = await makeApp();
    const response = await app.inject({ method: 'POST', url: '/runs', payload: {} });
    expect(response.statusCode).toBe(400);
  });

  it('POST /runs answers 400 (not 500) to malformed node entries', async () => {
    const { app } = await makeApp();
    const response = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: { graph: { nodes: [null], edges: [] } },
    });
    expect(response.statusCode).toBe(400);
  });

  it('GET /runs/:runId returns 404 for an unknown run', async () => {
    const { app } = await makeApp();
    const response = await app.inject({ method: 'GET', url: '/runs/missing' });
    expect(response.statusCode).toBe(404);
  });

  it('POST /runs answers 400 (not 500) to prototype-key node kinds', async () => {
    const { app } = await makeApp();
    const response = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: { graph: { nodes: [{ id: 'x1', kind: 'toString', data: {} }], edges: [] } },
    });
    expect(response.statusCode).toBe(400);
  });

  it('POST retry returns 404 for an unknown run', async () => {
    const { app } = await makeApp();
    const response = await app.inject({ method: 'POST', url: '/runs/missing/nodes/g1/retry' });
    expect(response.statusCode).toBe(404);
  });

  it('POST retry returns 400 for a node that did not fail', async () => {
    const { app, manager } = await makeApp();

    const created = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: { graph: linearGraph() },
    });
    const { runId } = created.json<{ runId: string }>();
    await waitForRun(manager, runId, ['completed']);

    const retry = await app.inject({ method: 'POST', url: `/runs/${runId}/nodes/g1/retry` });
    expect(retry.statusCode).toBe(400);
    expect(retry.json<{ error: string }>().error).toContain('Only failed nodes');
  });
});

describe('presets and images API', () => {
  it('GET /presets returns the catalog', async () => {
    const { app } = await makeApp();
    const response = await app.inject({ method: 'GET', url: '/presets' });
    expect(response.statusCode).toBe(200);
    const presets = response.json<{ id: string }[]>();
    expect(presets.length).toBeGreaterThan(0);
    expect(presets[0]).toHaveProperty('mainPrompt');
  });

  it('GET /references/:file serves preset reference images', async () => {
    const { app } = await makeApp();

    const found = await app.inject({ method: 'GET', url: '/references/ref-1.png' });
    expect(found.statusCode).toBe(200);
    expect(found.headers['content-type']).toContain('image/png');

    const traversal = await app.inject({ method: 'GET', url: '/references/..%2Fsecret.png' });
    expect(traversal.statusCode).toBe(404);
  });

  it('GET /images/:id serves stored bytes and 404s unknown ids', async () => {
    const { app, imageStore } = await makeApp();

    const id = imageStore.save(Buffer.from('fake-image'), 'image/png');
    const found = await app.inject({ method: 'GET', url: `/images/${id}` });
    expect(found.statusCode).toBe(200);
    expect(found.headers['content-type']).toContain('image/png');
    expect(found.rawPayload.toString()).toBe('fake-image');

    const missing = await app.inject({ method: 'GET', url: '/images/nope' });
    expect(missing.statusCode).toBe(404);
  });
});
