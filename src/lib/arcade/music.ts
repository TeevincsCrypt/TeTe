/**
 * Arcade background music.
 *
 * Synthesised with the Web Audio API, same reasoning as sfx.ts: no audio
 * files to fetch over a phone connection, no licensing question, and it
 * stays a few hundred bytes of code instead of a folder of clips. A short,
 * looping bass-and-lead pattern rather than a composition — this sits under
 * the sound effects and the game itself, not competing with either.
 *
 * Scheduling uses the AudioContext's own clock (`currentTime`), not
 * `setInterval`, so a backgrounded or throttled tab cannot make the loop
 * drift or double up — only the wake-up check that queues the next note is
 * on a timer, the notes themselves are all scheduled up front.
 */
import { audio } from './sfx';

const BEAT_SEC = 0.36;
/** One bar of a minor loop — low enough to sit under sfx without masking it. */
const BASSLINE = [110, 110, 130.81, 98, 110, 110, 87.31, 98];
/** A sparse lead an octave up, silent on some beats (0 = rest). */
const LEAD = [0, 220, 0, 261.63, 0, 220, 0, 196];

let playing = false;
let nextNoteTime = 0;
let step = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

function playNote(ac: AudioContext, freq: number, when: number, gain: number, type: OscillatorType) {
  if (freq <= 0) return;
  const osc = ac.createOscillator();
  const env = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);
  env.gain.setValueAtTime(0, when);
  env.gain.linearRampToValueAtTime(gain, when + 0.02);
  env.gain.exponentialRampToValueAtTime(0.0001, when + BEAT_SEC * 0.9);
  osc.connect(env);
  env.connect(ac.destination);
  osc.start(when);
  osc.stop(when + BEAT_SEC);
}

/** Queue every note that falls due in the next second or so, then check back. */
function schedule() {
  try {
    const ac = audio();
    if (!ac || !playing) return;
    while (nextNoteTime < ac.currentTime + 1) {
      playNote(ac, BASSLINE[step % BASSLINE.length] ?? 0, nextNoteTime, 0.05, 'triangle');
      playNote(ac, LEAD[step % LEAD.length] ?? 0, nextNoteTime, 0.035, 'sine');
      nextNoteTime += BEAT_SEC;
      step += 1;
    }
  } catch {
    // See sfx.ts: music failing to play must never interrupt a game.
  }
  timer = setTimeout(schedule, 250);
}

/** Start the background loop. Safe to call repeatedly — it will not stack. */
export function startMusic() {
  if (playing) return;
  const ac = audio();
  if (!ac) return;
  playing = true;
  step = 0;
  nextNoteTime = ac.currentTime;
  schedule();
}

/** Stop the loop — call on game over, on leaving the arcade, or on unmount. */
export function stopMusic() {
  playing = false;
  if (timer) clearTimeout(timer);
  timer = null;
}
