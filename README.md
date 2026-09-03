# TeTe

**Stake on skill. Play free in the arcade.**

A Nimiq Pay Mini App for peer-to-peer skill challenges. Two players agree a
challenge, put up the same stake in NIM, compete, and the stake goes to the
winner — decided by skill, never by chance. No stake, no problem: the arcade
next to it is free to play and pays real (small) rewards for how well you do.

TeTe never touches a private key or a seed phrase. Every wallet action is
approved by the player inside Nimiq Pay.

**Live:** [teteonnimiq.site](https://teteonnimiq.site)

---

## Status: what is real today

Nothing below is simulated. Where the backend is configured, escrow, disputes,
and rewards move real NIM on chain; where it is not, the app says so and falls
back to a local-only mode rather than faking a result.

| Capability | State | Notes |
| --- | --- | --- |
| Nimiq + EVM wallet connection | ✅ | `window.nimiq` / `window.ethereum`, behind a user tap |
| NIM balance | ✅ | Read server-side (`/api/balance`) when `NIMIQ_RPC_URL` is set; falls back to a client-side RPC read if only `NEXT_PUBLIC_NIMIQ_RPC_URL` is public; otherwise reported unavailable |
| USDT balance | ✅ | `eth_call` → `balanceOf` on the real USDT contract, per chain |
| Challenge builder | ✅ | 8 formats, direct-by-username or open-to-anyone, shareable link |
| **Escrow (NIM)** | ✅ real | Custodial treasury. Both stakes verified on chain before a match goes live; payout is a real signed transaction, waited-for on chain |
| Escrow (USDT) | ⚠️ selectable, not verified | The stake currency picker offers it; there is no on-chain funding check or payout for it yet — see [Roadmap](#roadmap) |
| Disputes | ✅ real | Conflicting reports hold the pot; both sides can mutually agree to void; otherwise an operator resolves manually |
| Rewards ledger | ✅ real | Arcade score and daily streak credit real NIM, server-side |
| Reward withdrawal | ✅ real | Pays the server-tracked balance (never a client-supplied number), from 25 NIM |
| Tipping | ✅ real | Signed ledger-to-ledger transfer to another username, no fee, no minimum |
| Activity history | ✅ real | Per-address, server-recorded, visible from any device |
| Username directory | ✅ real | Claimed by signing; challenge-by-username needs no address typed |
| Arcade — 8 playable games | ✅ | Crossing, Drift, Slice, Invasion, Rush, Pitch, Overheat, Alley |
| Daily check-in + streak | ✅ | Server-backed when configured; local-only fallback otherwise |
| Leaderboard | ⚠️ honest empty state | Explains how rank will be earned; nobody has a rank yet because no match has settled |
| Light / dark theme, profile customisation | ✅ | Local to the device |

Everything above degrades gracefully: without a durable store the app runs in
local-draft mode (`GET /api/status` reports `{ store: false, escrow: false }`);
with a store but no treasury, challenges can be listed but not funded. The
client only ever offers what the deployment can actually do.

---

## Quick start

**Requirements:** Node.js 22+, and Nimiq Pay installed on a phone on the same
Wi-Fi network as your development machine.

```bash
npm install
npm run dev
```

The dev server binds to `0.0.0.0:5173` so a phone can reach it. Find your
machine's LAN address (`ipconfig getifaddr en0` on macOS, `hostname -I` on
Linux) and open `http://<your-lan-ip>:5173` in **Nimiq Pay → Mini Apps →
Custom URL**.

Opening the URL in a desktop browser is also fine — TeTe detects that no
wallet provider was injected and shows you how to open it in Nimiq Pay
instead. You just cannot connect a wallet there, because there is no wallet.

```bash
npm run build       # production build
npm run start       # serve the production build
npm run typecheck   # tsc --noEmit
```

---

## Testing inside Nimiq Pay

1. Run `npm run dev` and note your LAN URL, e.g. `http://192.168.1.42:5173`.
   **Do not use `localhost`** — inside the WebView that resolves to the phone.
2. Open Nimiq Pay → **Mini Apps** → paste the URL into the Custom URL field.
3. TeTe loads. Tap **Connect wallet**; Nimiq Pay raises its own confirmation
   dialog.
4. Approve, and the Home screen shows your address, live consensus state and
   balance.
5. Tap **Connect EVM wallet** for the USDT side.

**Use testnet for anything involving funds.** Nimiq Pay has a hidden dev menu:
open the app menu and long-press the settings button for ~10 seconds, then
choose **Testnet**. On testnet, a **Get free NIM** button appears on the
empty-state home screen and in the Top Up modal (110,000 NIM per request).

Note that the testnet switch affects **Nimiq operations only**. EVM operations
stay on mainnet chains, so do not send real USDT while testing.

### Deeplinks

```
nimiqpay://miniapp?url=your-domain.example
```

The custom scheme is what the handoff screen uses. Nimiq Pay warns before
loading a URL it does not recognise but does proceed, so this works for an app
that is not in the directory yet.

The documented HTTPS equivalent, `https://nimpay.app/miniapps/open/<domain>`,
is **not** used. The docs state it "works with any domain"; in practice it
answers 404 — *"This app isn't in the directory"* — for anything unlisted. It
becomes usable once TeTe is submitted to the Nimiq Pay catalogue, which is
done through the catalogue's own open-source repository on GitHub, not this
one.

A custom scheme fails silently when the app is not installed and does nothing
on desktop, and neither failure is detectable from the page. So the pasteable
URL for **Mini Apps, Custom URL** is always shown, and is promoted after an
attempt.

---

## Environment variables

Copy `.env.example` to `.env.local` to set any. The app runs with none of
them, in a local-only mode — no directory, no escrow, no payouts.

### Client (`NEXT_PUBLIC_*`) — inlined into the bundle, never a secret

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_NIMIQ_RPC_URL` | Optional client-side fallback for the NIM balance, used only if the server-side path below isn't configured. Must be an endpoint safe to publish — it ships to every phone. |
| `NEXT_PUBLIC_NIMIQ_NETWORK` | `mainnet` or `testnet`. Labels which network the RPC endpoint points at. Informational only — a Mini App cannot query which network the wallet is on. |
| `NEXT_PUBLIC_APP_URL` | Public origin, used to build the Nimiq Pay deeplink. Falls back to `window.location.origin`. |
| `NEXT_PUBLIC_EVM_DEFAULT_CHAIN_ID` | Hex chain id preferred for USDT stakes. Defaults to `0x89` (Polygon). |
| `NEXT_PUBLIC_INTRO_VIDEO` | Swap the post-connect intro clip. Empty string forces the composited fallback animation. |
| `NEXT_PUBLIC_EXPLORER_TX_URL` | Optional block-explorer link template, `{hash}` as the placeholder. Unset by default — the raw hash is always shown, with copy. |

### Server only — never prefix with `NEXT_PUBLIC_`

Without these the API answers 503 and the app runs local-only. It fails
closed on purpose.

| Variable | Purpose |
| --- | --- |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Durable store (Upstash Redis REST, or Vercel KV). Escrow refuses to move money without it — a payout that cannot be recorded could be replayed. |
| `NIMIQ_RPC_URL`, `NIMIQ_RPC_AUTH` | Albatross RPC node. Preferred path for reading balances; required for the treasury. `NIMIQ_RPC_AUTH` is optional HTTP basic auth, `user:pass`. |
| `NIMIQ_TREASURY_ADDRESS`, `NIMIQ_TREASURY_PASSPHRASE` | The custodial wallet stakes are sent to and winners are paid from. Must exist and be unlockable on the node above. |
| `NIMIQ_MAX_PAYOUT_LUNA` | Ceiling on a single payout, in Luna. Defaults to 50 NIM. A bug cannot drain more than this in one transaction. |
| `NIMIQ_ADMIN_TOKEN` | Bearer token for the two admin routes (manual ledger correction, dispute resolution). As sensitive as the treasury passphrase. |

Public Nimiq RPC endpoints are listed at <https://nimiq.dev/rpc/open-servers>.
They are explicitly not production-grade; run your own node for production —
which is what the server-side `NIMIQ_RPC_URL` path is for.

---

## Architecture

Blockchain interaction is kept strictly out of application logic.

```
src/
├── app/
│   ├── page.tsx                Home
│   ├── challenges/[id]/        Challenge detail — fund, report, dispute, settle
│   ├── create/                 Challenge builder
│   ├── c/                      Shareable-link landing for an unopened challenge
│   ├── arcade/                 The 8 games
│   ├── wallet/                 Earnings, withdraw, tip
│   ├── leaderboard/, profile/
│   └── api/                    Route handlers — the only place secrets live
│       ├── challenges/         Post, list, accept, fund, report, void
│       ├── diagnose/funding/   Inspect the treasury's own tx history for a stake
│       ├── rewards/, streak/, tip/, withdraw/, activity/
│       ├── players/            Username directory
│       ├── balance/, status/
│       └── admin/               Bearer-token-guarded: ledger correction, dispute resolution
├── components/
│   ├── arcade/, challenges/, shell/, ui/, wallet/
├── lib/                         ← pure TypeScript. No React, no Next.js.
│   ├── config/env.ts            Client env
│   ├── nimiq/, evm/             Provider access, units, chains
│   ├── escrow/types.ts          The state machine — shared by client and server
│   ├── challenges/, roster/     Local drafts, local opponent nicknames
│   ├── wallet/earnings.ts       Reward rates (client-displayed; server copy is authoritative)
│   └── server/                  Server-only: auth, treasury, rpc, store, challenges, rewards, players, activity, env
├── state/                       The only place lib/ meets React
└── types/
```

**The rule:** `lib/` (minus `lib/server/`) is framework-agnostic and has no
React import. `lib/server/` is `server-only` and never imported by a client
component. `state/` is the seam where it becomes React state.

---

## Design

TeTe is meant to feel like a game you open for fun, not a dashboard you check.
The visual language leans on four cheap-to-render moves:

- **Chunky uppercase display type.** Archivo 900, tightly tracked, loaded
  through `next/font` so it is self-hosted at build time — no runtime request
  to Google, no layout shift on a phone connection.
- **Alternating white and near-black surfaces.** A warm-white page with white
  cards, punctuated by inverted dark panels, is what stops the layout
  flattening into one pale sheet.
- **Hard, blur-free shadows.** A solid offset shadow plus a real border makes
  a panel read as a sticker rather than floating glass. Pressing a button
  collapses the shadow and nudges the element into it, so a tap feels
  physical.
- **One accent that leads.** Orange points at every action. Violet means
  USDT, flame means streak, gold means rank — each support colour carries
  exactly one meaning, so colour is information rather than decoration.

Motion is limited to `transform` and `opacity` so it stays on the compositor,
and everything is disabled under `prefers-reduced-motion`.

### Cover art: photos where they're free to use, marks where they aren't

Chess, Trivia, eFootball and Custom use real photos (`public/format-art/`) —
each one checked directly and confirmed generic: a stock chess set, a
marquee sign, a stadium crowd with no players or branding in frame, a plain
typographic graphic. CODM, PUBG Mobile, Free Fire and Arcade stay drawn marks
that evoke the genre instead — every reference image offered for those turned
out to be a specific character illustration lifted from that game's own
promotional art, and removing a logo does not clear the copyright a publisher
holds on the drawing itself.

### Challenging by username

Opponents are addressed by name — `@rival99` rather than 36 characters of
address. A username is claimed once by signing with the address it points at,
in a small public directory (`lib/server/players.ts`); from then on it
resolves for anyone, on any device, and a challenge can be aimed at it with no
address typed. Each player also keeps a local roster of nicknames on their own
device as a shortcut in front of that directory.

### The arcade games are original

Eight games, each in a familiar arcade *genre* — road-crossing, one-touch
driving, swipe-to-slice, tower defence, three-lane running, curling a shot
round a wall, throttle-and-landing, beat-em-up pickups — because genre
mechanics belong to nobody. What is not reproduced is any name, character,
artwork, sound or level from an existing commercial title.

Each runs on a shared canvas harness (`components/arcade/GameCanvas.tsx`)
that handles device-pixel sizing, a clamped animation loop and pointer input.
Game state lives in a ref and is mutated inside the frame callback, so a
running game never triggers a React render — sixty renders a second is the
quickest way to make a WebView feel cheap.

### Brand assets and the login intro

The logo ships as an app-icon tile (`public/brand/`), resized from source at
build time so a phone never fetches the original, and supplies the favicon
and Apple touch icon.

Connecting plays `public/brand/intro.mp4`, skippable on tap. Three things can
go wrong with autoplay in a WebView — the file fails to load, the codec is
unsupported, or playback is refused — and each drops to a composited
animation rather than a black screen. Point `NEXT_PUBLIC_INTRO_VIDEO`
elsewhere to swap the film, or set it empty to always animate.

### Honest empty states

The leaderboard is legitimately empty — no match has ever settled. Rather
than fill it with sample opponents and invented win rates, the emptiness is
designed: a podium with nobody on it, and the exact rules for how a rank will
be earned. Nothing on screen can be mistaken for a working feature that
simply has no data yet.

---

## Escrow

Escrow is **custodial**. Both players send their stake to a treasury address
and the treasury pays the winner. That is not the first choice — a
hashed-timelock contract would hold the pot trustlessly — but the Mini App
provider can only create basic and staking transactions, so it cannot build
an HTLC on a player's behalf. Custody is the only shape that works through the
provider today, and while a challenge is funded the operator holds the money.
This is a deliberate, disclosed trade-off, not an oversight — see
[Security](#security) for what backs it.

| Step | Guard |
| --- | --- |
| Post a challenge | Signature proves the host owns the address |
| Aim it at `@name` | Username resolved through the directory — no address typed |
| Accept | Only the invited player, or anyone if it is open |
| Fund | A confirmed on-chain transfer to the treasury, from that player, for at least the stake, carrying the challenge id in its data field |
| Report | Only the two players in the match |
| Settle | Both reports agree; the pot is sent to the winner, waited-for on chain before the API reports success |
| Disagree | State becomes `disputed`. Nothing is paid automatically |
| Void | Both sides must offer to void — one side alone cannot undo a result they simply dislike |
| Arbitrate | An operator, holding a bearer token as sensitive as the treasury passphrase, can pay the pot to a side or refund both — the only two outcomes the challenge ever allows |

Deposits are **verified, never trusted**: a player claiming to have funded a
challenge proves nothing on its own, so the server scans the treasury's own
transaction history for a matching, confirmed payment before moving a
challenge to `funded`. A `/api/diagnose/funding` route exists for exactly the
case where a player insists they sent a stake and the challenge disagrees —
it shows what the treasury actually received, in every readable form of the
attached data, so a mismatched memo or amount is visible rather than argued
about.

Every write is authorised by a signature over that exact action and a
timestamp (5-minute window), so a signature captured for one request cannot
be replayed as another. The server checks both that the signature verifies
*and* that the address derived from the public key is the address being
claimed — checking only the first would let anyone sign with their own key
while claiming somebody else's address.

Conflicting reports are never resolved automatically. Choosing a winner from
contradictory claims is precisely the decision that needs a human, not a coin
flip — and a timer that released the pot back to both after a while would let
a losing player dispute every honest result and simply wait it out.

---

## Rewards

The arcade and the daily check-in credit real NIM to a server-side ledger as
you play — the client's own tally is only a display copy of it.

- **Withdraw** pays exactly the balance the server has credited (never a
  client-supplied number) once it clears 25 NIM, as a real signed transaction
  the withdrawal screen waits on before confirming.
- **Tip** moves value between two players' ledgers directly — no on-chain
  transaction, no fee, no minimum — so a balance below the withdrawal floor is
  still worth something to its owner.
- **Activity** is a public, server-recorded history per address, so a tip
  somebody else sent shows up on any device you open TeTe from.

Reward rates (`lib/wallet/earnings.ts`, with an authoritative server copy in
`lib/server/rewards.ts`) are deliberately small and placeholder-tuned: a
reward pool is a fixed float, and burn rate is players × sessions × these
numbers. A coin picked up mid-run pays more than the same stretch of plain
distance, on purpose — going for it costs a line, and that risk is where the
reward should sit.

For testing, real liquidity is not needed at all: Nimiq Pay's hidden dev menu
switches to testnet, where **Get free NIM** credits 110,000 testnet NIM per
request.

---

## Security

- TeTe never sees, requests, stores or transmits a player's private key or
  seed phrase. It cannot: the WebView is sandboxed and Nimiq Pay mediates
  every wallet operation, with its own native confirmation dialog.
- The treasury is different, and stated plainly: it **is** a custodial hot
  wallet, unlocked on a server-controlled node by
  `NIMIQ_TREASURY_PASSPHRASE`. It exists because the Mini App provider cannot
  build a trustless escrow primitive on a player's behalf — see
  [Escrow](#escrow). Its blast radius is bounded on purpose:
  `NIMIQ_MAX_PAYOUT_LUNA` caps any single payout, every payout is either a
  verified challenge settlement or an operator-arbitrated dispute (never a
  client-chosen amount), and the admin bearer token that can touch the
  reward ledger is guarded at the same trust level as the passphrase itself.
- Every authorised write (post, accept, report, void, withdraw, tip, claim a
  username) is a signature over that specific action and a timestamp, checked
  against both validity and the address the signer actually derives to — not
  taken on a player's word.
- `GET /api/status` exposes exactly two booleans — whether a durable store and
  a treasury are configured — never a URL, address or token. The client only
  ever offers an action the deployment can actually perform.
- Connection state otherwise lives in memory only. TeTe stores nothing about
  the user on its own — no cookie, no client-side analytics.
- `requestDeviceIdentifier()` is deliberately **not** called. It prompts the
  user, so it belongs to anti-spam work, not onboarding. It identifies a
  device, not a person, and will never be used as an authentication identity.

---

## Nimiq implementation notes

Decisions worth knowing about, and why they were made.

### The SDK is only three functions

`@nimiq/mini-app-sdk` (v0.1.0) exports `init()`, `getHostLanguage()`,
`requestDeviceIdentifier()` and the provider types. It does not wrap the
wallet — it waits for Nimiq Pay to inject `window.nimiq` and gives you
typings. All actual capability lives on the injected `NimiqProvider`.

TeTe reaches the provider **only** through `init()`, as the documentation
requires, and never constructs a `NimiqProvider` itself.

### Provider failures arrive in two shapes

A provider call can reject **or** resolve with `{ error: { type, message } }`.
Handling only one of these is a real source of silent bugs.
`lib/nimiq/provider.ts` collapses both into a single `NimiqProviderError`
carrying a `kind` (`rejected` / `unavailable` / `failed`), so the UI can treat
a dismissed confirmation dialog as a normal outcome rather than an error. The
same normalisation exists on the EVM side against EIP-1193 codes (`4001`
rejected, `4902` unknown chain).

### Nothing prompts on page load

The pre-ship checklist is explicit that approval dialogs must not fire
without user interaction. So on mount TeTe only does things that never
prompt: wait for provider injection, read consensus and block height, read
`eth_accounts` and `eth_chainId`. `listAccounts()` and `eth_requestAccounts`
run from a button press and nowhere else.

### NIM balance has two paths, and the server one is preferred

**The Mini App Nimiq provider has no balance method.** Its documented
surface is `listAccounts`, `sign`, `isConsensusEstablished`,
`getBlockNumber`, `sendBasicTransaction`, `sendBasicTransactionWithData` and
the staking family. Nothing reads an account directly.

What it does have is RPC routing — any method outside its wallet set is
forwarded to a configured JSON-RPC endpoint. TeTe's client-side fallback uses
exactly that (`getAccountByAddress`), but the app tries a server route first
(`/api/balance`, using the server-only `NIMIQ_RPC_URL`) so a credentialed
node's login is never inlined into a `NEXT_PUBLIC_` bundle that every phone
downloads. Set the server variable and the client one becomes unnecessary;
without either, the Home screen says the balance is unavailable and explains
why, rather than showing a zero or a dash styled as a number.

### Amounts are Luna, not NIM

1 NIM = 100,000 Luna. Every provider amount, every ledger entry and every
stake is an integer number of Luna. TeTe keeps Luna as its canonical unit and
converts only for display (`lib/nimiq/units.ts`), so escrow and reward
arithmetic never touches a float.

### One EVM address, many chains

Nimiq Pay derives a single EVM wallet from the user's entropy and uses the
**same address on every supported chain**. The variable is the chain, because
USDT is a different contract on each. `lib/evm/chains.ts` carries only
contract addresses that Nimiq's own documentation publishes:

| Chain | Chain ID | USDT |
| --- | --- | --- |
| Polygon | `0x89` | `0xc2132D05D31c914a87C6611C10748AEb04B58e8F` |
| Ethereum | `0x1` | `0xdAC17F958D2ee523a2206206994597C13D831ec7` |
| Arbitrum One | `0xa4b1` | `0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9` |
| Optimism | `0xa` | `0x94b008aA00579c1307B0EF2c499aD98a8ce58e58` |

Base (`0x2105`), BNB Smart Chain (`0x38`) and Sepolia (`0xaa36a7`) are exposed
by Nimiq Pay but have no documented USDT address, so TeTe reports the USDT
path as unavailable there rather than calling an address it cannot verify.

USDT uses **6 decimals**, not 18. Amounts are formatted with the token's real
`decimals` value.

### Why viem

The official checklist requires ABI encoding via a library rather than by
hand. viem's `encodeFunctionData` and `formatUnits` are imported individually
so the rest is tree-shaken out.

### Why Next.js, and why not a static export

Challenge state, escrow verification and payouts run as real server route
handlers — a static export was ruled out from the start for exactly this,
rather than something later phases had to migrate onto.

`next.config.ts` sets `allowedDevOrigins` for private IPv4 ranges. Next.js 16
rejects dev asset requests from unlisted origins, which breaks the one
workflow this project depends on: loading `http://192.168.x.x:5173` from a
phone. Without it the page renders but never hydrates, with 403s on
`/_next/static/chunks/*`. Production builds are unaffected.

### No web fonts

Type is a system stack. A Mini App loads over a phone's LAN connection during
development and inside a WebView in production; a blocking font fetch is a
failure mode with nothing to gain.

---

## Roadmap

What's genuinely still open, in order:

1. **USDT escrow.** The stake currency picker already offers it; funding
   verification and payout on the EVM side do not exist yet, unlike the NIM
   path. Needs a gas-awareness story too — see
   [Open questions](#open-questions).
2. **Reputation and ranking.** The leaderboard's rules are shown; nobody has
   a rank because it isn't computed from settled challenges yet.
3. **Trustless escrow.** Custody is a deliberate, disclosed trade-off — see
   [Escrow](#escrow) — not a preference. Moving off it needs either a
   provider primitive this Mini App SDK does not expose today, or a different
   settlement design entirely.
4. **Verification on real Nimiq Pay hardware.** Everything here is verified
   against the documented API surface and a production build; it has not yet
   been run inside Nimiq Pay on a physical device.
5. **Nimiq Pay catalogue submission**, so the documented HTTPS deeplink
   (`https://nimpay.app/miniapps/open/teteonnimiq.site`) starts working — a
   separate, GitHub-based process against the catalogue's own open-source
   repository, independent of this one.

Only skill-based formats. No games of chance.

---

## Open questions

1. **NIM escrow has no trustless contract primitive.** Nimiq supports HTLC
   and vesting accounts at the protocol level, but the Mini App provider
   exposes only basic transactions and staking — it cannot create either. A
   custodial treasury is the shape that works today; a non-custodial design
   remains the single biggest open question for going further.
2. **USDT escrow needs gas.** ERC-20 transfers in a Mini App go through
   `eth_sendTransaction` under standard EVM gas rules — Nimiq Pay's gas
   abstraction applies to its own native USDT sends, not to Mini App
   transactions. A player with USDT but no POL cannot fund an escrow, and
   this isn't built yet regardless.
3. **Wallet network is not observable.** A Mini App cannot ask Nimiq Pay
   whether it is on mainnet or testnet. `NEXT_PUBLIC_NIMIQ_NETWORK` labels the
   configured RPC endpoint, not the wallet. If the two disagree, a balance
   read will be wrong. Worth raising upstream: a `getNetworkId()` on the
   provider would close this.
4. **SDK version drift.** The `nimiq` branch of `trust-web3-provider` exports
   `getHostFiat()` and a `Fiat` enum that are **not** in the published
   v0.1.0. TeTe codes against the published package. Fiat-denominated stake
   display becomes possible when that ships.
5. **Untested on a physical device.** See [Roadmap](#roadmap) — the next
   thing to do before wider release, not before this submission.

`sendBasicTransaction`'s documented return value (a transaction hash) versus
the SDK's own doc comment ("the serialized transaction") no longer matters
for TeTe specifically: rather than trust what a send call returns, funding is
verified by scanning the treasury's own transaction history, and a payout
waits for its hash to actually appear on chain before reporting success. The
upstream documentation mismatch is still unresolved, but nothing here depends
on it.

---

## References

- [Mini Apps overview](https://nimiq.dev/mini-apps/)
- [Nimiq Provider API](https://nimiq.dev/mini-apps/api-reference/nimiq-provider)
- [Ethereum Provider API](https://nimiq.dev/mini-apps/api-reference/ethereum-provider)
- [Using EVM tokens](https://nimiq.dev/mini-apps/features/evm-tokens)
- [Load a local Mini App](https://nimiq.dev/mini-apps/development/load-local-mini-app)
- [`@nimiq/mini-app-sdk`](https://www.npmjs.com/package/@nimiq/mini-app-sdk)

## License

[MIT](./LICENSE)
