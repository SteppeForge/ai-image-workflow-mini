import type { EditImageInput, GenerateImageInput, ImageProvider, ImageResult } from './types.js';

/**
 * Офлайн-провайдер: имитирует задержку, рисует SVG с текстом промпта;
 * «[fail]» в тексте — ошибка для демонстрации error state и retry.
 */
export class MockProvider implements ImageProvider {
  readonly name = 'mock';
  readonly supportsEdit = true;

  constructor(private readonly delayMs: { min: number; max: number } = { min: 1500, max: 3000 }) {}

  async generateImage(input: GenerateImageInput): Promise<ImageResult> {
    await this.simulateWork(input.signal);
    if (input.prompt.includes('[fail]')) {
      throw new Error('Mock provider: generation failed (triggered by "[fail]" in prompt)');
    }
    return { kind: 'url', url: renderSvg('generated', input.prompt, input.negativePrompt, input.references) };
  }

  async editImage(input: EditImageInput): Promise<ImageResult> {
    await this.simulateWork(input.signal);
    if (input.instruction.includes('[fail]')) {
      throw new Error('Mock provider: edit failed (triggered by "[fail]" in instruction)');
    }
    return { kind: 'url', url: renderSvg('edited', input.instruction, null, []) };
  }

  private async simulateWork(signal: AbortSignal): Promise<void> {
    const { min, max } = this.delayMs;
    const delay = min + Math.random() * (max - min);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, delay);
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(signal.reason instanceof Error ? signal.reason : new Error('Aborted'));
        },
        { once: true },
      );
    });
  }
}

const PALETTE = ['#7d8cff', '#3bd5a0', '#f1bd63', '#58a9ff', '#ff9db5', '#b58cff'];

function renderSvg(kind: string, text: string, negative: string | null, references: string[]): string {
  const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
  const lines = [
    `mock ${kind}`,
    truncate(text, 46),
    negative ? `negative: ${truncate(negative, 40)}` : null,
    references.length > 0 ? `references: ${references.length}` : null,
  ].filter((line): line is string => line !== null);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <rect width="512" height="512" fill="#11161b"/>
  <circle cx="256" cy="180" r="110" fill="${color}" opacity="0.85"/>
  ${lines
    .map(
      (line, i) =>
        `<text x="256" y="${350 + i * 28}" text-anchor="middle" fill="#eef3f8" font-family="monospace" font-size="${i === 0 ? 22 : 15}">${escapeXml(line)}</text>`,
    )
    .join('\n  ')}
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
