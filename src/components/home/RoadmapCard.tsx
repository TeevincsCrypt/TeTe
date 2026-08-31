import { Card, CardLabel } from '@/components/ui/Card';

/**
 * An honest statement of where the build is.
 *
 * There is no challenge data yet, so this card shows none — no sample matches,
 * no placeholder opponents, no invented reputation score. It says what is wired
 * up and what is next, and nothing more.
 */
const NEXT_UP = [
  'Create a challenge and invite a player by link',
  'Escrow both stakes before play begins',
  'Report and confirm results, then settle to the winner',
  'Reputation built from completed challenges',
];

export function RoadmapCard() {
  return (
    <Card>
      <CardLabel>What works today</CardLabel>
      <p className="mt-3 text-[0.875rem] leading-relaxed text-muted">
        Wallet connection, live Nimiq node state and the USDT balance above are real, read from
        Nimiq Pay and the chain. Challenges and escrow are not built yet.
      </p>

      <p className="mt-6 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-faint">
        Next up
      </p>
      <ul className="mt-3 space-y-2.5">
        {NEXT_UP.map((item) => (
          <li key={item} className="flex gap-3 text-[0.875rem] leading-relaxed text-muted">
            <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-faint" />
            {item}
          </li>
        ))}
      </ul>
    </Card>
  );
}
