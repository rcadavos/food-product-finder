/**
 * The whole class-name toolkit: no `clsx`, no `tailwind-merge`. Parts are emitted in the
 * order they are passed and the caller's `className` is always last, so a consumer
 * override wins in source order without a merge algorithm guessing at utility conflicts.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts
    .filter((part): part is string => typeof part === 'string')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
