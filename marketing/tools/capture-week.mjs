// Warm-up week captures (WARMUP_WEEK.md §9): element screenshots at 2x with
// bounding boxes for masks/blurs, plus the keyboard-run and rug-autopsy clips
// with logged beat timestamps for burned-in captions.
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const require = createRequire('/home/user/Gmgn/apps/web/package.json');
const { chromium } = require('@playwright/test');

const BASE = 'http://localhost:8787';
const RAW = '/home/user/Gmgn/marketing/screens/week';
const CLIPS = '/home/user/Gmgn/marketing/video/app-footage';
const TMP = process.argv[2] || '/tmp/cap-frames';
const only = process.argv[3] ? process.argv[3].split(',') : null;
const want = (n) => !only || only.includes(n);
fs.mkdirSync(RAW, { recursive: true });
const api = async (p) => (await fetch(BASE + p)).json();
const meta = fs.existsSync(`${RAW}/boxes.json`) ? JSON.parse(fs.readFileSync(`${RAW}/boxes.json`, 'utf8')) : {};
const saveMeta = () => fs.writeFileSync(`${RAW}/boxes.json`, JSON.stringify(meta, null, 1));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

async function session(dpr) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: dpr, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/sol/trenches`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Sign in' }).first().click();
  await page.getByRole('button', { name: /Start paper trading|Quick start|Create guest/i }).last().click();
  await page.waitForTimeout(1500);
  return { ctx, page };
}

const panel = (page, title) => page.locator('section.panel').filter({ has: page.locator('h3', { hasText: new RegExp(`^${title}`) }) }).first();

/** Box of `inner` relative to `outer`, in CSS px. */
async function rel(outer, inner) {
  const o = await outer.boundingBox();
  const i = await inner.boundingBox();
  if (!o || !i) return null;
  return [i.x - o.x, i.y - o.y, i.width, i.height].map((v) => Math.round(v * 10) / 10);
}

async function shoot(locator, name) {
  await locator.screenshot({ path: `${RAW}/${name}.png` });
  const b = await locator.boundingBox();
  return [b.width, b.height];
}

async function record(page, name, seconds, actions, { hires = false } = {}) {
  const W = hires ? 3840 : 1920, H = hires ? 2160 : 1080;
  const dir = path.join(TMP, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', async (f) => {
    frames.push({ data: f.data, t: f.metadata.timestamp });
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  const start = Date.now();
  const beats = [];
  const mark = (label) => beats.push({ t: (Date.now() - start) / 1000, label });
  if (actions) await actions(mark);
  const left = seconds * 1000 - (Date.now() - start);
  if (left > 0) await page.waitForTimeout(left);
  await cdp.send('Page.stopScreencast');
  await page.waitForTimeout(200);
  const t0 = frames[0].t;
  const list = [];
  frames.forEach((f, i) => {
    const file = path.join(dir, `f${String(i).padStart(5, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    const next = i + 1 < frames.length ? frames[i + 1].t : t0 + seconds;
    list.push(`file '${file}'\nduration ${Math.max(0.001, next - f.t).toFixed(4)}`);
  });
  list.push(`file '${path.join(dir, `f${String(frames.length - 1).padStart(5, '0')}.jpg`)}'`);
  fs.writeFileSync(path.join(dir, 'list.txt'), list.join('\n'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'),
    '-vf', `fps=30,scale=${W}:${H}:flags=lanczos,format=yuv420p`, '-t', String(seconds), '-c:v', 'libx264', '-crf', hires ? '18' : '16', '-preset', hires ? 'medium' : 'slow',
    `${CLIPS}/${name}.mp4`]);
  meta[name] = { seconds, beats };
  saveMeta();
  console.log('clip', name, frames.length, 'frames', JSON.stringify(beats));
}

const trenches = await api('/api/sol/trenches?limit=100');
const all = [...trenches.new, ...trenches.almost, ...trenches.migrated];
const risk = (t) => (t.security?.bundlerRate ?? 0) + (t.security?.sniperHoldRate ?? 0) + (t.security?.insiderHoldRate ?? 0) + (t.security?.devHoldRate ?? 0);

// ---------------- stills at 2x ----------------
{
  const { ctx, page } = await session(2);

  if (want('holders')) {
    // A: a clean migrated token with holders; B: the riskiest near-graduation token.
    const A = [...trenches.migrated].filter((t) => risk(t) < 0.05 && t.holderCount > 80).sort((a, b) => b.holderCount - a.holderCount)[0];
    const B = [...trenches.almost].sort((a, b) => risk(b) - risk(a))[0];
    for (const [k, t] of [['A', A], ['B', B]]) {
      await page.goto(`${BASE}/sol/token/${t.address}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2500);
      const p = panel(page, 'Holders');
      const size = await shoot(p, `holders-${k}`);
      const masks = {};
      for (const label of ['Insiders', 'Bundlers', 'Snipers']) masks[label] = await rel(p, p.locator('span.chip', { hasText: label }).first());
      for (const label of ['Insider', 'Bundler', 'Sniper']) masks[`row-${label}`] = await rel(p, p.locator('div, li', { hasText: new RegExp(`^${label}\\s`) }).last()).catch(() => null);
      meta[`holders-${k}`] = { token: t.symbol, address: t.address, size, masks, risk: risk(t) };
      saveMeta();
      console.log('holders', k, t.symbol);
    }
  }

  if (want('wash')) {
    // Two tokens with similar 1h-ish volume: one flagged wash trading, one clean.
    const withVol = all.filter((t) => t.stats?.['1h']?.volumeUsd > 2000 || t.stats?.['24h']?.volumeUsd > 2000);
    const vol = (t) => t.stats?.['24h']?.volumeUsd ?? 0;
    const flagged = withVol.filter((t) => t.security?.isWashTrading).sort((a, b) => vol(b) - vol(a));
    let pair = null;
    for (const f of flagged) {
      const clean = withVol.filter((t) => !t.security?.isWashTrading && t.status === f.status).sort((a, b) => Math.abs(vol(a) - vol(f)) - Math.abs(vol(b) - vol(f)))[0];
      if (clean && Math.abs(vol(clean) - vol(f)) / vol(f) <= 0.3) { pair = [f, clean]; break; }
    }
    if (!pair) console.log('wash: no matching pair', flagged.length);
    else {
      for (const [k, t] of [['A', pair[0]], ['B', pair[1]]]) {
        await page.goto(`${BASE}/sol/token/${t.address}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(2500);
        const p = panel(page, 'Audit');
        await p.getByRole('button', { name: /^All \d+/ }).first().click().catch(() => {});
        await page.waitForTimeout(500);
        const size = await shoot(p, `wash-${k}`);
        const row = p.locator('li', { hasText: /Wash trading/ }).first();
        const box = await rel(p, row).catch(() => null);
        meta[`wash-${k}`] = { token: t.symbol, address: t.address, size, washRow: box, volume24h: vol(t), flagged: !!t.security?.isWashTrading };
        saveMeta();
        console.log('wash', k, t.symbol, Math.round(vol(t)), !!t.security?.isWashTrading, box);
      }
    }
  }

  if (want('gate')) {
    const B = [...trenches.almost].sort((a, b) => risk(b) - risk(a))[0];
    await page.goto(`${BASE}/sol/token/${B.address}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    const tp = page.locator('aside').first();
    // Buy quote panel (for screen-buy-preview).
    const quote = panel(page, 'Audit');
    const asideBox = await tp.boundingBox();
    await page.screenshot({ path: `${RAW}/buy-panel.png`, clip: { x: asideBox.x, y: asideBox.y, width: asideBox.width, height: 380 } });
    const recv = page.getByText('You receive', { exact: true }).first();
    const minr = page.getByText(/^Min received/).first();
    const rowBox = async (lab) => {
      const row = lab.locator('xpath=..');
      const r = await row.boundingBox();
      return [r.x - asideBox.x, r.y - asideBox.y, r.width, r.height];
    };
    meta['buy-panel'] = { token: B.symbol, size: [asideBox.width, 380], blur: [await rowBox(recv), await rowBox(minr)] };
    saveMeta();
    // Risk gate dialog.
    await page.getByRole('button', { name: /^Buy 0\.5 SOL/ }).first().click();
    await page.waitForTimeout(1200);
    const dlg = page.getByRole('dialog').first();
    const size = await shoot(dlg, 'risk-gate');
    const title = dlg.getByText(/^High-risk token/).first();
    meta['risk-gate'] = { token: B.symbol, size, title: await rel(dlg, title) };
    saveMeta();
    await page.keyboard.press('Escape');
    console.log('gate', B.symbol);
  }

  if (want('devhover')) {
    await page.goto(`${BASE}/sol/trenches`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    const live = await api('/api/sol/trenches?limit=60');
    const cands = [...live.new, ...live.almost].filter((t) => t.devMigratedCount === 0).sort((a, b) => b.devCreatedCount - a.devCreatedCount);
    let done = false;
    for (const t of cands.slice(0, 12)) {
      const card = page.locator(`li[data-token="${t.address}"]`).first();
      if (!(await card.count())) continue;
      await card.locator('span.block.rounded-full').first().hover();
      await page.waitForTimeout(900);
      const hc = page.getByRole('dialog', { name: `${t.symbol} summary` }).or(page.locator('[role="tooltip"], [data-hovercard]')).first();
      const cb = await card.boundingBox();
      const hb = await hc.boundingBox().catch(() => null);
      if (!hb) continue;
      const x = Math.max(0, Math.min(cb.x, hb.x) - 24), y = Math.max(0, Math.min(cb.y, hb.y) - 24);
      const w = Math.min(1920 - x, Math.max(cb.x + cb.width, hb.x + hb.width) - x + 24), h = Math.min(1080 - y, Math.max(cb.y + cb.height, hb.y + hb.height) - y + 24);
      await page.screenshot({ path: `${RAW}/dev-hover.png`, clip: { x, y, width: w, height: h } });
      const line = page.getByText(/launched ·/).last();
      const lb = await line.boundingBox().catch(() => null);
      meta['dev-hover'] = { token: t.symbol, size: [w, h], devCreated: t.devCreatedCount, line: lb ? [lb.x - x, lb.y - y, lb.width, lb.height] : null, card: [cb.x - x, cb.y - y, cb.width, cb.height] };
      saveMeta();
      console.log('devhover', t.symbol, t.devCreatedCount);
      done = true;
      break;
    }
    if (!done) console.log('devhover: none');
  }
  await ctx.close();
}

// ---------------- clips at 1x ----------------
{
  const { ctx, page } = await session(1);

  if (want('d3-c')) {
    await page.goto(`${BASE}/sol/trenches`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    await page.mouse.move(1919, 1079);
    await record(page, 'd3-c-keyboard', 15, async (mark) => {
      const press = async (key, label, wait) => { mark(label); await page.keyboard.press(key); await page.waitForTimeout(wait); };
      await page.waitForTimeout(1200);
      await press('2', '2', 1100);
      await press('j', 'J', 700);
      await press('j', 'J', 1100);
      await press('b', 'B', 2200);
      await press('Enter', 'ENTER', 3000);
      await press('s', 'S', 1500);
    });
  }

  if (want('d4-a')) {
    // Wait for a fresh bundler sell, then walk the record at 2x: audit, then
    // the activity table filtered to bundlers / snipers / dev, then the 1s chart.
    const { ctx: hctx, page: hp } = await session(2);
    let sig = null;
    const deadline = Date.now() + 300_000;
    while (!sig && Date.now() < deadline) {
      const now = Date.now();
      const bund = await api('/api/sol/signals?kind=bundler_sell&limit=10');
      sig = bund.filter((s) => now - s.createdAt < 15_000).sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
      if (!sig) await new Promise((r) => setTimeout(r, 1000));
    }
    if (!sig) console.log('d4-a: no bundler sell');
    else {
      console.log('autopsy', sig.token.symbol, sig.title);
      meta['d4-a-token'] = { symbol: sig.token.symbol, address: sig.token.address, title: sig.title };
      await hp.goto(`${BASE}/sol/token/${sig.token.address}`, { waitUntil: 'networkidle' });
      await hp.waitForTimeout(2000);
      const filter = (label) => hp.locator('[aria-label="Trader type"]').getByText(label, { exact: true }).first().click();
      const scrollTo = async (y) => { await hp.evaluate((y) => window.scrollTo({ top: y, behavior: 'smooth' }), y); await hp.waitForTimeout(500); };
      await record(hp, 'd4-a-autopsy', 21, async (mark) => {
        mark('audit');
        await hp.mouse.move(1500, 560, { steps: 25 });
        await hp.waitForTimeout(3000);
        await scrollTo(560);
        mark('bundler'); await filter('Bundler'); await hp.waitForTimeout(3300);
        mark('sniper'); await filter('Sniper'); await hp.waitForTimeout(3300);
        mark('dev'); await filter('Dev'); await hp.waitForTimeout(3300);
        await scrollTo(0);
        mark('chart');
        await filter('All');
        await hp.locator('[aria-label="Candle resolution"]').getByText('1s', { exact: true }).first().click().catch(() => {});
        await hp.mouse.move(700, 450, { steps: 30 });
      }, { hires: true });
      await hp.screenshot({ path: `${RAW}/autopsy-end.png` });
    }
    await hctx.close();
  }
  await ctx.close();
}
await browser.close();
