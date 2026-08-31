'use client';

import { useEffect, useState } from 'react';

import { CheckIcon, TrashIcon } from '@/components/shell/icons';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { cn } from '@/components/ui/cn';
import { PhaseNote } from '@/components/ui/PhaseNote';
import { StatTile } from '@/components/ui/StatTile';
import { Eyebrow, Sticker } from '@/components/ui/Sticker';
import { ConnectPanel } from '@/components/wallet/ConnectPanel';
import { copyText } from '@/lib/clipboard';
import { NIMIQ_NETWORK_LABEL } from '@/lib/config/env';
import { chainLabel } from '@/lib/evm/chains';
import { shortenEvmAddress } from '@/lib/evm/erc20';
import { formatAddress, shortenAddress } from '@/lib/nimiq/address';
import { defaultHandle } from '@/lib/profile/local-profile';
import { useMiniApp } from '@/state/mini-app-provider';
import { useDrafts } from '@/state/use-drafts';
import { useRoster } from '@/state/use-roster';
import { useLocalProfile } from '@/state/use-local-profile';

/**
 * The player.
 *
 * Identity here is the connected Nimiq address — TeTe has no accounts and no
 * backend. The display name is local decoration that never leaves the device;
 * the avatar is generated from the address itself. Reputation counters are real
 * and sit at zero, because no match has been played.
 */
export default function ProfilePage() {
  const { nimiq, evm, locale } = useMiniApp();
  const { displayName, save } = useLocalProfile();
  const { drafts } = useDrafts();
  const { players, remove: removePlayer } = useRoster();

  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [copied, setCopied] = useState(false);

  const handle = displayName ?? defaultHandle(nimiq.address);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!nimiq.address) {
    return (
      <div className="space-y-5 pt-2">
        <header>
          <Eyebrow className="text-faint">Your account</Eyebrow>
          <h1 className="display mt-1 text-[2rem]">Profile</h1>
        </header>
        <ConnectPanel />
      </div>
    );
  }

  return (
    <div className="space-y-5 pt-2">
      <Sticker tone="contrast" className="text-center">
        <div className="flex flex-col items-center">
          <Avatar address={nimiq.address} size={80} className="shadow-[var(--shadow-sticker-sm)]" />

          {editing ? (
            <div className="mt-4 w-full">
              <input
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                maxLength={20}
                autoFocus
                placeholder={handle}
                className="w-full rounded-xl border-2 border-on-contrast/20 bg-contrast-2 px-3.5 py-3 text-center text-[1.125rem] font-black tracking-tight text-on-contrast focus:outline-none"
              />
              <div className="mt-3 flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setEditing(false)}
                  className="border-on-contrast/30 text-on-contrast"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    save(draftName);
                    setEditing(false);
                  }}
                >
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="display mt-4 text-[1.75rem] text-on-contrast">{handle}</h1>
              <button
                type="button"
                onClick={() => {
                  setDraftName(displayName ?? '');
                  setEditing(true);
                }}
                className="mt-1.5 min-h-9 text-[0.75rem] font-bold text-on-contrast/60 underline underline-offset-2"
              >
                Edit name
              </button>
            </>
          )}

          <Chip tone="inverse" className="mt-3">
            Unranked · Season 01
          </Chip>

          <p className="mt-4 text-[0.6875rem] leading-snug text-on-contrast/55">
            Share your address so friends can add you as{' '}
            <span className="font-bold text-on-contrast/80">@{handle}</span> on their roster.
          </p>
        </div>
      </Sticker>

      <section>
        <Eyebrow className="mb-3 text-faint">Record</Eyebrow>
        <div className="grid grid-cols-2 gap-3">
          <StatTile label="Played" value={0} icon="⚔️" />
          <StatTile label="Won" value={0} accent="accent" icon="🏆" />
          <StatTile label="Win rate" value="—" icon="🎯" />
          <StatTile label="Best streak" value={0} accent="flame" icon="🔥" />
        </div>
        <PhaseNote className="mt-3">
          Real counters at zero. Nothing is recorded until challenges can be settled.
        </PhaseNote>
      </section>

      <section>
        <Eyebrow className="mb-3 text-faint">Wallets</Eyebrow>
        <div className="space-y-2.5">
          <Sticker tone="panel">
            <div className="flex items-center justify-between gap-3">
              <p className="eyebrow text-faint">Nimiq</p>
              <button
                type="button"
                onClick={async () => setCopied(await copyText(formatAddress(nimiq.address ?? '')))}
                className={cn(
                  'flex min-h-9 items-center gap-1.5 rounded-full border-2 px-3 text-[0.6875rem] font-bold transition-colors',
                  copied ? 'border-positive text-positive' : 'border-line text-muted',
                )}
              >
                {copied && <CheckIcon className="size-3" strokeWidth={3} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="mt-2.5 break-all font-mono text-[0.75rem] leading-relaxed text-text">
              {formatAddress(nimiq.address)}
            </p>
          </Sticker>

          <Sticker tone="panel">
            <p className="eyebrow text-faint">EVM · for USDT</p>
            {evm.address ? (
              <>
                <p className="mt-2.5 font-mono text-[0.8125rem] text-text">
                  {shortenEvmAddress(evm.address)}
                </p>
                {evm.chainId && (
                  <Chip tone="violet" className="mt-2.5">
                    {chainLabel(evm.chainId)}
                  </Chip>
                )}
              </>
            ) : (
              <p className="mt-2 text-[0.8125rem] text-faint">
                Not connected. Connect it from the USDT card on Home.
              </p>
            )}
          </Sticker>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <Eyebrow className="text-faint">Your roster</Eyebrow>
          <span className="text-[0.75rem] font-bold text-faint tabular">{players.length}</span>
        </div>

        {players.length === 0 ? (
          <Sticker tone="panel">
            <p className="text-[0.8125rem] leading-relaxed text-muted">
              No saved players yet. Add someone while creating a challenge and you can
              call them out by username from then on.
            </p>
          </Sticker>
        ) : (
          <div className="space-y-2.5">
            {players.map((player) => (
              <div
                key={player.id}
                className="flex items-center gap-3 rounded-2xl border-2 border-ink/12 bg-panel p-3"
              >
                <Avatar address={player.address} size={38} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.9375rem] font-black tracking-tight">
                    @{player.username}
                  </p>
                  <p className="truncate font-mono text-[0.6875rem] text-faint">
                    {shortenAddress(player.address)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removePlayer(player.id)}
                  aria-label={`Remove ${player.username}`}
                  className="-m-2 flex size-11 items-center justify-center rounded-full text-faint transition-colors active:text-negative"
                >
                  <TrashIcon className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <PhaseNote className="mt-3">
          Usernames are nicknames you assign on this device. TeTe has no global handle
          registry yet, so adding a player needs their address once.
        </PhaseNote>
      </section>

      <section>
        <Eyebrow className="mb-3 text-faint">Network</Eyebrow>
        <Sticker tone="panel">
          <Row
            label="Consensus"
            value={
              nimiq.chain ? (
                <span className={nimiq.chain.consensusEstablished ? 'text-positive' : 'text-gold'}>
                  {nimiq.chain.consensusEstablished ? 'Established' : 'Syncing'}
                </span>
              ) : (
                <span className="text-faint">Reading…</span>
              )
            }
          />
          <Row
            label="Block height"
            value={
              nimiq.chain ? (
                <span className="tabular">
                  #{new Intl.NumberFormat(locale).format(nimiq.chain.blockNumber)}
                </span>
              ) : (
                <span className="text-faint">—</span>
              )
            }
          />
          {NIMIQ_NETWORK_LABEL !== 'unknown' && (
            <Row label="RPC network" value={<span className="capitalize">{NIMIQ_NETWORK_LABEL}</span>} />
          )}
          <Row label="Saved players" value={<span className="tabular">{players.length}</span>} />
          <Row label="Local drafts" value={<span className="tabular">{drafts.length}</span>} last />
        </Sticker>
      </section>

      <Sticker tone="panel">
        <p className="text-[0.75rem] leading-relaxed text-faint">
          TeTe never sees your private keys or seed phrase — Nimiq Pay approves every
          action and holds every key. Your display name is stored only on this device.
        </p>
      </Sticker>
    </div>
  );
}

function Row({
  label,
  value,
  last = false,
}: {
  label: string;
  value: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 py-2.5',
        !last && 'border-b border-line',
      )}
    >
      <span className="text-[0.8125rem] text-muted">{label}</span>
      <span className="text-[0.8125rem] font-bold">{value}</span>
    </div>
  );
}
