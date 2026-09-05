/**
 * Arcade sound effects.
 *
 * Synthesised with the Web Audio API rather than shipped as audio files: no
 * asset requests over a phone connection, no licensing question, and it stays
 * a few hundred bytes of code instead of a folder of clips. Every call is
 * wrapped in a try/catch so a browser that refuses audio — no user gesture
 * yet, autoplay policy, no AudioContext at all — never throws into a game's
 * frame loop. Sound is decoration; it must never be able to break a game.
 */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

interface ToneOpts {
  type?: OscillatorType;
  duration?: number;
  gain?: number;
  /** When set, the tone sweeps from `freq` to this by the end of `duration`. */
  sweepTo?: number;
  /** Seconds from now to start this tone — how notes are staggered into a run. */
  delay?: number;
}

function tone(freq: number, { type = 'sine', duration = 0.12, gain = 0.16, sweepTo, delay = 0 }: ToneOpts = {}) {
  try {
    const ac = audio();
    if (!ac) return;
    const start = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const env = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, freq), start);
    if (sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, sweepTo), start + duration);
    // A linear attack then an exponential decay — a hard digital on/off click
    // reads as noise, this reads as a note.
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(gain, start + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(env);
    env.connect(ac.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  } catch {
    // See file header: a sound failing to play must never interrupt a game.
  }
}

/** A quick upward chirp — a hop, a jump, a roll under. */
export function sfxJump() {
  tone(420, { type: 'square', duration: 0.11, sweepTo: 760, gain: 0.12 });
}

/** A bright two-note pickup, the arcade's oldest sound. */
export function sfxCoin() {
  tone(880, { type: 'triangle', duration: 0.09, gain: 0.14 });
  tone(1320, { type: 'triangle', duration: 0.1, gain: 0.14, delay: 0.06 });
}

/** A low buzz — a hazard taken, a hit landed on the player. */
export function sfxHazard() {
  tone(180, { type: 'sawtooth', duration: 0.16, sweepTo: 90, gain: 0.13 });
}

/** A short, quiet tick — a shot fired. Quiet on purpose: some games fire this often. */
export function sfxShoot() {
  tone(620, { type: 'square', duration: 0.05, gain: 0.05 });
}

/** A solid thud — a strike connects, an invader goes down. */
export function sfxHit() {
  tone(160, { type: 'square', duration: 0.09, sweepTo: 70, gain: 0.15 });
}

/** A short triumphant rise — a goal. */
export function sfxGoal() {
  tone(523, { duration: 0.12, gain: 0.15 });
  tone(659, { duration: 0.12, gain: 0.15, delay: 0.1 });
  tone(784, { duration: 0.2, gain: 0.16, delay: 0.2 });
}

/** A short descending motif — the round is over. */
export function sfxLose() {
  tone(392, { type: 'triangle', duration: 0.14, gain: 0.13 });
  tone(311, { type: 'triangle', duration: 0.16, gain: 0.13, delay: 0.13 });
  tone(233, { type: 'triangle', duration: 0.26, gain: 0.13, delay: 0.27 });
}

/** A bright ascending fanfare — a new personal best. */
export function sfxHighScore() {
  tone(523, { duration: 0.11, gain: 0.15 });
  tone(659, { duration: 0.11, gain: 0.15, delay: 0.09 });
  tone(784, { duration: 0.11, gain: 0.15, delay: 0.18 });
  tone(1046, { duration: 0.28, gain: 0.17, delay: 0.27 });
}
