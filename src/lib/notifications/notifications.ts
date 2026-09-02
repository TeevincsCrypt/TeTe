/**
 * The local notification feed.
 *
 * Records of things worth telling the player about: a draft saved, a reward
 * earned, an opponent accepting, a tip arriving. Nothing is *pushed* here — a
 * Mini App cannot wake a phone — so these are written as the app notices them,
 * either from something done on this device or from polling the server.
 *
 * Each notice can carry an `href`, because a notice that names something the
 * player would want to look at and then makes them go and find it is doing
 * half a job.
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
  /** Where tapping it leads, when there is somewhere worth going. */
  href?: string;
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
  href?: string,
): Notice[] {
  const notice: Notice = { id: createId(), kind, title, body, href, at: Date.now(), read: false };
  const next = [notice, ...readNotices()].slice(0, LIMIT);
  write(next);
  return next;
}

/** Mark one notice read — what opening it should do. */
export function markRead(id: string): Notice[] {
  const next = readNotices().map((notice) =>
    notice.id === id ? { ...notice, read: true } : notice,
  );
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
