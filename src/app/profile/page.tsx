'use client';

import { useEffect, useRef, useState } from 'react';

import Link from 'next/link';

import { CheckIcon, ChevronRightIcon, FlameIcon, SwordsIcon, TargetIcon, TrashIcon, TrophyIcon } from '@/components/shell/icons';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { cn } from '@/components/ui/cn';
import { PhaseNote } from '@/components/ui/PhaseNote';
import { StatTile } from '@/components/ui/StatTile';
import { Eyebrow, Sticker } from '@/components/ui/Sticker';
import { ConnectPanel } from '@/components/wallet/ConnectPanel';
import { copyText } from '@/lib/clipboard';
import { preparePhoto } from '@/lib/profile/local-profile';
import { NIMIQ_NETWORK_LABEL } from '@/lib/config/env';
import { chainLabel } from '@/lib/evm/chains';
import { shortenEvmAddress } from '@/lib/evm/erc20';
import { formatAddress, shortenAddress } from '@/lib/nimiq/address';
import { defaultHandle } from '@/lib/profile/local-profile';
import { useMiniApp } from '@/state/mini-app-provider';
import { useDrafts } from '@/state/use-drafts';
import { useRoster } from '@/state/use-roster';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
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
  const { displayName, save, avatarSeed, saveAvatar, photo, savePhoto } = useLocalProfile();
  const [photoError, setPhotoError] = useState<string | null>(null);
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

        <section>
          <Eyebrow className="mb-3 text-faint">Appearance</Eyebrow>
          <div className="flex items-center justify-between rounded-2xl bg-panel-2 px-4 py-3">
            <div>
              <p className="text-[0.875rem] font-bold">Dark mode</p>
              <p className="mt-0.5 text-[0.6875rem] text-faint">Follows your phone until you choose.</p>
            </div>
            <ThemeToggle />
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5 pt-2">
      <Sticker tone="contrast" className="rounded-3xl p-7 text-center">
        <div className="flex flex-col items-center">
          <PhotoPicker
            address={nimiq.address}
            seed={avatarSeed}
            photo={photo}
            onPick={async (file) => {
              setPhotoError(null);
              try {
                savePhoto(await preparePhoto(file));
              } catch (cause: unknown) {
                setPhotoError(cause instanceof Error ? cause.message : 'Could not use that image.');
              }
            }}
            onClear={() => savePhoto(null)}
          />

          {editing ? (
            <div className="mt-4 w-full">
              <label htmlFor="display-name" className="sr-only">
                Display name
              </label>
              <input
                id="display-name"
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                maxLength={20}
                autoFocus
                placeholder={handle}
                className="w-full rounded-xl border border-on-contrast/25 bg-on-contrast/10 px-3.5 py-3 text-center text-[1.125rem] font-black tracking-tight text-on-contrast focus:outline-none"
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

          {photoError && (
            <p role="alert" className="mt-3 text-[0.75rem] font-semibold text-negative">
              {photoError}
            </p>
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

      <section hidden={Boolean(photo)}>
        <Eyebrow className="mb-3 text-faint">Look</Eyebrow>
        <div className="flex flex-wrap items-center gap-2.5">
          {[null, 1, 2, 3, 4, 5, 6, 7].map((seed, index) => {
            const active = avatarSeed === seed;
            return (
              <button
                key={index}
                type="button"
                onClick={() => saveAvatar(seed)}
                aria-label={seed === null ? 'Use default avatar' : `Avatar style ${index}`}
                aria-pressed={active}
                className={cn(
                  'rounded-full p-0.5 transition-transform duration-150 active:scale-90',
                  active ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg' : '',
                )}
              >
                <Avatar address={nimiq.address} size={40} seed={seed} />
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <Eyebrow className="mb-3 text-faint">Appearance</Eyebrow>
        <div className="flex items-center justify-between rounded-2xl bg-panel-2 px-4 py-3">
          <div>
            <p className="text-[0.875rem] font-bold">Dark mode</p>
            <p className="mt-0.5 text-[0.6875rem] text-faint">Follows your phone until you choose.</p>
          </div>
          <ThemeToggle />
        </div>
      </section>

      <section>
        <Eyebrow className="mb-3 text-faint">Record</Eyebrow>
        <div className="grid grid-cols-2 gap-3">
          <StatTile label="Played" value={0} icon={<SwordsIcon className="size-3.5" />} />
          <StatTile label="Won" value={0} accent="accent" icon={<TrophyIcon className="size-3.5" />} />
          <StatTile label="Win rate" value="—" icon={<TargetIcon className="size-3.5" />} />
          <StatTile label="Best streak" value={0} accent="flame" icon={<FlameIcon className="size-3.5" />} />
        </div>
        <PhaseNote className="mt-3">
          Real counters at zero. Nothing is recorded until challenges can be settled.
        </PhaseNote>
      </section>

      <section>
        <Link
          href="/wallet"
          className="flex items-center justify-between rounded-2xl bg-contrast px-4 py-3.5 text-on-contrast active:opacity-80"
        >
          <span>
            <span className="block text-[0.875rem] font-bold">Wallet and earnings</span>
            <span className="mt-0.5 block text-[0.6875rem] text-on-contrast/60">
              Deposit, withdraw, reward history
            </span>
          </span>
          <ChevronRightIcon className="size-4" />
        </Link>
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
                className="flex items-center gap-3 rounded-2xl bg-panel-2 p-3"
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

/**
 * Profile picture.
 *
 * The chosen file is cropped square and re-encoded before it is stored, since a
 * phone photo would otherwise blow the localStorage quota on its own. It never
 * leaves the device — there is no upload endpoint, and a picture is not
 * something TeTe needs a copy of.
 */
function PhotoPicker({
  address,
  seed,
  photo,
  onPick,
  onClear,
}: {
  address: string | null;
  seed: number | null;
  photo: string | null;
  onPick: (file: File) => void;
  onClear: () => void;
}) {
  const input = useRef<HTMLInputElement | null>(null);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => input.current?.click()}
        aria-label="Change profile picture"
        className="relative block rounded-full transition-transform duration-150 active:scale-95"
      >
        <Avatar address={address} size={78} seed={seed} photo={photo} />
        <span className="absolute -bottom-0.5 -right-0.5 flex size-7 items-center justify-center rounded-full border-2 border-contrast bg-accent text-on-accent">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="size-3.5" aria-hidden>
            <path d="M4 8h3l2-3h6l2 3h3v11H4Z" strokeLinejoin="round" />
            <circle cx="12" cy="13" r="3.2" />
          </svg>
        </span>
      </button>

      {photo && (
        <button
          type="button"
          onClick={onClear}
          className="mt-2 block w-full text-[0.6875rem] font-bold text-on-contrast/55 underline underline-offset-2"
        >
          Remove photo
        </button>
      )}

      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onPick(file);
          event.target.value = '';
        }}
      />
    </div>
  );
}
