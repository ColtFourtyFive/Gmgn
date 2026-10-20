// JSON encoding for durable state blobs and audit details. Plain JSON would
// silently turn bigint amounts into errors, Maps / Sets into `{}` and
// Infinity / NaN into null; those are written as tagged objects instead
// ({ "__ts": "bigint", "v": "123" }) and revived on decode.

const TAG = '__ts';

type Tagged = { [TAG]: 'bigint' | 'map' | 'set' | 'num'; v: unknown };

function isTagged(v: unknown): v is Tagged {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const keys = Object.keys(v);
  return keys.length === 2 && TAG in v && 'v' in v;
}

function replacer(this: unknown, _key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return { [TAG]: 'bigint', v: value.toString() };
  if (typeof value === 'number' && !Number.isFinite(value)) return { [TAG]: 'num', v: String(value) };
  if (value instanceof Map) return { [TAG]: 'map', v: [...value] };
  if (value instanceof Set) return { [TAG]: 'set', v: [...value] };
  return value;
}

function reviver(_key: string, value: unknown): unknown {
  if (!isTagged(value)) return value;
  switch (value[TAG]) {
    case 'bigint':
      return BigInt(value.v as string);
    case 'num':
      return Number(value.v as string);
    case 'map':
      return new Map(value.v as [unknown, unknown][]);
    case 'set':
      return new Set(value.v as unknown[]);
    default:
      return value;
  }
}

export function encodeValue(value: unknown): string {
  // `undefined` at the root has no JSON form: stored as null.
  return JSON.stringify(value === undefined ? null : value, replacer);
}

export function decodeValue(text: string): unknown {
  return JSON.parse(text, reviver);
}
