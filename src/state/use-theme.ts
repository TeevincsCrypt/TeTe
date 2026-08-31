'use client';

import { useCallback, useEffect, useState } from 'react';

import { applyTheme, readTheme, resolveTheme, writeTheme, type ThemeChoice } from '@/lib/theme';

/**
 * Theme state for the toggle. Reads after mount so server and client agree on
 * the first render; the inline bootstrap has already set the attribute by then,
 * so nothing flashes.
 */
export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>('system');
  const [resolved, setResolved] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const current = readTheme();
    setChoice(current);
    setResolved(resolveTheme(current));

    // Follow the OS while the player is on `system`.
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (readTheme() === 'system') {
        applyTheme('system');
        setResolved(resolveTheme('system'));
      }
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const set = useCallback((next: ThemeChoice) => {
    writeTheme(next);
    setChoice(next);
    setResolved(resolveTheme(next));
  }, []);

  const toggle = useCallback(() => {
    set(resolveTheme(readTheme()) === 'dark' ? 'light' : 'dark');
  }, [set]);

  return { choice, resolved, set, toggle };
}
