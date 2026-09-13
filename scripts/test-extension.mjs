import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, stat, mkdtemp } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(root, '.cache', 'browsers');
const { chromium, expect } = await import('@playwright/test');
await mkdir(path.join(root, '.cache', 'screenshots'), { recursive: true });
const fixtures = path.join(root, 'tests', 'fixtures');
const movie = path.join(root, '.cache', 'fixtures', 'sample.mp4');
const srt = path.join(fixtures, 'spanish.srt'), vtt = path.join(fixtures, 'english.vtt');
const server = createServer(async (req, res) => {
  try {
    if (req.url?.startsWith('/sample.mp4')) {
      const { size } = await stat(movie);
      const range = req.headers.range?.match(/bytes=(\d+)-(\d*)/);
      const start = range ? +range[1] : 0, end = range?.[2] ? +range[2] : size - 1;
      res.writeHead(range ? 206 : 200, { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}) });
      createReadStream(movie, { start, end }).pipe(res);
    } else {
      res.setHeader('Content-Type', 'text/html');
      res.end(req.url === '/empty' ? '<!doctype html><html><head><title>No video here</title></head><body><h1>Nothing playing</h1></body></html>' : await readFile(path.join(fixtures, 'page.html')));
    }
  } catch (error) { res.writeHead(500); res.end(String(error)); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const extensionPath = path.join(root, '.output', 'chrome-mv3');
const profile = await mkdtemp(path.join(root, '.cache', 'chrome-test-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium', headless: true, viewport: { width: 1440, height: 1080 },
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});
const errors = [], external = [];
context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
context.on('request', req => { if (/^https?:/.test(req.url()) && !req.url().startsWith(origin)) external.push(req.url()); });
const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
const extensionId = new URL(worker.url()).host;
const extension = `chrome-extension://${extensionId}`;
const page = await context.newPage();
const step = name => console.log(`Chromium: ${name}`);
async function seek(page, time) { await page.locator('video').evaluate((video, value) => { video.pause(); video.currentTime = value; }, time); }
async function screenshot(page, name) { await page.screenshot({ path: path.join(root, '.cache', 'screenshots', `${name}.png`), fullPage: true }); }
try {
  await page.goto(origin); await expect(page.locator('glosswatch-ui')).toHaveCount(1);
  await page.getByRole('button', { name: 'Open Glosswatch', exact: true }).click();
  await page.getByLabel('Subtitle file', { exact: true }).setInputFiles(srt);
  await seek(page, 1); await expect(page.locator('.main-line')).toHaveText('Hola, mundo.');
  await page.getByLabel('Translation subtitle file').setInputFiles(vtt);
  await expect(page.locator('.second-line')).toHaveText('Hello, world.');
  await page.getByLabel('Timing offset in seconds').fill('3');
  await expect(page.locator('.subtitle')).toBeHidden();
  await page.getByRole('button', { name: 'Reset timing' }).click();
  await expect(page.locator('.main-line')).toHaveText('Hola, mundo.');
  step('subtitle loading, translation, and live offsets');

  await page.getByLabel('Subtitle file', { exact: true }).setInputFiles({ name: 'broken.srt', mimeType: 'text/plain', buffer: Buffer.from('This is broken') });
  await expect(page.locator('.message')).toContainText('No readable subtitles');
  await expect(page.locator('.main-line')).toHaveText('Hola, mundo.');
  await page.getByLabel('Subtitle file', { exact: true }).setInputFiles({ name: 'image.idx', mimeType: 'text/plain', buffer: Buffer.from('images') });
  await expect(page.locator('.message')).toContainText('Image subtitles');
  step('invalid inputs preserve the working subtitle track');

  await page.getByRole('button', { name: 'Close subtitles panel' }).click();
  await page.getByRole('button', { name: 'Meaning of Hola', exact: true }).click();
  await expect(page.locator('.word-card')).toContainText(/hello/i, { timeout: 30000 });
  await page.getByRole('button', { name: 'Save word', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  await screenshot(page, 'watch-word');
  await page.getByRole('button', { name: 'Close word meaning' }).click();
  await seek(page, 4); await page.getByRole('button', { name: 'Meaning of corriendo' }).click();
  await expect(page.locator('.word-card')).toContainText('correr', { timeout: 30000 });
  await page.getByRole('button', { name: 'Close word meaning' }).click();
  step('offline word meanings, inflections, and saving');

  await page.getByRole('button', { name: 'Open Glosswatch', exact: true }).click();
  await page.getByLabel('Timing offset in seconds').fill('1.25');
  await page.getByText('Appearance & text', { exact: true }).click();
  await page.getByLabel('Text size', { exact: true }).fill('36');
  await page.getByRole('button', { name: 'Close subtitles panel' }).click();
  await page.reload(); await page.getByRole('button', { name: 'Open Glosswatch', exact: true }).click();
  await page.getByLabel('Subtitle file', { exact: true }).setInputFiles(srt);
  await expect(page.getByLabel('Timing offset in seconds')).toHaveValue('1.25');
  await page.getByText('Appearance & text', { exact: true }).click();
  await expect(page.getByLabel('Text size', { exact: true })).toHaveValue('36');
  await page.getByRole('button', { name: 'Reset timing' }).click(); await seek(page, 1);
  await page.locator('video').evaluate(video => { const replacement = video.cloneNode(true); video.replaceWith(replacement); });
  await seek(page, 1); await expect(page.locator('.main-line')).toHaveText('Hola, mundo.');
  await page.getByRole('button', { name: 'Full screen with subtitles' }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await expect(page.locator('glosswatch-ui')).toHaveCount(1);
  await page.evaluate(() => document.exitFullscreen());
  step('persistence, replaced players, and fullscreen');

  const review = await context.newPage(); await review.goto(`${extension}/review.html`);
  await expect(review.locator('.word-row')).toHaveCount(1);
  await review.getByRole('button', { name: 'Start review' }).click();
  await review.getByRole('button', { name: 'Show meaning' }).click();
  await expect(review.locator('#answer')).toContainText(/hello/i);
  await review.locator('[data-rating=good]').click();
  await expect(review.locator('#due')).toHaveText('0');
  await review.reload(); await expect(review.locator('#due')).toHaveText('0');
  await review.getByRole('button', { name: 'Edit', exact: true }).click();
  await review.locator('#edit-meaning').fill('hello; a greeting');
  await review.getByRole('button', { name: 'Save changes' }).click();
  await expect(review.locator('.meaning')).toHaveText('hello; a greeting');
  await screenshot(review, 'saved-words');
  await review.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(review.locator('.word-row')).toHaveCount(0);
  await review.locator('#toast').getByRole('button', { name: 'Undo' }).click();
  await expect(review.locator('.word-row')).toHaveCount(1);
  await review.getByText('Import & export', { exact: true }).click();
  const [backup] = await Promise.all([review.waitForEvent('download'), review.getByRole('button', { name: 'Back up words' }).click()]);
  const backupFile = path.join(root, '.cache', 'backup.json'); await backup.saveAs(backupFile);
  assert.equal(JSON.parse(await readFile(backupFile, 'utf8')).cards.length, 1);
  await review.getByLabel('Import word backup').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{bad') });
  await expect(review.locator('#error')).toContainText('not valid JSON');
  await expect(review.locator('.word-row')).toHaveCount(1);
  step('review schedules, editing, removal/undo, backup and invalid import');
  await review.getByLabel('Import word backup').setInputFiles(backupFile);
  await expect(review.locator('#toast')).toContainText('Imported 0 new words');
  for (const [language, word] of [['fr','bonjour'],['de','hallo'],['it','ciao'],['pt','olá']]) {
    const answer = await review.evaluate(async payload => chrome.runtime.sendMessage({ type: 'dictionary.lookup', payload }), { language, word });
    assert.equal(answer.ok, true); assert.ok(answer.data?.meanings.length, `${language} dictionary has ${word}`);
  }
  step('all five bundled dictionaries and duplicate-safe import');

  const player = await context.newPage(); await player.goto(`${extension}/player.html`); await screenshot(player, 'player-empty');
  await player.getByLabel('Video file', { exact: true }).setInputFiles(movie);
  await expect(player.locator('video')).toBeVisible();
  await player.getByRole('button', { name: 'Open Glosswatch', exact: true }).click();
  await player.getByLabel('Subtitle file', { exact: true }).setInputFiles(srt); await seek(player, 1);
  await expect(player.locator('.main-line')).toHaveText('Hola, mundo.');
  await player.getByRole('button', { name: 'Close subtitles panel' }).click();
  await player.getByLabel('Video file', { exact: true }).setInputFiles(path.join(root, '.cache', 'fixtures', 'sample.mkv'));
  await expect(player.locator('#progress')).toBeHidden({ timeout: 60000 });
  await expect(player.locator('#notice.error')).toHaveCount(0);
  await expect(player.locator('video')).toBeVisible();
  await expect.poll(() => player.locator('video').evaluate(video => video.readyState), { timeout: 30000 }).toBeGreaterThanOrEqual(2);
  await player.locator('video').evaluate(video => video.play());
  await expect.poll(() => player.locator('video').evaluate(video => video.currentTime)).toBeGreaterThan(.2);
  await seek(player, 1); await expect(player.locator('.main-line')).toHaveText('Hola, mundo.');
  await screenshot(player, 'player-video');
  step('local MP4 and real MKV remux/playback');
  const otherPlayer = await context.newPage(); await otherPlayer.goto(`${extension}/player.html`);
  assert.equal(await player.evaluate(async () => {
    const names = []; for await (const name of (await navigator.storage.getDirectory()).keys()) names.push(name); return names.filter(n => n.startsWith('glosswatch-')).length;
  }), 1, 'another player must not clean up an active video');
  await player.getByLabel('Video file', { exact: true }).setInputFiles({ name: 'broken.mkv', mimeType: 'video/x-matroska', buffer: Buffer.from('invalid media') });
  await expect(player.locator('#notice')).toContainText('could not be prepared');
  await expect.poll(() => player.evaluate(async () => { const names = []; for await (const name of (await navigator.storage.getDirectory()).keys()) names.push(name); return names.length; })).toBe(0);
  await player.evaluate(() => document.querySelector('#video-file').addEventListener('change', () => document.querySelector('#cancel').click(), { once: true }));
  await player.getByLabel('Video file', { exact: true }).setInputFiles(path.join(root, '.cache', 'fixtures', 'sample.mkv'));
  await expect(player.locator('#progress')).toBeHidden();
  await expect(player.locator('#notice')).toContainText('cancelled');
  await otherPlayer.close();
  step('damaged MKV guidance, cancellation, and temporary-file leases');

  const empty = await context.newPage(); await empty.goto(`${origin}/empty`);
  await empty.bringToFront();
  await worker.evaluate(async () => { const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); await chrome.tabs.sendMessage(tab.id, { type: 'watch.toggle' }); });
  await expect(empty.locator('.video-status')).toContainText('Couldn’t find a video');
  await player.goto(`${extension}/player.html?notice=file-access`);
  await expect(player.locator('#notice')).toContainText('Allow access to file URLs');
  await player.setViewportSize({ width: 390, height: 844 }); await screenshot(player, 'player-mobile');
  assert.equal(await player.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(external, [], 'The tested flows must not make external network requests');
  assert.deepEqual(errors, [], 'No uncaught browser errors');
  step('no-video and file-access guidance, narrow layout, and zero external requests');
  console.log('Chromium extension integration checks passed.');
} catch (error) {
  await screenshot(page, 'failure'); console.error('Browser errors:', errors); console.error('Panel status:', await page.locator('.message').textContent());
  for (const tab of context.pages()) if (tab.url().includes('player.html')) { console.error('Player notice:', await tab.locator('#notice').textContent()); await screenshot(tab, 'player-failure'); }
  throw error;
} finally { await context.close(); await new Promise(resolve => server.close(resolve)); }
