/** Единый разбор unknown-ошибки: catch-блоки не должны повторять эту тройку. */
export function messageOf(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}
