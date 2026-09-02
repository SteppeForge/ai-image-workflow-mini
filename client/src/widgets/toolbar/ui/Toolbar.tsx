import { useState, type ReactNode } from 'react';
import { NODE_PORTS, type NodeKind } from '@aiw/shared';
import { useRunInProgress, useRunStore } from '@/entities/run/model/store';
import { DEMO_BRANCHING, DEMO_GRAPHS, type DemoGraph } from '@/entities/workflow/model/demo';
import { useWorkflowStore } from '@/entities/workflow/model/store';
import { NODE_TITLE_KEYS } from '@/entities/workflow/model/types';
import { useRunWorkflow } from '@/features/run-workflow/model/use-run-workflow';
import { useT } from '@/shared/i18n/locale';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { DropdownMenu, type MenuItem } from '@/shared/ui/DropdownMenu';
import { SegmentedSwitch } from '@/shared/ui/SegmentedSwitch';
import { PlayIcon } from '@/shared/ui/icons';

const NODE_KINDS = Object.keys(NODE_PORTS) as NodeKind[];

type ToolbarMode = 'add' | 'demo';

/** id области, которой управляет свитч — ссылка для aria-controls. */
const SWAP_AREA_ID = 'toolbar-groups';

export function Toolbar() {
  const addNode = useWorkflowStore((state) => state.addNode);
  const loadGraph = useWorkflowStore((state) => state.loadGraph);
  const hasNodes = useWorkflowStore((state) => state.nodes.length > 0);
  const activeDemoKey = useWorkflowStore((state) => state.activeDemoKey);
  const undo = useWorkflowStore((state) => state.undo);
  const redo = useWorkflowStore((state) => state.redo);
  const canUndo = useWorkflowStore((state) => state.past.length > 0);
  const canRedo = useWorkflowStore((state) => state.future.length > 0);
  const { start, stop, errors } = useRunWorkflow();
  // Второй параллельный run дрался бы с первым за rate-limit провайдера.
  const runInProgress = useRunInProgress();
  const actionError = useRunStore((state) => state.actionError);
  const [confirmingReset, setConfirmingReset] = useState(false);
  // На планшетных ширинах обе группы кнопок рядом не влезают, поэтому
  // показывается одна из двух, а переключает их свитч.
  const [mode, setMode] = useState<ToolbarMode>('add');
  const t = useT();

  // Дублирующиеся сообщения сервера не должны давать одинаковые React-ключи.
  const problems = [
    ...new Set([...errors, ...(actionError ? [`${t('retryFailed')} ${actionError}`] : [])]),
  ];

  const historyControls = (
    <>
      <Button
        disabled={!canUndo || runInProgress}
        onClick={undo}
        // Иначе undo стал бы обходом блокировки: он умеет удалять только что
        // добавленную ноду или связь прямо во время выполнения.
        title={runInProgress ? t('editBlockedDuringRun') : t('undo')}
        aria-label={t('undo')}
      >
        ↩
      </Button>
      <Button
        disabled={!canRedo || runInProgress}
        onClick={redo}
        title={runInProgress ? t('editBlockedDuringRun') : t('redo')}
        aria-label={t('redo')}
      >
        ↪
      </Button>
    </>
  );

  const runControls = (
    <>
      {/* Выход из зависшего запуска без сброса графа — даже когда сеть легла целиком. */}
      {runInProgress && (
        <Button onClick={stop} title={t('stopRunHint')}>
          {t('stopRun')}
        </Button>
      )}
      {/* Подпись появляется только на широких экранах: иначе ряд не влезает
          в одну строку. Название всегда доступно через aria-label и tooltip. */}
      <Button
        variant="primary"
        className="inline-flex items-center gap-1.5"
        disabled={runInProgress || !hasNodes}
        title={runInProgress ? t('runInProgressHint') : t('runWorkflow')}
        aria-label={t('runWorkflow')}
        onClick={() => void start()}
      >
        <PlayIcon />
        <span className="hidden wide:inline">{t('runWorkflow')}</span>
      </Button>
    </>
  );

  // Действия описаны один раз и проецируются в две формы: кнопки и пункты меню.
  // Иначе новое демо или вид ноды пришлось бы добавлять в двух местах,
  // а рассинхрон был бы виден только на определённой ширине экрана.
  const addActions: MenuItem[] = NODE_KINDS.map((kind) => ({
    key: kind,
    label: t(NODE_TITLE_KEYS[kind]),
    onSelect: () => addNode(kind),
  }));

  const demoActions: MenuItem[] = [
    ...DEMO_GRAPHS.map((demo) => ({
      key: demo.nameKey,
      label: t(demo.nameKey),
      onSelect: () => loadDemo(demo),
      selected: demo.nameKey === activeDemoKey,
    })),
    { key: 'reset', label: t('reset'), onSelect: () => setConfirmingReset(true), danger: true },
  ];

  const asButtons = (items: MenuItem[]) =>
    items.map((item) => (
      <Button
        key={item.key}
        onClick={item.onSelect}
        aria-pressed={item.selected}
        className={item.selected ? '!border-indigo-400/70 !text-white' : ''}
      >
        {item.label}
      </Button>
    ));

  // Обе группы остаются в разметке и меняются прозрачностью со сдвигом —
  // высота зафиксирована, поэтому при переключении вёрстка не прыгает.
  // inert вместо aria-hidden: он убирает скрытую группу и из дерева доступности,
  // и из порядка табуляции — иначе Tab уводил бы фокус на невидимые кнопки.
  const swapGroup = (groupMode: ToolbarMode, children: ReactNode) => (
    <div
      inert={mode !== groupMode}
      className={`slim-scroll absolute inset-0 flex items-center gap-1.5 overflow-x-auto pb-1 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none ${
        mode === groupMode ? 'translate-x-0 opacity-100' : '-translate-x-3 opacity-0'
      }`}
    >
      {children}
    </div>
  );

  const resetCanvas = () => {
    // Возврат к тому демо, из которого вырос текущий граф, а не всегда к ветвлению.
    const demo = DEMO_GRAPHS.find((item) => item.nameKey === activeDemoKey) ?? DEMO_BRANCHING;
    loadDemo(demo);
    setConfirmingReset(false);
  };

  const loadDemo = (demo: DemoGraph) => {
    // Смена графа сбрасывает прошлый run: старые статусы не должны
    // прилипнуть к совпадающим id нового графа.
    stop();
    loadGraph(demo.nodes, demo.edges, demo.nameKey);
  };

  return (
    <div className="relative shrink-0 border-b border-neutral-800 bg-neutral-950 px-4 py-2.5">
      {/* До 900px — компактный ряд: обе группы свёрнуты в меню. */}
      <div className="flex flex-wrap items-center gap-2 tablet:hidden">
        <DropdownMenu label={t('addNode')} items={addActions} />
        <DropdownMenu label={t('demo')} items={demoActions} />
        {historyControls}
        <div className="ml-auto flex items-center gap-1.5">{runControls}</div>
      </div>

      {/* 900–1279px — свитч режима: кнопки видны сразу, но только одной группы. */}
      <div className="hidden items-center gap-3 tablet:flex xl:hidden">
        <SegmentedSwitch
          value={mode}
          onChange={setMode}
          label={t('toolbarMode')}
          controls={SWAP_AREA_ID}
          options={[
            { value: 'add', label: t('addNode') },
            { value: 'demo', label: t('demo') },
          ]}
        />
        {/* Запас по высоте под горизонтальный скроллбар: в браузерах без overlay-скролла
            он занимает место и обрезал бы кнопки. */}
        <div id={SWAP_AREA_ID} className="relative h-11 min-w-0 flex-1">
          {swapGroup('add', asButtons(addActions))}
          {swapGroup('demo', asButtons(demoActions))}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">{historyControls}</div>
        <div className="flex shrink-0 items-center gap-1.5">{runControls}</div>
      </div>

      {/* От 1280px — полный ряд со всеми кнопками. */}
      <div className="hidden flex-wrap items-center gap-x-6 gap-y-2 xl:flex">
        {/* role="group" связывает подпись с рядом кнопок: без него скринридер
            читает плоский список без группировки. */}
        <div role="group" aria-label={t('addNode')} className="flex items-center gap-1.5">
          <span className="mr-1 text-[11px] uppercase tracking-wide text-neutral-500">{t('addNode')}</span>
          {asButtons(addActions)}
        </div>

        <div role="group" aria-label={t('demo')} className="flex items-center gap-1.5">
          <span className="mr-1 text-[11px] uppercase tracking-wide text-neutral-500">{t('demo')}</span>
          {asButtons(demoActions)}
        </div>

        <div className="flex items-center gap-1.5">{historyControls}</div>

        <div className="ml-auto flex items-center gap-1.5">{runControls}</div>
      </div>

      {confirmingReset && (
        <ConfirmDialog
          title={t('resetTitle')}
          message={t('resetMessage')}
          confirmLabel={t('resetConfirm')}
          cancelLabel={t('cancel')}
          onConfirm={resetCanvas}
          onCancel={() => setConfirmingReset(false)}
        />
      )}

      {/* Ошибки — overlay поверх canvas, чтобы не растить тулбар. */}
      {problems.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-30 space-y-0.5 border-b border-red-900/60 bg-neutral-950/95 px-4 py-2 text-xs text-red-400">
          {problems.map((error) => (
            <li key={error}>⚠ {error}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
