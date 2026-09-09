'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { formatById } from '@/lib/challenges/types';
import { type Challenge, pot, type Side } from '@/lib/escrow/types';
import { shortenAddress } from '@/lib/nimiq/address';
import { formatNim } from '@/lib/nimiq/units';
import { defaultHandle } from '@/lib/profile/local-profile';
import { useLocalProfile } from '@/state/use-local-profile';
import { usePlayerLook } from '@/state/use-player-look';

import { renderPnlCard, type PnlCardFace } from './pnl-card';

/** `pot()`/`stake` are Luna for NIM and USDT cents for USDT — the same split
 *  the rest of this screen already renders the "Winner takes" figure with. */
function amountLabel(currency: Challenge['currency'], smallestUnit: number): string {
  return currency === 'NIM' ? formatNim(smallestUnit) : (smallestUnit / 100).toFixed(2);
}

/**
 * Download a PnL card for a challenge you won.
 *
 * Regenerated fresh from the challenge record and both players' looks on
 * every click — there is nothing to keep synced, so a card downloaded weeks
 * from now looks exactly like one downloaded the moment the pot landed.
 */
export function PnlCardButton({
  challenge,
  mySide,
  address,
}: {
  challenge: Challenge;
  mySide: Side;
  address: string;
}) {
  const [state, setState] = useState<'idle' | 'working' | 'error'>('idle');
  const { displayName, avatarSeed, photo } = useLocalProfile();

  const me = mySide === 'host' ? challenge.host : challenge.guest;
  const them = mySide === 'host' ? challenge.guest : challenge.host;
  const opponentLook = usePlayerLook(them?.address ?? null);

  if (!me || !them) return null;

  async function download() {
    setState('working');
    try {
      const winner: PnlCardFace = {
        address,
        handle: displayName ?? defaultHandle(address),
        seed: avatarSeed,
        photo,
      };
      const loser: PnlCardFace = {
        address: them!.address,
        handle: them!.username ? `@${them!.username}` : shortenAddress(them!.address),
        seed: opponentLook?.avatarSeed ?? null,
        photo: opponentLook?.photo ?? null,
      };

      const blob = await renderPnlCard({
        formatName: challenge.title?.trim() || formatById(challenge.format).name,
        currency: challenge.currency,
        potLabel: amountLabel(challenge.currency, pot(challenge)),
        stakeLabel: amountLabel(challenge.currency, challenge.stake),
        settledAt: challenge.updatedAt,
        challengeId: challenge.id,
        winner,
        loser,
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tete-win-${challenge.id.slice(0, 8)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setState('idle');
    } catch {
      setState('error');
    }
  }

  return (
    <div className="mt-3">
      <Button variant="contrast" onClick={download} loading={state === 'working'}>
        Download PnL card
      </Button>
      {state === 'error' && (
        <p role="alert" className="mt-2 text-[0.75rem] font-semibold text-negative">
          Could not build the card. Try again.
        </p>
      )}
    </div>
  );
}
