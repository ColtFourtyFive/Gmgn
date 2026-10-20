// meme-3 "trench facts": one capture-mode audit frame of a high-risk demo token whose audit really shows insiders,
// a bundle and fresh wallets over their lines (REPLY_BANK §5 meme-3 [truth]). Every number on the card is parsed
// from that same frame and saved to screens/live/facts.json. Nothing here trades.
import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire('/home/user/Gmgn/apps/web/package.json');
const { chromium } = require('@playwright/test');
const BASE = 'http://localhost:8787';
const OUT = '/home/user/Gmgn/marketing/screens/live';
const api = async (p) => (await fetch(BASE + p)).json();
const avoid = new Set(Object.values(JSON.parse(fs.readFileSync(`${OUT}/boxes.json`, 'utf8'))).map((v) => v?.address).filter(Boolean));
for (const f of ['videos.json', 'trailer-v4.json']) {
  try { const m = JSON.parse(fs.readFileSync(`${OUT}/${f}`, 'utf8')); for (const v of Object.values(m)) if (v?.address) avoid.add(v.address); } catch {}
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 3, colorScheme: 'dark' });
await ctx.addInitScript({ path: '/home/user/Gmgn/marketing/tools/capture-mode.js' });
const page = await ctx.newPage();
await page.goto(`${BASE}/sol/trenches`, { waitUntil: 'networkidle' });
const panel = (title) => page.locator('section.panel').filter({ has: page.locator('h3', { hasText: new RegExp(`^${title}`) }) }).first();

const num = (txt, label) => { const m = txt.match(new RegExp(`${label}\\n([^\\n]+)`)); return m ? m[1].trim() : null; };
const pct = (v) => (v && /%/.test(v) ? parseFloat(v) : null);
const tr = await api('/api/sol/trenches?limit=100');
const cands = [...tr.almost, ...tr.new, ...tr.migrated].filter((t) => !avoid.has(t.address) && (t.security?.rugRatio ?? 0) > 0.3)
  .sort((a, b) => (b.security.bundlerRate + b.security.insiderHoldRate + b.security.freshWalletRate) - (a.security.bundlerRate + a.security.insiderHoldRate + a.security.freshWalletRate));
let done = false;
for (const t of cands.slice(0, 12)) {
  await page.goto(`${BASE}/sol/token/${t.address}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const p = panel('Audit');
  await p.getByRole('button', { name: /^All \d+/ }).first().click().catch(() => {});
  await page.waitForTimeout(600);
  const txt = await p.innerText();
  const v = {
    flags: (txt.match(/(\d+) flags?/) || [])[1], risk: (txt.match(/(High|Medium|Low) risk/) || [])[1],
    rugRatio: num(txt, 'Rug ratio'), dev: num(txt, 'Dev holding'), insiders: num(txt, 'Insiders'), bundlers: num(txt, 'Bundlers'),
    snipers: num(txt, 'Snipers'), fresh: num(txt, 'Fresh wallets'), top10: num(txt, 'Top 10 holders'), smart: num(txt, 'Smart money'),
  };
  const holdersHead = await panel('Holders').locator('h3').first().locator('..').innerText().catch(() => '');
  v.holders = (holdersHead.match(/(\d[\d,]*) holders?/) || [])[1];
  const ok = pct(v.insiders) >= 5 && pct(v.bundlers) >= 10 && pct(v.fresh) >= 30 && v.holders;
  console.log(t.symbol, JSON.stringify(v), ok ? 'OK' : 'skip');
  if (!ok) continue;
  await p.screenshot({ path: `${OUT}/facts-audit.png` });
  fs.writeFileSync(`${OUT}/facts.json`, JSON.stringify({ token: t.symbol, address: t.address, captured: new Date().toISOString(), values: v, auditText: txt }, null, 1));
  done = true;
  break;
}
console.log(done ? 'facts captured' : 'no token met the meme-3 truth rule');
await browser.close();
