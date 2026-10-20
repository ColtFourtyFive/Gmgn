// Launch-day captures (LAUNCH_DAY.md §10): sign-in quick start, audit + holders
// table, Auto exits, a sandwiched fill (MEV toast), a live dump at 1s candles,
// and a "guess the fate" timelapse of one launch.
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const require = createRequire('/home/user/Gmgn/apps/web/package.json');
const { chromium } = require('@playwright/test');

const BASE = 'http://localhost:8787';
const RAW = '/home/user/Gmgn/marketing/screens/launch';
const CLIPS = '/home/user/Gmgn/marketing/video/app-footage';
const TMP = process.argv[2] || '/tmp/cap-frames';
const only = process.argv[3] ? process.argv[3].split(',') : null;
const want = (n) => !only || only.includes(n);
fs.mkdirSync(RAW, { recursive: true });
const api = async (p) => (await fetch(BASE + p)).json();
const metaPath = `${RAW}/boxes.json`;
const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
const saveMeta = () => fs.writeFileSync(metaPath, JSON.stringify(meta, null, 1));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

async function context(dpr, signIn = true) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: dpr, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/sol/trenches`, { waitUntil: 'networkidle' });
  if (signIn) {
    await page.getByRole('button', { name: 'Sign in' }).first().click();
    await page.getByRole('button', { name: /Start paper trading|Quick start|Create guest/i }).last().click();
    await page.waitForTimeout(1500);
  }
  return { ctx, page };
}
const panel = (page, title) => page.locator('section.panel').filter({ has: page.locator('h3', { hasText: new RegExp(`^${title}`) }) }).first();
async function rel(outer, inner) {
  const o = await outer.boundingBox();
  const i = await inner.boundingBox();
  return o && i ? [i.x - o.x, i.y - o.y, i.width, i.height].map((v) => Math.round(v * 10) / 10) : null;
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
    '-vf', `fps=30,scale=${W}:${H}:flags=lanczos,format=yuv420p`, '-t', String(seconds), '-c:v', 'libx264', '-crf', hires ? '18' : '16', '-preset', 'medium',
    `${CLIPS}/${name}.mp4`]);
  meta[name] = { seconds, beats };
  saveMeta();
  console.log('clip', name, frames.length, 'frames', JSON.stringify(beats));
}

const trenches = await api('/api/sol/trenches?limit=100');
const risk = (t) => (t.security?.bundlerRate ?? 0) + (t.security?.sniperHoldRate ?? 0) + (t.security?.insiderHoldRate ?? 0) + (t.security?.devHoldRate ?? 0);

if (want('signin')) {
  const { ctx, page } = await context(2, false);
  await page.getByRole('button', { name: 'Sign in' }).first().click();
  await page.waitForTimeout(800);
  const dlg = page.getByRole('dialog').first();
  await dlg.screenshot({ path: `${RAW}/signin.png` });
  const b = await dlg.boundingBox();
  meta.signin = { size: [b.width, b.height] };
  saveMeta();
  console.log('signin');
  await ctx.close();
}

if (want('audit-holders') || want('auto')) {
  const { ctx, page } = await context(2);
  const B = [...trenches.almost].sort((a, b) => risk(b) - risk(a))[0];
  await page.goto(`${BASE}/sol/token/${B.address}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  if (want('audit-holders')) {
    const audit = panel(page, 'Audit');
    await audit.screenshot({ path: `${RAW}/audit.png` });
    const ab = await audit.boundingBox();
    const bundRow = await rel(audit, audit.locator('li', { hasText: /Bundlers/ }).first()).catch(() => null);
    await page.getByRole('tab', { name: /^Holders/ }).first().click().catch(() => page.getByText(/^Holders$/).last().click());
    await page.waitForTimeout(1500);
    const tabs = page.locator('div.panel').filter({ has: page.getByRole('tab', { name: /^Activity/ }) }).first();
    await tabs.screenshot({ path: `${RAW}/holders-table.png` });
    const tb = await tabs.boundingBox();
    const funded = await rel(tabs, tabs.getByText('Funded by', { exact: false }).first()).catch(() => null);
    meta['audit-holders'] = { token: B.symbol, audit: [ab.width, ab.height], bundlersRow: bundRow, table: [tb.width, tb.height], fundedHeader: funded };
    saveMeta();
    console.log('audit-holders', B.symbol, funded);
  }
  if (want('auto')) {
    await page.getByRole('tab', { name: 'Auto' }).first().click().catch(() => page.getByText('Auto', { exact: true }).first().click());
    await page.waitForTimeout(1000);
    const aside = page.locator('aside').first();
    const b = await aside.boundingBox();
    await page.screenshot({ path: `${RAW}/auto.png`, clip: { x: b.x, y: b.y, width: b.width, height: Math.min(1016, b.height) } });
    meta.auto = { token: B.symbol, size: [b.width, Math.min(1016, b.height)] };
    saveMeta();
    console.log('auto');
  }
  await ctx.close();
}

if (want('mev')) {
  const { ctx, page } = await context(2);
  const pools = [...trenches.migrated].filter((t) => t.liquidityUsd > 8000 && t.liquidityUsd < 40000 && t.security?.riskLevel !== 'high').sort((a, b) => a.liquidityUsd - b.liquidityUsd);
  const T = pools[0];
  console.log('mev token', T.symbol, Math.round(T.liquidityUsd));
  await page.goto(`${BASE}/sol/token/${T.address}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.locator('aside').first().getByText('S3', { exact: true }).first().click();
  await page.waitForTimeout(500);
  const input = page.locator('aside').first().locator('input').first();
  await input.fill('2');
  await page.waitForTimeout(800);
  const aside = page.locator('aside').first();
  const b = await aside.boundingBox();
  await page.screenshot({ path: `${RAW}/mev-quote.png`, clip: { x: b.x, y: b.y, width: b.width, height: 560 } });
  let got = false;
  for (let i = 0; i < 14 && !got; i++) {
    await aside.getByRole('button', { name: /^Buy 2 SOL/ }).first().click({ timeout: 5000 }).catch(() => {});
    const dlg = page.getByRole('dialog');
    if (await dlg.count()) {
      await dlg.getByText('I understand the risks and want to buy').click({ timeout: 2000 }).catch(() => {});
      await dlg.getByRole('button', { name: /Buy anyway|Confirm buy/ }).click({ timeout: 3000 }).catch(() => {});
    }
    const toast = page.locator('[role="status"], [role="alert"]').filter({ hasText: /Bought/ }).last();
    await toast.waitFor({ timeout: 4000 }).catch(() => {});
    const txt = (await toast.textContent().catch(() => '')) || '';
    if (/MEV/.test(txt)) {
      const tb = await toast.boundingBox();
      await page.screenshot({ path: `${RAW}/mev-toast.png`, clip: { x: tb.x - 16, y: tb.y - 16, width: tb.width + 32, height: tb.height + 32 } });
      await page.screenshot({ path: `${RAW}/mev-full.png` });
      meta.mev = { token: T.symbol, toast: txt, toastBox: [tb.x, tb.y, tb.width, tb.height], tries: i + 1 };
      saveMeta();
      console.log('mev', txt);
      got = true;
    } else {
      await page.waitForTimeout(1500);
    }
  }
  if (!got) console.log('mev: no sandwich in 14 tries');
  await ctx.close();
}

if (want('live-rug')) {
  // Record a token page at 1s candles starting right at a fresh, large dev sell.
  const { ctx, page } = await context(1);
  await page.goto(`${BASE}/sol/trenches`, { waitUntil: 'networkidle' });
  let sig = null;
  const deadline = Date.now() + 420_000;
  while (!sig && Date.now() < deadline) {
    const now = Date.now();
    const devs = await api('/api/sol/signals?kind=dev_sell&limit=10');
    const pct = (s) => Number((s.title.match(/(\d+)%/) || [0, 0])[1]);
    sig = devs.filter((s) => now - s.createdAt < 4_000 && pct(s) >= 50).sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
    if (!sig) await sleep(500);
  }
  if (!sig) console.log('live-rug: none');
  else {
    console.log('live-rug', sig.token.symbol, sig.title);
    meta['live-rug-token'] = { symbol: sig.token.symbol, title: sig.title };
    await page.goto(`${BASE}/sol/token/${sig.token.address}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[aria-label="Candle resolution"]').getByText('1s', { exact: true }).first().click({ timeout: 5000 }).catch(() => {});
    await record(page, 'launch-live-rug', 22);
  }
  await ctx.close();
}

if (want('fate')) {
  // Guess the fate: a ~2-minute-old launch, then a timelapse until it resolves.
  const { ctx, page } = await context(2);
  const now = Date.now();
  const fresh = trenches.new.filter((t) => now - t.createdAt > 90_000 && now - t.createdAt < 180_000 && t.holderCount >= 5);
  const T = fresh.sort((a, b) => risk(b) - risk(a))[Math.min(1, fresh.length - 1)] ?? trenches.new[0];
  console.log('fate token', T.symbol, Math.round((now - T.createdAt) / 1000), 's old');
  await page.goto(`${BASE}/sol/token/${T.address}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${RAW}/fate-start.png` });
  const dir = path.join(TMP, 'fate');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const t0 = Date.now();
  let n = 0;
  let outcome = 'unresolved';
  const maxMs = Number(process.env.FATE_MAX_MS || 1_500_000);
  while (Date.now() - t0 < maxMs) {
    await page.screenshot({ path: path.join(dir, `f${String(n++).padStart(5, '0')}.png`), scale: 'css' });
    if (n % 10 === 0) {
      const d = await api(`/api/sol/tokens/${T.address}`);
      if (d.status === 'migrated') { outcome = 'migrated'; }
      if (d.security?.devStatus === 'sold_all' && d.marketCapUsd < 0.5 * (d.athMarketCapUsd || d.marketCapUsd)) outcome = 'rugged';
      if (outcome !== 'unresolved') { for (let k = 0; k < 15; k++) { await sleep(2000); await page.screenshot({ path: path.join(dir, `f${String(n++).padStart(5, '0')}.png`), scale: 'css' }); } break; }
    }
    await sleep(2000);
  }
  const elapsed = (Date.now() - t0) / 1000;
  meta.fate = { token: T.symbol, address: T.address, frames: n, elapsed, outcome, ageAtStart: Math.round((now - T.createdAt) / 1000) };
  saveMeta();
  console.log('fate', JSON.stringify(meta.fate));
  await ctx.close();
}

await browser.close();
