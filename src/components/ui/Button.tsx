'use client';

import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from './cn';

type Variant = 'primary' | 'cream' | 'outline' | 'ghost' | 'violet';
type Size = 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-lime text-ink border-ink shadow-[var(--shadow-sticker)]',
  cream: 'bg-cream text-ink border-ink shadow-[var(--shadow-sticker)]',
  violet: 'bg-violet text-white border-ink shadow-[var(--shadow-sticker)]',
  outline: 'bg-transparent text-text border-line hover:border-lime hover:text-lime shadow-none',
  ghost: 'bg-transparent text-muted border-transparent shadow-none hover:text-text',
};

const SIZES: Record<Size, string> = {
  md: 'min-h-12 px-5 text-[0.875rem]',
  lg: 'min-h-14 px-7 text-[1rem]',
};

/**
 * Every button clears the 44px touch-target floor and gives physical feedback:
 * pressing collapses the hard shadow and nudges the button into it, so the tap
 * reads as the sticker being pushed down rather than a colour change.
 */
const BASE = cn(
  'inline-flex w-full items-center justify-center gap-2 rounded-full border-2',
  'font-bold tracking-tight',
  'transition-[transform,box-shadow,background-color,border-color,color] duration-100',
  'active:translate-x-[3px] active:translate-y-[3px] active:shadow-none',
  'disabled:cursor-not-allowed disabled:opacity-40 disabled:active:translate-0 disabled:active:shadow-[var(--shadow-sticker)]',
);

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
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
      className={cn(BASE, SIZES[size], VARIANTS[variant], className)}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

/** Same skin as Button, but navigates. Used for every nav-shaped action. */
export function ButtonLink({
  href,
  variant = 'primary',
  size = 'md',
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={cn(BASE, SIZES[size], VARIANTS[variant], className)}>
      {children}
    </Link>
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
