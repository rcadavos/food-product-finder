export interface TtlCacheOptions {
  /** Lifetime of an entry in milliseconds. `0` disables caching. */
  ttlMs: number;
  /** Hard bound on the number of live entries; the oldest is evicted first. */
  maxEntries?: number;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const DEFAULT_MAX_ENTRIES = 500;

/**
 * Minimal in-process cache: insertion-ordered `Map`, per-entry expiry and an
 * oldest-first bound so a long-running process cannot grow without limit.
 */
export class TtlCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(options: TtlCacheOptions);
  constructor(ttlMs: number, maxEntries?: number);
  constructor(optionsOrTtlMs: TtlCacheOptions | number, maxEntries?: number) {
    const options: TtlCacheOptions =
      typeof optionsOrTtlMs === 'number' ? { ttlMs: optionsOrTtlMs, maxEntries } : optionsOrTtlMs;
    this.ttlMs = Math.max(0, options.ttlMs);
    this.maxEntries = Math.max(1, options.maxEntries ?? DEFAULT_MAX_ENTRIES);
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  set(key: string, value: T): void {
    if (this.ttlMs === 0) return;
    // Re-inserting moves the key to the back of the eviction queue.
    this.entries.delete(key);
    this.prune();
    while (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    this.prune();
    return this.entries.size;
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
  }
}
