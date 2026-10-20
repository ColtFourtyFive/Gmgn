// Extra trailer captures: the risk gate ("Buy anyway"), the wallet-tag
// activity filter, and a live dump (1s candles right after a dev/bundler sell).
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const require = createRequire('/home/user/Gmgn/apps/web/package.json');
const { chromium } = require('@playwright/test');

const BASE = 'http://localhost:8787';
const OUT = '/home/user/Gmgn/marketing';
const SHOTS = `${OUT}/screens`;
const CLIPS = `${OUT}/video/app-footage`;
const TMP = process.argv[2] || '/tmp/cap-frames';
const only = process.argv[3] ? process.argv[3].split(',') : null;
const api = async (p) => (await fetch(BASE + p)).json();

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, colorScheme: 'dark' });
const page = await ctx.newPage();

async function signIn() {
  await page.goto(`${BASE}/sol/trenches`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Sign in' }).first().click();
  await page.getByRole('button', { name: /Start paper trading|Quick start|Create guest/i }).last().click();
  await page.waitForTimeout(1500);
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
  if (actions) await actions();
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
    '-vf', 'fps=30,scale=1920:1080:flags=lanczos,format=yuv420p', '-t', String(seconds), '-c:v', 'libx264', '-crf', '16', '-preset', 'slow',
    `${CLIPS}/${name}.mp4`]);
  console.log('clip', name, frames.length, 'frames');
}

const want = (n) => !only || only.includes(n);
await signIn();

// Riskiest token near graduation.
const trenches = await api('/api/sol/trenches?limit=100');
const risk = (t) => (t.security?.bundlerRate ?? 0) + (t.security?.sniperHoldRate ?? 0) + (t.security?.insiderHoldRate ?? 0) + (t.security?.devHoldRate ?? 0);
const risky = [...trenches.almost, ...trenches.new].sort((a, b) => risk(b) - risk(a))[0];
console.log('risky', risky.symbol);

if (want('app-risk-gate')) {
  await page.goto(`${BASE}/sol/token/${risky.address}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await record('app-risk-gate', 7.5, async () => {
    await page.waitForTimeout(700);
    await page.getByRole('button', { name: /^Buy 0\.5 SOL/ }).first().click();
    await page.waitForTimeout(1600);
    await page.screenshot({ path: `${SHOTS}/screen-risk-gate.png` });
    await page.getByText('I understand the risks and want to buy').click();
    await page.waitForTimeout(900);
    await page.getByRole('button', { name: 'Buy anyway' }).click();
  });
}

if (want('app-tag-filter')) {
  await page.goto(`${BASE}/sol/token/${risky.address}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await record('app-tag-filter', 7, async () => {
    for (const label of ['Bundler', 'Insider', 'Sniper', 'Dev']) {
      await page.waitForTimeout(900);
      await page.locator('[aria-label="Trader type"]').getByText(label, { exact: true }).first().click();
    }
  });
}

if (want('app-rug')) {
  // Wait for a fresh, large dev sell (or a bundler sell) and film the 1s chart.
  let sig = null;
  const deadline = Date.now() + 240_000;
  while (!sig && Date.now() < deadline) {
    const now = Date.now();
    const devs = await api('/api/sol/signals?kind=dev_sell&limit=10');
    const bund = await api('/api/sol/signals?kind=bundler_sell&limit=10');
    const pct = (s) => Number((s.title.match(/(\d+)%/) || [0, 0])[1]);
    sig = [...devs, ...bund].filter((s) => now - s.createdAt < 12_000 && (s.kind === 'bundler_sell' || pct(s) >= 60)).sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
    if (!sig) await new Promise((r) => setTimeout(r, 1000));
  }
  if (!sig) throw new Error('no fresh dump signal');
  console.log('dump', sig.kind, sig.title, sig.token.symbol);
  await page.goto(`${BASE}/sol/token/${sig.token.address}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /^1s$/ }).first().click().catch(() => {});
  await page.waitForTimeout(1200);
  await record('app-rug', 6.5);
  await page.screenshot({ path: `${SHOTS}/screen-rug.png` });
}

await browser.close();
