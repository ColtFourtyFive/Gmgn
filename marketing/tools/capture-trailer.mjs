// Trailer app shots (SCRIPT.md §8) at 2x, plus real wallet-tag chips at 4x (§5.3).
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const require = createRequire('/home/user/Gmgn/apps/web/package.json');
const { chromium } = require('@playwright/test');

const BASE = 'http://localhost:8787';
const CHIPS = '/home/user/Gmgn/marketing/video/overlays/chips';
const CLIPS = '/home/user/Gmgn/marketing/video/app-footage';
const RAW = '/home/user/Gmgn/marketing/screens/trailer';
const TMP = process.argv[2] || '/tmp/cap-frames';
const only = process.argv[3] ? process.argv[3].split(',') : null;
const want = (n) => !only || only.includes(n);
for (const d of [CHIPS, RAW]) fs.mkdirSync(d, { recursive: true });
const api = async (p) => (await fetch(BASE + p)).json();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const metaPath = `${RAW}/meta.json`;
const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
const saveMeta = () => fs.writeFileSync(metaPath, JSON.stringify(meta, null, 1));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
async function context(dpr) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: dpr, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/sol/trenches`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Sign in' }).first().click();
  await page.getByRole('button', { name: /Start paper trading|Quick start|Create guest/i }).last().click();
  await page.waitForTimeout(1500);
  return { ctx, page };
}

async function record(page, name, seconds, actions) {
  const W = 3840, H = 2160;
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
    '-vf', `fps=30,scale=${W}:${H}:flags=lanczos,format=yuv420p`, '-t', String(seconds), '-c:v', 'libx264', '-crf', '18', '-preset', 'medium',
    `${CLIPS}/${name}.mp4`]);
  meta[name] = { seconds, beats };
  saveMeta();
  console.log('clip', name, frames.length, 'frames', JSON.stringify(beats));
}

const trenches = await api('/api/sol/trenches?limit=100');
const risk = (t) => (t.security?.bundlerRate ?? 0) + (t.security?.sniperHoldRate ?? 0) + (t.security?.insiderHoldRate ?? 0) + (t.security?.devHoldRate ?? 0);

if (want('chips')) {
  const { ctx, page } = await context(4);
  const B = [...trenches.almost, ...trenches.new].sort((a, b) => risk(b) - risk(a));
  const holderWith = async (tag) => {
    for (const t of B.slice(0, 15)) {
      const rows = await api(`/api/sol/tokens/${t.address}/holders?tag=${tag}&limit=5`);
      const w = rows.find((r) => r.addrType !== 'curve' && r.addrType !== 'pool' && r.wallet);
      if (w) return w.wallet;
    }
    return null;
  };
  const lb = async (tag) => ((await api(`/api/sol/leaderboard?tag=${tag}&period=1d&limit=3`))[0] ?? {}).address;
  const me = await page.evaluate(async () => {
    const tok = Object.keys(localStorage).map((k) => localStorage.getItem(k)).find((v) => v && v.length > 20 && !v.startsWith('{'));
    return tok || null;
  });
  const targets = { whale: await lb('whale'), sniper: await lb('sniper'), bundler: await holderWith('bundler'), insider: await holderWith('insider'), dev: await holderWith('dev') };
  console.log('chip wallets', JSON.stringify(targets));
  const labels = { whale: 'Whale', sniper: 'Sniper', bundler: 'Bundler', insider: 'Insider', dev: 'Dev', you: 'You' };
  for (const [tag, addr] of Object.entries(targets)) {
    if (!addr) { console.log('chip missing', tag); continue; }
    await page.goto(`${BASE}/sol/address/${addr}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const chip = page.locator('span.chip', { hasText: new RegExp(`^${labels[tag]}$`) }).first();
    if (!(await chip.count())) { console.log('chip not on page', tag); continue; }
    await chip.screenshot({ path: `${CHIPS}/${tag}.png`, omitBackground: true });
    console.log('chip', tag);
  }
  // "You": open the portfolio's own wallet via a holder row tagged 'you' after a paper buy.
  const T = trenches.migrated[0];
  await page.goto(`${BASE}/sol/token/${T.address}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.locator('aside').first().getByRole('button', { name: /^Buy 0\.5 SOL/ }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await page.getByRole('tab', { name: /^Holders/ }).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  const youChip = page.locator('span.chip', { hasText: /^You$/ }).first();
  if (await youChip.count()) { await youChip.screenshot({ path: `${CHIPS}/you.png`, omitBackground: true }); console.log('chip you'); }
  else console.log('chip you: not found');
  await ctx.close();
}

if (want('habitat')) {
  const { ctx, page } = await context(2);
  await page.goto(`${BASE}/sol/trenches`, { waitUntil: 'networkidle' });
  await page.mouse.move(1919, 1079);
  await page.waitForTimeout(3000);
  await record(page, 'trailer-habitat', 14);
  await ctx.close();
}

if (want('gate')) {
  const { ctx, page } = await context(2);
  const B = [...trenches.almost].sort((a, b) => risk(b) - risk(a))[0];
  meta.gateToken = B.symbol;
  await page.goto(`${BASE}/sol/token/${B.address}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const aside = page.locator('aside').first();
  await page.mouse.move(1500, 300);
  await record(page, 'trailer-gate', 9, async (mark) => {
    await page.waitForTimeout(500);
    mark('max');
    await aside.getByRole('button', { name: /^max$/i }).first().click({ timeout: 8000 }).catch(() => aside.getByText(/^max$/i).first().click());
    await page.waitForTimeout(900);
    mark('buy');
    const buyBtn = aside.getByRole('button', { name: /^Buy [\d.]+ SOL/ }).first();
    const bb = await buyBtn.boundingBox();
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 18 });
    await buyBtn.click();
    await page.waitForTimeout(1300);
    mark('dialog');
    const dlg = page.getByRole('dialog').first();
    const cb = dlg.getByText('I understand the risks and want to buy');
    const cbb = await cb.boundingBox();
    await page.mouse.move(cbb.x + 10, cbb.y + cbb.height / 2, { steps: 20 });
    await page.waitForTimeout(400);
    mark('tick');
    await cb.click();
    await page.waitForTimeout(300);
    const ba = dlg.getByRole('button', { name: 'Buy anyway' });
    const bab = await ba.boundingBox();
    await page.mouse.move(bab.x + bab.width / 2, bab.y + bab.height / 2, { steps: 18 });
    await page.waitForTimeout(300);
    mark('click');
    await ba.click();
    await page.waitForTimeout(400);
    mark('toast');
  });
  await ctx.close();
}

if (want('rug')) {
  const { ctx, page } = await context(2);
  await page.goto(`${BASE}/sol/trenches`, { waitUntil: 'networkidle' });
  let sig = null;
  const deadline = Date.now() + 480_000;
  const seen = new Set(['ASTRO', 'NPC', 'PDAO', 'COMBO']);
  while (!sig && Date.now() < deadline) {
    const now = Date.now();
    const devs = await api('/api/sol/signals?kind=dev_sell&limit=10');
    const pct = (s) => Number((s.title.match(/(\d+)%/) || [0, 0])[1]);
    sig = devs.filter((s) => now - s.createdAt < 3_000 && pct(s) >= 50 && !seen.has(s.token.symbol)).sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
    if (!sig) await sleep(400);
  }
  if (!sig) console.log('rug: none');
  else {
    meta.rugToken = { symbol: sig.token.symbol, title: sig.title };
    saveMeta();
    console.log('rug', sig.token.symbol, sig.title);
    await page.goto(`${BASE}/sol/token/${sig.token.address}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[aria-label="Candle resolution"]').getByText('1s', { exact: true }).first().click({ timeout: 5000 }).catch(() => {});
    await record(page, 'trailer-rug', 10);
  }
  await ctx.close();
}
await browser.close();
