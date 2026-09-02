import type { ReactNode } from 'react';
import { Handle, Position } from '@xyflow/react';
import { NODE_PORTS, type JobStatus, type NodeKind } from '@aiw/shared';
import { useJob, useRunInProgress, useRunStore } from '@/entities/run/model/store';
import { JobStatusBadge } from '@/entities/run/ui/JobStatusBadge';
import { retryNodeInCurrentRun } from '@/features/run-workflow/model/retry-node';
import { Button } from '@/shared/ui/Button';
import { InfoHint } from '@/shared/ui/InfoHint';
import { CloseIcon } from '@/shared/ui/icons';
import { NODE_TITLE_KEYS, PORT_COLORS } from '@/entities/workflow/model/types';
import { useWorkflowStore } from '@/entities/workflow/model/store';
import { useT } from '@/shared/i18n/locale';

// Цель для клика при соединении: меньше — тяжело попасть мышью.
const HANDLE_SIZE = 11;

const STATUS_BORDERS: Record<JobStatus, string> = {
  idle: 'border-neutral-700',
  queued: 'border-amber-600/70',
  running: 'border-blue-500 shadow-[0_0_14px_rgba(59,130,246,0.35)]',
  success: 'border-emerald-600',
  error: 'border-red-600',
};

interface NodeShellProps {
  nodeId: string;
  kind: NodeKind;
  selected?: boolean;
  /** Подсказка рядом с заголовком: в шапке она не мешает ни тексту, ни скроллу. */
  hint?: string;
  children?: ReactNode;
}

export function NodeShell({ nodeId, kind, selected, hint, children }: NodeShellProps) {
  const t = useT();
  const job = useJob(nodeId);
  const runFailed = useRunStore((state) => state.snapshot?.status === 'failed');
  const runInProgress = useRunInProgress();
  const removeNode = useWorkflowStore((state) => state.removeNode);
  const status = job?.status ?? 'idle';
  // Словарь API оставляет queued, но в failed-run нода без retry не стартует —
  // говорим прямо, а не «ждёт выполнения».
  const blockedByUpstream = status === 'queued' && runFailed;
  const ports = NODE_PORTS[kind];
  const title = t(NODE_TITLE_KEYS[kind]);

  return (
    <div
      className={`w-60 rounded-lg border bg-neutral-900 text-neutral-100 transition-colors ${STATUS_BORDERS[status]} ${selected ? 'ring-2 ring-indigo-400/60' : ''}`}
    >
      {ports.inputs.map((port) => (
        <Handle
          key={port.id}
          id={port.id}
          type="target"
          position={Position.Left}
          title={`${port.label} (${port.type})`}
          style={{ background: PORT_COLORS[port.type], width: HANDLE_SIZE, height: HANDLE_SIZE }}
        />
      ))}

      <div className="flex items-center justify-between gap-2 border-b border-neutral-800 px-3 py-1.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-semibold">{title}</span>
          {hint && <InfoHint text={hint} />}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <JobStatusBadge status={status} />
          <button
            type="button"
            // Во время запуска удаление стёрло бы живой статус выполняющейся ноды.
            disabled={runInProgress}
            className="nodrag rounded p-0.5 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-neutral-500"
            title={runInProgress ? t('editBlockedDuringRun') : t('deleteNode')}
            aria-label={`${t('deleteNode')}: ${title}`}
            onClick={() => removeNode(nodeId)}
          >
            <CloseIcon />
          </button>
        </span>
      </div>

      {blockedByUpstream && (
        <p className="border-b border-neutral-800 px-3 py-1.5 text-[11px] text-amber-400/80">
          {t('blockedByUpstream')}
        </p>
      )}

      {children && <div className="px-3 py-2">{children}</div>}

      {status === 'error' && (
        <div className="border-t border-neutral-800 px-3 py-1.5">
          <p className="mb-2 text-xs text-red-300" title={job?.error ?? undefined}>
            {truncate(job?.error ?? 'Unknown error', 90)}
          </p>
          <Button variant="danger" className="w-full" onClick={() => void retryNodeInCurrentRun(nodeId)}>
            {t('retry')}
          </Button>
        </div>
      )}

      {ports.outputs.map((port) => (
        <Handle
          key={port.id}
          id={port.id}
          type="source"
          position={Position.Right}
          title={`${port.label} (${port.type})`}
          style={{ background: PORT_COLORS[port.type], width: HANDLE_SIZE, height: HANDLE_SIZE }}
        />
      ))}
    </div>
  );
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
