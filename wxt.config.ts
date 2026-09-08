import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/webextension-polyfill'],
  // CONTEXT.md: Manifest V3 for Chrome and Firefox from day one.
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: 'Glosswatch',
    description:
      'Clickable subtitles for any video. Local, free, no account, no tracking.',
    // No popup in v1 — the toolbar icon will open an in-page panel later.
    action: {
      default_title: 'Glosswatch',
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
