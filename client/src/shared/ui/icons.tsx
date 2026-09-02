// Иконки рисуются SVG, а не символами (× ⓘ ↓ ▾): у глифов свои метрики,
// из-за которых они не центруются во flex-контейнере и вылезают за границы.

export function CloseIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3.5 3.5l7 7m0-7l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="shrink-0">
      <path d="M3 2.2v7.6l6.5-3.8z" fill="currentColor" />
    </svg>
  );
}

export function ChevronIcon({ open, className = '' }: { open: boolean; className?: string }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
      className={`shrink-0 text-neutral-500 transition-transform ${open ? 'rotate-180' : ''} ${className}`}
    >
      <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
