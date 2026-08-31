/**
 * Theme storage and application.
 *
 * The choice is written to `data-theme` on the root element, which every token
 * in `globals.css` keys off. `system` follows the OS rather than pinning a
 * value, so a player who never touches the toggle tracks their phone.
 */
export type ThemeChoice = 'light' | 'dark' | 'system';

export const THEME_KEY = 'tete.theme.v1';

export function readTheme(): ThemeChoice {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function resolveTheme(choice: ThemeChoice): 'light' | 'dark' {
  if (choice !== 'system') return choice;
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(choice: ThemeChoice): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = resolveTheme(choice);
}

export function writeTheme(choice: ThemeChoice): void {
  try {
    if (choice === 'system') window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, choice);
  } catch {
    /* Storage unavailable; the choice simply is not remembered. */
  }
  applyTheme(choice);
}

/**
 * Runs before first paint to stop a light flash on a dark-theme load. Inlined
 * into the document head, so it is deliberately tiny and dependency-free.
 */
export const THEME_BOOTSTRAP = `(function(){try{var s=localStorage.getItem('${THEME_KEY}');var d=s==='dark'||(s!=='light'&&matchMedia('(prefers-color-scheme:dark)').matches);document.documentElement.dataset.theme=d?'dark':'light'}catch(e){document.documentElement.dataset.theme='light'}})()`;
