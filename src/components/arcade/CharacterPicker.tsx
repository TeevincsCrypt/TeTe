'use client';

import { CheckIcon } from '@/components/shell/icons';
import { cn } from '@/components/ui/cn';
import type { Character } from '@/lib/arcade/characters';

/**
 * A bust drawn from the same `Look` the 3D builder reads.
 *
 * The picker used to be five coloured circles, which could not show the one
 * thing now worth choosing between: the silhouettes differ, and a swatch says
 * nothing about a crest, a visor or a ponytail. This is deliberately the same
 * set of features rather than a hand-drawn portrait per character, so a look
 * changed in characters.ts cannot leave its picker mark behind.
 */
function CharacterMark({ look, className }: { look: Character; className?: string }) {
  const { helmet = 'none', visor, cape, scarf, hair = 'short', accent, glow, mask, feline, tail, spots } = look;

  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden fill="none">
      {cape && <path d="M6 32c0-7 3-11 10-11s10 4 10 11Z" fill={accent} opacity="0.55" />}
      {tail && <path d="M24 32c4-3 5-8 3-12l-2.6 1.4c1.4 3 0.8 7-2.4 9.6Z" fill={accent} />}

      {/* Shoulders, widened for a heavy build so bulk reads here too. */}
      <path
        d={
          (look.bulk ?? 1) > 1.1
            ? 'M4 32c0-6 5-9 12-9s12 3 12 9Z'
            : 'M7 32c0-5 4-8 9-8s9 3 9 8Z'
        }
        fill="currentColor"
      />
      {spots && (
        <>
          <circle cx="12" cy="28" r="1.5" fill={spots} opacity="0.75" />
          <circle cx="20" cy="27" r="1.7" fill={spots} opacity="0.75" />
          <circle cx="16" cy="30.5" r="1.3" fill={spots} opacity="0.75" />
        </>
      )}
      {glow && (
        <>
          <rect x="15.2" y="23" width="1.6" height="7" rx="0.8" fill={glow} />
          <rect x="10.5" y="25" width="1.3" height="4" rx="0.65" fill={glow} transform="rotate(20 11 27)" />
          <rect x="20.2" y="25" width="1.3" height="4" rx="0.65" fill={glow} transform="rotate(-20 21 27)" />
        </>
      )}

      {scarf && <rect x="11" y="20" width="10" height="3.4" rx="1.6" fill={accent} />}
      {hair === 'ponytail' && <path d="M21 10c4 1 5 5 3.5 8.5L22 17Z" fill={accent} />}

      {/* Head */}
      <circle cx="16" cy="13" r="6.4" fill="currentColor" />

      {feline && (
        <>
          <path d="M9.5 7.5 10.8 11.4 7.4 11Z" fill="currentColor" />
          <path d="M22.5 7.5 21.2 11.4 24.6 11Z" fill="currentColor" />
          <ellipse cx="16" cy="15.6" rx="2.6" ry="2" fill={accent} opacity="0.85" />
        </>
      )}
      {hair === 'short' && !feline && <path d="M9.6 11.2a6.4 6.4 0 0 1 12.8 0Z" fill={accent} />}
      {mask && <rect x="11.6" y="14.4" width="8.8" height="4" rx="1.6" fill={accent} />}

      {helmet === 'cap' && (
        <>
          <path d="M9.6 11.6a6.4 6.4 0 0 1 12.8 0Z" fill={accent} />
          <rect x="6.5" y="11.2" width="8" height="2.2" rx="1.1" fill={accent} />
        </>
      )}
      {helmet === 'full' && <circle cx="16" cy="13" r="7.2" fill={accent} opacity="0.9" />}
      {helmet === 'crest' && (
        <>
          <circle cx="16" cy="13" r="7" fill={accent} opacity="0.85" />
          <path d="M15 4.5h2v5h-2Z" fill={accent} />
        </>
      )}

      {visor && (
        <rect
          x={helmet === 'full' ? 9.6 : 10}
          y={helmet === 'full' ? 11.4 : 11.8}
          width={helmet === 'full' ? 12.8 : 12}
          height="3"
          rx="1.5"
          fill={visor}
        />
      )}
    </svg>
  );
}

/**
 * Pick who you play as. Cosmetic only — nothing here changes a hitbox, a
 * speed or a score, which is why it sits above the games rather than inside
 * any one of them.
 */
export function CharacterPicker({
  characters,
  selectedId,
  onSelect,
}: {
  characters: Character[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const selected = characters.find((c) => c.id === selectedId) ?? characters[0];

  return (
    <div className="pt-5">
      <p className="text-[0.625rem] font-bold uppercase tracking-[0.12em] text-faint">
        Your character
      </p>

      <div className="-mx-4 mt-2.5 flex gap-2.5 overflow-x-auto px-4 pb-1 no-scrollbar">
        {characters.map((option) => {
          const isSelected = option.id === selectedId;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onSelect(option.id)}
              aria-label={option.name}
              aria-pressed={isSelected}
              className={cn(
                'relative flex w-[4.75rem] shrink-0 flex-col items-center gap-1.5 rounded-2xl px-2 pb-2 pt-2.5',
                'transition-transform duration-100 active:scale-95',
                isSelected ? 'ring-2 ring-accent' : 'ring-1 ring-ink/10',
              )}
              style={{ backgroundColor: option.body }}
            >
              {isSelected && (
                <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-on-accent text-accent">
                  <CheckIcon className="size-2.5" strokeWidth={3} />
                </span>
              )}
              <CharacterMark look={option} className="size-11 text-white/90" />
              <span className="text-[0.6875rem] font-bold leading-none text-white drop-shadow">
                {option.name}
              </span>
            </button>
          );
        })}
      </div>

      {selected && (
        <p className="mt-2 text-[0.6875rem] leading-snug text-faint">
          <span className="font-bold text-muted">{selected.name}</span> — {selected.blurb} Appears in
          Crossing, Drift, Rush, Invasion, Overheat and Alley; Pitch and Slice have no on-screen
          character to skin.
        </p>
      )}
    </div>
  );
}
