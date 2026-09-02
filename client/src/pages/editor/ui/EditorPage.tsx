import { useEffect } from 'react';
import { isRunInProgress, useRunStore } from '@/entities/run/model/store';
import { useWorkflowStore } from '@/entities/workflow/model/store';
import { useLocaleStore, useT } from '@/shared/i18n/locale';
import type { Locale } from '@/shared/i18n/messages';
import { SegmentedSwitch } from '@/shared/ui/SegmentedSwitch';
import { Toolbar } from '@/widgets/toolbar/ui/Toolbar';
import { WorkflowCanvas } from '@/widgets/workflow-canvas/ui/WorkflowCanvas';

const LOCALES: Locale[] = ['ru', 'en'];

// В полях ввода — свой нативный undo, глобальные хоткеи их не перехватывают.
function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)
  );
}

export function EditorPage() {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || isEditableTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;
      // Та же блокировка, что у кнопок истории: хоткей не должен быть лазейкой
      // для структурной правки графа во время выполнения.
      if (isRunInProgress(useRunStore.getState())) return;
      event.preventDefault();
      const { undo, redo } = useWorkflowStore.getState();
      if (key === 'y' || event.shiftKey) {
        redo();
      } else {
        undo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      <header className="slim-scroll flex h-10 shrink-0 items-center gap-3 overflow-x-auto overflow-y-hidden whitespace-nowrap border-b border-neutral-800 px-4">
        <h1 className="shrink-0 text-sm font-bold">AI Image Workflow Mini</h1>
        <span className="shrink-0 text-xs text-neutral-500">{t('appSubtitle')}</span>
        {/* Тот же компонент, что и свитч режима в тулбаре: два сегментных
            переключателя в одном интерфейсе не должны выглядеть и звучать по-разному. */}
        <SegmentedSwitch
          value={locale}
          onChange={setLocale}
          label={t('language')}
          size="sm"
          className="ml-auto shrink-0 uppercase"
          options={LOCALES.map((code) => ({ value: code, label: code }))}
        />
      </header>
      <Toolbar />
      <main className="min-h-0 flex-1">
        <WorkflowCanvas />
      </main>
    </div>
  );
}
