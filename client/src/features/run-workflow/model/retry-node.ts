import { useRunStore } from '@/entities/run/model/store';
import { messageOf } from '@/shared/lib/error-message';
import { retryNode } from '../api/runs-api';

// Ошибка запроса уходит в тулбар: молчаливый console.error выглядел бы
// как «кнопка Retry не работает».
export async function retryNodeInCurrentRun(nodeId: string): Promise<void> {
  const { runId, setActionError } = useRunStore.getState();
  if (!runId) return;
  try {
    await retryNode(runId, nodeId);
    setActionError(null);
  } catch (err) {
    setActionError(messageOf(err, 'Retry request failed'));
  }
}
