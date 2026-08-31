'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  children: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent-dim active:bg-accent-dim',
  secondary: 'bg-surface-2 text-text border border-line hover:border-faint',
  ghost: 'bg-transparent text-muted hover:text-text',
};

/**
 * `min-h-12` (48px) keeps every button past the 44px touch-target floor the
 * Mini Apps checklist requires.
 */
export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(
        'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-6',
        'text-[0.9375rem] font-semibold tracking-tight',
        'transition-all duration-150 active:scale-[0.985]',
        'disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100',
        VARIANTS[variant],
        className,
      )}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
    />
  );
}
