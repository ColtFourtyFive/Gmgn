// Launch-day stills (LAUNCH_DAY §10) in marketing capture mode on the local demo market, 1920x1080 CSS at a forced
// device scale of 2 (native 3840x2160 page shots). blur-tickers.js blurs demo tickers, names and @handles everywhere.
//   audit  -> launch-4: a high-risk token's audit card, then its Holders tab with the Funded by column
//   risk   -> launch-5: a Market buy on a high-risk token, the High-risk dialog open (unticked) over the red audit card
//   exits  -> launch-6: after an Auto buy with TP ladder, SL, trailing and a dev-sell exit, the Orders tab + chart lines
//   bill   -> launch-7: a Market buy sized so price impact turns red, the full quote
//   surv   -> launch-9: a copy-trade task, a migration sniper task (both created through the app's API), Signals, Monitor
//   strip  -> launch-17: a holder strip with the Bundlers and Insiders chips red
//   keys2  -> launch-8: keyboard only, a different sequence from peek-keys: / , paste an address, Enter, B, S, back to
//             the board (browser Back), 3, J, K. Recorded at scale 1 (LAUNCH_DSF=1) for frame rate
// Each token is new to the kit (addresses used by earlier captures are skipped). Buys are paper buys in the simulator.
// Page shots go to screens/live/l-<part>*.png, boxes (CSS px) to screens/live/launch2.json.
// Usage: [LAUNCH_DSF=1] node capture_launch2.mjs scratch_dir [audit,risk,exits,bill,surv,strip,keys2]
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const require = createRequire('/home/user/Gmgn/apps/web/package.json');
const { chromium } = require('@playwright/test');

const BASE = 'http://localhost:8787';
const TOOLS = '/home/user/Gmgn/marketing/tools';
const LIVE = '/home/user/Gmgn/marketing/screens/live';
const only = process.argv[3] ? process.argv[3].split(',') : null;
const want = (n) => !only || only.includes(n);
const metaPath = `${LIVE}/launch2.json`;
const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
const save = () => fs.writeFileSync(metaPath, JSON.stringify(meta, null, 1));
const api = async (p) => (await fetch(BASE + p)).json();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DSF = Number(process.env.LAUNCH_DSF || 2);
const TMP = process.argv[2];
const BLUR = 'a.link.font-semibold[title],span.truncate.text-muted[title],h1.text-lg.font-bold,h1.text-lg.font-bold + *{filter:blur(6px)!important}';

// Tokens already in other assets.
const used = new Set();
const collect = (o) => { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (k === 'address' && typeof v === 'string') used.add(v); else collect(v); } };
for (const f of ['boxes.json', 'videos.json', 'trailer-v4.json', 'trailer-v4m.json', 'peeks2.json', 'facts.json', 'launch2.json']) {
  try { collect(JSON.parse(fs.readFileSync(`${LIVE}/${f}`, 'utf8'))); } catch {}
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: [`--force-device-scale-factor=${DSF}`, '--window-size=1920,1080'] });
const ctx = await browser.newContext({ viewport: null, colorScheme: 'dark' });
await ctx.addInitScript({ path: `${TOOLS}/capture-mode.js` });
await ctx.addInitScript({ path: `${TOOLS}/blur-tickers.js` });
await ctx.addInitScript(`document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent=${JSON.stringify(BLUR)};document.head.appendChild(s);});`);
const page = await ctx.newPage();
const em = await ctx.newCDPSession(page);
await em.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 0, mobile: false });
await page.goto(`${BASE}/sol/trenches`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Sign in' }).first().click();
await page.getByRole('button', { name: /Start trading|Quick start/i }).last().click();
await page.waitForTimeout(2000);
const token = async () => page.evaluate(() => localStorage.getItem('ts.token'));
const call = async (method, path, body) => page.evaluate(async ([m, p, b, t]) => {
  const r = await fetch(p, { method: m, headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` }, body: b ? JSON.stringify(b) : undefined });
  return { status: r.status, body: await r.text() };
}, [method, path, body, await token()]);

const box = async (loc) => { const b = await loc.boundingBox().catch(() => null); return b && [b.x, b.y, b.width, b.height].map((v) => Math.round(v)); };
const panel = (title) => page.locator('section.panel').filter({ has: page.locator('h3', { hasText: new RegExp(`^${title}`) }) }).first();
const shot = async (name) => {
  await page.mouse.move(1919, 140);
  await sleep(400);
  const s = await em.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${LIVE}/${name}.png`, Buffer.from(s.data, 'base64'));
};
const s = (t) => t.security ?? {};
async function pick(filter, sort) {
  const tr = await api('/api/sol/trenches?limit=100');
  const c = [...tr.almost, ...tr.new, ...tr.migrated].filter((t) => !used.has(t.address) && filter(t)).sort(sort ?? ((a, b) => b.holderCount - a.holderCount));
  if (!c[0]) throw new Error('no candidate');
  used.add(c[0].address);
  return c[0];
}
async function open(t) {
  await page.goto(`${BASE}/sol/token/${t.address}`, { waitUntil: 'networkidle' });
  await page.mouse.move(1919, 140);
  await page.waitForTimeout(2500);
}
const aside = () => page.locator('aside').first();
async function confirmRisk() {
  const dlg = page.getByRole('dialog').first();
  if (await dlg.count()) {
    await dlg.getByText('I understand the risks and want to buy').click();
    await dlg.getByRole('button', { name: 'Buy anyway' }).click();
  }
}

if (want('audit')) {
  const t = await pick((x) => (s(x).rugRatio ?? 0) > 0.5 && s(x).insiderHoldRate >= 0.05 && s(x).bundlerRate >= 0.1 && s(x).freshWalletRate >= 0.3 && x.holderCount >= 15);
  await open(t);
  meta.audit = { token: t.symbol, address: t.address, panel: await box(panel('Audit')) };
  await shot('l-audit');
  await page.locator('div.panel').getByRole('tab', { name: /^Holders/ }).first().click();
  await page.waitForFunction(() => [...document.querySelectorAll('tbody tr')].some((r) => /\d/.test(r.innerText)), null, { timeout: 15000 }).catch(() => {});
  // Scroll the page, not the table (a wheel over a long table scrolls its rows instead).
  await page.evaluate(() => {
    const els = [...document.querySelectorAll('*')].filter((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 50);
    els.sort((a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth);
    (els[0] || document.scrollingElement).scrollBy(0, 330);
  });
  await page.waitForTimeout(1200);
  meta.audit.table = await box(page.locator('div.panel').filter({ has: page.locator('tbody') }).last());
  meta.audit.fundedBy = await box(page.getByText(/^Funded by$/i).first());
  save();
  await shot('l-holders');
  console.log('audit', t.symbol);
}

if (want('risk')) {
  const t = await pick((x) => (s(x).rugRatio ?? 0) > 0.6 && s(x).devHoldRate >= 0.1 && s(x).insiderHoldRate >= 0.05 && x.status === 'curve');
  await open(t);
  await aside().getByRole('button', { name: /^0\.5$/ }).first().click().catch(() => {});
  await aside().getByRole('button', { name: /^Buy [\d.]+ SOL/ }).first().click();
  await page.waitForTimeout(1000);
  const dlg = page.getByRole('dialog').first();
  meta.risk = { token: t.symbol, address: t.address, dialog: await box(dlg), audit: await box(panel('Audit')),
    reasons: await box(dlg.getByText(/Why this is risky/).first().locator('..')) };
  save();
  await shot('l-risk');
  await dlg.getByRole('button', { name: 'Cancel' }).click().catch(() => {});
  console.log('risk', t.symbol);
}

if (want('exits')) {
  const t = await pick((x) => x.status === 'curve' && (s(x).rugRatio ?? 1) < 0.3 && x.holderCount >= 20);
  await open(t);
  await aside().locator('[aria-label="Order type"]').getByText('Auto', { exact: true }).click();
  await page.waitForTimeout(400);
  await aside().getByRole('button', { name: /^Default ladder$/ }).first().click().catch(() => {});
  await aside().getByRole('switch').first().click().catch(() => {});
  const dev = aside().locator('[aria-label="Sell percent when dev sells"]').first();
  await dev.fill('100');
  await dev.press('Tab');
  await aside().getByRole('button', { name: /^0\.5$/ }).first().click().catch(() => {});
  await aside().getByRole('button', { name: /^Buy [\d.]+ SOL/ }).first().click();
  await page.waitForTimeout(900);
  await confirmRisk();
  await page.getByText(/^Bought /).first().waitFor({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(6000);   // let the fill toast clear
  await page.locator('div.panel').getByRole('tab', { name: /^Orders/ }).first().click();
  await page.waitForTimeout(800);
  // Scroll so all five open exits show under the chart (its exit lines stay in view).
  await page.mouse.move(800, 950);
  for (let i = 0; i < 16; i++) { await page.mouse.wheel(0, 25); await sleep(16); }
  await page.waitForTimeout(1200);
  meta.exits = { token: t.symbol, address: t.address, orders: await box(page.locator('div.panel').filter({ has: page.getByRole('tab', { name: /^Orders/ }) }).last()),
    chart: await box(page.locator('section.panel, div.panel').filter({ has: page.locator('[aria-label="Candle resolution"]') }).first()),
    devRow: await box(page.locator('tr').filter({ hasText: /Dev[- ]sell/i }).first()) };
  save();
  await shot('l-exits');
  console.log('exits', t.symbol, JSON.stringify(meta.exits.devRow));
}

if (want('bill')) {
  const t = await pick((x) => x.status === 'curve' && x.liquidityUsd > 3000 && x.liquidityUsd < 9000, (a, b) => a.liquidityUsd - b.liquidityUsd);
  await open(t);
  const amt = aside().locator('[aria-label$=" in SOL"]').first();
  await amt.fill('6');
  await amt.press('Tab');
  await page.waitForTimeout(1500);
  meta.bill = { token: t.symbol, address: t.address, liquidityUsd: t.liquidityUsd, aside: await box(aside()),
    impact: await box(aside().getByText(/^Price impact$/).first().locator('..')), fees: await box(aside().getByText(/^Fees$/).first().locator('..')),
    route: await box(aside().getByText(/^Route$/).first().locator('..')), receive: await box(aside().getByText(/^You receive$/).first().locator('..')),
    impactText: await aside().getByText(/^Price impact$/).first().locator('..').innerText().catch(() => null) };
  save();
  await shot('l-bill');
  console.log('bill', t.symbol, meta.bill.impactText);
}

if (want('surv')) {
  // A smart-money wallet to copy, and a migration sniper.
  const tr = await api('/api/sol/trenches?limit=60');
  let target = null;
  for (const t of [...tr.migrated, ...tr.almost]) {
    const hs = await api(`/api/sol/tokens/${t.address}/holders?tag=smart&limit=5`);
    if (hs[0]) { target = hs[0].wallet; break; }
  }
  const strat = { takeProfits: [{ changePct: 100, sellPercent: 50 }], stopLosses: [{ lossPct: 40, sellPercent: 100 }], trailing: null, devSellPercent: 100, migrationSellPercent: 0 };
  console.log('copy', (await call('POST', '/api/copytrade', { chain: 'sol', target, label: 'smart wallet #1', buyMode: 'fixed', buyAmount: 0.2, maxPerToken: 1,
    sellMode: 'mirror', minMarketCapUsd: null, maxMarketCapUsd: null, minLiquidityUsd: null, strategy: strat })).status);
  console.log('sniper', (await call('POST', '/api/sniper', { chain: 'sol', kind: 'migration', label: 'migration snipe', buyAmount: 0.3, maxBuys: 3,
    maxDevHoldRate: 0.1, strategy: strat })).status);
  for (const [p, name] of [['copytrade', 'l-copy'], ['sniper', 'l-sniper'], ['signals', 'l-signals'], ['monitor', 'l-monitor']]) {
    await page.goto(`${BASE}/sol/${p}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    await shot(name);
  }
  meta.surv = { target };
  save();
}

if (want('strip')) {
  const t = await pick((x) => s(x).bundlerRate >= 0.15 && s(x).insiderHoldRate >= 0.08 && x.holderCount >= 15);
  await open(t);
  meta.strip = { token: t.symbol, address: t.address, panel: await box(panel('Holders')) };
  save();
  await shot('l-strip');
  console.log('strip', t.symbol);
}

async function record(name, seconds, actions) {
  const dir = path.join(TMP, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', async (f) => {
    frames.push({ data: f.data, t: f.metadata.timestamp });
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  const start = Date.now();
  const beats = [];
  const mark = (label, extra) => beats.push({ t: (Date.now() - start) / 1000, label, ...(extra || {}) });
  await actions(mark);
  const left = seconds * 1000 - (Date.now() - start);
  if (left > 0) await sleep(left);
  await cdp.send('Page.stopScreencast');
  await sleep(200);
  const list = frames.map((f, i) => {
    const file = path.join(dir, `f${String(i).padStart(5, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    const next = i + 1 < frames.length ? frames[i + 1].t : frames[0].t + seconds;
    return `file '${file}'\nduration ${Math.max(0.001, next - f.t).toFixed(4)}`;
  });
  list.push(`file '${path.join(dir, `f${String(frames.length - 1).padStart(5, '0')}.jpg`)}'`);
  fs.writeFileSync(path.join(dir, 'list.txt'), list.join('\n'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'),
    '-vf', 'fps=30,scale=1920:1080:flags=lanczos,format=yuv420p', '-t', String(seconds), '-c:v', 'libx264', '-crf', '16', '-preset', 'slow',
    `/home/user/Gmgn/marketing/video/app-footage/live-${name}.mp4`]);
  meta[name] = { seconds, beats };
  save();
  console.log('clip', name, frames.length, 'frames', JSON.stringify(beats.map((b) => [b.label, +b.t.toFixed(2)])));
}

if (want('keys2')) {
  const t = await pick((x) => x.status === 'curve' && x.holderCount >= 20 && (s(x).rugRatio ?? 1) < 0.5);
  await page.goto(`${BASE}/sol/trenches`, { waitUntil: 'networkidle' });
  await page.mouse.move(1919, 1079);
  await page.waitForTimeout(3000);
  await record('keys2', 16, async (mark) => {
    const key = async (k, label, wait) => { mark(label); await page.keyboard.press(k); await sleep(wait); };
    await sleep(1200);
    await key('/', '/', 700);
    mark('paste');
    await page.keyboard.insertText(t.address);
    await sleep(1500);
    await key('Enter', 'enter', 2400);
    await page.evaluate(() => document.activeElement?.blur());
    await key('b', 'b', 1400);
    await page.evaluate(() => document.activeElement?.blur());
    await key('s', 's', 1500);
    await page.evaluate(() => document.activeElement?.blur());
    // Browser Back (no in-app hotkey returns to the board; headless Chromium ignores Alt+Left).
    mark('back');
    await page.goBack();
    await page.mouse.move(1919, 1079);
    await sleep(1700);
    await key('3', '3', 1100);
    await key('j', 'j', 700);
    await key('j', 'j', 700);
    await key('k', 'k', 900);
  });
  meta.keys2.token = { symbol: t.symbol, address: t.address };
  save();
}

await browser.close();
