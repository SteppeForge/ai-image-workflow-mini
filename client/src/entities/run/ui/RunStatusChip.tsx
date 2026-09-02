import type { RunStatus } from '@aiw/shared';
import type { RunConnection } from '@/entities/run/model/store';
import { useT } from '@/shared/i18n/locale';
import { Spinner } from '@/shared/ui/Spinner';

const STATUS_DOTS: Record<RunStatus, string> = {
  queued: '#fcd34d',
  running: '#93c5fd',
  completed: '#6ee7b7',
  failed: '#fca5a5',
};

// Чип смонтирован всегда: до первого запуска — idle (словарь ТЗ),
// дальше — словарь run; появление/исчезновение не дёргало бы вёрстку.
export function RunStatusChip({
  status,
  connection = 'live',
}: {
  status: RunStatus | null;
  connection?: RunConnection;
}) {
  const t = useT();
  return (
    <span className="flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-950/90 px-2.5 py-1.5 text-[11px] text-neutral-300">
      {status === 'running' ? (
        <Spinner className="size-2.5 text-blue-300" />
      ) : (
        <span
          className="size-2.5 rounded-full"
          style={{ background: status ? STATUS_DOTS[status] : '#737373' }}
        />
      )}
      <span className={status ? '' : 'text-neutral-500'}>run: {status ?? 'idle'}</span>
      {/* Состояние транспорта видно и без снапшота: run может потеряться до первого. */}
      {connection === 'polling' && (
        <span className="text-amber-400/90">· {t('connectionPolling')}</span>
      )}
      {connection === 'lost' && <span className="text-red-400/90">· {t('runLost')}</span>}
    </span>
  );
}
