// Warm-up peeks, second batch (WARMUP_WEEK §9.2), in marketing capture mode on the local demo market. Desktop
// 1920x1080 CSS at a forced device scale of 2, so stills are native 3840x2160. The keys video is recorded at scale 1
// (PEEKS_DSF=1) for frame rate.
//   keys:    peek-keys, the board driven from the keyboard only (2, J, J, B quick buy, Enter, S, /); beat times saved
//   funding: peek-funding stills, the holder strip and the Holders tab filtered to insiders with "Funded by", on a
//            token where 3+ insiders share one funder
//   exits:   peek-exits stills, the Auto form with take-profits, a stop-loss, a trailing stop and "Sell when dev sells
//            100%", then the "Bought … · N exit orders" toast after the (paper) buy
//   monitor: peek-monitor still, /sol/monitor
// Beats and element boxes (CSS px) go to screens/live/peeks2.json. Buys are paper buys in the local simulator.
// Usage: [PEEKS_DSF=1] node capture_peeks2.mjs scratch_dir [keys,funding,exits,monitor]
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const require = createRequire('/home/user/Gmgn/apps/web/package.json');
const { chromium } = require('@playwright/test');

const BASE = 'http://localhost:8787';
const MODE = '/home/user/Gmgn/marketing/tools/capture-mode.js';
const LIVE = '/home/user/Gmgn/marketing/screens/live';
const CLIPS = '/home/user/Gmgn/marketing/video/app-footage';
const TMP = process.argv[2];
const only = process.argv[3] ? process.argv[3].split(',') : null;
const want = (n) => !only || only.includes(n);
const metaPath = `${LIVE}/peeks2.json`;
const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
const save = () => fs.writeFileSync(metaPath, JSON.stringify(meta, null, 1));
const api = async (p) => (await fetch(BASE + p)).json();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// PEEKS_DSF=1 for the keys video: a 2x render screencasts at ~8 fps here, 1x at ~35.
const DSF = Number(process.env.PEEKS_DSF || 2);
const BLUR = 'a.link.font-semibold[title],span.truncate.text-muted[title],h1.text-lg.font-bold,h1.text-lg.font-bold + *{filter:blur(6px)!important}';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: [`--force-device-scale-factor=${DSF}`, '--window-size=1920,1080'] });
const ctx = await browser.newContext({ viewport: null, colorScheme: 'dark' });
await ctx.addInitScript({ path: MODE });
await ctx.addInitScript({ path: '/home/user/Gmgn/marketing/tools/blur-tickers.js' });
await ctx.addInitScript(`document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent=${JSON.stringify(BLUR)};document.head.appendChild(s);});`);
const page = await ctx.newPage();
const em = await ctx.newCDPSession(page);
await em.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 0, mobile: false });
await page.goto(`${BASE}/sol/trenches`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Sign in' }).first().click();
await page.getByRole('button', { name: /Start trading|Start paper trading|Quick start/i }).last().click();
await page.waitForTimeout(2000);

const box = async (loc) => { const b = await loc.boundingBox().catch(() => null); return b && [b.x, b.y, b.width, b.height].map((v) => Math.round(v)); };
const panel = (title) => page.locator('section.panel').filter({ has: page.locator('h3', { hasText: new RegExp(`^${title}`) }) }).first();
// CDP screenshots come back at the forced device scale (3840x2160).
const shot = async (name) => {
  const s = await em.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${LIVE}/${name}.png`, Buffer.from(s.data, 'base64'));
};

async function record(name, seconds, actions, size = 3840) {
  const dir = path.join(TMP, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', async (f) => {
    frames.push({ data: f.data, t: f.metadata.timestamp });
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: size, maxHeight: size * 9 / 16, everyNthFrame: 1 });
  const start = Date.now();
  const beats = [];
  const mark = (label, extra) => beats.push({ t: (Date.now() - start) / 1000, label, ...(extra || {}) });
  await actions(mark);
  const left = seconds * 1000 - (Date.now() - start);
  if (left > 0) await sleep(left);
  await cdp.send('Page.stopScreencast');
  await sleep(200);
  const list = [];
  frames.forEach((f, i) => {
    const file = path.join(dir, `f${String(i).padStart(5, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    const next = i + 1 < frames.length ? frames[i + 1].t : frames[0].t + seconds;
    list.push(`file '${file}'\nduration ${Math.max(0.001, next - f.t).toFixed(4)}`);
  });
  list.push(`file '${path.join(dir, `f${String(frames.length - 1).padStart(5, '0')}.jpg`)}'`);
  fs.writeFileSync(path.join(dir, 'list.txt'), list.join('\n'));
  // The post crops the status bar and scales to 1920.
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'),
    '-vf', `fps=30,scale=${size}:${size * 9 / 16}:flags=lanczos,format=yuv420p`, '-t', String(seconds), '-c:v', 'libx264', '-crf', '16', '-preset', 'slow',
    `${CLIPS}/live-${name}.mp4`]);
  meta[name] = { seconds, beats };
  save();
  console.log('clip', name, frames.length, 'frames', JSON.stringify(beats.map((b) => [b.label, +b.t.toFixed(2)])));
}

if (want('keys')) {
  await page.goto(`${BASE}/sol/trenches`, { waitUntil: 'networkidle' });
  await page.mouse.move(1919, 1079);
  await page.waitForTimeout(3000);
  await record('keys', 15, async (mark) => {
    const key = async (k, label, wait) => { mark(label); await page.keyboard.press(k); await sleep(wait); };
    await sleep(1300);
    await key('2', '2', 1300);
    await key('j', 'j', 600);
    await key('j', 'j', 1100);
    await key('b', 'b', 2000);
    await key('Enter', 'enter', 2600);
    await key('s', 's', 1800);
    // S focuses the sell amount; the search hotkey only fires outside inputs.
    await page.evaluate(() => document.activeElement?.blur());
    await key('/', '/', 600);
    await page.keyboard.type('sniper', { delay: 90 });
  }, 1920);
  await page.keyboard.press('Escape');
}

if (want('funding')) {
  // A token where 3+ insider holders share one first funder.
  const tr = await api('/api/sol/trenches?limit=100');
  let pick = null;
  for (const t of [...tr.almost, ...tr.new].filter((x) => (x.security?.insiderHoldRate ?? 0) > 0.08 && x.holderCount >= 12)) {
    const hs = await api(`/api/sol/tokens/${t.address}/holders?tag=insider&limit=50`);
    const by = {};
    for (const h of hs) if (h.fundedBy) by[h.fundedBy] = (by[h.fundedBy] || 0) + 1;
    const top = Object.entries(by).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= 3) { pick = { t, funder: top[0], n: top[1] }; break; }
  }
  if (!pick) console.log('funding: no token with 3+ insiders on one funder');
  else {
    console.log('funding', pick.t.symbol, pick.n, 'insiders share', pick.funder.slice(0, 6));
    await page.goto(`${BASE}/sol/token/${pick.t.address}`, { waitUntil: 'networkidle' });
    await page.mouse.move(1919, 700);
    await page.waitForTimeout(2500);
    await page.locator('div.panel').getByRole('tab', { name: /^Holders/ }).first().click().catch(() => page.getByRole('tab', { name: /^Holders/ }).first().click());
    await page.waitForTimeout(500);
    await page.locator('div.panel').getByText(/^Insider$/).first().click().catch(() => {});
    await page.waitForFunction(() => [...document.querySelectorAll('tbody tr')].some((r) => /\d/.test(r.innerText)), null, { timeout: 15000 }).catch(() => {});
    // Bring more of the table into view (the page scrolls under the fixed top bar).
    await page.mouse.move(800, 950);
    for (let i = 0; i < 20; i++) { await page.mouse.wheel(0, 25); await sleep(16); }
    await page.mouse.move(1919, 140);
    await page.waitForTimeout(1200);
    meta.funding = { token: pick.t.symbol, address: pick.t.address, funder: pick.funder, shared: pick.n,
      strip: await box(panel('Holders')), table: await box(page.locator('div.panel').filter({ has: page.locator('tbody') }).last()),
      fundedBy: await box(page.getByText(/^Funded by$/i).first()) };
    save();
    await shot('peek-funding-page');
  }
}

if (want('exits')) {
  // A medium-risk token keeps the High-risk prompt out of the way; the prompt is handled if it shows anyway.
  const tr = await api('/api/sol/trenches?limit=100');
  const t = [...tr.almost, ...tr.new].filter((x) => x.status === 'curve' && (x.security?.rugRatio ?? 1) < 0.3).sort((a, b) => b.holderCount - a.holderCount)[0];
  await page.goto(`${BASE}/sol/token/${t.address}`, { waitUntil: 'networkidle' });
  await page.mouse.move(1919, 700);
  await page.waitForTimeout(2000);
  const aside = page.locator('aside').first();
  await aside.locator('[aria-label="Order type"]').getByText('Auto', { exact: true }).click();
  await page.waitForTimeout(500);
  await aside.getByRole('button', { name: /^Default ladder$/ }).first().click().catch(() => console.log('no default ladder'));
  await page.waitForTimeout(400);
  await aside.getByRole('switch').first().click().catch(() => console.log('no trailing switch'));
  await page.waitForTimeout(300);
  const dev = aside.locator('[aria-label="Sell percent when dev sells"]').first();
  await dev.fill('100');
  await dev.press('Tab');
  await aside.getByRole('button', { name: /^0\.5$/ }).first().click().catch(() => {});
  await page.mouse.move(1919, 700);
  await page.waitForTimeout(700);
  meta.exits = { token: t.symbol, address: t.address, form: await box(aside), dev: await box(dev),
    strategy: await box(aside.getByText(/Buy with exit strategy/).first().locator('xpath=ancestor::*[contains(@class,"rounded")][1]')) };
  await shot('peek-exits-form');
  await aside.getByRole('button', { name: /^Buy [\d.]+ SOL/ }).first().click();
  await page.waitForTimeout(900);
  const dlg = page.getByRole('dialog').first();
  if (await dlg.count()) {
    await dlg.getByText('I understand the risks and want to buy').click();
    await dlg.getByRole('button', { name: 'Buy anyway' }).click();
  }
  await page.getByText(/^Bought /).first().waitFor({ timeout: 6000 }).catch(() => {});
  await page.mouse.move(1919, 700);
  await page.waitForTimeout(500);
  meta.exits.toast = await box(page.getByText(/^Bought /).first().locator('..').locator('..'));
  meta.exits.toastText = await page.getByText(/^Bought /).first().locator('..').innerText().catch(() => null);
  save();
  await shot('peek-exits-toast');
}

if (want('monitor')) {
  await page.goto(`${BASE}/sol/monitor`, { waitUntil: 'networkidle' });
  await page.mouse.move(1919, 1079);
  await page.waitForTimeout(4000);
  await shot('peek-monitor-page');
  meta.monitor = { hot: await box(page.getByText(/Hot by smart money/i).first().locator('..')) };
  save();
}

await browser.close();
