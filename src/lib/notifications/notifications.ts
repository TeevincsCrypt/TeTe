/**
 * The local notification feed.
 *
 * These are records of things that happened on this device — a draft saved, a
 * reward earned, a challenge posted. Nothing arrives from a server, because
 * there is no server: a real feed (opponent accepted, result confirmed, payout
 * sent) needs a backend to push it.
 */
import { createId } from '@/lib/ids';

const KEY = 'tete.notifications.v1';
const LIMIT = 40;

export type NoticeKind = 'reward' | 'challenge' | 'system' | 'result';

export interface Notice {
  id: string;
  kind: NoticeKind;
  title: string;
  body?: string;
  at: number;
  read: boolean;
}

export function readNotices(): Notice[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isNotice).sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}

export function pushNotice(
  kind: NoticeKind,
  title: string,
  body?: string,
): Notice[] {
  const notice: Notice = { id: createId(), kind, title, body, at: Date.now(), read: false };
  const next = [notice, ...readNotices()].slice(0, LIMIT);
  write(next);
  return next;
}

export function markAllRead(): Notice[] {
  const next = readNotices().map((notice) => ({ ...notice, read: true }));
  write(next);
  return next;
}

export function clearNotices(): Notice[] {
  write([]);
  return [];
}

export function unreadCount(notices: Notice[]): number {
  return notices.filter((notice) => !notice.read).length;
}

function write(notices: Notice[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(notices));
    window.dispatchEvent(new CustomEvent('tete:notices-changed'));
  } catch {
    /* Storage unavailable; the notice is simply not kept. */
  }
}

function isNotice(value: unknown): value is Notice {
  if (typeof value !== 'object' || value === null) return false;
  const n = value as Partial<Notice>;
  return typeof n.id === 'string' && typeof n.title === 'string' && typeof n.at === 'number';
}
