import { Chip } from '@/components/ui/Chip';
import { STATE_LABEL, type EscrowState } from '@/lib/escrow/types';

const TONE: Record<EscrowState, 'neutral' | 'accent' | 'gold' | 'positive' | 'warn' | 'flame'> = {
  open: 'neutral',
  accepted: 'gold',
  partly_funded: 'gold',
  funded: 'accent',
  reported: 'accent',
  disputed: 'flame',
  settled: 'positive',
  refunded: 'warn',
  expired: 'neutral',
};

export function StateChip({ state }: { state: EscrowState }) {
  return <Chip tone={TONE[state]}>{STATE_LABEL[state]}</Chip>;
}
