import { buildApp } from './app.js';
import { RunManager } from './core/executor.js';
import { ImageStore } from './core/image-store.js';
import { createProvider } from './providers/index.js';

try {
  process.loadEnvFile();
} catch {
  // .env опционален — работают переменные окружения и дефолты.
}

const PORT = Number(process.env.PORT ?? 3001);

const provider = createProvider();
const imageStore = new ImageStore();
const runManager = new RunManager(provider, imageStore);
const app = await buildApp(runManager, imageStore);

app.log.info(`Image provider: ${provider.name} (supportsEdit: ${provider.supportsEdit})`);

try {
  await app.listen({ port: PORT });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
