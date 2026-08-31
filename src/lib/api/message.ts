/**
 * The exact string that gets signed.
 *
 * Shared by the client and the server so the two can never drift — a mismatch
 * here would reject every legitimate signature.
 */
export function signingMessage(intent: string, issuedAt: number): string {
  return `TeTe:${intent}:${issuedAt}`;
}
