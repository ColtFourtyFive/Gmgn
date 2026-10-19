// Number / time formatting conventions shared by server and web.
// Memecoin terminals live and die by dense, scannable numbers:
//   compact amounts  -> 1.23K, 4.5M, 1.2B
//   tiny prices      -> 0.0₅123  (subscript count of leading zeros)
//   relative ages    -> 12s, 5m, 3h, 2d, 4mo, 1y

const SUBSCRIPT_DIGITS = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];

function toSubscript(n: number): string {
  return String(n)
    .split('')
    .map((d) => SUBSCRIPT_DIGITS[Number(d)] ?? d)
    .join('');
}

function trimZeros(s: string): string {
  if (!s.includes('.')) return s;
  return s.replace(/0+$/, '').replace(/\.$/, '');
}

/** Compact number: 999 -> "999", 1234 -> "1.23K", 1_250_000 -> "1.25M". */
export function formatCompact(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const units: [number, string][] = [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];
  for (const [size, suffix] of units) {
    if (abs >= size) {
      let scaled = abs / size;
      // Avoid "1000K": promote when rounding would overflow the unit.
      if (Number(scaled.toFixed(digits)) >= 1000 && suffix !== 'T') continue;
      return `${sign}${trimZeros(scaled.toFixed(digits))}${suffix}`;
    }
  }
  if (abs === 0) return '0';
  if (abs < 1) return `${sign}${formatSmall(abs, digits + 1)}`;
  return `${sign}${trimZeros(abs.toFixed(abs >= 100 ? Math.min(digits, 1) : digits))}`;
}

/**
 * Small number with subscript-zero notation once there are >= 4 leading zeros
 * after the decimal point: 0.000001234 -> "0.0₅1234".
 */
export function formatSmall(value: number, significant = 4): string {
  if (!Number.isFinite(value)) return '--';
  if (value === 0) return '0';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 1) return `${sign}${trimZeros(abs.toFixed(significant))}`;
  const exponent = Math.floor(Math.log10(abs)); // e.g. -6 for 1.2e-6
  const leadingZeros = -exponent - 1;
  const sig = Math.max(1, significant);
  if (leadingZeros >= 4) {
    // digits after the zeros
    const mantissa = Math.round(abs * Math.pow(10, -exponent + sig - 1));
    const digits = trimZeros(String(mantissa).padStart(sig, '0')) || '0';
    return `${sign}0.0${toSubscript(leadingZeros)}${digits}`;
  }
  return `${sign}${trimZeros(abs.toFixed(leadingZeros + sig))}`;
}

/** USD price of a token, with "$" prefix, tiny-price aware. */
export function formatPrice(value: number | null | undefined, significant = 4): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--';
  if (value === 0) return '$0';
  if (Math.abs(value) >= 1000) return `$${formatCompact(value, 2)}`;
  if (Math.abs(value) >= 1) return `$${trimZeros(value.toFixed(Math.abs(value) >= 100 ? 2 : 4))}`;
  return `$${formatSmall(value, significant)}`;
}

/** USD amount, compact: $1.23K, $45.6M. */
export function formatUsd(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs > 0 && abs < 0.01) return `${sign}<$0.01`;
  return `${sign}$${formatCompact(abs, digits)}`;
}

/** Native token amount, e.g. "1.25 SOL" (symbol optional). */
export function formatNative(value: number | null | undefined, symbol?: string, digits = 3): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--';
  const abs = Math.abs(value);
  const body = abs !== 0 && abs < 0.001 ? formatSmall(value, 3) : formatCompact(value, digits);
  return symbol ? `${body} ${symbol}` : body;
}

/** Percent with sign: 0.1234 (ratio) -> "+12.34%". Pass ratio=false when value is already a percent. */
export function formatPercent(
  value: number | null | undefined,
  opts: { ratio?: boolean; digits?: number; sign?: boolean } = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--';
  const { ratio = true, digits = 2, sign = true } = opts;
  const pct = ratio ? value * 100 : value;
  const abs = Math.abs(pct);
  let body: string;
  if (abs >= 10000) body = formatCompact(abs, 1);
  else if (abs >= 100) body = abs.toFixed(Math.min(digits, 1));
  else body = abs.toFixed(digits);
  body = trimZeros(body);
  const prefix = pct > 0 && sign ? '+' : pct < 0 ? '-' : '';
  return `${prefix}${body}%`;
}

/** Relative age from a past timestamp (ms): 12s, 5m, 3h, 2d, 4mo, 1y. */
export function formatAge(fromMs: number, nowMs: number = Date.now()): string {
  const s = Math.max(0, Math.floor((nowMs - fromMs) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(d / 365)}y`;
}

/** Duration in seconds -> "45s", "12m", "3h 5m", "2d 4h". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '--';
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
}

/** Shorten an address: "7xKX...9fQz". */
export function shortAddress(address: string, head = 4, tail = 4): string {
  if (!address) return '';
  if (address.length <= head + tail + 3) return address;
  return `${address.slice(0, head)}...${address.slice(-tail)}`;
}

/** Plain integer with thousands separators. */
export function formatInt(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--';
  return Math.round(value).toLocaleString('en-US');
}
