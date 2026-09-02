import { useRef, useState } from 'react';
import { useDismissable } from '@/shared/lib/use-dismissable';
import { ChevronIcon } from './icons';
import { POPUP_PANEL } from './popup';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  className?: string;
}

// Свой select: нативный popup рисует ОС, и он выбивается из тёмного canvas.
export function Select({ value, options, onChange, className = '' }: SelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useDismissable(open, () => setOpen(false), rootRef);

  const selected = options.find((option) => option.value === value);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-neutral-700 bg-neutral-950 p-1.5 text-xs text-neutral-100 outline-none transition-colors focus:border-indigo-400 hover:border-neutral-600"
        onClick={() => setOpen((visible) => !visible)}
      >
        <span className="truncate">{selected?.label ?? value}</span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <ul
          role="listbox"
          className={`${POPUP_PANEL} inset-x-0`}
        >
          {options.map((option) => (
            <li key={option.value} role="option" aria-selected={option.value === value}>
              <button
                type="button"
                className={`w-full px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-neutral-800 ${
                  option.value === value ? 'font-semibold text-indigo-300' : 'text-neutral-200'
                }`}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
