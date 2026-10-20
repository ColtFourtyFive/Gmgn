// meme-5 / meme-7 (REPLY_BANK §5): sharp stills of one demo-market rug right after it happens, in marketing capture
// mode. The token is the last take capture_watch.mjs kept (screens/live/watch.json), so the recording and its trades
// back every field. Page at 1920x1080 CSS, forced device scale 3: the 1 s chart, the audit card (read after the dump),
// the holder count. Output: screens/live/rug-*.png and rug.json (boxes in CSS px, the audit text, the facts for the
// toe tag). Nothing trades.
// Usage: node capture_rug.mjs
import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire('/home/user/Gmgn/apps/web/package.json');
const { chromium } = require('@playwright/test');

const BASE = 'http://localhost:8787';
const TOOLS = '/home/user/Gmgn/marketing/tools';
const LIVE = '/home/user/Gmgn/marketing/screens/live';
const W = JSON.parse(fs.readFileSync(`${LIVE}/watch.json`, 'utf8'));
const take = W.takes.at(-1);
const BLUR = 'a.link.font-semibold[title],span.truncate.text-muted[title],h1.text-lg.font-bold,h1.text-lg.font-bold + *{filter:blur(6px)!important}';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--force-device-scale-factor=3', '--window-size=1920,1080'] });
const ctx = await browser.newContext({ viewport: null, colorScheme: 'dark' });
await ctx.addInitScript({ path: `${TOOLS}/capture-mode.js` });
await ctx.addInitScript({ path: `${TOOLS}/blur-tickers.js` });
await ctx.addInitScript(`document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent=${JSON.stringify(BLUR)};document.head.appendChild(s);});`);
const page = await ctx.newPage();
const em = await ctx.newCDPSession(page);
await em.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 0, mobile: false });
await page.goto(`${BASE}/sol/token/${take.address}`, { waitUntil: 'networkidle' });
await page.locator('[aria-label="Candle resolution"]').getByText('1s', { exact: true }).first().click({ timeout: 5000 }).catch(() => {});
await page.mouse.move(1919, 140);
await page.waitForTimeout(3500);
const box = async (loc) => { const b = await loc.boundingBox().catch(() => null); return b && [b.x, b.y, b.width, b.height].map((v) => Math.round(v)); };
const panel = (title) => page.locator('section.panel').filter({ has: page.locator('h3', { hasText: new RegExp(`^${title}`) }) }).first();
const shot = async (name) => {
  const s = await em.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${LIVE}/${name}.png`, Buffer.from(s.data, 'base64'));
};
await shot('rug-page');
const audit = panel('Audit');
const auditText = await audit.innerText();
const detail = await (await fetch(`${BASE}/api/sol/tokens/${take.address}`)).json();
const meta = {
  token: take.symbol, address: take.address, capturedAt: Date.now() / 1000,
  chart: await box(page.locator('section.panel, div.panel').filter({ has: page.locator('[aria-label="Candle resolution"]') }).first()),
  audit: await box(audit), auditText,
  flags: (auditText.match(/(\d+) flags?/) || [])[1], risk: (auditText.match(/(High|Medium|Low) risk/) || [])[1],
  rugRatio: (auditText.match(/Rug ratio\n([\d.]+%)/) || [])[1],
  holders: detail.holderCount,
};
fs.writeFileSync(`${LIVE}/rug.json`, JSON.stringify(meta, null, 1));
console.log(JSON.stringify({ ...meta, auditText: undefined }));
await browser.close();
