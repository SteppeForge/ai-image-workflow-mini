import { useEffect, useState } from 'react';
import type { Preset } from '@aiw/shared';
import { apiFetch } from '@/shared/api/http';
import { messageOf } from '@/shared/lib/error-message';

// Кэш на уровне модуля: каталог грузится раз за сессию, сколько бы нод
// ни использовало хук.
let cached: Preset[] | null = null;
let pending: Promise<Preset[]> | null = null;

function loadPresets(): Promise<Preset[]> {
  if (cached) return Promise.resolve(cached);
  pending ??= apiFetch<Preset[]>('/presets')
    .then((data) => {
      cached = data;
      return data;
    })
    .catch((err: unknown) => {
      // Ошибка не кэшируется — следующий mount повторит запрос.
      pending = null;
      throw err;
    });
  return pending;
}

export function usePresets(): { presets: Preset[]; error: string | null } {
  const [presets, setPresets] = useState<Preset[]>(cached ?? []);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPresets()
      .then((data) => {
        if (!cancelled) setPresets(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(messageOf(err, 'Failed to load presets'));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { presets, error };
}
