'use client';

import { useState } from 'react';

import { ChevronLeftIcon, WalletIcon } from '@/components/shell/icons';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { cn } from '@/components/ui/cn';
import { PhaseNote } from '@/components/ui/PhaseNote';
import { SlidingTabs } from '@/components/ui/SlidingTabs';
import { Eyebrow, Sticker } from '@/components/ui/Sticker';
import { TREASURY_NIM_ADDRESS } from '@/lib/config/env';
import { pushNotice } from '@/lib/notifications/notifications';
import { sendNim } from '@/lib/nimiq/provider';
import { formatNim, LUNA_PER_NIM, nimToLuna } from '@/lib/nimiq/units';
import { PAYOUT_THRESHOLD_LUNA } from '@/lib/wallet/earnings';
import { useEarnings } from '@/state/use-earnings';
import { useMiniApp } from '@/state/mini-app-provider';

type Tab = 'earnings' | 'deposit' | 'withdraw';

/**
 * Wallet: what the player holds, what they have earned, and moving funds.
 *
 * The two directions are not symmetrical, and the screen does not pretend they
 * are. A deposit is a real transaction the player signs in Nimiq Pay. A
 * withdrawal needs TeTe to send funds *to* a player, which a Mini App cannot do
 * — that needs a treasury key on a server — so the withdraw tab records a
 * request and says exactly what is missing instead of showing a fake success.
 */
export default function WalletPage() {
  const [tab, setTab] = useState<Tab>('earnings');
  const { entries, totalLuna } = useEarnings();
  const { nimiq, locale } = useMiniApp();

  return (
    <div className="pt-1">
      <header className="border-b border-line pb-5">
        <Eyebrow className="text-faint">Wallet</Eyebrow>
        <div className="mt-3 flex items-end justify-between gap-4">
          <div>
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-faint">
              Unpaid rewards
            </p>
            <p className="mt-1 text-[2.5rem] font-black leading-none tracking-[-0.035em] tabular">
              {formatNim(totalLuna, { locale })}
              <span className="ml-2 text-[1rem] text-faint">NIM</span>
            </p>
          </div>
          <span className="flex size-11 items-center justify-center rounded-2xl bg-contrast text-accent">
            <WalletIcon className="size-5" />
          </span>
        </div>
        <Chip tone="warn" className="mt-3">
          Not on chain · not yet payable
        </Chip>
      </header>

      <SlidingTabs<Tab>
        className="mt-5"
        value={tab}
        onChange={setTab}
        options={[
          { id: 'earnings', label: 'Earned' },
          { id: 'deposit', label: 'Deposit' },
          { id: 'withdraw', label: 'Withdraw' },
        ]}
      />

      {tab === 'earnings' && (
        <section className="mt-5">
          {entries.length === 0 ? (
            <div className="rounded-2xl bg-panel-2 px-5 py-10 text-center">
              <p className="text-[0.9375rem] font-bold">Nothing earned yet</p>
              <p className="mx-auto mt-1.5 max-w-[17rem] text-[0.8125rem] leading-relaxed text-muted">
                Play a game in the Arcade or keep a daily streak and it lands here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-line border-y border-line">
              {entries.slice(0, 30).map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.875rem] font-bold">{entry.label}</span>
                    <span className="block text-[0.6875rem] text-faint">
                      {new Date(entry.at).toLocaleDateString(locale, {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                  </span>
                  <span className="shrink-0 text-[0.9375rem] font-black text-accent-text tabular">
                    +{formatNim(entry.luna, { locale, maximumFractionDigits: 3 })}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <PhaseNote className="mt-4">
            These are real amounts owed by the reward pool, recorded on this device —
            not a balance you hold and not spendable. A Mini App can ask your wallet to
            send funds but cannot send funds to you, so paying these out needs a funded
            treasury signing from a server. That does not exist yet.
          </PhaseNote>
        </section>
      )}

      {tab === 'deposit' && <DepositPanel />}

      {tab === 'withdraw' && (
        <WithdrawPanel totalLuna={totalLuna} address={nimiq.address} locale={locale} />
      )}
    </div>
  );
}

/**
 * A real send. Nimiq Pay raises its own confirmation and signs it; TeTe never
 * touches a key. With no treasury address configured this refuses outright —
 * a Nimiq transfer to a wrong address cannot be undone.
 */
function DepositPanel() {
  const { nimiq } = useMiniApp();
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const value = Number.parseFloat(amount);
  const valid = Number.isFinite(value) && value > 0;
  const configured = Boolean(TREASURY_NIM_ADDRESS);

  async function send() {
    if (!valid || !TREASURY_NIM_ADDRESS) return;
    setStatus('sending');
    setMessage(null);
    try {
      await sendNim(TREASURY_NIM_ADDRESS, nimToLuna(value), 'TeTe deposit');
      setStatus('sent');
      pushNotice('system', 'Deposit sent', `${value} NIM sent to the TeTe pool.`);
    } catch (cause: unknown) {
      setStatus('error');
      setMessage(cause instanceof Error ? cause.message : 'The transfer failed.');
    }
  }

  if (!configured) {
    return (
      <Sticker tone="panel" className="mt-5">
        <p className="text-[0.9375rem] font-bold">Deposits are not configured</p>
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-muted">
          Set <code className="font-mono text-[0.75rem]">NEXT_PUBLIC_TREASURY_NIM_ADDRESS</code> to the
          address deposits should go to. Until then this screen will not send, because a
          Nimiq transfer to the wrong address cannot be reversed.
        </p>
      </Sticker>
    );
  }

  if (status === 'sent') {
    return (
      <Sticker tone="contrast" className="mt-5 rounded-3xl p-6 text-center">
        <p className="text-[1.25rem] font-black">Deposit sent</p>
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-on-contrast/70">
          Nimiq Pay signed and broadcast it. It will confirm on chain shortly.
        </p>
        <Button className="mt-5" onClick={() => { setStatus('idle'); setAmount(''); }}>
          Send another
        </Button>
      </Sticker>
    );
  }

  return (
    <section className="mt-5 space-y-3">
      <Sticker tone="panel">
        <label htmlFor="deposit" className="eyebrow text-faint">
          Amount to deposit
        </label>
        <div className="mt-2 flex items-baseline gap-2">
          <input
            id="deposit"
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0"
            className="w-full min-w-0 bg-transparent text-[2rem] font-black tracking-[-0.03em] text-text tabular placeholder:text-faint focus:outline-none"
          />
          <span className="shrink-0 text-[1rem] font-black text-faint">NIM</span>
        </div>
      </Sticker>

      <Sticker tone="panel">
        <Eyebrow className="text-faint">Going to</Eyebrow>
        <p className="mt-2 break-all font-mono text-[0.75rem] leading-relaxed text-muted">
          {TREASURY_NIM_ADDRESS}
        </p>
      </Sticker>

      <Button onClick={send} disabled={!valid || !nimiq.address} loading={status === 'sending'} size="lg">
        {nimiq.address ? 'Send deposit' : 'Connect your wallet first'}
      </Button>

      {status === 'error' && (
        <p role="alert" className="text-[0.8125rem] leading-relaxed text-negative">
          {message}
        </p>
      )}

      <PhaseNote>
        This is a real transaction. Nimiq Pay will ask you to approve it, and the
        amount leaves your wallet once you do.
      </PhaseNote>
    </section>
  );
}

function WithdrawPanel({
  totalLuna,
  address,
  locale,
}: {
  totalLuna: number;
  address: string | null;
  locale: string;
}) {
  const enough = totalLuna >= PAYOUT_THRESHOLD_LUNA;

  return (
    <section className="mt-5 space-y-3">
      <Sticker tone="panel">
        <div className="flex items-end justify-between gap-3">
          <div>
            <Eyebrow className="text-faint">Available to request</Eyebrow>
            <p className="mt-1.5 text-[1.75rem] font-black leading-none tabular">
              {formatNim(totalLuna, { locale })}
              <span className="ml-1.5 text-[0.8125rem] text-faint">NIM</span>
            </p>
          </div>
          <Chip tone={enough ? 'positive' : 'neutral'}>
            Min {PAYOUT_THRESHOLD_LUNA / LUNA_PER_NIM} NIM
          </Chip>
        </div>

        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-panel">
          <div
            className={cn('h-full rounded-full transition-[width] duration-500', enough ? 'bg-positive' : 'bg-accent')}
            style={{ width: `${Math.min(100, (totalLuna / PAYOUT_THRESHOLD_LUNA) * 100)}%` }}
          />
        </div>
      </Sticker>

      <Sticker tone="panel">
        <Eyebrow className="text-faint">Paying out to</Eyebrow>
        <p className="mt-2 break-all font-mono text-[0.75rem] leading-relaxed text-muted">
          {address ?? 'Connect your wallet to set a destination.'}
        </p>
      </Sticker>

      <Button disabled size="lg">
        Withdrawals not available yet
      </Button>

      <PhaseNote>
        Withdrawal is the one direction a Mini App cannot do. TeTe can ask your wallet
        to send funds, but nothing lets it send funds to you — that needs a treasury
        wallet whose key signs payouts from a server. Your earned total is recorded and
        will settle against exactly these entries once that exists.
      </PhaseNote>
    </section>
  );
}
