# TeTe

**Peer-to-peer skill challenges, settled in NIM or USDT — a Nimiq Pay Mini App.**

Two players agree a challenge, put up the same stake, compete, and the stake goes to
the winner. No luck, no house edge, no custody: TeTe never touches a private key or a
seed phrase. Every wallet action is approved by the user inside Nimiq Pay.

This repository is at **Phase 1**. The foundation is built and the Mini App
integration is proven end to end. Challenges, escrow and reputation are not
implemented yet — see [Roadmap](#roadmap).

---

## Status: what is real today

Everything below reads live data from Nimiq Pay or from a chain. There is no mock
wallet, no placeholder balance and no simulated transaction anywhere in this codebase.

| Capability | State | How |
| --- | --- | --- |
| Nimiq Pay environment detection | ✅ | `window.nimiqPay` / `window.nimiq` |
| Mini App SDK initialisation | ✅ | `init()` from `@nimiq/mini-app-sdk` |
| Nimiq account connection | ✅ | `listAccounts()`, behind a user tap |
| Nimiq consensus + block height | ✅ | `isConsensusEstablished()`, `getBlockNumber()` |
| NIM balance | ⚠️ conditional | No provider method exists — read from a Nimiq RPC node when one is configured. See [NIM balance](#nim-balance-the-one-real-gap) |
| EVM provider detection | ✅ | `window.ethereum` (EIP-1193) |
| EVM account connection | ✅ | `eth_requestAccounts`, behind a user tap |
| Active chain + chain switching | ✅ | `eth_chainId`, `wallet_switchEthereumChain` |
| USDT balance | ✅ | `eth_call` → `balanceOf` on the real USDT contract |
| Five working screens | ✅ | Home, Challenges, Create, Leaderboard, Profile |
| Challenge builder | ✅ local only | Real 3-step form, saves an unfunded local draft |
| Local display name + avatar | ✅ | Name stored on device, avatar derived from the address |
| Challenge by username | ✅ local only | Saved roster of opponents; no global handle registry yet |
| Arcade — 3 playable arcade games | ✅ | Crossing, Drift, Slice. Canvas game loops, touch input |
| Light / dark theme | ✅ | Orange-on-white, or green-on-black. Follows the OS by default |
| Notification centre | ✅ local only | Events recorded on this device |
| Wallet, deposit | ✅ real | A signed NIM transfer to a configured treasury |
| Wallet, withdrawal | ❌ not possible | Needs a treasury key signing from a server |
| Rewards ledger (NIM) | ✅ recorded, unpaid | Real amounts owed; see [Rewards](#rewards-and-why-they-are-unpaid) |
| Shareable challenge links | ✅ | Terms encoded in the URL — works with no backend |
| Profile customisation | ✅ | Display name, avatar style, theme |
| Daily check-in + streak | ✅ local only | Real streak, pays XP |
| XP progression | ✅ local only | **XP is not NIM.** See [Rewards](#rewards-and-why-xp-is-not-nim) |
| NIM/token rewards | ❌ not possible yet | Needs a funded treasury and a backend that can sign payouts |
| Escrow, invites, settlement, ranking | ❌ not built | Phase 2+ |

No transaction is ever sent in Phase 1. The app only reads state and requests
account access.

---

## Quick start

**Requirements:** Node.js 22+, and Nimiq Pay installed on a phone on the same Wi-Fi
network as your development machine.

```bash
npm install
npm run dev
```

The dev server binds to `0.0.0.0:5173` so a phone can reach it. Find your machine's
LAN address (`ipconfig getifaddr en0` on macOS, `hostname -I` on Linux) and open
`http://<your-lan-ip>:5173` in **Nimiq Pay → Mini Apps → Custom URL**.

Opening the URL in a desktop browser is also fine — TeTe detects that no wallet
provider was injected and shows you how to open it in Nimiq Pay instead. You just
cannot connect a wallet there, because there is no wallet.

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
3. TeTe loads. Tap **Connect wallet**; Nimiq Pay raises its own confirmation dialog.
4. Approve, and the Home screen shows your address, live consensus state and block
   height.
5. Tap **Connect EVM wallet** for the USDT side.

**Use testnet for anything involving funds.** Nimiq Pay has a hidden dev menu: open
the app menu and long-press the settings button for ~10 seconds, then choose
**Testnet**. On testnet, a **Get free NIM** button appears on the empty-state home
screen and in the Top Up modal (110,000 NIM per request).

Note that the testnet switch affects **Nimiq operations only**. EVM operations stay
on mainnet chains, so do not send real USDT while testing.

### Deeplinks

```
nimiqpay://miniapp?url=your-domain.example
```

The custom scheme is what the handoff screen uses. Nimiq Pay warns before
loading a URL it does not recognise but does proceed, so this works for an app
that is not in the directory yet.

The documented HTTPS equivalent, `https://nimpay.app/miniapps/open/<domain>`, is
**not** used. The docs state it "works with any domain"; in practice it answers
404 — *"This app isn't in the directory"* — for anything unlisted. It becomes
usable once TeTe is submitted to the Nimiq Pay catalogue.

A custom scheme fails silently when the app is not installed and does nothing on
desktop, and neither failure is detectable from the page. So the pasteable URL
for **Mini Apps, Custom URL** is always shown, and is promoted after an attempt.

---

## Environment variables

All variables are optional — the app runs with none of them. Copy `.env.example` to
`.env.local` to set any.

Everything here is `NEXT_PUBLIC_*` and therefore **public**: it is inlined into the
bundle that ships to the WebView. Never put a secret in it. If a later phase needs a
privileged API key, it belongs behind a backend route, not in the client.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_NIMIQ_RPC_URL` | Nimiq JSON-RPC endpoint. Enables the NIM balance. Unset ⇒ the UI states the balance is unavailable. |
| `NEXT_PUBLIC_NIMIQ_NETWORK` | `mainnet` or `testnet`. Labels which network the RPC endpoint points at. Informational only. |
| `NEXT_PUBLIC_APP_URL` | Public origin, used to build the Nimiq Pay deeplink. Falls back to `window.location.origin`. |
| `NEXT_PUBLIC_EVM_DEFAULT_CHAIN_ID` | Hex chain id preferred for USDT stakes. Defaults to `0x89` (Polygon). |

Public Nimiq RPC endpoints are listed at <https://nimiq.dev/rpc/open-servers>. They
are explicitly not production-grade; run your own node for production.

---

## Architecture

Blockchain interaction is kept strictly out of application logic.

```
src/
├── app/                    App Router — one folder per screen
│   ├── page.tsx            Home
│   ├── challenges/         Challenges (drafts / active / done)
│   ├── create/             Challenge builder, 3 steps
│   ├── leaderboard/        Rankings
│   ├── profile/            Player
│   ├── icon.svg            Favicon
│   └── globals.css         Design tokens
├── components/
│   ├── ui/                 Button, Sticker, Chip, StatTile, Segmented,
│   │                       EmptyState, Avatar, Marquee, Sunburst, PhaseNote
│   ├── shell/              AppFrame, TopBar, TabBar, BrandMark, icons
│   └── wallet/             BalanceRail, ConnectPanel
├── lib/                    ← pure TypeScript. No React, no Next.js.
│   ├── config/env.ts       Environment configuration
│   ├── host/context.ts     window.nimiqPay: host language, device identifier
│   ├── nimiq/              SDK init, error normalisation, units, addresses
│   ├── evm/                EIP-1193 access, chains, ERC-20 reads
│   ├── challenges/         Challenge types + local draft storage
│   ├── profile/            Local display name
│   ├── clipboard.ts        Copy with a non-secure-context fallback
│   └── ids.ts              ID generation with a non-secure-context fallback
├── state/                  The only place lib/ meets React
└── types/                  Domain vocabulary
```

**The rule:** `lib/` is framework-agnostic and has no React import. `state/` is the
single seam where it becomes React state. Screens consume `useMiniApp()` and never
call a provider directly.

That seam is what makes Phase 2 additive rather than a rewrite. `lib/challenges`,
`lib/escrow` and `lib/reputation` will sit beside `lib/nimiq` and `lib/evm` as more
pure modules; the challenge state machine will be a reducer that consumes escrow
events. Those folders are deliberately **not** created yet — there is nothing to put
in them, and empty abstractions are harder to remove than to add.

---

## Design

TeTe is meant to feel like a game you open for fun, not a dashboard you check.
The visual language leans on four cheap-to-render moves:

- **Chunky uppercase display type.** Archivo 900, tightly tracked, loaded through
  `next/font` so it is self-hosted at build time — no runtime request to Google,
  no layout shift on a phone connection.
- **Alternating white and near-black surfaces.** A warm-white page with white
  cards, punctuated by inverted dark panels, is what stops the layout
  flattening into one pale sheet.
- **Hard, blur-free shadows.** A solid offset shadow plus a real border makes a
  panel read as a sticker rather than floating glass. Pressing a button collapses
  the shadow and nudges the element into it, so a tap feels physical.
- **One accent that leads.** Orange points at every action. Violet means USDT,
  flame means streak, gold means rank — each support colour carries exactly one
  meaning, so colour is information rather than decoration. Orange ships in two
  values: a vivid one for fills, and a darkened `accent-text` for the cases
  where orange has to be type on white and the vivid version misses contrast.

Motion is limited to `transform` and `opacity` so it stays on the compositor,
and everything is disabled under `prefers-reduced-motion`.

### Challenging by username

Opponents are addressed by name — `@rival99` rather than 36 characters of
address. The honest limit, which the UI states rather than hides: TeTe has no
backend, so there is **no global handle registry** to look anyone up in. A
username is a nickname the player assigns on their own device.

So adding someone to the roster needs their address exactly once; from then on
they are reachable by name, and challenge rows read "vs @rival99". The roster
rejects a duplicate username and refuses to save one address under two names, so
a single opponent cannot appear twice. When a backend arrives this becomes the
local cache in front of a real registry and the address step goes away — the
record shape does not change.

### The arcade games are original

The three games sit in familiar arcade *genres* — road-crossing, one-touch
driving, swipe-to-slice — because genre mechanics belong to nobody. What is not
reproduced is any name, character, artwork, sound or level from an existing
commercial title. Titles like Pac-Man, Fruit Ninja, Crossy Road, Helix Jump and
Drift Boss are trademarked properties of their publishers; cloning one into a
public repository would be straightforward infringement, competition entry or
not. So these are written from scratch, with their own names and art.

Each runs on a shared canvas harness (`components/arcade/GameCanvas.tsx`) that
handles device-pixel sizing, a clamped animation loop and pointer input. Game
state lives in a ref and is mutated inside the frame callback, so a running game
never triggers a React render — sixty renders a second is the quickest way to
make a WebView feel cheap.

### Brand assets and the login intro

The logo ships as an app-icon tile (`public/brand/`), resized from the 1254px
source at build time so a phone never fetches the original. It is used as-is
rather than knocked out onto a transparent background — that left a halo and
erased the die pips — and it reads correctly on both the light and dark grounds.
It also supplies the favicon and the Apple touch icon.

Connecting plays `public/brand/intro.mp4` (H.264/AAC, ~508 KB, 2.6s), skippable
on tap. Three things can go wrong with autoplay in a WebView — the file fails to
load, the codec is unsupported, or playback is refused — and each drops to a
composited animation rather than a black screen. A clip that has not begun
within 1.8s is abandoned for the same reason. Point `NEXT_PUBLIC_INTRO_VIDEO`
elsewhere to swap the film, or set it empty to always animate.

### Escrow

Escrow is **custodial**. Both players send their stake to a treasury address and
the treasury pays the winner. That is not the first choice — a hashed-timelock
contract would hold the pot trustlessly — but the Mini App provider can only
create basic and staking transactions, so it cannot build an HTLC on a player's
behalf. Custody is the only shape that works through the provider today, and
while a challenge is funded the operator holds the money.

The flow, with what is checked at each step:

| Step | Guard |
| --- | --- |
| Post a challenge | Signature proves the host owns the address |
| Aim it at `@name` | Username resolved through the directory — no address typed |
| Accept | Only the invited player, or anyone if it is open |
| Fund | A confirmed on-chain transfer to the treasury, from that player, for at least the stake, carrying the challenge id |
| Report | Only the two players in the match |
| Settle | Both reports agree; the pot is sent to the winner |
| Disagree | State becomes `disputed` and **nothing is paid** |

Every write is authorised by a signature over that exact action and a
timestamp, so a signature captured for one request cannot be replayed as
another. The server checks both that the signature verifies *and* that the
address derived from the public key is the address being claimed — checking
only the first would let anyone sign with their own key while claiming
somebody else's address.

Conflicting reports are never resolved automatically. Choosing a winner from
contradictory claims is precisely the decision that needs a human or an oracle.

### Rewards, and why they are unpaid

The arcade and the daily check-in credit **NIM** to a rewards ledger. Those
amounts are real and recorded — and unpaid. That is a structural limit rather
than a shortcut.

**TeTe cannot send anyone NIM.** The Mini App provider signs transactions *from
the connected player's own wallet, with their approval on a native dialog*.
There is no mechanism for the app to send funds *to* a player. Paying rewards
needs a server holding a treasury key that signs outgoing transactions — a
backend with hot-wallet custody, which this repository does not have and which
cannot be faked in a client.

So the ledger records what is owed and every screen that shows it says it is
not yet payable. A **deposit** works today and is genuinely on chain, because
that direction only needs the player to sign. When a treasury exists, payouts
settle against exactly these entries.

Reward rates in `lib/wallet/earnings.ts` are placeholders. They must be tuned
against a real pool before anything pays out: burn rate is players x sessions x
those numbers, and a small float empties fast once a faucet is public.

For testing, real liquidity is not needed at all: Nimiq Pay's hidden dev menu
switches to testnet, where **Get free NIM** credits 110,000 testnet NIM per
request.

### Honest empty states

Most of TeTe is legitimately empty — no match has ever been played. Rather than
fill screens with sample opponents and invented win rates, emptiness gets
designed: a podium with nobody on it, counters sitting at a real zero, and a
`PhaseNote` wherever a surface will later hold live data. Nothing on screen can
be mistaken for a working on-chain feature.

---

## Nimiq implementation notes

These are the decisions worth knowing about, and why they were made.

### The SDK is only three functions

`@nimiq/mini-app-sdk` (v0.1.0) exports `init()`, `getHostLanguage()`,
`requestDeviceIdentifier()` and the provider types. It does not wrap the wallet — it
waits for Nimiq Pay to inject `window.nimiq` and gives you typings. All actual
capability lives on the injected `NimiqProvider`.

TeTe reaches the provider **only** through `init()`, as the documentation requires,
and never constructs a `NimiqProvider` itself.

### Provider failures arrive in two shapes

A provider call can reject **or** resolve with `{ error: { type, message } }`.
Handling only one of these is a real source of silent bugs. `lib/nimiq/provider.ts`
collapses both into a single `NimiqProviderError` carrying a `kind`
(`rejected` / `unavailable` / `failed`), so the UI can treat a dismissed
confirmation dialog as a normal outcome rather than an error. The same normalisation
exists on the EVM side against EIP-1193 codes (`4001` rejected, `4902` unknown chain).

### Nothing prompts on page load

The pre-ship checklist is explicit that approval dialogs must not fire without user
interaction. So on mount TeTe only does things that never prompt: wait for provider
injection, read consensus and block height, read `eth_accounts` and `eth_chainId`.
`listAccounts()` and `eth_requestAccounts` run from a button press and nowhere else.

### NIM balance: the one real gap

**The Mini App Nimiq provider has no balance method.** Its documented surface is
`listAccounts`, `sign`, `isConsensusEstablished`, `getBlockNumber`,
`sendBasicTransaction`, `sendBasicTransactionWithData` and the staking family.
Nothing reads an account.

What the provider does have is RPC routing: any method outside its wallet set is
forwarded to a JSON-RPC endpoint the Mini App configures — the mechanism the
documentation describes as *"other RPC calls use the configured endpoint or your mini
app's own RPC"*. TeTe uses exactly that, calling `getAccountByAddress` and reading
`balance` (an integer in Luna) when `NEXT_PUBLIC_NIMIQ_RPC_URL` is set.

Without that variable, the Home screen says the balance is unavailable and explains
why. It does not show a zero, a dash styled as a number, or any other stand-in.

### Amounts are Luna, not NIM

1 NIM = 100,000 Luna. Every provider amount is an integer number of Luna. TeTe keeps
Luna as its canonical unit and converts only for display (`lib/nimiq/units.ts`), so
Phase 2 stake and payout arithmetic never touches a float.

### One EVM address, many chains

Nimiq Pay derives a single EVM wallet from the user's entropy and uses the **same
address on every supported chain**. The variable is the chain, because USDT is a
different contract on each. `lib/evm/chains.ts` carries only contract addresses that
Nimiq's own documentation publishes:

| Chain | Chain ID | USDT |
| --- | --- | --- |
| Polygon | `0x89` | `0xc2132D05D31c914a87C6611C10748AEb04B58e8F` |
| Ethereum | `0x1` | `0xdAC17F958D2ee523a2206206994597C13D831ec7` |
| Arbitrum One | `0xa4b1` | `0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9` |
| Optimism | `0xa` | `0x94b008aA00579c1307B0EF2c499aD98a8ce58e58` |

Base (`0x2105`), BNB Smart Chain (`0x38`) and Sepolia (`0xaa36a7`) are exposed by
Nimiq Pay but have no documented USDT address, so TeTe reports the USDT path as
unavailable there rather than calling an address it cannot verify.

USDT uses **6 decimals**, not 18. Amounts are formatted with the token's real
`decimals` value.

### Why viem

The official checklist requires ABI encoding via a library rather than by hand. viem's
`encodeFunctionData` and `formatUnits` are imported individually so the rest is
tree-shaken out. It is the only runtime dependency beyond the SDK and the framework.

### Why Next.js, and why not a static export

The build keeps Next.js's standard server-capable output. Phase 1 executes nothing on
the server — every provider call is client-only — but challenge state, result
verification and dispute records will need route handlers, and adding them later to a
static export means restructuring the project.

`next.config.ts` sets `allowedDevOrigins` for private IPv4 ranges. Next.js 16 rejects
dev asset requests from unlisted origins, which breaks the one workflow this project
depends on: loading `http://192.168.x.x:5173` from a phone. Without it the page
renders but never hydrates, with 403s on `/_next/static/chunks/*`. Production builds
are unaffected.

### No web fonts

Type is a system stack. A Mini App loads over a phone's LAN connection during
development and inside a WebView in production; a blocking font fetch is a failure
mode with nothing to gain.

---

## Security

- TeTe never sees, requests, stores or transmits a private key or seed phrase. It
  cannot: the WebView is sandboxed and Nimiq Pay mediates every wallet operation.
- Every sensitive action goes through a native Nimiq Pay confirmation dialog. TeTe
  has no way to bypass one and does not try.
- No credentials are in the codebase. Every environment variable is public by design.
- Connection state lives in memory only. TeTe stores nothing about the user — no
  cookie, no local storage, no analytics.
- `requestDeviceIdentifier()` is deliberately **not** called. It prompts the user, so
  it belongs to the leaderboard/anti-spam work, not to onboarding. It identifies a
  device, not a person, and will never be used as an authentication identity.

---

## Roadmap

Phase 1 is the foundation. What comes next, in order:

1. **Challenges** — the builder exists and saves local drafts today; next comes
   sending an invite by shareable link.
2. **Escrow** — both players fund, funds held until settlement.
3. **Results** — submit and confirm, with both players signing the outcome
   (`nimiq.sign()` / `eth_signTypedData_v4`) so neither can later deny it.
4. **Reputation** — built from completed challenges.
5. **Marketplace, leaderboards, seasons, disputes.**

Only skill-based formats. No games of chance.

---

## Open questions

Honest list of what still needs verification against a real device or a Nimiq
maintainer.

1. **`sendBasicTransaction` return value.** The API reference documents it as
   returning a **transaction hash**; the SDK's own TypeScript doc comment says
   "the serialized transaction". These are different things and Phase 2's escrow
   depends on which. Needs confirming on a device before any transaction code ships.
2. **NIM escrow has no contract primitive.** Nimiq supports HTLC and vesting accounts
   at the protocol level, but the Mini App provider exposes only basic transactions
   and staking — it cannot create either. So NIM escrow cannot be a trustless on-chain
   contract through the Mini App provider alone. The options are a settlement address
   with signed, published terms, or an arbiter-mediated design. This is the single
   biggest open design question for Phase 2, and it is a framework constraint rather
   than a preference.
3. **USDT escrow needs gas.** In a Mini App, ERC-20 transfers go through
   `eth_sendTransaction` under standard EVM gas rules — Nimiq Pay's gas abstraction
   applies to its own native USDT sends, not to Mini App transactions. A player with
   USDT but no POL cannot fund an escrow. The flow must detect and explain this.
4. **Wallet network is not observable.** A Mini App cannot ask Nimiq Pay whether it is
   on mainnet or testnet. `NEXT_PUBLIC_NIMIQ_NETWORK` therefore labels the configured
   RPC endpoint, not the wallet. If the two disagree, a balance read will be wrong.
   Worth raising upstream: a `getNetworkId()` on the provider would close this.
5. **SDK version drift.** The `nimiq` branch of `trust-web3-provider` exports
   `getHostFiat()` and a `Fiat` enum that are **not** in the published v0.1.0. TeTe
   codes against the published package. Displaying stake values in the user's chosen
   fiat currency becomes possible when that ships.
6. **Untested on a physical device.** Everything here was verified against the
   documented API surface, a production build, and browser rendering at 375px and
   390px. It has not yet run inside Nimiq Pay on real hardware — that is the next
   thing to do, and step 5 of the scaffold flow says not to build further until it
   passes.

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
