import { cn } from '@/components/ui/cn';

/**
 * The wordmark. Doubling "Te" is the whole product in two syllables — two
 * players — so the second half carries the accent.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn('display select-none text-[1.375rem] text-ink', className)}>
      Te<span className="text-lime-deep">Te</span>
    </span>
  );
}

export function BrandMarkOnDark({ className }: { className?: string }) {
  return (
    <span className={cn('display select-none text-[1.375rem] text-text', className)}>
      Te<span className="text-lime">Te</span>
    </span>
  );
}
