import { useCallback, useEffect, useRef, useState } from 'react';

function read<T>(key: string, initial: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? initial : (JSON.parse(raw) as T);
  } catch {
    return initial;
  }
}

/**
 * useState persisted as JSON in localStorage (per-browser UI preferences such
 * as column layouts or last selected tab). Storage failures are ignored, so
 * it degrades to plain state in private mode. Syncs across tabs, and re-reads
 * when `key` changes (e.g. a per-chain or per-token key).
 */
export function useLocalStorage<T>(key: string, initial: T): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => read(key, initial));
  // `initial` is only a fallback; keep the latest without re-subscribing on its identity.
  const initialRef = useRef(initial);
  initialRef.current = initial;
  // Adjust state while rendering (not in an effect) so the new key's value is never a frame late.
  const [readKey, setReadKey] = useState(key);
  if (readKey !== key) {
    setReadKey(key);
    setValue(read(key, initial));
  }

  // Latest value for functional updates. Storage is written right away, not inside a
  // state updater: React drops those when the component unmounts in the same update
  // (e.g. a dialog that records a choice and closes).
  const latest = useRef(value);
  latest.current = value;

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      const resolved = typeof next === 'function' ? (next as (p: T) => T)(latest.current) : next;
      latest.current = resolved;
      try {
        localStorage.setItem(key, JSON.stringify(resolved));
      } catch {
        /* storage unavailable */
      }
      setValue(resolved);
    },
    [key],
  );

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) setValue(read(key, initialRef.current));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key]);

  return [value, set];
}
