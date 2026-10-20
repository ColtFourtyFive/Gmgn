// Render jobs to PNG with headless Chromium.
// Usage: node render.mjs jobs.json
// jobs: [{ src: "file.svg|file.html", out: "x.png", width, height, scale?: 1, transparent?: bool }]
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const require = createRequire('/home/user/Gmgn/apps/web/package.json');
const { chromium } = require('@playwright/test');

const jobs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const j of jobs) {
  const ctx = await browser.newContext({ viewport: { width: j.width, height: j.height }, deviceScaleFactor: j.scale || 1 });
  const page = await ctx.newPage();
  if (j.src.endsWith('.svg')) {
    const svg = fs.readFileSync(j.src, 'utf8');
    await page.setContent(
      `<html><body style="margin:0;background:transparent"><div style="width:${j.width}px;height:${j.height}px;display:flex;align-items:center;justify-content:center">` +
        svg.replace('<svg ', `<svg style="width:${j.width}px;height:${j.height}px" `) +
        '</div></body></html>',
    );
  } else {
    await page.goto(pathToFileURL(path.resolve(j.src)).href, { waitUntil: 'networkidle' });
  }
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(j.wait || 150);
  fs.mkdirSync(path.dirname(j.out), { recursive: true });
  await page.screenshot({ path: j.out, omitBackground: !!j.transparent, clip: { x: 0, y: 0, width: j.width, height: j.height } });
  console.log('rendered', j.out);
  await ctx.close();
}
await browser.close();
