// Подсказка-иконка: текст показывается по наведению, вёрстку не двигает.
// Это button, а не span: иначе элемент не получает фокус с клавиатуры
// и скринридер никогда не озвучит подсказку.
export function InfoHint({ text, className = '' }: { text: string; className?: string }) {
  return (
    <button
      type="button"
      className={`pointer-events-auto flex size-3.5 cursor-help items-center justify-center rounded-full text-neutral-600 transition-colors hover:text-neutral-300 focus-visible:text-neutral-200 focus-visible:outline focus-visible:outline-1 focus-visible:outline-indigo-400 ${className}`}
      title={text}
      aria-label={text}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <circle cx="7" cy="7" r="5.6" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="7" cy="4.3" r="0.85" fill="currentColor" />
        <path d="M7 6.4v3.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </button>
  );
}
