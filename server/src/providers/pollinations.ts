import type { EditImageInput, GenerateImageInput, ImageProvider, ImageResult } from './types.js';

const LEGACY_BASE = 'https://image.pollinations.ai';
const GEN_BASE = 'https://gen.pollinations.ai';
const IMAGE_SIZE = 768;
// Анонимный тариф: ~1 запрос / 15 с — параллельные ветки упираются в лимит.
const RATE_LIMIT_RETRY_DELAY_MS = 16_000;
const MAX_RETRY_AFTER_MS = 60_000;
// Потолок на скачанную картинку: внешний сервис не доверен.
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
// Только растр: внешний SVG может нести активное содержимое.
const RASTER_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

/**
 * Pollinations.AI: генерация — открытый GET-endpoint (FLUX), без ключа;
 * редактирование — kontext через gen.pollinations.ai, требует ключ.
 * Маппинг Request Builder: negativePrompt вклеивается в промпт («Avoid: ...»),
 * references txt2img-endpoint не принимает — ограничение описано в README.
 */
export class PollinationsProvider implements ImageProvider {
  readonly name = 'pollinations';
  readonly supportsEdit: boolean;

  constructor(private readonly apiKey = process.env.POLLINATIONS_API_KEY ?? '') {
    this.supportsEdit = this.apiKey !== '';
  }

  async generateImage(input: GenerateImageInput): Promise<ImageResult> {
    const prompt = input.negativePrompt
      ? `${input.prompt}. Avoid: ${input.negativePrompt}`
      : input.prompt;

    const url = new URL(`${LEGACY_BASE}/prompt/${encodeURIComponent(prompt)}`);
    url.searchParams.set('model', 'flux');
    url.searchParams.set('width', String(IMAGE_SIZE));
    url.searchParams.set('height', String(IMAGE_SIZE));
    url.searchParams.set('referrer', 'ai-image-workflow-mini');

    const headers: Record<string, string> = this.apiKey
      ? { Authorization: `Bearer ${this.apiKey}` }
      : {};
    const response = await this.fetchWithRetry(
      () => fetch(url, { headers, signal: input.signal }),
      input.signal,
      'generation',
    );
    return this.imageBytesFrom(response, 'generation');
  }

  async editImage(input: EditImageInput): Promise<ImageResult> {
    if (!this.supportsEdit) {
      throw new Error(
        'Image editing requires POLLINATIONS_API_KEY (free registration at enter.pollinations.ai)',
      );
    }

    const form = new FormData();
    // Копия в Uint8Array: Buffer может сидеть на SharedArrayBuffer, Blob такое не принимает.
    form.append('image', new Blob([Uint8Array.from(input.imageBytes)], { type: input.contentType }), 'input.png');
    form.append('prompt', input.instruction);
    form.append('model', 'kontext');

    const response = await this.fetchWithRetry(
      () =>
        fetch(`${GEN_BASE}/v1/images/edits`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.apiKey}` },
          body: form,
          signal: input.signal,
        }),
      input.signal,
      'edit',
    );

    let payload: { data?: { url?: string; b64_json?: string }[] };
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      throw new Error('Pollinations edit returned a non-JSON response');
    }
    const item = payload.data?.[0];
    if (item?.b64_json) {
      const bytes = Buffer.from(item.b64_json, 'base64');
      if (bytes.length > MAX_IMAGE_BYTES) {
        throw new Error('Pollinations edit returned an image larger than the allowed limit');
      }
      return { kind: 'bytes', bytes, contentType: 'image/png' };
    }
    if (item?.url) {
      // Скачиваем сами: хост/тип/размер проверяются, внешний URL не попадает
      // в снапшоты; redirect запрещён — защита от SSRF.
      const url = trustedImageUrl(item.url);
      const download = await this.fetchWithRetry(
        () => fetch(url, { signal: input.signal, redirect: 'error' }),
        input.signal,
        'edit download',
      );
      return this.imageBytesFrom(download, 'edit');
    }
    throw new Error('Pollinations edit: unexpected response format');
  }

  // Общая проверка ответа: растровый тип, лимит размера — потоково,
  // до размещения всего тела в памяти.
  private async imageBytesFrom(response: Response, what: string): Promise<ImageResult> {
    const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!RASTER_IMAGE_TYPES.has(contentType)) {
      throw new Error(`Pollinations ${what} returned unsupported content-type "${contentType}"`);
    }
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
      throw new Error(`Pollinations ${what} returned an image larger than the allowed limit`);
    }
    const bytes = await readBodyWithLimit(response, MAX_IMAGE_BYTES, what);
    return { kind: 'bytes', bytes, contentType };
  }

  // Один повтор после паузы на 429/5xx с учётом Retry-After.
  private async fetchWithRetry(
    doFetch: () => Promise<Response>,
    signal: AbortSignal,
    what: string,
  ): Promise<Response> {
    let response = await this.fetchOrExplain(doFetch, what);
    if (response.status === 429 || response.status >= 500) {
      void response.body?.cancel();
      await delay(retryDelayMs(response), signal);
      response = await this.fetchOrExplain(doFetch, what);
    }
    if (!response.ok) {
      throw new Error(`Pollinations ${what} failed: HTTP ${response.status} ${await safeText(response)}`);
    }
    return response;
  }

  private async fetchOrExplain(doFetch: () => Promise<Response>, what: string): Promise<Response> {
    try {
      return await doFetch();
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`Pollinations ${what} request failed: ${reason}`, { cause: err });
    }
  }
}

// Edit может вернуть URL — качаем только с https://*.pollinations.ai.
function trustedImageUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Pollinations edit returned an invalid image URL');
  }
  const trustedHost = url.hostname === 'pollinations.ai' || url.hostname.endsWith('.pollinations.ai');
  if (url.protocol !== 'https:' || !trustedHost) {
    throw new Error(`Pollinations edit returned an image URL on an untrusted host "${url.hostname}"`);
  }
  return url;
}

async function readBodyWithLimit(response: Response, limit: number, what: string): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > limit) {
      throw new Error(`Pollinations ${what} returned an image larger than the allowed limit`);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function retryDelayMs(response: Response): number {
  const retryAfter = Number(response.headers.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, MAX_RETRY_AFTER_MS);
  }
  return RATE_LIMIT_RETRY_DELAY_MS;
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason instanceof Error ? signal.reason : new Error('Aborted'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function safeText(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  return text.slice(0, 200);
}
