/**
 * Phase 0 smoke test: launch headless Firefox, install the MV3 build as a
 * temporary add-on, and confirm the content script marked an arbitrary page.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = path.join(ROOT, '.output', 'firefox-mv3');
const FIREFOX =
  process.env.FIREFOX_PATH ??
  (process.platform === 'win32'
    ? 'C:\\Program Files\\Mozilla Firefox\\firefox.exe'
    : 'firefox');
const MARIONETTE_PORT = 28218;

if (!existsSync(path.join(EXT, 'manifest.json'))) {
  console.error('Firefox build is missing. Run npm run build:firefox first.');
  process.exit(1);
}

if (path.isAbsolute(FIREFOX) && !existsSync(FIREFOX)) {
  console.error('Firefox was not found. Install it or set FIREFOX_PATH to its executable.');
  process.exit(1);
}

const profileDir = await mkdtemp(path.join(tmpdir(), 'glosswatch-ff-'));
await writeFile(
  path.join(profileDir, 'user.js'),
  [
    'user_pref("marionette.enabled", true);',
    `user_pref("marionette.port", ${MARIONETTE_PORT});`,
    'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
    'user_pref("toolkit.telemetry.reportingpolicy.firstRun", false);',
  ].join('\n'),
);

const firefox = spawn(
  FIREFOX,
  [
    '-marionette',
    '-headless',
    '-no-remote',
    '-profile',
    profileDir,
  ],
  { windowsHide: true, stdio: 'ignore' },
);

let launchError;
firefox.once('error', (error) => { launchError = error; });

let settled = false;
const finish = async (code) => {
  if (settled) return;
  settled = true;
  firefox.kill();
  if (process.platform === 'win32' && firefox.pid) {
    spawn('taskkill', ['/T', '/F', '/PID', String(firefox.pid)], {
      windowsHide: true,
      stdio: 'ignore',
    });
  }
  await delay(400);
  if (!path.resolve(profileDir).startsWith(path.resolve(tmpdir()) + path.sep)) {
    throw new Error('Refusing to remove a Firefox profile outside the temp directory');
  }
  await rm(profileDir, { recursive: true, force: true });
  process.exit(code);
};

const connectMarionette = async () => {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (launchError) {
      throw new Error(`Could not start Firefox. Check FIREFOX_PATH: ${launchError.message}`);
    }
    try {
      return await new Promise((resolve, reject) => {
        const socket = net.connect({ host: '127.0.0.1', port: MARIONETTE_PORT });
        socket.once('connect', () => resolve(socket));
        socket.once('error', reject);
      });
    } catch {
      await delay(250);
    }
  }
  throw new Error(`Marionette never listened on ${MARIONETTE_PORT}`);
};

const createClient = (socket) => {
  let buffer = Buffer.alloc(0);
  const waiters = [];

  const readNext = () =>
    new Promise((resolve, reject) => {
      waiters.push({ resolve, reject });
      flush();
    });

  const flush = () => {
    const colon = buffer.indexOf(':');
    if (colon === -1 || waiters.length === 0) return;
    const length = Number(buffer.subarray(0, colon).toString('utf8'));
    if (!Number.isFinite(length)) {
      waiters.shift()?.reject(new Error('Invalid Marionette length prefix'));
      return;
    }
    const start = colon + 1;
    if (buffer.length < start + length) return;
    const json = buffer.subarray(start, start + length).toString('utf8');
    buffer = buffer.subarray(start + length);
    waiters.shift()?.resolve(JSON.parse(json));
    flush();
  };

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    flush();
  });
  socket.on('error', (error) => {
    while (waiters.length) waiters.shift()?.reject(error);
  });

  let nextId = 1;
  const send = async (command, params = {}) => {
    const id = nextId++;
    const payload = JSON.stringify([0, id, command, params]);
    socket.write(`${Buffer.byteLength(payload)}:${payload}`);
    const message = await readNext();
    if (!Array.isArray(message) || message[0] !== 1) {
      throw new Error(`Unexpected Marionette message: ${JSON.stringify(message)}`);
    }
    if (message[2]) {
      throw new Error(`${command} failed: ${JSON.stringify(message[2])}`);
    }
    return message[3];
  };

  return { hello: readNext(), send, socket };
};

try {
  const socket = await connectMarionette();
  const client = createClient(socket);
  const hello = await client.hello;
  if (!hello?.marionetteProtocol) {
    throw new Error(`Unexpected Marionette hello: ${JSON.stringify(hello)}`);
  }

  await client.send('WebDriver:NewSession', { capabilities: {} });
  await client.send('Addon:Install', { path: EXT, temporary: true });
  await client.send('WebDriver:Navigate', { url: 'https://example.com/' });

  const result = await client.send('WebDriver:ExecuteScript', {
    script: 'return document.documentElement.dataset.glosswatch || ""',
    args: [],
  });

  const value = result?.value ?? result;
  client.socket.end();

  if (value !== 'loaded') {
    throw new Error(
      `Content script did not mark the page (got ${JSON.stringify(value)})`,
    );
  }

  console.log(
    'Phase 0 smoke: Firefox content script injected on https://example.com',
  );
  await finish(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  await finish(1);
}
