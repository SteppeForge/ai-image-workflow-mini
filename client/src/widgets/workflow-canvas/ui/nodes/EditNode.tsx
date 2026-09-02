import type { NodeProps } from '@xyflow/react';
import type { EditFlowNode } from '@/entities/workflow/model/types';
import { useWorkflowStore } from '@/entities/workflow/model/store';
import { useT } from '@/shared/i18n/locale';
import { NodeShell } from '../NodeShell';

export function EditNode({ id, data, selected }: NodeProps<EditFlowNode>) {
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const t = useT();

  return (
    <NodeShell nodeId={id} kind="edit" selected={selected} hint={t('promptLanguageHint')}>
      <input
        className="nodrag block w-full rounded-md border border-neutral-700 bg-neutral-950 p-2 text-xs text-neutral-100 outline-none focus:border-indigo-400"
        placeholder={t('editPlaceholder')}
        value={data.prompt}
        onChange={(event) => updateNodeData(id, { prompt: event.target.value })}
      />
    </NodeShell>
  );
}
