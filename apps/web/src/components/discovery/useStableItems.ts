import { useMemo, useRef } from 'react';

/**
 * Keep the previous object for items whose content did not change between
 * snapshots. Live lists replace every object on each push, which defeats
 * memoized rows; with stable identities only rows that changed re-render.
 * `signature` defaults to JSON (exact equality of the serialized payload).
 */
export function useStableItems<T>(items: T[] | null | undefined, key: (item: T) => string, signature: (item: T) => string = JSON.stringify): T[] | null {
  const cache = useRef(new Map<string, { item: T; sig: string }>());
  return useMemo(() => {
    if (!items) return null;
    const prev = cache.current;
    const next = new Map<string, { item: T; sig: string }>();
    const out = items.map((item) => {
      const k = key(item);
      const sig = signature(item);
      const hit = prev.get(k);
      const kept = hit && hit.sig === sig ? hit.item : item;
      next.set(k, { item: kept, sig });
      return kept;
    });
    cache.current = next;
    return out;
    // `key` and `signature` must be stable (module-level) functions.
  }, [items]);
}
