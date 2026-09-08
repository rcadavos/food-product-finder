import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TtlCache } from '../../src/lib/cache';

const TTL_MS = 60_000;

describe('TtlCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('time-to-live', () => {
    it('returns a stored value while the entry is still inside its TTL', () => {
      const cache = new TtlCache<string>({ ttlMs: TTL_MS });
      cache.set('off:search:chocolate', 'cached-payload');

      vi.advanceTimersByTime(TTL_MS - 1);

      expect(cache.get('off:search:chocolate')).toBe('cached-payload');
      expect(cache.has('off:search:chocolate')).toBe(true);
    });

    it('stops returning a value once the TTL has elapsed', () => {
      const cache = new TtlCache<string>({ ttlMs: TTL_MS });
      cache.set('off:search:chocolate', 'cached-payload');

      vi.advanceTimersByTime(TTL_MS);

      expect(cache.get('off:search:chocolate')).toBeUndefined();
      expect(cache.has('off:search:chocolate')).toBe(false);
    });

    it('restarts the lifetime of a key that is written again', () => {
      const cache = new TtlCache<string>({ ttlMs: TTL_MS });
      cache.set('key', 'first');

      vi.advanceTimersByTime(TTL_MS - 1_000);
      cache.set('key', 'second');
      vi.advanceTimersByTime(TTL_MS - 1_000);

      expect(cache.get('key')).toBe('second');
    });

    it('reclaims an expired entry when it is read, so it no longer counts towards the bound', () => {
      const cache = new TtlCache<string>({ ttlMs: TTL_MS, maxEntries: 2 });
      cache.set('a', 'A');

      vi.advanceTimersByTime(TTL_MS);

      expect(cache.get('a')).toBeUndefined();
      expect(cache.size).toBe(0);
    });

    it('never stores anything when the TTL is zero', () => {
      const cache = new TtlCache<string>({ ttlMs: 0 });
      cache.set('key', 'value');

      expect(cache.get('key')).toBeUndefined();
      expect(cache.size).toBe(0);
    });

    it('applies the same TTL and bound when constructed with positional arguments', () => {
      const cache = new TtlCache<number>(TTL_MS, 2);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      expect(cache.size).toBe(2);
      expect(cache.get('a')).toBeUndefined();

      vi.advanceTimersByTime(TTL_MS);
      expect(cache.get('c')).toBeUndefined();
    });
  });

  describe('max-entry bound', () => {
    it('evicts the oldest entry first when the bound is reached', () => {
      const cache = new TtlCache<string>({ ttlMs: TTL_MS, maxEntries: 3 });
      cache.set('a', 'A');
      cache.set('b', 'B');
      cache.set('c', 'C');
      cache.set('d', 'D');

      expect(cache.size).toBe(3);
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBe('B');
      expect(cache.get('c')).toBe('C');
      expect(cache.get('d')).toBe('D');
    });

    it('never grows past the bound however many keys are written', () => {
      const cache = new TtlCache<number>({ ttlMs: TTL_MS, maxEntries: 4 });
      for (let index = 0; index < 50; index += 1) {
        cache.set(`key-${index}`, index);
      }

      expect(cache.size).toBe(4);
      expect(cache.get('key-49')).toBe(49);
      expect(cache.get('key-45')).toBeUndefined();
    });

    it('moves a rewritten key to the back of the eviction queue', () => {
      const cache = new TtlCache<string>({ ttlMs: TTL_MS, maxEntries: 2 });
      cache.set('a', 'A');
      cache.set('b', 'B');
      cache.set('a', 'A2');
      cache.set('c', 'C');

      expect(cache.get('b')).toBeUndefined();
      expect(cache.get('a')).toBe('A2');
      expect(cache.get('c')).toBe('C');
    });

    it('keeps a single-entry cache holding only the most recent write', () => {
      const cache = new TtlCache<string>({ ttlMs: TTL_MS, maxEntries: 1 });
      cache.set('a', 'A');
      cache.set('b', 'B');

      expect(cache.size).toBe(1);
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBe('B');
    });
  });

  describe('explicit removal', () => {
    it('removes one key with delete and reports whether it was present', () => {
      const cache = new TtlCache<string>({ ttlMs: TTL_MS });
      cache.set('a', 'A');
      cache.set('b', 'B');

      expect(cache.delete('a')).toBe(true);
      expect(cache.delete('a')).toBe(false);
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBe('B');
      expect(cache.size).toBe(1);
    });

    it('drops every entry on clear', () => {
      const cache = new TtlCache<string>({ ttlMs: TTL_MS });
      cache.set('a', 'A');
      cache.set('b', 'B');

      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBeUndefined();
    });
  });

  describe('size', () => {
    it('counts only live entries and ignores expired ones', () => {
      const cache = new TtlCache<string>({ ttlMs: TTL_MS });
      cache.set('early', 'A');

      vi.advanceTimersByTime(TTL_MS - 1_000);
      cache.set('late', 'B');
      expect(cache.size).toBe(2);

      vi.advanceTimersByTime(1_000);

      expect(cache.size).toBe(1);
      expect(cache.get('late')).toBe('B');
    });

    it('is zero once every entry has outlived its TTL', () => {
      const cache = new TtlCache<string>({ ttlMs: TTL_MS });
      cache.set('a', 'A');
      cache.set('b', 'B');

      vi.advanceTimersByTime(TTL_MS);

      expect(cache.size).toBe(0);
    });
  });
});
