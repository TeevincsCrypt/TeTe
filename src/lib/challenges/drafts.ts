/**
 * Local storage for challenge drafts.
 *
 * Drafts live in this browser and nowhere else. Nothing here touches a chain,
 * moves funds, or notifies an opponent — that is Phase 2. Keeping them real but
 * clearly local means Create and Challenges are genuinely functional today
 * without inventing on-chain state.
 *
 * Every access is wrapped: `localStorage` throws in some WebView privacy modes,
 * and a thrown storage error must never take the screen down with it.
 */
import type { ChallengeDraft } from './types';

const KEY = 'tete.challenge-drafts.v1';

export function readDrafts(): ChallengeDraft[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isDraft).sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export function saveDraft(draft: ChallengeDraft): ChallengeDraft[] {
  const next = [draft, ...readDrafts()];
  write(next);
  return next;
}

export function deleteDraft(id: string): ChallengeDraft[] {
  const next = readDrafts().filter((draft) => draft.id !== id);
  write(next);
  return next;
}

function write(drafts: ChallengeDraft[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(drafts));
    // Lets other mounted screens refresh without a global store.
    window.dispatchEvent(new CustomEvent('tete:drafts-changed'));
  } catch {
    /* Storage unavailable (private mode, quota). The draft is simply not kept. */
  }
}

function isDraft(value: unknown): value is ChallengeDraft {
  if (typeof value !== 'object' || value === null) return false;
  const draft = value as Partial<ChallengeDraft>;
  return typeof draft.id === 'string' && typeof draft.createdAt === 'number';
}
