/**
 * A client that always appends a key sends `?limit=` (or `?page=`) for a blank
 * field. Zod's coercion would turn that empty string into `0` and fail the
 * range check, so it is mapped to "not supplied" and the schema default applies.
 */
export function emptyToUndefined(value: unknown): unknown {
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}
