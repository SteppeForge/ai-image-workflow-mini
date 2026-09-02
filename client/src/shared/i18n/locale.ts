import { useCallback } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { readStorage, removeStorage, writeStorage } from '@/shared/lib/storage';
import { MESSAGES, type Locale, type MessageKey } from './messages';

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const useLocaleStore = create<LocaleState>()(
  persist((set) => ({ locale: 'ru', setLocale: (locale) => set({ locale }) }), {
    name: 'aiw-locale',
    storage: createJSONStorage(() => ({
      getItem: readStorage,
      setItem: writeStorage,
      removeItem: removeStorage,
    })),
  }),
);

export function useT(): (key: MessageKey) => string {
  const locale = useLocaleStore((state) => state.locale);
  return useCallback((key: MessageKey) => MESSAGES[locale][key], [locale]);
}
