import Image from 'next/image';

import { cn } from '@/components/ui/cn';

/**
 * The TeTe mark.
 *
 * The artwork is an app-icon tile — a rounded white card carrying the wordmark —
 * so it is rendered as one rather than knocked out onto a transparent
 * background, which left a halo and erased the die pips. As a tile it reads
 * correctly on both the light and dark grounds.
 *
 * `next/image` resizes and re-encodes at build time, so the 1254px source never
 * reaches a phone.
 */
export function BrandMark({
  size = 30,
  withWordmark = false,
  className,
}: {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <Image
        src="/brand/logo-256.png"
        alt="TeTe"
        width={size}
        height={size}
        priority
        className="rounded-[28%]"
        style={{ width: size, height: size }}
      />
      {withWordmark && (
        <span className="text-[1.125rem] font-black leading-none tracking-[-0.045em] text-on-contrast">
          Te<span className="text-accent">Te</span>
        </span>
      )}
    </span>
  );
}

/** The mark alone, for dark surfaces where the wordmark would crowd. */
export function BrandMarkOnDark({ className }: { className?: string }) {
  return <BrandMark className={className} />;
}
