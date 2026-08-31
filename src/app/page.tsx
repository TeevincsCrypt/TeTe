'use client';

import { HomeScreen } from '@/components/home/HomeScreen';
import { OnboardingScreen } from '@/components/onboarding/OnboardingScreen';
import { AppShell } from '@/components/shell/AppShell';
import { TabBar } from '@/components/shell/TabBar';
import { useMiniApp } from '@/state/mini-app-provider';

/**
 * Phase 1 is a two-screen app: onboarding until a Nimiq account is connected,
 * then home. Connection state lives in memory only — TeTe stores nothing about
 * the user, and Nimiq Pay re-approves account access each session.
 */
export default function Page() {
  const { nimiq } = useMiniApp();
  const connected = nimiq.address !== null;

  return (
    <AppShell footer={connected ? <TabBar /> : undefined}>
      {connected ? <HomeScreen /> : <OnboardingScreen />}
    </AppShell>
  );
}
