import { useLayoutEffect, useRef } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { PromptFlowNode } from '@/entities/workflow/model/types';
import { useWorkflowStore } from '@/entities/workflow/model/store';
import { useT } from '@/shared/i18n/locale';
import { NodeShell } from '../NodeShell';

// Предел роста поля: длинный промпт видно целиком, но нода не занимает весь холст.
const MAX_FIELD_HEIGHT = 160;

export function PromptNode({ id, data, selected }: NodeProps<PromptFlowNode>) {
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const t = useT();
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  // Поле подстраивается под объём текста: короткий промпт не занимает лишнего
  // места, длинный не приходится читать через щель в три строки.
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${Math.min(field.scrollHeight, MAX_FIELD_HEIGHT)}px`;
  }, [data.text]);

  return (
    <NodeShell nodeId={id} kind="prompt" selected={selected} hint={t('promptLanguageHint')}>
      <textarea
        ref={fieldRef}
        // block — иначе инлайновое поле добавляет подстрочный зазор под собой.
        className="nodrag slim-scroll block min-h-14 w-full resize-none rounded-md border border-neutral-700 bg-neutral-950 p-2 text-xs text-neutral-100 outline-none focus:border-indigo-400"
        placeholder={t('promptPlaceholder')}
        value={data.text}
        onChange={(event) => updateNodeData(id, { text: event.target.value })}
      />
    </NodeShell>
  );
}
