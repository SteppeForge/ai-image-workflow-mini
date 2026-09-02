import type { NodeProps } from '@xyflow/react';
import type { GenerateFlowNode } from '@/entities/workflow/model/types';
import { useWorkflowStore } from '@/entities/workflow/model/store';
import { usePresets } from '@/entities/preset/model/use-presets';
import { useT } from '@/shared/i18n/locale';
import { Select } from '@/shared/ui/Select';
import { NodeShell } from '../NodeShell';

export function GenerateNode({ id, data, selected }: NodeProps<GenerateFlowNode>) {
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const { presets, error } = usePresets();
  const t = useT();

  return (
    <NodeShell nodeId={id} kind="generate" selected={selected}>
      <label className="mb-1 block text-[11px] text-neutral-500">{t('presetLabel')}</label>
      <Select
        className="nodrag"
        value={data.presetId ?? ''}
        onChange={(value) => updateNodeData(id, { presetId: value || null })}
        options={[
          { value: '', label: t('noPreset') },
          ...presets.map((preset) => ({ value: preset.id, label: preset.name })),
        ]}
      />
      {error && (
        <p className="mt-1 text-[11px] text-red-400">
          {t('presetsUnavailable')} {error}
        </p>
      )}
    </NodeShell>
  );
}
