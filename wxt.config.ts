import { defineConfig } from 'wxt';
import { Launcher } from 'chrome-launcher';
import { accessSync, constants, statSync } from 'node:fs';
import { relative } from 'node:path';

function findChrome(): string | undefined {
  try {
    return Launcher.getInstallations()[0];
  } catch {
    // Discovery can throw on machines without a supported Chrome installation.
    return undefined;
  }
}

function isExecutable(binary: string | undefined): boolean {
  if (!binary) return false;
  try {
    accessSync(binary, constants.X_OK);
    return statSync(binary).isFile();
  } catch {
    return false;
  }
}

const chromeBinary = process.env.CHROME_PATH || findChrome();

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/webextension-polyfill'],
  zip: {
    dotSources: true,
    includeSources: [
      'src/**', 'public/**', 'assets/**', 'scripts/**', 'tests/**',
      '.github/workflows/**', '.gitignore', '*.md', 'LICENSE',
      'package.json', 'package-lock.json', 'tsconfig.json', 'wxt.config.ts',
    ],
  },
  webExt: {
    // WXT passes binaries.chrome to web-ext as chromiumBinary.
    binaries: chromeBinary ? { chrome: chromeBinary } : {},
  },
  hooks: {
    'config:resolved'(wxt) {
      // Keep the verification suite in the reproducible source package.
      wxt.config.zip.excludeSources = wxt.config.zip.excludeSources.filter(
        pattern => pattern !== '**/__tests__/**' && pattern !== '**/*.+(test|spec).?(c|m)+(j|t)s?(x)',
      );
      if (wxt.config.command !== 'serve' || wxt.config.browser !== 'chrome') return;

      // Resolve after local web-ext config and .env files have been loaded.
      const webExt = wxt.config.webExt.config;
      if (webExt.disabled) return;
      const binary = process.env.CHROME_PATH || webExt.binaries?.chrome;
      if (isExecutable(binary)) {
        webExt.binaries = { ...webExt.binaries, chrome: binary! };
        return;
      }

      webExt.disabled = true;
      // WXT selects its runner before this hook, so replace it as well.
      wxt.config.runner = {
        async openBrowser() {
          wxt.logger.info(
            'No usable Chrome binary found; browser auto-launch is disabled. ' +
              'Set CHROME_PATH to a Chrome/Chromium executable to enable it.',
          );
          wxt.logger.info(
            `Load "${relative(wxt.config.root, wxt.config.outDir)}" as an unpacked extension manually`,
          );
        },
      };
    },
  },
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: 'Glosswatch',
    description:
      'Load your subtitles, look up words, and review what you learn. Works locally on web videos and your own files.',
    permissions: ['storage', 'activeTab'],
    action: { default_title: 'Open Glosswatch' },
    options_ui: { page: 'about.html', open_in_tab: true },
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'glosswatch@youssof20.github.io',
          // 140+ is required for gecko.data_collection_permissions (AMO).
          strict_min_version: '140.0',
          data_collection_permissions: {
            required: ['none'],
          },
        },
        gecko_android: {
          strict_min_version: '142.0',
        },
      },
    }),
  }),
});
