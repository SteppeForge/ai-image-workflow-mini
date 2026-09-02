import type { Preset } from '@aiw/shared';

// Каталог in-memory; замена на БД тронет только этот модуль.
const PRESETS: Preset[] = [
  {
    id: 'preset-premium-3d',
    name: 'Premium 3D',
    mainPrompt: 'premium minimal 3D visual, soft studio lighting, clean composition',
    negativePrompt: 'clutter, noisy background, text artifacts',
    references: ['/references/ref-1.png', '/references/ref-2.png'],
  },
  {
    id: 'preset-flat-illustration',
    name: 'Flat Illustration',
    mainPrompt: 'flat vector illustration, bold shapes, limited palette',
    negativePrompt: 'photorealism, gradients, noise',
    references: [],
  },
];

// Наружу — копии: вызывающий код не должен мутировать каталог.
export function listPresets(): Preset[] {
  return PRESETS.map((preset) => ({ ...preset, references: [...preset.references] }));
}

export function getPreset(id: string): Preset | undefined {
  return PRESETS.find((preset) => preset.id === id);
}
