import type { CreateRunRequest, CreateRunResponse, RunSnapshot, WorkflowGraph } from '@aiw/shared';
import type { RunConnection } from '@/entities/run/model/store';
import { API_BASE, ApiError, apiFetch } from '@/shared/api/http';

const POLL_INTERVAL_MS = 2000;

export function createRun(graph: WorkflowGraph): Promise<CreateRunResponse> {
  const body: CreateRunRequest = { graph };
  return apiFetch<CreateRunResponse>('/runs', { method: 'POST', body: JSON.stringify(body) });
}

export function retryNode(runId: string, nodeId: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/runs/${runId}/nodes/${nodeId}/retry`, { method: 'POST' });
}

export interface RunSubscription {
  onSnapshot: (snapshot: RunSnapshot) => void;
  onConnectionChange: (connection: RunConnection) => void;
}

/**
 * Статусы запуска: SSE + запасной опрос GET /runs/:runId при обрыве;
 * 404 при опросе — run потерян (рестарт сервера). На completed подписка
 * гасит себя сама: сервер тоже закрывает поток, а переподключение
 * зациклило бы close → reconnect. Failed остаётся подписанным ради retry.
 */
export function subscribeToRun(runId: string, { onSnapshot, onConnectionChange }: RunSubscription): () => void {
  const source = new EventSource(`${API_BASE}/runs/${runId}/events`);
  let finished = false;
  let pollSession = 0;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let pollActive = false;

  const stopPolling = () => {
    pollSession += 1;
    pollActive = false;
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
  };

  const stop = () => {
    finished = true;
    stopPolling();
    source.close();
  };

  const handleSnapshot = (snapshot: RunSnapshot) => {
    // Поздний ответ после отписки не должен воскресить сброшенный run.
    if (finished) return;
    if (snapshot.status === 'completed') {
      // stop() до колбэка: даже если onSnapshot бросит, закрытый поток
      // не зациклится; пометка «опрос» на завершённом run — дезинформация.
      stop();
      onConnectionChange('live');
    }
    onSnapshot(snapshot);
  };

  // Опрос последовательный: следующий запрос — только после ответа предыдущего,
  // а устаревшая сессия не перетрёт свежий SSE-снапшот.
  const poll = async (session: number) => {
    if (finished || session !== pollSession) return;
    try {
      const snapshot = await apiFetch<RunSnapshot>(`/runs/${runId}`);
      if (finished || session !== pollSession) return;
      handleSnapshot(snapshot);
      if (!finished && session === pollSession) schedulePoll(session);
    } catch (err) {
      if (finished || session !== pollSession) return;
      if (err instanceof ApiError && err.status === 404) {
        // Сервер перезапущен: run пропал, статусы на экране устарели.
        stop();
        onConnectionChange('lost');
        return;
      }
      // Сетевая ошибка — продолжаем опрос; SSE-reconnect может ожить раньше.
      schedulePoll(session);
    }
  };

  const schedulePoll = (session: number) => {
    pollTimer = setTimeout(() => void poll(session), POLL_INTERVAL_MS);
  };

  source.onmessage = (event: MessageEvent<string>) => {
    stopPolling();
    onConnectionChange('live');
    handleSnapshot(JSON.parse(event.data) as RunSnapshot);
  };

  source.onerror = () => {
    // Браузер сам переподключает SSE; пока он это делает — опрашиваем.
    if (finished || pollActive) return;
    pollActive = true;
    onConnectionChange('polling');
    schedulePoll(pollSession);
  };

  return stop;
}
