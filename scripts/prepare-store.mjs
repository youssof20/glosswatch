import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(root, '.cache', 'browsers');
const { chromium, expect } = await import('@playwright/test');
const output = path.join(root, 'docs', 'store');
await mkdir(output, { recursive: true });
await mkdir(path.join(root, '.cache'), { recursive: true });
const extensionPath = path.join(root, '.output', 'chrome-mv3');
const context = await chromium.launchPersistentContext(await mkdtemp(path.join(root, '.cache', 'store-')), {
  channel: 'chromium', headless: true, viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1,
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});
const errors = [];
context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
const extension = `chrome-extension://${new URL(worker.url()).host}`;
const page = await context.newPage();
try {
  // Original vector artwork keeps the demo independent of third-party video rights.
  const scene = await readFile(path.join(root, 'assets', 'demo-scene.svg'), 'utf8');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.setContent(`<style>body{margin:0}svg{display:block}</style>${scene}`);
  const still = path.join(root, '.cache', 'terrace.png');
  await page.screenshot({ path: still });
  const movie = path.join(root, 'docs', 'demo', 'terrace.mp4');
  await promisify(execFile)('ffmpeg', ['-y','-loop','1','-i',still,'-t','15','-r','24','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',movie], { windowsHide: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${extension}/player.html`);
  await page.getByLabel('Video file', { exact: true }).setInputFiles(movie);
  await page.locator('#subtitle-controls').click();
  await page.getByLabel('Subtitle file', { exact: true }).setInputFiles(path.join(root, 'docs', 'demo', 'terrace.srt'));
  await page.getByLabel('Translation subtitle file').setInputFiles(path.join(root, 'docs', 'demo', 'terrace.en.vtt'));
  await page.locator('video').evaluate(video => { video.pause(); video.currentTime = 2; });
  await expect(page.locator('.main-line')).toContainText('ventana');
  await page.getByRole('button', { name: 'Close subtitles panel' }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.locator('.anchor').evaluate(node => Math.round(node.getBoundingClientRect().top))).toBeGreaterThan(100);
  await page.getByRole('button', { name: 'Meaning of ventana', exact: true }).click();
  await expect(page.locator('.word-card')).toContainText('window', { timeout: 30000 });
  await page.getByRole('button', { name: 'Save word', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  await page.mouse.move(10, 10);
  await page.screenshot({ path: path.join(output, '01-watch.jpg'), type: 'jpeg', quality: 94 });
  const rows = [
    ['ventana', 'window', 'Abre la ventana. Hace una tarde preciosa.'],
    ['precioso', 'beautiful; lovely', 'Hace una tarde preciosa.'],
    ['junto', 'next to; together', 'Vamos a tomar un café junto al mar.'],
    ['volver', 'to return; to come back', 'Mañana volveremos a este lugar.'],
    ['tarde', 'afternoon; evening', 'Hace una tarde preciosa.'],
  ];
  await page.evaluate(async rows => {
    for (const [i, [word, meaning, sentence]] of rows.entries()) {
      const reply = await chrome.runtime.sendMessage({ type: 'cards.restore', payload: {
        id: `es:${word}`, word, lemma: word, language: 'es', meaning, sentence, ipa: '', translation: '', source: 'Glosswatch terrace demo',
        created: Date.now() - i * 60000, due: Date.now() + (i > 2 ? 86400000 : -60000), interval: i > 2 ? 1 : 0, ease: 2.5, reviews: i > 2 ? 1 : 0,
      } });
      if (!reply.ok) throw new Error(reply.error);
    }
  }, rows);
  const review = await context.newPage();
  await review.goto(`${extension}/review.html`);
  await expect(review.locator('.word-row')).toHaveCount(5);
  await review.screenshot({ path: path.join(output, '02-words.jpg'), type: 'jpeg', quality: 94 });
  await review.getByRole('button', { name: 'Start review' }).click();
  await review.getByRole('button', { name: 'Show meaning' }).click();
  await review.screenshot({ path: path.join(output, '03-review.jpg'), type: 'jpeg', quality: 94 });

  const icon = (await readFile(path.join(root, 'assets', 'icon.svg'), 'utf8')).replace(/<title>.*?<\/title>/s, '');
  await page.setViewportSize({ width: 128, height: 128 });
  await page.setContent(`<style>body{margin:0;background:transparent}svg{position:absolute;inset:16px;width:96px;height:96px}</style>${icon}`);
  await page.screenshot({ path: path.join(output, 'icon-128.png'), omitBackground: true });
  for (const [name, width, height] of [['promo-440x280',440,280],['marquee-1400x560',1400,560]]) {
    const small = width === 440;
    await page.setViewportSize({ width, height });
    await page.setContent(`<style>
      *{box-sizing:border-box}body{margin:0;width:100vw;height:100vh;background:#172b3a;color:#f2f6f8;font-family:system-ui,sans-serif;display:flex;align-items:center;padding:${small ? 32 : 96}px;gap:100px}
      .brand{display:flex;align-items:center;gap:12px;font-size:${small ? 25 : 38}px;font-weight:700;letter-spacing:-.8px}svg{width:${small ? 40 : 64}px;height:${small ? 40 : 64}px}
      h1{font-size:${small ? 29 : 62}px;line-height:1.2;font-weight:600;letter-spacing:-1px;margin:${small ? 24 : 32}px 0 12px}p{color:#bfd0da;font-size:${small ? 14 : 22}px;margin:0}.sample{padding:40px;border:1px solid #436071;border-radius:16px;font-size:36px;color:#cbd9e0}.sample strong{color:#71dfb8;border-bottom:3px solid #71dfb8;padding-bottom:8px;font-weight:550}.sample span{display:block;font-size:20px;margin-top:24px;color:#bfd0da}
    </style><div><div class="brand">${icon}Glosswatch</div><h1>Subtitles.<br>With meaning.</h1><p>Your videos. Five offline dictionaries.</p></div>${small ? '' : '<div class="sample">Abre la <strong>ventana</strong>.<span>ventana &nbsp; / &nbsp; window</span></div>'}`);
    await page.screenshot({ path: path.join(output, `${name}.png`) });
  }
  const manifest = JSON.parse(await readFile(path.join(extensionPath, 'manifest.json'), 'utf8'));
  await writeFile(path.join(root, '.cache', 'store-capture.json'), JSON.stringify({ version: manifest.version, viewport: '1280 × 800', screenshots: ['01-watch.jpg','02-words.jpg','03-review.jpg'], demo: 'Original terrace illustration and example vocabulary. Captured in the built extension.' }, null, 2) + '\n');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(pathToFileURL(path.join(root, 'docs', 'privacy.html')).href);
  await expect(page.getByRole('heading', { name: 'Privacy policy', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'chuumberry@gmail.com' })).toHaveAttribute('href', 'mailto:chuumberry@gmail.com');
  await page.goto(pathToFileURL(path.join(root, 'docs', 'index.html')).href);
  await expect.poll(() => page.locator('.screenshot').evaluate(image => image.naturalWidth)).toBe(1280);
  await page.setViewportSize({ width: 320, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'the public site must fit narrow screens');
  assert.deepEqual(errors, []);
  console.log('Prepared real extension screenshots, store icon, promo tiles, and the reviewer demo in docs/.');
} finally { await context.close(); }
