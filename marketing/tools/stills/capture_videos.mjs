// Product-peek screen recordings in marketing capture mode (WARMUP_WEEK §9.2): the board, the chain switch and the
// 10-second bundle check. CDP screencast at DPR 2, downscaled to 1920x1080, with beat times and element boxes
// (CSS px) in screens/live/videos.json for the post overlays. Nothing here places a trade.
// Usage: node capture_videos.mjs scratch_dir [board,chains,bundle]
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const require = createRequire('/home/user/Gmgn/apps/web/package.json');
const { chromium } = require('@playwright/test');

const BASE = 'http://localhost:8787';
const MODE = '/home/user/Gmgn/marketing/tools/capture-mode.js';
const CLIPS = '/home/user/Gmgn/marketing/video/app-footage';
const TMP = process.argv[2];
const only = process.argv[3] ? process.argv[3].split(',') : null;
const want = (n) => !only || only.includes(n);
const metaPath = '/home/user/Gmgn/marketing/screens/live/videos.json';
const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
const save = () => fs.writeFileSync(metaPath, JSON.stringify(meta, null, 1));
const api = async (p) => (await fetch(BASE + p)).json();
// Demo tickers and names can collide with real coins (ledger §7.3): blur them on the board and token header.
const BLUR_TICKERS = 'a.link.font-semibold[title],span.truncate.text-muted[title],h1.text-lg.font-bold,h1.text-lg.font-bold + *{filter:blur(6px)!important}';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, colorScheme: 'dark' });
await ctx.addInitScript({ path: MODE });
await ctx.addInitScript(`document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent=${JSON.stringify(BLUR_TICKERS)};document.head.appendChild(s);});`);
const page = await ctx.newPage();
await page.goto(`${BASE}/sol/trenches`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Sign in' }).first().click();
await page.getByRole('button', { name: /Start trading|Start paper trading|Quick start/i }).last().click();
await page.waitForTimeout(2000);

async function record(name, seconds, actions) {
  const dir = path.join(TMP, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', async (f) => {
    frames.push({ data: f.data, t: f.metadata.timestamp });
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 3840, maxHeight: 2160, everyNthFrame: 1 });
  const start = Date.now();
  const beats = [];
  const mark = (label, extra) => beats.push({ t: (Date.now() - start) / 1000, label, ...(extra || {}) });
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
    '-vf', 'fps=30,scale=1920:1080:flags=lanczos,format=yuv420p', '-t', String(seconds), '-c:v', 'libx264', '-crf', '14', '-preset', 'slow',
    `${CLIPS}/live-${name}.mp4`]);
  meta[name] = { seconds, beats };
  save();
  console.log('clip', name, frames.length, 'frames', JSON.stringify(beats.map((b) => [b.label, +b.t.toFixed(2)])));
}
const shotAt = (name) => page.screenshot({ path: `/home/user/Gmgn/marketing/screens/live/${name}.png` });
const box = async (loc) => { const b = await loc.boundingBox().catch(() => null); return b && [b.x, b.y, b.width, b.height].map((v) => Math.round(v)); };

if (want('board')) {
  await page.goto(`${BASE}/sol/trenches`, { waitUntil: 'networkidle' });
  await page.mouse.move(1919, 1079);
  await page.waitForTimeout(3000);
  const col = page.getByText(/^Near graduation$/).first();
  await record('board', 11, async (mark) => {
    mark('stream');
    await page.waitForTimeout(6500);
    const b = await col.boundingBox();
    mark('hover', { column: await box(page.locator('section, div').filter({ has: col }).last()) });
    await page.mouse.move(b.x + 200, b.y + 300, { steps: 25 });
    await page.waitForTimeout(600);
    mark('paused', { pill: await box(page.getByText(/^Paused/).first()) });
  });
}

if (want('chains')) {
  await page.goto(`${BASE}/sol/trenches`, { waitUntil: 'networkidle' });
  await page.mouse.move(1919, 1079);
  await page.waitForTimeout(2500);
  const sw = page.locator('[aria-label="Switch chain"]').first();
  meta.chainsSwitch = await box(sw);
  await record('chains', 12, async (mark) => {
    mark('sol');
    await page.waitForTimeout(1800);
    for (const name of ['Base', 'BNB Chain', 'Ethereum']) {
      await sw.click();
      await page.waitForTimeout(450);
      await page.getByRole('option', { name: new RegExp(name) }).first().click();
      mark(name);
      await page.waitForTimeout(2300);
    }
  });
}

if (want('bundle')) {
  // One high-risk, bundled demo token. The Buy click can only open the risk prompt (rug ratio well over 30%); it is cancelled.
  const tr = await api('/api/sol/trenches?limit=100');
  const s = (t) => t.security ?? {};
  const t = tr.almost.filter((x) => (s(x).rugRatio ?? 0) > 0.6 && s(x).bundlerRate >= 0.25 && x.holderCount >= 10).sort((a, b) => s(b).bundlerRate - s(a).bundlerRate)[0];
  if (!t) throw new Error('bundle: no candidate');
  await page.goto(`${BASE}/sol/token/${t.address}`, { waitUntil: 'networkidle' });
  await page.mouse.move(1919, 1079);
  await page.waitForTimeout(2500);
  const audit = page.locator('section.panel').filter({ has: page.locator('h3', { hasText: /^Audit/ }) }).first();
  const holders = page.locator('section.panel').filter({ has: page.locator('h3', { hasText: /^Holders/ }) }).first();
  meta.bundleToken = { symbol: t.symbol, address: t.address, header: await box(page.locator('h1.text-lg.font-bold').first()) };
  await record('bundle', 24, async (mark) => {
    mark('open');
    await shotAt('bundle-1-open');
    await page.waitForTimeout(2500);
    const row = audit.locator('li, div', { hasText: /^Bundlers/ }).last();
    mark('audit', { box: await box(row), panel: await box(audit) });
    await row.hover().catch(() => {});
    await page.waitForTimeout(700);
    await shotAt('bundle-2-audit');
    await page.waitForTimeout(4000);
    const chip = holders.locator('span.chip', { hasText: 'Bundlers' }).first();
    mark('chips', { box: await box(chip), panel: await box(holders) });
    await chip.hover().catch(() => {});
    await page.waitForTimeout(700);
    await shotAt('bundle-3-chips');
    await page.waitForTimeout(4000);
    await page.locator('div.panel').getByRole('tab', { name: /^Holders/ }).first().click().catch(() => page.getByRole('tab', { name: /^Holders/ }).first().click());
    await page.waitForTimeout(400);
    await page.locator('div.panel').getByText(/^Bundler$/).first().click().catch(() => {});
    // Wait for real rows (not the loading skeleton) before the still.
    await page.waitForFunction(() => [...document.querySelectorAll('tbody tr')].some((r) => /\d/.test(r.innerText)), null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
    mark('funded', { box: await box(page.getByText(/^Funded by$/i).first()), table: await box(page.locator('div.panel').last()) });
    await page.mouse.move(1919, 1079);
    await shotAt('bundle-4-funded');
    await page.waitForTimeout(4500);
    const aside = page.locator('aside').first();
    await aside.getByRole('button', { name: /^1$/ }).first().click().catch(() => {});
    await page.waitForTimeout(300);
    await aside.getByRole('button', { name: /^Buy [\d.]+ SOL/ }).first().click();
    await page.waitForTimeout(900);
    const dlg = page.getByRole('dialog').first();
    mark('prompt', { box: await box(dlg), title: await box(dlg.getByText(/High-risk token/).first()),
      receive: await box(dlg.getByText(/^Receive/).first().locator('..')) });
    await shotAt('bundle-5-prompt');
    await page.waitForTimeout(4500);
    await dlg.getByRole('button', { name: 'Cancel' }).click();
    mark('end');
  });
}

await browser.close();
