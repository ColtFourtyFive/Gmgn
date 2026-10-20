// Real wallet-tag chips with labels, at 4x, from the app's own WalletTagBadge
// markup on /_ui (clone the icon badge and add its label, exactly like showLabel).
import { createRequire } from 'module';
const require = createRequire('/home/user/Gmgn/apps/web/package.json');
const { chromium } = require('@playwright/test');
const OUT = '/home/user/Gmgn/marketing/video/overlays/chips';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 4, colorScheme: 'dark' });
const p = await ctx.newPage();
await p.goto('http://localhost:8787/_ui', { waitUntil: 'networkidle' });
await p.waitForTimeout(1000);
for (const [tag, label] of [['whale', 'Whale'], ['sniper', 'Sniper'], ['bundler', 'Bundler'], ['insider', 'Insider'], ['dev', 'Dev'], ['you', 'You'], ['smart', 'Smart'], ['kol', 'KOL'], ['fresh', 'Fresh'], ['bot', 'Bot']]) {
  const ok = await p.evaluate(({ label, tag }) => {
    const src = document.querySelector(`span.chip[role="img"][aria-label="${label}"]`);
    if (!src) return false;
    const c = src.cloneNode(true);
    c.removeAttribute('role'); c.removeAttribute('aria-label');
    c.classList.add('!px-1.5');
    c.appendChild(document.createTextNode(label));
    c.id = `cap-${tag}`;
    const holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:400px;top:400px;z-index:9999;padding:6px;background:#11141A;border-radius:9px;display:inline-flex';
    holder.id = `plate-${tag}`;
    holder.appendChild(c);
    document.body.appendChild(holder);
    return true;
  }, { label, tag });
  if (!ok) { console.log('missing', tag); continue; }
  await p.locator(`#plate-${tag}`).screenshot({ path: `${OUT}/${tag}.png`, omitBackground: true });
  await p.evaluate((tag) => document.getElementById(`cap-${tag}`).parentElement.remove(), tag);
  console.log('chip', tag);
}
await b.close();
