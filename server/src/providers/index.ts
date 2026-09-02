import { MockProvider } from './mock.js';
import { PollinationsProvider } from './pollinations.js';
import type { ImageProvider } from './types.js';

export function createProvider(): ImageProvider {
  const kind = process.env.IMAGE_PROVIDER ?? 'pollinations';
  switch (kind) {
    case 'pollinations':
      return new PollinationsProvider();
    case 'mock':
      return new MockProvider();
    default:
      throw new Error(`Unknown IMAGE_PROVIDER: "${kind}"`);
  }
}
