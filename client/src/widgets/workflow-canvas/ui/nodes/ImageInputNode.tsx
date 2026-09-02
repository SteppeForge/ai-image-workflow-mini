import { useRef, useState, type ChangeEvent } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { ImageInputFlowNode } from '@/entities/workflow/model/types';
import { useWorkflowStore } from '@/entities/workflow/model/store';
import { useT } from '@/shared/i18n/locale';
import type { MessageKey } from '@/shared/i18n/messages';
import { NodeShell } from '../NodeShell';

// data-URL едет в JSON на сервер; лимит зеркалится серверной валидацией.
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function ImageInputNode({ id, data, selected }: NodeProps<ImageInputFlowNode>) {
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const t = useT();
  // Ошибка хранится ключом словаря — перерисовывается при смене языка.
  const [error, setError] = useState<MessageKey | null>(null);
  // Медленное чтение старого файла не должно перетереть более новый выбор.
  const readSeqRef = useRef(0);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('onlyImages');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('fileTooLarge');
      return;
    }

    const seq = ++readSeqRef.current;
    const reader = new FileReader();
    reader.onload = () => {
      if (seq !== readSeqRef.current || typeof reader.result !== 'string') return;
      setError(null);
      updateNodeData(id, { imageDataUrl: reader.result });
    };
    reader.onerror = () => {
      if (seq === readSeqRef.current) setError('fileReadFailed');
    };
    reader.readAsDataURL(file);
  };

  return (
    <NodeShell nodeId={id} kind="image-input" selected={selected}>
      {data.imageDataUrl ? (
        <img src={data.imageDataUrl} alt="Uploaded input" className="mb-2 max-h-24 w-full rounded-md object-cover" />
      ) : (
        <p className="mb-2 text-xs text-neutral-500">{t('noImage')}</p>
      )}
      <input
        type="file"
        accept="image/*"
        onChange={onFileChange}
        className="nodrag w-full text-xs text-neutral-400 file:mr-2 file:rounded-md file:border-0 file:bg-neutral-700 file:px-2 file:py-1 file:text-xs file:text-neutral-100"
      />
      {error && <p className="mt-1 text-[11px] text-red-400">{t(error)}</p>}
    </NodeShell>
  );
}
