'use client';

import { useEffect, useState } from 'react';

import { CloseIcon } from '@/components/shell/icons';
import { cn } from '@/components/ui/cn';
import { useNotices } from '@/state/use-notices';

const TONES: Record<string, string> = {
  reward: 'text-accent-text',
  challenge: 'text-violet',
  result: 'text-positive',
  system: 'text-muted',
};

/**
 * The notification centre.
 *
 * Everything in it happened on this device. A real feed — an opponent accepting,
 * a result confirmed, a payout landing — needs a server to push it, so nothing
 * here pretends to be live from elsewhere.
 */
export function NoticeBar({ onClose }: { onClose: () => void }) {
  const { notices, markRead, clear } = useNotices();

  // Opening the panel is the read receipt.
  useEffect(() => {
    const timer = setTimeout(markRead, 400);
    return () => clearTimeout(timer);
  }, [markRead]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col" role="dialog" aria-label="Notifications">
      <button
        type="button"
        aria-label="Close notifications"
        onClick={onClose}
        className="absolute inset-0 bg-contrast/40 backdrop-blur-[2px]"
      />

      <div
        className="relative mx-auto mt-0 w-full max-w-md animate-[var(--animate-toast)] rounded-b-3xl bg-panel px-4 pb-4 shadow-lg"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
      >
        <div className="flex items-center justify-between pb-3">
          <h2 className="text-[1rem] font-black tracking-tight">Notifications</h2>
          <div className="flex items-center gap-1">
            {notices.length > 0 && (
              <button
                type="button"
                onClick={clear}
                className="min-h-9 rounded-full px-3 text-[0.75rem] font-bold text-muted active:text-text"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex size-9 items-center justify-center rounded-full text-muted active:text-text"
            >
              <CloseIcon className="size-4" />
            </button>
          </div>
        </div>

        {notices.length === 0 ? (
          <p className="py-8 text-center text-[0.8125rem] text-faint">Nothing yet.</p>
        ) : (
          <ul className="max-h-[60dvh] divide-y divide-line overflow-y-auto">
            {notices.map((notice) => (
              <li key={notice.id} className="flex gap-3 py-3">
                <span
                  className={cn(
                    'mt-1.5 size-1.5 shrink-0 rounded-full',
                    notice.read ? 'bg-line' : 'bg-accent',
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className={cn('text-[0.875rem] font-bold', TONES[notice.kind])}>{notice.title}</p>
                  {notice.body && (
                    <p className="mt-0.5 text-[0.75rem] leading-snug text-muted">{notice.body}</p>
                  )}
                </div>
                <span className="shrink-0 text-[0.625rem] text-faint tabular">
                  {timeAgo(notice.at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function timeAgo(at: number): string {
  const seconds = Math.round((Date.now() - at) / 1000);
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

/** The bell, with its unread count. */
export function NoticeBell({ onOpen }: { onOpen: () => void }) {
  const { unread } = useNotices();
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (unread === 0) return;
    setPulse(true);
    const timer = setTimeout(() => setPulse(false), 900);
    return () => clearTimeout(timer);
  }, [unread]);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
      className="relative flex size-9 items-center justify-center rounded-full text-on-contrast/70 transition-colors active:text-on-contrast"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="size-5" aria-hidden>
        <path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13 6 9Z" strokeLinejoin="round" />
        <path d="M10 18.5a2 2 0 0 0 4 0" strokeLinecap="round" />
      </svg>
      {unread > 0 && (
        <span
          className={cn(
            'absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-accent px-1',
            'text-[0.5625rem] font-black text-on-accent tabular',
            pulse && 'animate-[var(--animate-pop)]',
          )}
        >
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  );
}
