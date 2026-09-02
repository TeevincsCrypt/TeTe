'use client';

/**
 * The server's record of what this address has earned and not withdrawn.
 *
 * This is the number that pays out, so it is the one every screen should show.
 * The device's own earnings ledger (`use-earnings`) is a history of rounds
 * played on this phone — useful as a list, wrong as a balance, because it
 * misses anything earned elsewhere and keeps anything already withdrawn.
 *
 * Null means the deployment has no store configured, or the read failed;
 * callers should say so rather than render a zero as if it were a balance.
 */
import { useCallback, useEffect, useState } from 'react';

import { fetchRewardBalance } from '@/lib/api/client';
import { useMiniApp } from '@/state/mini-app-provider';

export function useRewardBalance() {
  const { nimiq } = useMiniApp();
  const address = nimiq.address;

  const [balance, setBalance] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!address) {
      setBalance(null);
      setLoaded(true);
      return;
    }
    setBalance(await fetchRewardBalance(address));
    setLoaded(true);
  }, [address]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Rounds are credited server-side as they finish, so a screen showing this
  // needs to hear about it — the arcade fires the same event the local ledger
  // uses when it banks a round.
  useEffect(() => {
    const onChange = () => void refresh();
    window.addEventListener('tete:earnings-changed', onChange);
    return () => window.removeEventListener('tete:earnings-changed', onChange);
  }, [refresh]);

  return { balance, loaded, refresh };
}
