/** Join class names, dropping falsy entries. Keeps JSX readable. */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}
