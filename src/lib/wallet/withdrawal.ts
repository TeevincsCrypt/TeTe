/**
 * What a withdrawal is allowed to send.
 *
 * This is the policy; /api/withdraw is the I/O around it. It lives here,
 * outside `server-only`, for two reasons: the screens that quote the limits
 * read the same numbers the server enforces, so they cannot drift; and a rule
 * that decides how much real money leaves a treasury should be checkable
 * without a store, a treasury key or a signature.
 *
 * The server is still the only one that decides. Anything the client works
 * out with these is a display, and is recomputed here before a NIM moves.
 */
import { LUNA_PER_NIM } from '@/lib/nimiq/units';

/** Minimum payout worth the transaction that carries it. */
export const MIN_WITHDRAW_LUNA = 10 * LUNA_PER_NIM;

/**
 * Most one address can withdraw in a UTC day.
 *
 * Earning is deliberately uncapped — play as long as you like and keep what
 * you earn — so this is the only thing bounding the operator's exposure, and
 * the number that matters. A balance above it is not lost: it stays on the
 * ledger, and the rest is withdrawable tomorrow.
 *
 * Worth being plain about the limit: Nimiq addresses are free to generate, so
 * a determined farmer runs many in parallel and a per-address cap does not
 * stop them — it only prices them. Closing that needs something this app does
 * not have yet: a deposit, a funded wallet, or an identity check before
 * earning.
 */
export const MAX_DAILY_WITHDRAW_LUNA = 100 * LUNA_PER_NIM;

export type WithdrawPlan =
  | { ok: true; sending: number; remaining: number }
  | { ok: false; error: string };

const nim = (luna: number) => luna / LUNA_PER_NIM;

/**
 * Decide what to send, given a balance and what has already left today.
 *
 * Being over the ceiling is not an error and nothing is forfeited: the day's
 * remaining allowance is sent, and `remaining` stays credited for tomorrow.
 * The only refusals are a balance below the minimum, and an allowance so
 * nearly spent that what is left would not cover a worthwhile transaction.
 */
export function planWithdrawal(owed: number, withdrawnToday: number): WithdrawPlan {
  if (owed < MIN_WITHDRAW_LUNA) {
    return {
      ok: false,
      error: `You need at least ${nim(MIN_WITHDRAW_LUNA)} NIM to withdraw. You have ${nim(owed)}.`,
    };
  }

  const allowance = Math.max(0, MAX_DAILY_WITHDRAW_LUNA - withdrawnToday);
  if (allowance < MIN_WITHDRAW_LUNA) {
    return {
      ok: false,
      error:
        `You have withdrawn ${nim(withdrawnToday)} NIM today, and the daily limit is ` +
        `${nim(MAX_DAILY_WITHDRAW_LUNA)}. Your remaining ${nim(owed)} NIM stays on your ` +
        `balance — withdraw it tomorrow.`,
    };
  }

  const sending = Math.min(owed, allowance);
  return { ok: true, sending, remaining: owed - sending };
}
