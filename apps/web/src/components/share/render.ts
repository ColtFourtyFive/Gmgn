// Canvas renderer of the PnL share card (1200×675, the X / Telegram preview
// ratio): Trenchscope mark, chain, token avatar and ticker, the PnL in $ and
// %, a price sparkline with the entry line, entry / exit MC, hold time and a
// footer (demo: paper trading on the simulated market; live: Solana). Colors
// mirror the index.css theme tokens so the image looks the same whatever
// theme the page shows.

import { CHAINS } from '@trenchscope/shared';
import { hashString } from '@/components/common/color';
import { isLiveMode } from '@/lib/mode';
import { shareStats, signedUsd, type PnlShareData } from './model';

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 675;

export type CardTheme = 'dark' | 'light';

interface Palette {
  bg: string;
  bg2: string;
  panel: string;
  line: string;
  fg: string;
  muted: string;
  faint: string;
  accent: string;
  up: string;
  down: string;
}

const PALETTES: Record<CardTheme, Palette> = {
  dark: {
    bg: 'rgb(10 12 16)',
    bg2: 'rgb(17 20 26)',
    panel: 'rgb(31 36 45)',
    line: 'rgb(48 55 68)',
    fg: 'rgb(230 233 240)',
    muted: 'rgb(140 148 163)',
    faint: 'rgb(92 99 114)',
    accent: 'rgb(255 181 71)',
    up: 'rgb(34 214 135)',
    down: 'rgb(255 84 104)',
  },
  light: {
    bg: 'rgb(244 245 248)',
    bg2: 'rgb(255 255 255)',
    panel: 'rgb(236 238 243)',
    line: 'rgb(205 210 220)',
    fg: 'rgb(20 23 31)',
    muted: 'rgb(96 104 120)',
    faint: 'rgb(140 147 161)',
    accent: 'rgb(217 125 0)',
    up: 'rgb(0 148 88)',
    down: 'rgb(222 44 70)',
  },
};

const SANS = 'Inter, ui-sans-serif, system-ui, sans-serif';
const EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const PAD = 64;

/** `rgb(r g b)` → `rgb(r g b / a)`. */
const alpha = (rgb: string, a: number) => rgb.replace(')', ` / ${a})`);

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Shrink the font until `text` fits `maxWidth`. */
function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, maxWidth: number, min = 28): number {
  let s = size;
  ctx.font = `${weight} ${s}px ${SANS}`;
  while (s > min && ctx.measureText(text).width > maxWidth) {
    s -= 4;
    ctx.font = `${weight} ${s}px ${SANS}`;
  }
  return s;
}

/** The Trenchscope reticle mark (LogoMark, viewBox 32). */
function drawMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, p: Palette): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 32, size / 32);
  roundRect(ctx, 0, 0, 32, 32, 8);
  ctx.fillStyle = p.panel;
  ctx.fill();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(16, 16, 9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  for (const [x1, y1, x2, y2] of [
    [16, 3.5, 16, 8],
    [16, 24, 16, 28.5],
    [3.5, 16, 8, 16],
    [24, 16, 28.5, 16],
  ]) {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }
  ctx.stroke();
  ctx.strokeStyle = p.fg;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(10.6, 18.6);
  ctx.lineTo(13.6, 15.5);
  ctx.lineTo(16.2, 17.9);
  ctx.lineTo(21.4, 12.6);
  ctx.stroke();
  ctx.restore();
}

/** Seeded gradient avatar with the meme glyph (same recipe as TokenAvatar). */
function drawAvatar(ctx: CanvasRenderingContext2D, seed: string, glyph: string, cx: number, cy: number, r: number): void {
  const h = hashString(seed);
  const hue1 = h % 360;
  const hue2 = (hue1 + 35 + ((h >>> 9) % 100)) % 360;
  const angle = (((h >>> 17) % 360) * Math.PI) / 180;
  const dx = Math.cos(angle) * r;
  const dy = Math.sin(angle) * r;
  const g = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
  g.addColorStop(0, `hsl(${hue1} 72% 56%)`);
  g.addColorStop(1, `hsl(${hue2} 70% 32%)`);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();
  const bx = cx + ((((h >>> 3) % 100) / 100) * 2 - 1) * r * 0.5;
  const by = cy + ((((h >>> 11) % 100) / 100) * 2 - 1) * r * 0.5;
  ctx.beginPath();
  ctx.arc(bx, by, r * 0.75, 0, Math.PI * 2);
  ctx.fillStyle = 'rgb(255 255 255 / 0.12)';
  ctx.fill();
  ctx.restore();
  if (glyph) {
    ctx.font = `${Math.round(r * 1.05)}px ${EMOJI}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, cx, cy + r * 0.06);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
}

/** Price line with an area fill and a dashed entry line, scaled into the box. */
function drawSparkline(ctx: CanvasRenderingContext2D, closes: number[], entry: number | null, box: { x: number; y: number; w: number; h: number }, color: string, p: Palette): void {
  if (closes.length < 2) return;
  let lo = Math.min(...closes);
  let hi = Math.max(...closes);
  const showEntry = entry !== null && entry >= lo * 0.5 && entry <= hi * 2;
  if (showEntry) {
    lo = Math.min(lo, entry);
    hi = Math.max(hi, entry);
  }
  const span = hi - lo || hi || 1;
  const px = (i: number) => box.x + (i / (closes.length - 1)) * box.w;
  const py = (v: number) => box.y + box.h - ((v - lo) / span) * box.h;

  ctx.save();
  ctx.beginPath();
  closes.forEach((v, i) => (i === 0 ? ctx.moveTo(px(i), py(v)) : ctx.lineTo(px(i), py(v))));
  ctx.lineTo(px(closes.length - 1), box.y + box.h);
  ctx.lineTo(box.x, box.y + box.h);
  ctx.closePath();
  const fill = ctx.createLinearGradient(0, box.y, 0, box.y + box.h);
  fill.addColorStop(0, alpha(color, 0.28));
  fill.addColorStop(1, alpha(color, 0));
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.beginPath();
  closes.forEach((v, i) => (i === 0 ? ctx.moveTo(px(i), py(v)) : ctx.lineTo(px(i), py(v))));
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  const lastX = px(closes.length - 1);
  const lastY = py(closes[closes.length - 1]);
  ctx.beginPath();
  ctx.arc(lastX, lastY, 12, 0, Math.PI * 2);
  ctx.fillStyle = alpha(color, 0.25);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(lastX, lastY, 6, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  if (showEntry) {
    const y = py(entry);
    ctx.setLineDash([10, 8]);
    ctx.strokeStyle = p.muted;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(box.x, y);
    ctx.lineTo(box.x + box.w, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = `600 18px ${SANS}`;
    ctx.fillStyle = p.muted;
    ctx.textAlign = 'right';
    ctx.fillText('Entry', box.x + box.w, y - 10);
    ctx.textAlign = 'left';
  }
  ctx.restore();
}

/** Draw the card onto `canvas` (resized to the card at `scale`). */
export function renderPnlCard(canvas: HTMLCanvasElement, d: PnlShareData, opts: { theme: CardTheme; closes?: number[]; scale?: number }): void {
  const p = PALETTES[opts.theme];
  const scale = opts.scale ?? 1;
  canvas.width = CARD_WIDTH * scale;
  canvas.height = CARD_HEIGHT * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const W = CARD_WIDTH;
  const H = CARD_HEIGHT;
  const tone = d.pnlUsd > 0 ? p.up : d.pnlUsd < 0 ? p.down : p.muted;

  // Background: base gradient, a glow in the PnL color, a faint reticle watermark.
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, p.bg2);
  bg.addColorStop(1, p.bg);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W - 220, 120, 0, W - 220, 120, 640);
  glow.addColorStop(0, alpha(tone, opts.theme === 'dark' ? 0.2 : 0.14));
  glow.addColorStop(1, alpha(tone, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = alpha(p.accent, 0.08);
  ctx.lineWidth = 3;
  for (const r of [150, 230]) {
    ctx.beginPath();
    ctx.arc(W + 10, H + 30, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = alpha(p.accent, 0.9);
  ctx.fillRect(0, 0, W, 6);

  // Header: brand left, chain right.
  drawMark(ctx, PAD, 44, 48, p);
  ctx.textBaseline = 'middle';
  ctx.font = `700 30px ${SANS}`;
  ctx.fillStyle = p.fg;
  ctx.fillText('Trench', PAD + 64, 69);
  ctx.fillStyle = p.accent;
  ctx.fillText('scope', PAD + 64 + ctx.measureText('Trench').width, 69);
  const chain = CHAINS[d.chain];
  ctx.font = `600 22px ${SANS}`;
  const chainW = ctx.measureText(chain.name).width + 52;
  roundRect(ctx, W - PAD - chainW, 48, chainW, 42, 21);
  ctx.fillStyle = alpha(p.panel, 0.9);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(W - PAD - chainW + 22, 69, 7, 0, Math.PI * 2);
  ctx.fillStyle = chain.color;
  ctx.fill();
  ctx.fillStyle = p.fg;
  ctx.fillText(chain.name, W - PAD - chainW + 38, 70);

  // Token: avatar, $SYMBOL + status, name.
  drawAvatar(ctx, d.token.logoSeed, d.token.logoGlyph, PAD + 44, 186, 44);
  ctx.textBaseline = 'alphabetic';
  const symbol = `$${d.token.symbol}`;
  fitFont(ctx, symbol, 700, 44, 420);
  ctx.fillStyle = p.fg;
  ctx.fillText(symbol, PAD + 112, 184);
  const symW = ctx.measureText(symbol).width;
  const status = d.status === 'open' ? 'Holding' : 'Closed';
  ctx.font = `600 18px ${SANS}`;
  const statusW = ctx.measureText(status).width + 24;
  roundRect(ctx, PAD + 112 + symW + 16, 156, statusW, 32, 8);
  ctx.fillStyle = alpha(d.status === 'open' ? p.accent : p.muted, 0.16);
  ctx.fill();
  ctx.fillStyle = d.status === 'open' ? p.accent : p.muted;
  ctx.fillText(status, PAD + 112 + symW + 28, 178);
  ctx.font = `500 22px ${SANS}`;
  ctx.fillStyle = p.muted;
  const name = d.token.name.length > 34 ? `${d.token.name.slice(0, 33)}…` : d.token.name;
  ctx.fillText(name, PAD + 112, 218);

  // PnL: dollars, then the percent pill.
  ctx.font = `600 22px ${SANS}`;
  ctx.fillStyle = p.muted;
  ctx.fillText(d.status === 'open' ? 'Total PnL' : 'Realized PnL', PAD, 296);
  const pnl = signedUsd(d.pnlUsd);
  fitFont(ctx, pnl, 800, 104, 600, 56);
  ctx.fillStyle = tone;
  ctx.fillText(pnl, PAD - 4, 392);
  if (d.pnlRate !== null) {
    const pct = `${d.pnlRate > 0 ? '+' : d.pnlRate < 0 ? '−' : ''}${Math.abs(d.pnlRate * 100).toLocaleString('en-US', { maximumFractionDigits: Math.abs(d.pnlRate) >= 1 ? 0 : 1 })}%`;
    ctx.font = `700 36px ${SANS}`;
    const pctW = ctx.measureText(pct).width + 36;
    roundRect(ctx, PAD, 418, pctW, 56, 12);
    ctx.fillStyle = alpha(tone, 0.15);
    ctx.fill();
    ctx.fillStyle = tone;
    ctx.fillText(pct, PAD + 18, 459);
  }

  // Chart on the right.
  drawSparkline(ctx, opts.closes ?? [], d.entryPriceUsd, { x: 700, y: 150, w: W - PAD - 700, h: 300 }, tone, p);

  // Stats row.
  const stats = shareStats(d);
  const colW = (W - PAD * 2) / stats.length;
  ctx.strokeStyle = alpha(p.line, 0.8);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, 512);
  ctx.lineTo(W - PAD, 512);
  ctx.stroke();
  stats.forEach((s, i) => {
    const x = PAD + i * colW;
    ctx.font = `500 20px ${SANS}`;
    ctx.fillStyle = p.muted;
    ctx.fillText(s.label, x, 556);
    ctx.font = `700 34px ${SANS}`;
    ctx.fillStyle = p.fg;
    ctx.fillText(s.value, x, 598);
  });

  // Footer.
  ctx.font = `500 18px ${SANS}`;
  ctx.fillStyle = p.faint;
  ctx.fillText(isLiveMode() ? 'Traded on Solana with Trenchscope · not financial advice' : 'Paper trade on Trenchscope’s simulated market · not financial advice', PAD, H - 30);
  ctx.textAlign = 'right';
  const date = new Date(d.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  ctx.fillText(d.trader ? `${d.trader} · ${date}` : date, W - PAD, H - 30);
  ctx.textAlign = 'left';
}

/** The canvas as a PNG blob. */
export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not render the image'))), 'image/png'));
}
