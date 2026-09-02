import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { useRunInProgress } from '@/entities/run/model/store';
import { useWorkflowStore } from '@/entities/workflow/model/store';
import { useT } from '@/shared/i18n/locale';
import { CloseIcon } from '@/shared/ui/icons';

// Кнопка видна всегда, а не по hover: попасть кликом в тонкую кривую трудно,
// и без явного элемента пользователь не догадывается, что связь можно разорвать.
export function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
}: EdgeProps) {
  const removeEdge = useWorkflowStore((state) => state.removeEdge);
  const runInProgress = useRunInProgress();
  const t = useT();
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <button
          type="button"
          disabled={runInProgress}
          // pointer-events-auto — слой подписей рёбер по умолчанию не кликабелен.
          className="nodrag nopan pointer-events-auto absolute flex size-4 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900 text-neutral-500 opacity-70 transition-colors hover:border-red-500 hover:bg-red-600 hover:text-white hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-neutral-700 disabled:hover:bg-neutral-900 disabled:hover:text-neutral-500"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          onClick={() => removeEdge(id)}
          title={runInProgress ? t('editBlockedDuringRun') : t('deleteEdge')}
          aria-label={t('deleteEdge')}
        >
          <CloseIcon size={9} />
        </button>
      </EdgeLabelRenderer>
    </>
  );
}
