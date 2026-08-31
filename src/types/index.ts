/**
 * TeTe domain vocabulary.
 *
 * Phase 1 only needs the stake currencies, because that is all the shell
 * actually renders. Challenge, escrow and reputation types are deliberately
 * absent until the code that uses them exists — see the README for where they
 * are planned to live (`lib/challenges`, `lib/escrow`, `lib/reputation`).
 */

/** The two assets a challenge can be staked in. */
export type StakeCurrency = 'NIM' | 'USDT';

/** How far a piece of wallet state has got. */
export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * A capability that the Mini App environment does not offer at all, as
 * distinct from one that merely failed. Used for the NIM balance (no provider
 * method) and USDT on chains with no verified contract address.
 */
export type CapabilityStatus = LoadStatus | 'unsupported';
