import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'ghost' | 'danger';

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-indigo-500 hover:bg-indigo-400 text-white',
  ghost: 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700',
  danger: 'bg-red-600/80 hover:bg-red-500 text-white',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = 'ghost', className = '', ...rest }: ButtonProps) {
  return (
    <button
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    />
  );
}
