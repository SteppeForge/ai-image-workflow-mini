import { useRef, useState } from 'react';
import { useDismissable } from '@/shared/lib/use-dismissable';
import { Button } from './Button';
import { ChevronIcon } from './icons';
import { POPUP_PANEL } from './popup';

export interface MenuItem {
  key: string;
  label: string;
  onSelect: () => void;
  danger?: boolean;
  /** Выбранный пункт взаимоисключающего набора: галочка рисуется здесь, а не в тексте подписи. */
  selected?: boolean;
}

interface DropdownMenuProps {
  label: string;
  items: MenuItem[];
}

export function DropdownMenu({ label, items }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useDismissable(open, () => setOpen(false), rootRef);

  return (
    <div ref={rootRef} className="relative">
      <Button aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {label}
        <ChevronIcon open={open} className="ml-1.5 inline-block" />
      </Button>

      {open && (
        <ul
          role="menu"
          className={`${POPUP_PANEL} left-0 min-w-40`}
        >
          {items.map((item) => (
            <li key={item.key} role="none" className={item.danger ? 'mt-1 border-t border-neutral-800 pt-1' : ''}>
              <button
                type="button"
                // menuitemradio только там, где есть выбор из набора: тогда скринридер
                // озвучит состояние, а не прочтёт галочку как часть названия.
                role={item.selected === undefined ? 'menuitem' : 'menuitemradio'}
                aria-checked={item.selected}
                className={`flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-xs transition-colors ${
                  item.danger
                    ? 'text-red-400 hover:bg-red-950/40'
                    : 'text-neutral-200 hover:bg-neutral-800'
                }`}
                onClick={() => {
                  item.onSelect();
                  setOpen(false);
                }}
              >
                {item.selected !== undefined && (
                  <span aria-hidden="true" className={item.selected ? 'text-indigo-300' : 'invisible'}>
                    ✓
                  </span>
                )}
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
