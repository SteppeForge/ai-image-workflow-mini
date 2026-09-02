import { useCallback, useEffect, useRef, useState } from 'react';
import { useRunStore } from '@/entities/run/model/store';
import { useWorkflowStore } from '@/entities/workflow/model/store';
import { ApiError } from '@/shared/api/http';
import { messageOf } from '@/shared/lib/error-message';
import { createRun, subscribeToRun } from '../api/runs-api';

// Оркестрация запуска: граф с canvas → POST /runs → подписка на статусы.
// generationRef инвалидирует устаревшие async-старты (гонки start/stop/unmount).
export function useRunWorkflow() {
  const [errors, setErrors] = useState<string[]>([]);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const generationRef = useRef(0);

  useEffect(
    () => () => {
      generationRef.current += 1;
      unsubscribeRef.current?.();
      // Сброс флага здесь, а не только в finally: при размонтировании во время
      // полёта POST /runs поколение уже не совпадёт, и глобальный starting
      // остался бы поднятым — кнопка запуска была бы disabled после возврата.
      useRunStore.getState().setStarting(false);
    },
    [],
  );

  // Баннер ошибок гаснет только при содержательной правке графа:
  // selection и drag тоже меняют ссылки массивов у React Flow.
  useEffect(
    () =>
      useWorkflowStore.subscribe((state, previous) => {
        if (state.nodes === previous.nodes && state.edges === previous.edges) return;
        if (graphContentChanged(previous, state)) {
          setErrors((current) => (current.length > 0 ? [] : current));
        }
      }),
    [],
  );

  const start = useCallback(async () => {
    const generation = ++generationRef.current;
    // Флаг только в сторе: на него смотрят и блокировки удаления, и кнопки
    // тулбара — второй локальный флаг пришлось бы держать в синхроне вручную.
    useRunStore.getState().setStarting(true);
    setErrors([]);
    try {
      const graph = useWorkflowStore.getState().toGraph();
      const { runId } = await createRun(graph);
      // Пока летел запрос, случился более новый start/stop/unmount.
      if (generation !== generationRef.current) return;
      unsubscribeRef.current?.();
      useRunStore.getState().setRun(runId);
      unsubscribeRef.current = subscribeToRun(runId, {
        onSnapshot: (snapshot) => useRunStore.getState().setSnapshot(snapshot),
        onConnectionChange: (connection) => useRunStore.getState().setConnection(connection),
      });
    } catch (err) {
      // Устаревший старт не должен показать свою ошибку поверх более нового.
      if (generation !== generationRef.current) return;
      setErrors(
        err instanceof ApiError && err.details.length > 0
          ? err.details
          : [messageOf(err, 'Unexpected error')],
      );
    } finally {
      // Флагом владеет новейший старт; для прерванных его сбрасывает stop().
      if (generation === generationRef.current) useRunStore.getState().setStarting(false);
    }
  }, []);

  // Клиентский стоп (кнопка «Стоп», смена графа): серверный run доработает —
  // отмены на сервере нет, это осознанное упрощение (см. ARCHITECTURE).
  const stop = useCallback(() => {
    generationRef.current += 1;
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    useRunStore.getState().reset();
  }, []);

  return { start, stop, errors };
}

type GraphSlice = Pick<ReturnType<typeof useWorkflowStore.getState>, 'nodes' | 'edges'>;

function graphContentChanged(previous: GraphSlice, next: GraphSlice): boolean {
  return (
    next.nodes.length !== previous.nodes.length ||
    next.edges.length !== previous.edges.length ||
    next.nodes.some((node, i) => node.id !== previous.nodes[i].id || node.data !== previous.nodes[i].data) ||
    next.edges.some((edge, i) => edge.id !== previous.edges[i].id)
  );
}
