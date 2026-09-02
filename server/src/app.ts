import { readFile } from 'node:fs/promises';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { CreateRunRequest } from '@aiw/shared';
import { validateGraph } from './core/graph.js';
import { listPresets } from './core/presets.js';
import type { RunManager } from './core/executor.js';
import type { ImageStore } from './core/image-store.js';

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

// Фабрика отделена от bootstrap: тесты внедряют зависимости и работают без сети.
export async function buildApp(
  runManager: RunManager,
  imageStore: ImageStore,
  options: { logger?: boolean } = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? true,
    bodyLimit: 25 * 1024 * 1024, // data-URL картинок из Image Input
  });

  await app.register(cors, { origin: true });

  app.get('/health', () => ({ status: 'ok' }));

  app.get('/presets', () => listPresets());

  app.get<{ Params: { file: string } }>('/references/:file', async (request, reply) => {
    if (!/^[\w-]+\.png$/.test(request.params.file)) {
      return reply.status(404).send({ error: 'Reference not found' });
    }
    try {
      const bytes = await readFile(new URL(`../assets/references/${request.params.file}`, import.meta.url));
      return await reply.type('image/png').header('X-Content-Type-Options', 'nosniff').send(bytes);
    } catch {
      return reply.status(404).send({ error: 'Reference not found' });
    }
  });

  app.get<{ Params: { imageId: string } }>('/images/:imageId', (request, reply) => {
    const stored = imageStore.get(request.params.imageId);
    if (!stored) {
      return reply.status(404).send({ error: 'Image not found' });
    }
    // Имя с расширением — для скачивания: клиент не знает content-type заранее.
    const extension = IMAGE_EXTENSIONS[stored.contentType] ?? 'bin';
    return reply
      .type(stored.contentType)
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Disposition', `inline; filename="${request.params.imageId}.${extension}"`)
      .send(stored.bytes);
  });

  app.post<{ Body: CreateRunRequest }>('/runs', (request, reply) => {
    const graph = request.body?.graph;
    if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
      return reply.status(400).send({ errors: ['Body must contain a workflow graph'] });
    }
    const errors = validateGraph(graph);
    if (errors.length > 0) {
      return reply.status(400).send({ errors });
    }
    const runId = runManager.createRun(graph);
    return reply.status(201).send({ runId });
  });

  app.get<{ Params: { runId: string } }>('/runs/:runId', (request, reply) => {
    const snapshot = runManager.getSnapshot(request.params.runId);
    if (!snapshot) {
      return reply.status(404).send({ error: `Run "${request.params.runId}" not found` });
    }
    return snapshot;
  });

  app.get<{ Params: { runId: string } }>('/runs/:runId/events', (request, reply) => {
    const { runId } = request.params;
    const snapshot = runManager.getSnapshot(runId);
    if (!snapshot) {
      return reply.status(404).send({ error: `Run "${runId}" not found` });
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    let unsubscribe: (() => void) | undefined;
    const send = (data: { status: string }) => {
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      // completed больше не изменится (failed может — через retry), держать сокет
      // незачем; клиент на терминальном статусе не переподключается — цикла нет.
      if (data.status === 'completed') {
        unsubscribe?.();
        unsubscribe = undefined;
        reply.raw.end();
      }
    };

    send(snapshot);
    if (snapshot.status !== 'completed') {
      unsubscribe = runManager.subscribe(runId, send);
      request.raw.on('close', () => unsubscribe?.());
    }
  });

  app.post<{ Params: { runId: string; nodeId: string } }>(
    '/runs/:runId/nodes/:nodeId/retry',
    (request, reply) => {
      const result = runManager.retryNode(request.params.runId, request.params.nodeId);
      if (!result.ok) {
        return reply.status(result.code === 'not-found' ? 404 : 400).send({ error: result.error });
      }
      return { ok: true };
    },
  );

  return app;
}
