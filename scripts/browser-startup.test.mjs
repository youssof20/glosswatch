import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Launcher } from 'chrome-launcher';
import { createServer } from 'wxt';

test('browser startup configuration', async (t) => {
  const originalChromePath = process.env.CHROME_PATH;
  const originalDiscovery = Launcher.getInstallations;
  delete process.env.CHROME_PATH;
  Launcher.getInstallations = () => { throw new Error('No Chrome installation'); };
  t.after(() => {
    Launcher.getInstallations = originalDiscovery;
    if (originalChromePath === undefined) delete process.env.CHROME_PATH;
    else process.env.CHROME_PATH = originalChromePath;
  });

  async function resolve(browser = 'chrome', webExt = {}) {
    let config;
    const server = await createServer({
      browser,
      webExt,
      hooks: { 'server:created': (wxt) => { config = wxt.config; } },
    });
    await server.stop();
    return config;
  }

  await t.test('failed discovery keeps a working manual runner', async () => {
    const config = await resolve('chrome', { binaries: { chrome: '' } });
    assert.equal(config.webExt.config.disabled, true);
    assert.equal(config.runner.canOpen?.() ?? false, false);
    await config.runner.openBrowser();
  });

  // Any executable is sufficient: these checks resolve config without launching it.
  await t.test('a local binary enables auto-launch', async () => {
    const config = await resolve('chrome', { binaries: { chrome: process.execPath } });
    assert.equal(config.webExt.config.disabled ?? false, false);
    assert.equal(config.runner.canOpen(), true);
  });

  await t.test('CHROME_PATH takes precedence over local configuration', async () => {
    process.env.CHROME_PATH = process.execPath;
    const config = await resolve('chrome', { binaries: { chrome: 'missing-chrome.exe' } });
    assert.equal(config.webExt.config.binaries.chrome, process.execPath);
    assert.equal(config.runner.canOpen(), true);
  });

  await t.test('a stale CHROME_PATH falls back without throwing', async () => {
    process.env.CHROME_PATH = 'missing-chrome.exe';
    const config = await resolve('chrome', { binaries: { chrome: process.execPath } });
    assert.equal(config.webExt.config.disabled, true);
  });

  await t.test('directories are not accepted as executables', async () => {
    process.env.CHROME_PATH = process.cwd();
    const config = await resolve();
    assert.equal(config.webExt.config.disabled, true);
  });

  await t.test('Firefox is unaffected by Chrome discovery', async () => {
    const config = await resolve('firefox');
    assert.equal(config.webExt.config.disabled ?? false, false);
    assert.equal(config.runner.canOpen(), true);
  });

  await t.test('explicitly disabled auto-launch stays disabled', async () => {
    process.env.CHROME_PATH = process.execPath;
    const config = await resolve('chrome', { disabled: true });
    assert.equal(config.webExt.config.disabled, true);
    assert.equal(config.runner.canOpen?.() ?? false, false);
  });
});
