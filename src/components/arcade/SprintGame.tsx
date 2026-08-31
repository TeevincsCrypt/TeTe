'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';

const DURATION = 30;

interface Question {
  text: string;
  answer: number;
  options: number[];
}

/** Build one arithmetic question with three plausible near-miss distractors. */
function makeQuestion(): Question {
  const kind = Math.floor(Math.random() * 3);
  let a = 0;
  let b = 0;
  let answer = 0;
  let text = '';

  if (kind === 0) {
    a = 12 + Math.floor(Math.random() * 78);
    b = 12 + Math.floor(Math.random() * 78);
    answer = a + b;
    text = `${a} + ${b}`;
  } else if (kind === 1) {
    a = 40 + Math.floor(Math.random() * 60);
    b = 5 + Math.floor(Math.random() * 35);
    answer = a - b;
    text = `${a} − ${b}`;
  } else {
    a = 3 + Math.floor(Math.random() * 10);
    b = 3 + Math.floor(Math.random() * 10);
    answer = a * b;
    text = `${a} × ${b}`;
  }

  // Distractors sit close to the answer, so the question is decided by
  // arithmetic rather than by spotting the one number that looks unlike the rest.
  const options = new Set<number>([answer]);
  while (options.size < 4) {
    const drift = Math.floor(Math.random() * 11) - 5;
    const candidate = answer + (drift === 0 ? 6 : drift);
    if (candidate > 0) options.add(candidate);
  }

  return { text, answer, options: [...options].sort(() => Math.random() - 0.5) };
}

/**
 * Thirty seconds of mental arithmetic. Score is correct answers minus wrong
 * ones, floored at zero, so guessing at speed is not a strategy.
 */
export function SprintGame({ onFinish }: { onFinish: (score: number, xp: number) => void }) {
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(DURATION);
  const [question, setQuestion] = useState<Question | null>(null);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [flash, setFlash] = useState<'right' | 'wrong' | null>(null);
  const finished = useRef(false);

  const stop = useCallback(
    (right: number, missed: number) => {
      if (finished.current) return;
      finished.current = true;
      setRunning(false);
      setQuestion(null);
      const score = Math.max(0, right - missed);
      onFinish(score, score * 4);
    },
    [onFinish],
  );

  useEffect(() => {
    if (!running) return;
    if (left <= 0) {
      stop(correct, wrong);
      return;
    }
    const timer = setTimeout(() => setLeft((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [running, left, correct, wrong, stop]);

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 180);
    return () => clearTimeout(timer);
  }, [flash]);

  function start() {
    finished.current = false;
    setCorrect(0);
    setWrong(0);
    setLeft(DURATION);
    setQuestion(makeQuestion());
    setRunning(true);
  }

  function answer(value: number) {
    if (!question || !running) return;
    if (value === question.answer) {
      setCorrect((n) => n + 1);
      setFlash('right');
    } else {
      setWrong((n) => n + 1);
      setFlash('wrong');
    }
    setQuestion(makeQuestion());
  }

  if (!running) {
    return (
      <div className="text-center">
        <p className="display text-[1.5rem]">30 seconds</p>
        <p className="mt-2 text-[0.875rem] leading-relaxed text-muted">
          Answer as many as you can. A wrong answer costs you one.
        </p>
        <Button className="mt-5" onClick={start}>
          Start sprint
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[0.8125rem] font-bold text-muted tabular">
          {correct} right · {wrong} wrong
        </span>
        <span
          className={cn(
            'rounded-full border-2 border-ink px-3 py-1 text-[0.875rem] font-black tabular',
            left <= 5 ? 'bg-negative text-white' : 'bg-panel',
          )}
        >
          {left}s
        </span>
      </div>

      <div
        className={cn(
          'flex h-28 items-center justify-center rounded-[var(--radius-sticker)] border-2 border-ink transition-colors duration-100',
          flash === 'right' ? 'bg-positive text-white' : flash === 'wrong' ? 'bg-negative text-white' : 'bg-contrast text-on-contrast',
        )}
      >
        <span className="display text-[2.25rem] tabular">{question?.text}</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {question?.options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => answer(option)}
            className="min-h-14 rounded-full border-2 border-ink bg-panel text-[1.125rem] font-black tabular shadow-[var(--shadow-sticker-sm)] transition-transform duration-100 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
