# How to use TeTe

A quick walkthrough for anyone opening TeTe for the first time — no code, just
what to tap.

**Live app:** [teteonnimiq.site](https://teteonnimiq.site)

---

## 1. Open it inside Nimiq Pay

TeTe is a *Mini App* — it runs inside the Nimiq Pay app, not a regular
browser, because that's what gives it access to your wallet.

1. Install **Nimiq Pay** if you don't have it.
2. Open Nimiq Pay → **Mini Apps** → **Custom URL**.
3. Paste `teteonnimiq.site` and load it.

Opening the link in a normal browser also works, but it shows you a
"open this in Nimiq Pay" screen instead of the app — there's no wallet to
connect to out there.

**Trying it out without risking real funds?** Nimiq Pay has a hidden dev
menu: open its own app menu and long-press the settings button for about 10
seconds, then choose **Testnet**. A **Get free NIM** button then appears
right on TeTe's empty-state screens — 110,000 test NIM per request, no real
money involved.

---

## 2. Connect your wallet

Tap **Connect wallet** on the Home screen. Nimiq Pay shows its own native
confirmation — approve it, and you're in. Everything from here on (funding a
stake, reporting a result, withdrawing) asks for that same kind of approval
before anything moves. TeTe never sees your seed phrase and can't act
without you tapping "approve."

If you want to stake in USDT instead of NIM later, also tap **Connect EVM
wallet** — same wallet, same address, just the Ethereum-compatible side of
it.

---

## 3. The five tabs

| Tab | What's there |
| --- | --- |
| **Home** | Your stats, the arcade shortcut, quick-create arenas, live matches |
| **Battles** | Every challenge you're part of — drafts, awaiting stakes, live, settled |
| **Create** | Set up a new challenge (sits in the middle, it's the main action) |
| **Arcade** | 8 free skill games |
| **You** | Profile, wallet, leaderboard |

---

## 4. Staking a challenge

This is the core loop: two players, equal stakes, winner takes the pot,
decided entirely by skill.

1. **Tap Create.** Pick a format — Chess, Trivia, eFootball, CODM, PUBG
   Mobile, Free Fire, Arcade (beat a high score), or Custom (name your own
   contest).
2. **Set the stake.** Choose NIM or USDT and an amount — quick-pick chips are
   there for common amounts, or type your own. Both players stake the same.
3. **Pick your opponent.** Either aim it at a specific `@username` (add them
   to your roster once by address, challenge them by name from then on), or
   leave it open for anyone to accept.
4. **Post it, then share the link.** Send it to your opponent however you'd
   normally message them — it opens directly inside Nimiq Pay for them too.
5. **They accept**, and now both of you owe the same stake.
6. **Fund your stake.** Tap fund on the challenge screen — Nimiq Pay asks you
   to sign a real transfer to TeTe's escrow, carrying this challenge's ID.
   The screen updates once your transfer is actually seen on chain (not
   just once you've signed something).
7. **Play the match yourselves** — outside the app, on whatever platform the
   format is actually played on. TeTe holds the stake; it doesn't referee
   the game itself.
8. **Report the result.** Both players tap who won. If you agree, the pot is
   paid straight to the winner's wallet. If you disagree, the challenge goes
   to **Disputed** and nothing pays out automatically.

**If a dispute happens:** either side can offer to call it off and take their
own stake back — but it takes *both* of you agreeing to void it, so a losing
player can't just refuse to agree and walk away with a refund. If you can't
resolve it between yourselves, it's escalated for a human decision.

**Right now, only NIM stakes fund and settle for real.** USDT is selectable
in the creator, but the on-chain funding check for it isn't wired up yet — use
NIM for anything you actually want to see through to a payout.

---

## 5. The arcade — free to play, still earns

Tap **Arcade** for 8 original skill games: Crossing, Drift, Slice, Invasion,
Rush, Pitch, Overheat, Alley. No stake needed. Every one is decided entirely
by your own input — nothing pays out on luck, ever.

Finish a round and your score is submitted; the server (not the number shown
on your screen) decides what it's worth and credits it to your rewards
balance. A coin picked up mid-run is worth chasing — it pays more than the
same stretch played safe, because going for it costs you a line.

---

## 6. Daily check-in

Home screen, every day: tap to check in and bank a small NIM reward. Keep
coming back and your streak builds — miss a day and it resets.

---

## 7. Your wallet — earnings, tipping, withdrawing

Under **You → Wallet**:

- **Earnings** shows your real, credited-but-not-yet-withdrawn NIM balance
  from the arcade and check-ins.
- **Withdraw** once you've got at least **25 NIM** — this sends a real
  transaction to your connected wallet, asking Nimiq Pay to sign to prove
  it's really you.
- **Tip** sends part of your balance straight to another player by username —
  instant, no fee, no minimum, even below the 25 NIM withdrawal floor.

---

## 8. Leaderboard

Under **You → Leaderboard**. It's genuinely empty right now — nobody's won a
staked match yet on this deployment. It shows exactly how a rank gets earned
(win matches, build streaks, stake weight, settle clean) rather than making up
sample players to look populated.

---

## Good to know

- **TeTe never asks for your seed phrase or private key.** Every wallet
  action shows Nimiq Pay's own confirmation dialog — if something skips that
  and asks you to type a phrase, it isn't TeTe.
- **Nothing in TeTe pays out on chance.** Every format — arcade or staked — is
  decided by what you actually did, not a roll.
- **A stake held while a challenge is live sits with TeTe's own escrow
  wallet**, not with your opponent — that's what makes a stranger-vs-stranger
  open challenge safe to fund in the first place.

---

## Troubleshooting

- **"Connect wallet" does nothing / balance says unavailable** — you're
  probably not inside Nimiq Pay (a plain browser has no wallet to connect),
  or this deployment hasn't got a balance source configured. Either way the
  app will tell you plainly rather than show a fake number.
- **My stake isn't showing as funded** — on-chain confirmation can take a
  moment after you sign; the challenge screen checks again every few seconds.
  If it still disagrees after a while, that's exactly what a dispute or a
  support check is for.
- **The custom URL screen won't load my link** — double-check you typed
  `teteonnimiq.site` with no `http://` prefix needed, and that you're in
  Nimiq Pay's **Mini Apps → Custom URL** field, not a regular address bar.
