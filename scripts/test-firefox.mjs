import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cache = path.join(root, '.cache'); await mkdir(cache, { recursive: true });
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(cache, 'browsers');
const { firefox: playwrightFirefox } = await import('playwright');
const binary = process.env.FIREFOX_PATH ?? playwrightFirefox.executablePath();
const profile = await mkdtemp(path.join(cache, 'firefox-test-'));
const portProbe = net.createServer(); await new Promise(resolve => portProbe.listen(0, '127.0.0.1', resolve));
const port = portProbe.address().port; await new Promise(resolve => portProbe.close(resolve));
const server = createServer(async (req, res) => {
  const file = req.url === '/sample.mp4' ? path.join(cache, 'fixtures', 'sample.mp4') : path.join(root, 'tests', 'fixtures', 'page.html');
  res.setHeader('Content-Type', req.url === '/sample.mp4' ? 'video/mp4' : 'text/html');
  res.end(await readFile(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
await writeFile(path.join(profile, 'user.js'), Object.entries({
  'marionette.enabled': true, 'marionette.port': port,
  'datareporting.policy.dataSubmissionEnabled': false,
  'network.captive-portal-service.enabled': false, 'network.connectivity-service.enabled': false,
}).map(([key,value]) => `user_pref(${JSON.stringify(key)}, ${JSON.stringify(value)});`).join('\n'));
const firefox = spawn(binary, ['-headless','-no-remote','-marionette','--remote-allow-system-access','-profile',profile], { windowsHide: true, stdio: 'ignore' });
let launchError; firefox.on('error', error => launchError = error);
let socket;
try {
  const deadline = Date.now() + 30000;
  while (!socket && Date.now() < deadline) {
    if (launchError) throw launchError;
    try {
      socket = await new Promise((resolve,reject) => {
        const candidate = net.connect({ host: '127.0.0.1', port });
        candidate.once('connect', () => resolve(candidate)); candidate.once('error', reject);
      });
    } catch { await delay(200); }
  }
  if (!socket) throw new Error('Firefox did not start. Run npx playwright install firefox or set FIREFOX_PATH.');
  let buffer = Buffer.alloc(0); const messages = [], waiting = [];
  const flush = () => {
    while (true) {
      const colon = buffer.indexOf(':'); if (colon < 0) break;
      const length = Number(buffer.subarray(0, colon).toString());
      if (buffer.length < colon + 1 + length) break;
      messages.push(JSON.parse(buffer.subarray(colon + 1, colon + 1 + length).toString()));
      buffer = buffer.subarray(colon + 1 + length);
    }
    while (waiting.length && messages.length) waiting.shift().resolve(messages.shift());
  };
  socket.on('data', data => { buffer = Buffer.concat([buffer,data]); flush(); });
  const read = () => new Promise((resolve,reject) => { const timer = setTimeout(() => reject(new Error('Firefox command timed out')), 45000); waiting.push({ resolve: value => { clearTimeout(timer); resolve(value); } }); flush(); });
  await read(); let id = 0;
  const send = async (command, params = {}) => {
    const payload = JSON.stringify([0,++id,command,params]); socket.write(`${Buffer.byteLength(payload)}:${payload}`);
    const response = await read(); if (response[2]) throw new Error(`${command}: ${JSON.stringify(response[2])}`);
    return response[3]?.value ?? response[3];
  };
  const evaluate = script => send('WebDriver:ExecuteScript', { script, args: [] });
  const until = async (script, label) => {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) { if (await evaluate(script)) return; await delay(150); }
    throw new Error(`Firefox: ${label} did not become ready`);
  };
  const click = selector => evaluate(`document.querySelector('glosswatch-ui').shadowRoot.querySelector(${JSON.stringify(selector)}).click()`);
  const inject = async (selector, filename) => {
    const bytes = (await readFile(filename)).toString('base64');
    const name = path.basename(filename);
    await evaluate(`{
      const input = document.querySelector('glosswatch-ui')?.shadowRoot.querySelector(${JSON.stringify(selector)}) ?? document.querySelector(${JSON.stringify(selector)});
      const bytes = Uint8Array.from(atob(${JSON.stringify(bytes)}), c => c.charCodeAt(0));
      const transfer = new DataTransfer(); transfer.items.add(new File([bytes], ${JSON.stringify(name)}));
      input.files = transfer.files; input.dispatchEvent(new Event('change', {bubbles:true}));
    }`);
  };
  const text = selector => `document.querySelector('glosswatch-ui')?.shadowRoot.querySelector(${JSON.stringify(selector)})?.textContent`;
  await send('WebDriver:NewSession', { capabilities: {} });
  await send('Addon:Install', { path: path.join(root, '.output', 'firefox-mv3'), temporary: true });
  await send('WebDriver:Navigate', { url: origin });
  await until("return !!document.querySelector('glosswatch-ui')", 'content script');
  await click('.toggle'); await inject('.main-file', path.join(root,'tests','fixtures','spanish.srt'));
  await evaluate('document.querySelector("video").currentTime = 1');
  await until(`return ${text('.main-line')} === 'Hola, mundo.'`, 'subtitles');
  await inject('.second-file', path.join(root,'tests','fixtures','english.vtt'));
  await until(`return ${text('.second-line')} === 'Hello, world.'`, 'translation');
  await click('.close'); await click('.word');
  await until(`return ${text('.word-card')}?.includes('hello')`, 'dictionary lookup');
  await click('.word-card .primary');
  await until(`return ${text('.word-card .primary')} === 'Saved'`, 'word save');
  console.log('Firefox: content injection, subtitle import, translation, offline lookup and saving');
  await send('Marionette:SetContext', { value: 'chrome' });
  const base = await evaluate('return WebExtensionPolicy.getByID("glosswatch@youssof20.github.io").getURL("")');
  await send('Marionette:SetContext', { value: 'content' });
  await send('WebDriver:Navigate', { url: `${base}review.html` });
  await until('return document.querySelectorAll(".word-row").length === 1', 'saved-word collection');
  await evaluate('document.querySelector("#start-review").click(); document.querySelector("#reveal").click(); document.querySelector("[data-rating=good]").click()');
  await until('return document.querySelector("#due").textContent === "0"', 'review schedule');
  await send('WebDriver:Refresh');
  await until('return document.querySelectorAll(".word-row").length === 1 && document.querySelector("#due").textContent === "0"', 'persisted review');
  console.log('Firefox: IndexedDB persistence and review scheduling');
  await send('WebDriver:Navigate', { url: `${base}player.html` });
  await inject('#video-file', path.join(cache, 'fixtures','sample.mkv'));
  await until('return !document.querySelector("#progress").hidden || !document.querySelector("#video").hidden || !document.querySelector("#notice").hidden', 'file selection');
  await until('return document.querySelector("#progress").hidden', 'MKV remux');
  const problem = await evaluate('return document.querySelector("#notice").hidden ? "" : document.querySelector("#notice p").textContent');
  assert.equal(problem, '', 'MKV remux should not show an error');
  await until('return document.querySelector("video").readyState >= 2', 'MKV playback');
  await evaluate('document.querySelector("video").muted = true; document.querySelector("video").play()');
  await until('return document.querySelector("video").currentTime > 0.2', 'playing MKV');
  await evaluate('document.querySelector("video").pause()');
  await inject('.main-file', path.join(root, 'tests','fixtures','spanish.srt'));
  await evaluate('document.querySelector("video").currentTime = 1');
  await until(`return ${text('.main-line')} === 'Hola, mundo.'`, 'local player overlay');
  await mkdir(path.join(cache,'screenshots'), { recursive: true });
  const screenshot = await send('WebDriver:TakeScreenshot', { id: null, full: true });
  await writeFile(path.join(cache,'screenshots','firefox-player.png'), Buffer.from(screenshot,'base64'));
  console.log('Firefox: local MKV remux, playback and subtitle overlay');
  console.log('Firefox extension integration checks passed.');
  await send('WebDriver:DeleteSession');
} finally {
  socket?.destroy();
  if (firefox.pid && process.platform === 'win32') {
    await new Promise(resolve => { const killer = spawn('taskkill', ['/PID',String(firefox.pid),'/T','/F'], { windowsHide: true, stdio: 'ignore' }); killer.once('close', resolve); killer.once('error', resolve); });
  } else firefox.kill();
  await new Promise(resolve => server.close(resolve));
}
