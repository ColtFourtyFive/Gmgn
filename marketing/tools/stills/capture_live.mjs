// Warm-up product stills in marketing capture mode (WARMUP_WEEK §9.2): element screenshots at 2x on demo data,
// with boxes for masks/callouts in screens/live/boxes.json. Nothing here places a trade.
// Usage: node capture_live.mjs [holders,funding,audit,facts,risk,monitor,wash]
import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire('/home/user/Gmgn/apps/web/package.json');
const { chromium } = require('@playwright/test');

const BASE = 'http://localhost:8787';
const OUT = '/home/user/Gmgn/marketing/screens/live';
const MODE = '/home/user/Gmgn/marketing/tools/capture-mode.js';
const only = process.argv[2] ? process.argv[2].split(',') : null;
const want = (n) => !only || only.includes(n);
fs.mkdirSync(OUT, { recursive: true });
const api = async (p) => (await fetch(BASE + p)).json();
const metaPath = `${OUT}/boxes.json`;
const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
const save = () => fs.writeFileSync(metaPath, JSON.stringify(meta, null, 1));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, colorScheme: 'dark' });
await ctx.addInitScript({ path: MODE });
const page = await ctx.newPage();
await page.goto(`${BASE}/sol/trenches`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Sign in' }).first().click();
await page.getByRole('button', { name: /Start trading|Start paper trading|Quick start/i }).last().click();
await page.waitForTimeout(2000);

const panel = (title) => page.locator('section.panel').filter({ has: page.locator('h3', { hasText: new RegExp(`^${title}`) }) }).first();
async function rel(outer, inner) {
  const o = await outer.boundingBox();
  const i = await inner.boundingBox().catch(() => null);
  if (!o || !i) return null;
  return [i.x - o.x, i.y - o.y, i.width, i.height].map((v) => Math.round(v * 10) / 10);
}
async function open(t) {
  await page.goto(`${BASE}/sol/token/${t.address}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
}

const tr = await api('/api/sol/trenches?limit=100');
const all = [...tr.new, ...tr.almost, ...tr.migrated];
const sec = (t) => t.security ?? {};
const used = new Set();

if (want('holders')) {
  // sr1 asset rule (WARMUP D2-P2), default chip thresholds: top 10 30%, dev 30%, insiders 5%, bundlers 10%, snipers 10%, fresh 30%.
  const green = (t) => { const s = sec(t); return s.top10HolderRate < 0.3 && s.devHoldRate < 0.3 && s.freshWalletRate < 0.3 && s.insiderHoldRate < 0.05 && s.sniperHoldRate < 0.1 && s.bundlerRate < 0.1; };
  const bundled = (t) => { const s = sec(t); return s.bundlerRate >= 0.1 && s.insiderHoldRate >= 0.05 && s.top10HolderRate >= 0.3 && s.freshWalletRate >= 0.3 && s.devStatus === 'hold'; };
  const A = all.filter(green).sort((a, b) => b.holderCount - a.holderCount)[0];
  const B = all.filter(bundled).sort((a, b) => a.holderCount - b.holderCount)[0];
  console.log('holders A', A?.symbol, A?.holderCount, 'B', B?.symbol, B?.holderCount);
  for (const [k, t] of [['A', A], ['B', B]]) {
    if (!t) continue;
    used.add(t.address);
    await open(t);
    const p = panel('Holders');
    await p.screenshot({ path: `${OUT}/holders-${k}.png` });
    const b = await p.boundingBox();
    const masks = {};
    for (const label of ['Insiders', 'Bundlers', 'Snipers']) masks[label] = await rel(p, p.locator('span.chip', { hasText: label }).first());
    for (const label of ['Insider', 'Bundler', 'Sniper']) masks[`row-${label}`] = await rel(p, p.locator('div, li', { hasText: new RegExp(`^${label}\\s`) }).last());
    meta[`holders-${k}`] = { token: t.symbol, address: t.address, size: [b.width, b.height], masks, security: sec(t), holders: t.holderCount };
    save();
  }
}

if (want('funding')) {
  // A token where insiders share a funder: open the Holders tab with the "Funded by" column.
  const cands = all.filter((t) => !used.has(t.address) && sec(t).insiderHoldRate >= 0.1 && t.holderCount >= 12).sort((a, b) => sec(b).insiderHoldRate - sec(a).insiderHoldRate);
  const t = cands[0];
  if (t) {
    used.add(t.address);
    await open(t);
    await page.locator('div.panel').getByRole('tab', { name: /^Holders/ }).first().click().catch(() => page.getByRole('tab', { name: /^Holders/ }).first().click());
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/funding-full.png` });
    const strip = panel('Holders');
    meta.funding = { token: t.symbol, address: t.address, strip: await strip.boundingBox(), funded: await page.getByText(/Funded by/).first().boundingBox().catch(() => null), security: sec(t) };
    save();
    console.log('funding', t.symbol);
  }
}

for (const [key, pick] of [['audit', (c) => c[0]], ['facts', (c) => c[1]]]) {
  if (!want(key)) continue;
  // High-risk demo tokens whose audit shows insiders, a bundle and fresh wallets in amber or red; different tokens for peek-audit and meme-3.
  const cands = all.filter((t) => !used.has(t.address) && sec(t).insiderHoldRate >= 0.05 && sec(t).bundlerRate >= 0.1 && sec(t).freshWalletRate >= 0.3 && t.holderCount >= 8)
    .sort((a, b) => (sec(b).bundlerRate + sec(b).insiderHoldRate) - (sec(a).bundlerRate + sec(a).insiderHoldRate));
  const t = pick(cands);
  if (!t) { console.log(key, 'no candidate'); continue; }
  used.add(t.address);
  await open(t);
  const p = panel('Audit');
  await p.getByRole('button', { name: /^All \d+/ }).first().click().catch(() => {});
  await page.waitForTimeout(600);
  await p.screenshot({ path: `${OUT}/${key}-audit.png` });
  const h = panel('Holders');
  await h.screenshot({ path: `${OUT}/${key}-holders.png` });
  const text = await p.innerText();
  meta[key] = { token: t.symbol, address: t.address, holders: t.holderCount, auditText: text, security: sec(t) };
  save();
  console.log(key, t.symbol);
}

if (want('risk')) {
  // The risk prompt: a high-risk token, Market buy, dialog open with the box unticked. Cancelled, never confirmed.
  // Rug ratio over 30% is what triggers the prompt (ledger SC-08); pick one well above it so the click can only open the dialog.
  const t = tr.almost.filter((x) => !used.has(x.address) && (sec(x).rugRatio ?? 0) > 0.6).sort((a, b) => sec(b).rugRatio - sec(a).rugRatio)[0];
  if (!t) throw new Error('risk: no token with rug ratio > 60%');
  used.add(t.address);
  await open(t);
  const aside = page.locator('aside').first();
  await aside.getByRole('button', { name: /^1$/ }).first().click().catch(() => {});
  await page.waitForTimeout(500);
  await aside.getByRole('button', { name: /^Buy [\d.]+ SOL/ }).first().click();
  await page.waitForTimeout(1500);
  const dlg = page.getByRole('dialog').first();
  await dlg.screenshot({ path: `${OUT}/risk-dialog.png` });
  await page.screenshot({ path: `${OUT}/risk-full.png` });
  meta.risk = { token: t.symbol, address: t.address, dialog: await dlg.boundingBox(), title: await rel(dlg, dlg.getByText(/High-risk token/).first()),
    buyAnyway: await rel(dlg, dlg.getByRole('button', { name: 'Buy anyway' })) };
  save();
  await dlg.getByRole('button', { name: 'Cancel' }).click();
  console.log('risk', t.symbol);
}

if (want('monitor')) {
  await page.goto(`${BASE}/sol/monitor`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/monitor-full.png` });
  meta.monitor = { hot: await page.getByText(/Hot by smart money/i).first().boundingBox().catch(() => null) };
  save();
  console.log('monitor');
}

if (want('wash')) {
  // Spot the rug #2 needs a token the audit really flags for wash trading (security.isWashTrading).
  let flagged = [];
  for (const chain of ['sol', 'bsc', 'base', 'eth']) {
    const x = await api(`/api/${chain}/trenches?limit=100`);
    flagged.push(...[...x.new, ...x.almost, ...x.migrated].filter((t) => t.security?.isWashTrading).map((t) => `${chain}:${t.symbol}`));
  }
  meta.wash = { checked: new Date().toISOString(), flagged };
  save();
  console.log('wash flagged', flagged.length, flagged.slice(0, 5));
}

await browser.close();
