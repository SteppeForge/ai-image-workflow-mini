import type { NodeProps } from '@xyflow/react';
import type { ResultFlowNode } from '@/entities/workflow/model/types';
import { useJob } from '@/entities/run/model/store';
import { resolveImageUrl } from '@/shared/api/http';
import { useT } from '@/shared/i18n/locale';
import { NodeShell } from '../NodeShell';

export function ResultNode({ id, selected }: NodeProps<ResultFlowNode>) {
  const job = useJob(id);
  const t = useT();

  return (
    <NodeShell nodeId={id} kind="result" selected={selected}>
      {job?.imageUrl ? (
        <div className="relative">
          {/* block — чтобы инлайновая ссылка не добавляла подстрочный зазор под картинкой. */}
          <a
            href={resolveImageUrl(job.imageUrl)}
            target="_blank"
            rel="noreferrer"
            title={t('openFullSize')}
            className="block"
          >
            <img src={resolveImageUrl(job.imageUrl)} alt="Generation result" className="w-full rounded-md" />
          </a>
          {/* download без имени: браузер возьмёт его из Content-Disposition сервера. */}
          <a
            href={resolveImageUrl(job.imageUrl)}
            download
            className="nodrag absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-md border border-neutral-700 bg-neutral-950/85 text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
            title={t('downloadImage')}
            aria-label={t('downloadImage')}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M6 2v6m0 0l2.4-2.4M6 8L3.6 5.6M2.5 9.8h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>
      ) : (
        <div className="flex h-20 items-center justify-center rounded-md border border-dashed border-neutral-700 text-xs text-neutral-500">
          {t('resultPreview')}
        </div>
      )}
    </NodeShell>
  );
}
