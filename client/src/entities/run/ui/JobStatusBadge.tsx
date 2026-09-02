import type { JobStatus } from '@aiw/shared';
import { StatusBadge, type BadgeTone } from '@/shared/ui/StatusBadge';

const STATUS_TONES: Record<JobStatus, BadgeTone> = {
  idle: 'neutral',
  queued: 'pending',
  running: 'active',
  success: 'success',
  error: 'failure',
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return (
    <StatusBadge tone={STATUS_TONES[status]} showSpinner={status === 'running'}>
      {status}
    </StatusBadge>
  );
}
