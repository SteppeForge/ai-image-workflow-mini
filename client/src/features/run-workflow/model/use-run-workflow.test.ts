// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRunStore } from '@/entities/run/model/store';
import { useWorkflowStore } from '@/entities/workflow/model/store';
import { FakeEventSource, snapshotOf } from '../testing/fake-event-source';
import { useRunWorkflow } from './use-run-workflow';

// Самое рискованное в хуке — гонки start/stop: медленный POST /runs не должен
// перетереть более новый старт или остановку.

function deferredFetch() {
  const pending: Array<(response: Response) => void> = [];
  const fetchMock = vi.fn(
    () => new Promise<Response>((resolve) => pending.push(resolve)),
  );
  const respond = (body: unknown, status = 200) => {
    const resolve = pending.shift();
    if (!resolve) throw new Error('No pending fetch to respond to');
    resolve(new Response(JSON.stringify(body), { status }));
  };
  return { fetchMock, respond };
}

describe('useRunWorkflow', () => {
  beforeEach(() => {
    vi.stubGlobal('EventSource', FakeEventSource);
    FakeEventSource.instances = [];
    useRunStore.getState().reset();
    useWorkflowStore.setState({ nodes: [], edges: [], past: [], future: [] });
  });

  afterEach(() => {
    // Без vitest globals у RTL нет авто-cleanup — размонтируем хуки явно,
    // иначе они копят подписки на сторы между тестами.
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('starts a run and feeds SSE snapshots into the run store', async () => {
    const { fetchMock, respond } = deferredFetch();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useRunWorkflow());
    let started: Promise<void>;
    act(() => {
      started = result.current.start();
    });
    await act(async () => {
      respond({ runId: 'run-1' });
      await started;
    });

    expect(useRunStore.getState().runId).toBe('run-1');
    const source = FakeEventSource.instances.at(-1)!;
    act(() => source.emit(snapshotOf('run-1', 'running')));
    expect(useRunStore.getState().snapshot?.status).toBe('running');
  });

  it('a stop during an in-flight start discards the late response', async () => {
    const { fetchMock, respond } = deferredFetch();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useRunWorkflow());
    let started: Promise<void>;
    act(() => {
      started = result.current.start();
    });
    act(() => result.current.stop());
    await act(async () => {
      respond({ runId: 'run-late' });
      await started;
    });

    // Запоздавший runId не должен воскресить остановленный запуск.
    expect(useRunStore.getState().runId).toBeNull();
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it('with two rapid starts only the newest run wins', async () => {
    const { fetchMock, respond } = deferredFetch();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useRunWorkflow());
    let first: Promise<void>;
    let second: Promise<void>;
    act(() => {
      first = result.current.start();
    });
    act(() => {
      second = result.current.start();
    });
    await act(async () => {
      // Ответы приходят по порядку; первый уже устарел.
      respond({ runId: 'run-1' });
      respond({ runId: 'run-2' });
      await Promise.all([first, second]);
    });

    expect(useRunStore.getState().runId).toBe('run-2');
    // Подписку открыл только победивший старт.
    expect(FakeEventSource.instances.map((s) => s.url)).toEqual(['/api/runs/run-2/events']);
  });

  it('unmount during an in-flight start never opens a subscription', async () => {
    const { fetchMock, respond } = deferredFetch();
    vi.stubGlobal('fetch', fetchMock);

    const { result, unmount } = renderHook(() => useRunWorkflow());
    let started: Promise<void>;
    act(() => {
      started = result.current.start();
    });
    unmount();
    await act(async () => {
      respond({ runId: 'run-x' });
      await started;
    });

    expect(useRunStore.getState().runId).toBeNull();
    expect(FakeEventSource.instances).toHaveLength(0);
    // Флаг не должен остаться поднятым: иначе после возврата на страницу
    // кнопка запуска останется заблокированной.
    expect(useRunStore.getState().starting).toBe(false);
  });

  it('shows server validation errors and clears them on the next graph edit', async () => {
    const { fetchMock, respond } = deferredFetch();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useRunWorkflow());
    let started: Promise<void>;
    act(() => {
      started = result.current.start();
    });
    await act(async () => {
      respond({ errors: ['Graph has no nodes'] }, 400);
      await started;
    });
    expect(result.current.errors).toEqual(['Graph has no nodes']);

    // Пользователь правит граф — устаревший баннер должен исчезнуть.
    act(() => useWorkflowStore.getState().addNode('prompt'));
    expect(result.current.errors).toEqual([]);
  });
});
