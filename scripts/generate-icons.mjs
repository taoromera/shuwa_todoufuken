/**
 * Render the home-screen icons (white 手 on navy) into public/icons/.
 * Requires the Playwright Chromium: npx playwright install chromium
 * Usage: node scripts/generate-icons.mjs
 */
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const outDir = resolve(fileURLToPath(new URL('../public/icons', import.meta.url)));
const BACKGROUND = '#1a365d';

// Maskable icons are cropped to a circle by Android, so the glyph must stay
// inside the central 80% safe zone.
const ICONS = [
  { file: 'icon-192.png', size: 192, glyphScale: 0.68 },
  { file: 'icon-512.png', size: 512, glyphScale: 0.68 },
  { file: 'icon-maskable-512.png', size: 512, glyphScale: 0.5 },
  { file: 'apple-touch-icon.png', size: 180, glyphScale: 0.68 },
];

function iconHtml(size, glyphScale) {
  return `<!DOCTYPE html>
<html><body style="margin:0">
<div style="width:${size}px;height:${size}px;background:${BACKGROUND};display:flex;
  align-items:center;justify-content:center;color:#fff;
  font-family:'Noto Sans JP','Yu Gothic','Meiryo',sans-serif;font-weight:700;
  font-size:${Math.round(size * glyphScale)}px;line-height:1">手</div>
</body></html>`;
}

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
try {
  for (const { file, size, glyphScale } of ICONS) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(iconHtml(size, glyphScale));
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: resolve(outDir, file) });
    await page.close();
    console.log(`public/icons/${file}`);
  }
} finally {
  await browser.close();
}
