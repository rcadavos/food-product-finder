/**
 * Reads back the URLs the Open Food Facts client actually asked `fetch` for.
 *
 * `Mock.mock.calls` is loosely typed, so the argument is narrowed here once
 * instead of being cast at every assertion site.
 */

import type { Mock } from 'vitest';

export function offRequestUrl(fetchMock: Mock, index = 0): URL {
  const argument: unknown = fetchMock.mock.calls[index]?.[0];
  if (typeof argument !== 'string') {
    throw new Error(`fetch call #${index} was not made with a URL string`);
  }
  return new URL(argument);
}

export function offRequestUrls(fetchMock: Mock): URL[] {
  return fetchMock.mock.calls.map((_call, index) => offRequestUrl(fetchMock, index));
}
