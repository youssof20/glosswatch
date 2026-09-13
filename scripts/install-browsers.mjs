import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const cli = path.join(path.dirname(fileURLToPath(import.meta.resolve('playwright/package.json'))), 'cli.js');
const child = spawn(process.execPath, [cli, 'install', 'chromium', 'firefox', ...process.argv.slice(2)], {
  env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ?? path.resolve('.cache/browsers') },
  stdio: 'inherit', windowsHide: true,
});
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('exit', code => process.exitCode = code ?? 1);
