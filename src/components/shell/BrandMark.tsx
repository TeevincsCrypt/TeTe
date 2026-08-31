import { cn } from '@/components/ui/cn';

/**
 * TeTe wordmark. The doubled "Te" is the product's whole idea — two players —
 * so the second one carries the accent.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'select-none text-xl font-black leading-none tracking-[-0.045em] text-text',
        className,
      )}
    >
      Te<span className="text-accent">Te</span>
    </span>
  );
}
