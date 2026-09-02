import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeEventSource, snapshotOf } from '../testing/fake-event-source';
import { subscribeToRun } from './runs-api';

// Самый рискованный транспортный код: SSE + последовательный опрос,
// самоостановка на completed, инвалидация устаревшей polling-сессии.
describe('subscribeToRun', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('EventSource', FakeEventSource);
    FakeEventSource.instances = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('stops itself after a completed snapshot and resets the connection state', () => {
    const onSnapshot = vi.fn();
    const onConnectionChange = vi.fn();
    subscribeToRun('r1', { onSnapshot, onConnectionChange });

    const source = FakeEventSource.instances.at(-1)!;
    source.emit(snapshotOf('r1', 'completed'));

    expect(onSnapshot).toHaveBeenCalledTimes(1);
    expect(source.closed).toBe(true);
    expect(onConnectionChange).toHaveBeenLastCalledWith('live');
  });

  it('falls back to polling on SSE errors and marks the run lost on 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'gone' }), { status: 404 })),
    );
    const onConnectionChange = vi.fn();
    subscribeToRun('r1', { onSnapshot: vi.fn(), onConnectionChange });

    const source = FakeEventSource.instances.at(-1)!;
    source.onerror?.();
    expect(onConnectionChange).toHaveBeenCalledWith('polling');

    await vi.advanceTimersByTimeAsync(2000);
    expect(onConnectionChange).toHaveBeenLastCalledWith('lost');
    expect(source.closed).toBe(true);
  });

  it('discards a late poll response after SSE recovered', async () => {
    let resolvePoll: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((resolve) => (resolvePoll = resolve))),
    );
    const onSnapshot = vi.fn();
    subscribeToRun('r1', { onSnapshot, onConnectionChange: vi.fn() });

    const source = FakeEventSource.instances.at(-1)!;
    source.onerror?.();
    await vi.advanceTimersByTimeAsync(2000); // poll-запрос ушёл и висит
    source.emit(snapshotOf('r1', 'running')); // SSE ожил с более свежими данными
    resolvePoll!(new Response(JSON.stringify(snapshotOf('r1', 'queued')), { status: 200 }));
    await vi.advanceTimersByTimeAsync(0);

    // Устаревший queued из инвалидированной сессии не должен откатить UI назад.
    expect(onSnapshot).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'running' }));
  });

  it('unsubscribe closes the stream and cancels pending polling', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const unsubscribe = subscribeToRun('r1', { onSnapshot: vi.fn(), onConnectionChange: vi.fn() });

    const source = FakeEventSource.instances.at(-1)!;
    source.onerror?.(); // планирует опрос через 2 с
    unsubscribe();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(source.closed).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
