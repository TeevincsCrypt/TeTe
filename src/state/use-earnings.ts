'use client';

import { useCallback, useEffect, useState } from 'react';

import { addEarning, readEarnings, totalLuna, type Earning, type EarningSource } from '@/lib/wallet/earnings';

export function useEarnings() {
  const [entries, setEntries] = useState<Earning[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const sync = () => {
      setEntries(readEarnings());
      setLoaded(true);
    };
    sync();
    window.addEventListener('tete:earnings-changed', sync);
    return () => window.removeEventListener('tete:earnings-changed', sync);
  }, []);

  const add = useCallback((source: EarningSource, label: string, luna: number) => {
    setEntries(addEarning(source, label, luna));
  }, []);

  return { entries, loaded, add, totalLuna: totalLuna(entries) };
}
