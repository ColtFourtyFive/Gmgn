/**
 * Drop every entry of a long-lived lookup (Set or Map) whose key is not in
 * `keep`. Live feeds use it to bound their per-id caches by what is still on
 * screen: the lists are capped, a tab left open all day must not keep every
 * id it ever saw.
 */
export function retainKeys<K>(lookup: Set<K> | Map<K, unknown>, keep: ReadonlySet<K>): void {
  for (const k of lookup.keys()) if (!keep.has(k)) lookup.delete(k);
}
