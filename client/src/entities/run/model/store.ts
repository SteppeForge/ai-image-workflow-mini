import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { JobSnapshot, RunSnapshot } from '@aiw/shared';

// Состояние транспорта подписки: live — SSE; polling — опрос GET /runs/:runId
// после обрыва; lost — run пропал на сервере (рестарт), статусы устарели.
export type RunConnection = 'live' | 'polling' | 'lost';

export interface RunState {
  runId: string | null;
  snapshot: RunSnapshot | null;
  connection: RunConnection;
  actionError: string | null;
  /** POST /runs ушёл, runId ещё не получен. */
  starting: boolean;
  setStarting: (starting: boolean) => void;
  setRun: (runId: string) => void;
  setSnapshot: (snapshot: RunSnapshot) => void;
  setConnection: (connection: RunConnection) => void;
  setActionError: (actionError: string | null) => void;
  reset: () => void;
}

export const useRunStore = create<RunState>((set) => ({
  runId: null,
  snapshot: null,
  connection: 'live',
  actionError: null,
  starting: false,
  setStarting: (starting) => set({ starting }),
  setRun: (runId) =>
    set({ runId, snapshot: null, connection: 'live', actionError: null, starting: false }),
  setSnapshot: (snapshot) => set({ snapshot }),
  setConnection: (connection) => set({ connection }),
  setActionError: (actionError) => set({ actionError }),
  reset: () =>
    set({ runId: null, snapshot: null, connection: 'live', actionError: null, starting: false }),
}));

// useShallow: каждый SSE-снапшот пересобирает объекты jobs — без него каждая
// нода перерисовывалась бы на каждое событие, даже чужое.
export function useJob(nodeId: string): JobSnapshot | null {
  return useRunStore(useShallow((state) => state.snapshot?.jobs[nodeId] ?? null));
}

// Запуск ещё идёт и его статусам можно верить; отсутствие снапшота —
// run только что создан и вот-вот стартует.
export function isRunInProgress(state: RunState): boolean {
  // Запрос на создание уже ушёл: граф зафиксирован, правки на холсте
  // только вводили бы в заблуждение, а из зависшего запроса нужен выход —
  // именно по этому флагу показывается кнопка «Стоп».
  if (state.starting) return true;
  if (!state.runId || state.connection === 'lost') return false;
  const status = state.snapshot?.status;
  return status === undefined || status === 'queued' || status === 'running';
}

export function useRunInProgress(): boolean {
  return useRunStore(isRunInProgress);
}
