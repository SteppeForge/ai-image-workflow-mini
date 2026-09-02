/** Пресет — отдельная сущность data model, не UI-логика (раздел 11 ТЗ). */
export interface Preset {
  id: string;
  name: string;
  mainPrompt: string;
  negativePrompt: string;
  references: string[];
}
