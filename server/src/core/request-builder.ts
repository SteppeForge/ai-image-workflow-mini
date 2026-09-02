import type { Preset } from '@aiw/shared';
import type { GenerateImageInput } from '../providers/types.js';

/** User prompt + preset → запрос провайдеру (Request Builder, раздел 11 ТЗ). */
export function buildGenerateRequest(
  userPrompt: string,
  preset: Preset | null,
  signal: AbortSignal,
): GenerateImageInput {
  if (!preset) {
    return { prompt: userPrompt, negativePrompt: null, references: [], signal };
  }
  return {
    prompt: `${preset.mainPrompt}. ${userPrompt}`,
    negativePrompt: preset.negativePrompt || null,
    references: [...preset.references],
    signal,
  };
}
