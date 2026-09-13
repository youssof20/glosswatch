// Optional network smoke check. These pages can change independently of this repo.
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.resolve('.cache/browsers');
const { chromium, expect } = await import('@playwright/test');
const extension = path.resolve('.output/chrome-mv3');
const context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, viewport: { width: 1440, height: 1000 }, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
await mkdir('.cache/screenshots', { recursive: true });
try {
  for (const [name, url] of [
    ['youtube','https://www.youtube.com/watch?v=YE7VzlLtp-4'],
    ['peertube','https://video.blender.org/videos/watch/6402b77c-b61f-4a06-96ca-c8420a2becf4'],
  ]) {
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      const reject = page.getByRole('button', { name: /Reject all/i });
      if (await reject.count()) await reject.first().click();
      await expect(page.locator('video').first()).toBeVisible({ timeout: 30000 });
      await expect(page.getByRole('button', { name: 'Open Glosswatch', exact: true }).first()).toBeVisible({ timeout: 15000 });
      await page.getByRole('button', { name: 'Open Glosswatch', exact: true }).first().click();
      await page.getByLabel('Subtitle file', { exact: true }).first().setInputFiles({ name: 'site-check.srt', mimeType: 'text/plain', buffer: Buffer.from('1\n00:00:00,000 --> 23:59:59,000\nGlosswatch subtitle check') });
      await expect(page.locator('.main-line').first()).toHaveText('Glosswatch subtitle check');
      await page.screenshot({ path: `.cache/screenshots/site-${name}.png` });
      console.log(`${name}: video detected and imported subtitle rendered on ${url}`);
    } catch (error) {
      await page.screenshot({ path: `.cache/screenshots/site-${name}-failure.png` });
      console.error(`${name}: ${error.message}`); process.exitCode = 1;
    } finally { await page.close(); }
  }
} finally { await context.close(); }
