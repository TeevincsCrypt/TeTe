'use client';

import { cn } from '@/components/ui/cn';
import { useTheme } from '@/state/use-theme';

/**
 * Light / dark switch. The knob slides and the two glyphs crossfade, so the
 * control shows its state without needing a label.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolved, toggle } = useTheme();
  const dark = resolved === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={dark}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={cn(
        'relative flex h-9 w-16 shrink-0 items-center rounded-full border border-line bg-panel-2 px-1',
        className,
      )}
    >
      <span
        aria-hidden
        className="absolute size-7 rounded-full bg-contrast"
        style={{
          left: dark ? 'calc(100% - 2rem)' : '0.25rem',
          transition: 'left 0.34s cubic-bezier(0.65,0,0.35,1)',
        }}
      />
      <span className="relative flex w-full items-center justify-between px-1.5">
        <SunIcon className={cn('size-3.5 transition-colors', dark ? 'text-faint' : 'text-on-contrast')} />
        <MoonIcon className={cn('size-3.5 transition-colors', dark ? 'text-on-contrast' : 'text-faint')} />
      </span>
    </button>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" strokeLinecap="round" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z" strokeLinejoin="round" />
    </svg>
  );
}
