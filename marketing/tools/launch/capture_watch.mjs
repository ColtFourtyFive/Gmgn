// Launch-day screen recordings that need a real dev dump (LAUNCH_DAY §10): launch-10 (QT-1, real speed) and launch-13
// (L1-A rug autopsy, mint to floor). Marketing capture mode on the local demo market; nothing trades.
// Opens fresh launches as they appear (up to 4 at once; one that hasn't doubled by 75 s is dropped, each its own 1920x1080 page on 1 s candles) and records each from
// its first seconds: a 4 fps timelapse to disk for the whole life, plus a full-rate 40 s ring buffer. When the dev sells
// (the dev_sell signal for that token) it records until 10 s after the full dump (at most 30 s) and keeps both; a launch with no dev sell in 8 minutes is
// dropped. Stops after two dumps, or 40 minutes. Token events (trades with wallet tags) are saved for the captions.
// Output: video/app-footage/watch-<n>-lapse.mp4 (timelapse frames on their real timestamps) and watch-<n>-rt.mp4,
// meta in screens/live/watch.json.
// Usage: [WATCH_WANT=n] [WATCH_FULL=1] node capture_watch.mjs scratch_dir
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const require = createRequire('/home/user/Gmgn/apps/web/package.json');
const { chromium } = require('@playwright/test');

const BASE = 'http://localhost:8787';
const TOOLS = '/home/user/Gmgn/marketing/tools';
const APP = '/home/user/Gmgn/marketing/video/app-footage';
const TMP = process.argv[2];
const metaPath = '/home/user/Gmgn/marketing/screens/live/watch.json';
const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : { takes: [] };
const save = () => fs.writeFileSync(metaPath, JSON.stringify(meta, null, 1));
const api = async (p, tries = 3) => {
  for (let i = 1; ; i++) {
    try { return await (await fetch(BASE + p)).json(); } catch (e) { if (i >= tries) throw e; await new Promise((r) => setTimeout(r, 1000 * i)); }
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BLUR = 'a.link.font-semibold[title],span.truncate.text-muted[title],h1.text-lg.font-bold,h1.text-lg.font-bold + *{filter:blur(6px)!important}';
const WANT = Number(process.env.WATCH_WANT || 2);
// WATCH_FULL=1 keeps only full dumps (a "sold all" signal); partial dev sells are dropped.
const FULL = process.env.WATCH_FULL === '1';
const MAX_LIFE = 10 * 60_000;
const SLOTS = 4;
// Scripted rugs pump first: a launch that hasn't doubled by 75 s is dropped to free its slot.
const PUMP_BY = 75, PUMP_X = 2;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, colorScheme: 'dark' });
await ctx.addInitScript({ path: `${TOOLS}/capture-mode.js` });
await ctx.addInitScript({ path: `${TOOLS}/blur-tickers.js` });
await ctx.addInitScript(`document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent=${JSON.stringify(BLUR)};document.head.appendChild(s);});`);
{
  const p = await ctx.newPage();
  await p.goto(`${BASE}/sol/trenches`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Sign in' }).first().click();
  await p.getByRole('button', { name: /Start trading|Quick start/i }).last().click();
  await p.waitForTimeout(1500);
  await p.close();
}

function encode(frames, out, tEnd) {
  const list = frames.map((f, i) => `file '${f.file}'\nduration ${Math.max(0.001, (i + 1 < frames.length ? frames[i + 1].t : tEnd) - f.t).toFixed(4)}`);
  list.push(`file '${frames.at(-1).file}'`);
  const lp = path.join(TMP, `${path.basename(out)}.txt`);
  fs.writeFileSync(lp, list.join('\n'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lp,
    '-vf', 'fps=30,scale=1920:1080:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-crf', '15', '-preset', 'slow', `${out}.mp4`]);
}

const watching = new Map();
const seen = new Set();
let done = 0;
const t0 = Date.now();

async function watch(t) {
  const n = seen.size;
  const dir = path.join(TMP, `w${n}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/sol/token/${t.address}`, { waitUntil: 'networkidle' });
  await page.locator('[aria-label="Candle resolution"]').getByText('1s', { exact: true }).first().click({ timeout: 4000 }).catch(() => {});
  await page.mouse.move(1919, 700);
  const cdp = await ctx.newCDPSession(page);
  const lapse = [];
  const ring = [];
  let lastKept = 0;
  cdp.on('Page.screencastFrame', async (f) => {
    const ts = f.metadata.timestamp;
    ring.push({ data: f.data, t: ts });
    while (ring.length > 2 && ring.at(-1).t - ring[0].t > 40) ring.shift();
    if (ts - lastKept >= 0.25) {
      lastKept = ts;
      const file = path.join(dir, `l${String(lapse.length).padStart(5, '0')}.jpg`);
      fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
      lapse.push({ file, t: ts });
    }
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: 1920, maxHeight: 1080 });
  const w = { t, page, cdp, lapse, ring, dir, n, start: Date.now() / 1000, devSellAt: null, mc0: t.marketCapUsd, peak: t.marketCapUsd };
  watching.set(t.address, w);
  console.log('watch', n, t.symbol, 'age', ((Date.now() - t.createdAt) / 1000).toFixed(1), 's');
}

async function finish(w, keep) {
  watching.delete(w.t.address);
  await w.cdp.send('Page.stopScreencast').catch(() => {});
  await sleep(200);
  await w.page.close();
  if (!keep) { fs.rmSync(w.dir, { recursive: true, force: true }); console.log('dropped', w.n, w.t.symbol); return; }
  const end = w.lapse.at(-1).t + 0.25;
  const tag = w.t.symbol.toLowerCase();
  encode(w.lapse, `${APP}/watch-${tag}-lapse`, end);
  const rt = w.ring.map((f, i) => {
    const file = path.join(w.dir, `r${String(i).padStart(5, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    return { file, t: f.t };
  });
  encode(rt, `${APP}/watch-${tag}-rt`, rt.at(-1).t + 0.05);
  const trades = await api(`/api/sol/tokens/${w.t.address}/trades?limit=300`);
  const detail = await api(`/api/sol/tokens/${w.t.address}`);
  meta.takes.push({ n: w.n, file: `watch-${tag}`, peakMc: w.peak, mc0: w.mc0, symbol: w.t.symbol, address: w.t.address, createdAt: w.t.createdAt / 1000, lapseStart: w.lapse[0].t, rtStart: rt[0].t,
    end, devSellAt: w.devSellAt, dumpAt: w.dumpAt ?? null, security: detail.security, athMarketCapUsd: detail.athMarketCapUsd,
    trades: trades.map((x) => ({ t: x.timestamp / 1000, side: x.side, tags: x.walletTags, isDev: x.isDev, block: x.block, mc: x.marketCapUsd, usd: x.usdAmount })) });
  save();
  done++;
  console.log('kept', w.n, w.t.symbol, 'dev sell at', (w.devSellAt - w.lapse[0].t).toFixed(1), 's into the lapse');
}

while (done < WANT && Date.now() - t0 < 40 * 60_000) {
  if (watching.size < SLOTS) {
    const tr = await api('/api/sol/trenches?limit=50');
    const fresh = tr.new.filter((x) => !seen.has(x.address) && Date.now() - x.createdAt < 12_000)
      .sort((a, b) => b.createdAt - a.createdAt);
    for (const t of fresh.slice(0, SLOTS - watching.size)) { seen.add(t.address); await watch(t); }
  }
  const sells = await api('/api/sol/signals?kind=dev_sell&limit=50');
  const live = await api('/api/sol/trenches?limit=100');
  const mcs = new Map([...live.new, ...live.almost, ...live.migrated].map((x) => [x.address, x.marketCapUsd]));
  for (const w of [...watching.values()]) {
    const mc = mcs.get(w.t.address);
    if (mc) w.peak = Math.max(w.peak, mc);
    if (!w.devSellAt && Date.now() / 1000 - w.t.createdAt / 1000 > PUMP_BY && w.peak < PUMP_X * w.mc0) { console.log('no pump', w.n, w.t.symbol); await finish(w, false); }
  }
  for (const w of [...watching.values()]) {
    // A partial dev sell may be followed by the full dump: wait up to 30 s for "sold all", then 10 s past it.
    const mine = sells.filter((x) => x.token?.address === w.t.address);
    const all = mine.find((x) => /all/i.test(x.title));
    if (mine.length && !w.devSellAt) { w.devSellAt = Math.min(...mine.map((x) => x.createdAt)) / 1000; console.log('dev sell', w.n, w.t.symbol, mine[0].title); }
    if (all && !w.dumpAt) w.dumpAt = all.createdAt / 1000;
    const now = Date.now() / 1000;
    if (w.devSellAt && ((w.dumpAt && now > w.dumpAt + 10) || now > w.devSellAt + 30)) await finish(w, !FULL || !!w.dumpAt);
    else if (!w.devSellAt && Date.now() / 1000 - w.start > MAX_LIFE / 1000) { console.log('no dump', w.n, w.t.symbol); await finish(w, false); }
  }
  await sleep(1000);
}
for (const w of [...watching.values()]) await finish(w, false);
await browser.close();
console.log('done', done);
