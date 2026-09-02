import type { ReactNode } from 'react';
import { Spinner } from './Spinner';

export type BadgeTone = 'neutral' | 'pending' | 'active' | 'success' | 'failure';

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-neutral-800 text-neutral-400',
  pending: 'bg-amber-950 text-amber-300',
  active: 'bg-blue-950 text-blue-300',
  success: 'bg-emerald-950 text-emerald-300',
  failure: 'bg-red-950 text-red-300',
};

interface StatusBadgeProps {
  tone: BadgeTone;
  showSpinner?: boolean;
  children: ReactNode;
}

export function StatusBadge({ tone, showSpinner = false, children }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${TONE_CLASSES[tone]}`}
    >
      {showSpinner && <Spinner />}
      {children}
    </span>
  );
}
