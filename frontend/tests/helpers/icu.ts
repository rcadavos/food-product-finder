/**
 * A minimal ICU MessageFormat scanner that reports which arguments a message uses
 * and how. It exists because a regex cannot tell an argument (`{term}`) from a
 * plural option body (`{Keine}`) — the second is ordinary text that happens to be
 * braced, and a naive scan reports it as a placeholder, which is exactly the kind
 * of false positive that would make a parity test worthless.
 *
 * Only structure matters here, not semantics: option bodies are re-scanned as
 * message text so nested arguments are found, and ICU's apostrophe escaping is
 * honoured so French copy such as `l''huile` cannot unbalance the braces.
 */

/** Argument name → its ICU type (`plural`, `number`, …), or `''` for a plain `{name}`. */
export type IcuSignature = Record<string, string>;

export class IcuSyntaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IcuSyntaxError';
  }
}

function skipQuoted(text: string, index: number): number {
  const next = text[index + 1];
  if (next === "'") return index + 2; // '' is a literal apostrophe

  // Only a quote directly before a syntax character opens a quoted literal.
  if (next !== '{' && next !== '}' && next !== '#') return index + 1;

  let i = index + 2;
  while (i < text.length) {
    if (text[i] === "'") {
      if (text[i + 1] === "'") {
        i += 2;
        continue;
      }
      return i + 1;
    }
    i += 1;
  }
  return text.length;
}

function findClosingBrace(text: string, open: number): number {
  let depth = 0;
  let i = open;
  while (i < text.length) {
    const char = text[i];
    if (char === "'") {
      i = skipQuoted(text, i);
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  throw new IcuSyntaxError(`Unbalanced braces in ICU message: ${text}`);
}

function scanMessage(text: string, start: number, end: number, out: IcuSignature): void {
  let i = start;
  while (i < end) {
    const char = text[i];
    if (char === "'") {
      i = skipQuoted(text, i);
      continue;
    }
    if (char === '{') {
      i = scanArgument(text, i, out);
      continue;
    }
    i += 1;
  }
}

function scanArgument(text: string, open: number, out: IcuSignature): number {
  let i = open + 1;
  while (i < text.length && text[i] !== ',' && text[i] !== '}') i += 1;

  const name = text.slice(open + 1, i).trim();
  if (name === '') throw new IcuSyntaxError(`Empty ICU argument in message: ${text}`);

  if (text[i] === '}') {
    out[name] = out[name] ?? '';
    return i + 1;
  }
  if (i >= text.length) throw new IcuSyntaxError(`Unterminated ICU argument in: ${text}`);

  let typeEnd = i + 1;
  while (typeEnd < text.length && text[typeEnd] !== ',' && text[typeEnd] !== '}') typeEnd += 1;
  out[name] = text.slice(i + 1, typeEnd).trim();

  const close = findClosingBrace(text, open);
  scanArgumentStyle(text, typeEnd, close, out);
  return close + 1;
}

/**
 * The part after `{name, type`: selectors and `{…}` groups that are themselves
 * messages (`one {# product}`), so they may nest further arguments.
 */
function scanArgumentStyle(text: string, start: number, end: number, out: IcuSignature): void {
  let i = start;
  while (i < end) {
    const char = text[i];
    if (char === "'") {
      i = skipQuoted(text, i);
      continue;
    }
    if (char === '{') {
      const close = findClosingBrace(text, i);
      scanMessage(text, i + 1, close, out);
      i = close + 1;
      continue;
    }
    i += 1;
  }
}

/** Every argument in the message, with its type. Throws `IcuSyntaxError` on bad syntax. */
export function icuSignature(message: string): IcuSignature {
  const signature: IcuSignature = {};
  scanMessage(message, 0, message.length, signature);
  return signature;
}

/** Argument names only, sorted so a mismatch diffs readably. */
export function icuArguments(message: string): string[] {
  return Object.keys(icuSignature(message)).sort();
}
