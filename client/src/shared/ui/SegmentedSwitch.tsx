interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedSwitchProps<T extends string> {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  label: string;
  /** id области, видимостью которой управляет переключатель. */
  controls?: string;
  size?: 'sm' | 'md';
  className?: string;
}

const SIZES = {
  sm: 'px-2 py-0.5 text-[11px]',
  md: 'px-3 py-1 text-xs',
} as const;

/**
 * Сегментный переключатель: выбранный сегмент подсвечен «пилюлей», которая
 * едет к нему при смене. Колонки равной ширины (auto-cols-fr), поэтому
 * позиция пилюли считается как index * 100% — без измерений DOM.
 */
export function SegmentedSwitch<T extends string>({
  value,
  options,
  onChange,
  label,
  controls,
  size = 'md',
  className = '',
}: SegmentedSwitchProps<T>) {
  const index = options.findIndex((option) => option.value === value);

  return (
    <div
      role="group"
      aria-label={label}
      className={`relative inline-grid auto-cols-fr grid-flow-col rounded-md border border-neutral-700 bg-neutral-950 p-0.5 ${className}`}
    >
      {/* Неизвестное значение не должно подсвечивать чужой сегмент. */}
      {index >= 0 && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0.5 left-0.5 rounded bg-indigo-500 transition-transform duration-200 ease-out motion-reduce:transition-none"
          style={{
            width: `calc((100% - 0.25rem) / ${options.length})`,
            transform: `translateX(${index * 100}%)`,
          }}
        />
      )}
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          aria-controls={controls}
          onClick={() => onChange(option.value)}
          className={`relative z-10 rounded font-semibold transition-colors ${SIZES[size]} ${
            option.value === value ? 'text-white' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
