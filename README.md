# Glosswatch

A Chrome and Firefox extension in early development for language learners who want
clickable subtitles on their own videos. Only the extension setup is built so far.

No content library, accounts, tracking, or server. You supply the video and subtitle
files; subtitle playback and learning tools are still planned.

## Develop

Requires Node.js 22.12+ and npm. From the repo root:

```sh
npm ci
npm run dev            # Chrome; loads manually if no browser is found
npm run dev:firefox    # requires Firefox
```

To build for manual installation:

```sh
npm run build
npm run build:firefox
npm run compile
```

- Chrome: open `chrome://extensions`, enable Developer mode, then load unpacked
  from `.output/chrome-mv3` (or `.output/chrome-mv3-dev` while dev is running).
- Firefox: open `about:debugging#/runtime/this-firefox` and load a temporary add-on
  using `.output/firefox-mv3/manifest.json`.

### Troubleshooting

Set `CHROME_PATH` to your Chrome/Chromium executable if detection misses it.
To save a manual `chromiumBinary` setting, WXT calls it `binaries.chrome`:
create the ignored `web-ext.config.ts` below. `CHROME_PATH` takes precedence.
If your browser opens without the extension, use the manual-load steps above.

```ts
import { defineWebExtConfig } from 'wxt';

export default defineWebExtConfig({
  binaries: { chrome: 'C:/path/to/chrome.exe' },
});
```

## Current state

Manifest V3 builds and a content-script injection check are implemented. On a normal
web page, the check sets `<html data-glosswatch="loaded">`. `npm run smoke` checks
injection in headless Firefox after `npm run build:firefox`; set `FIREFOX_PATH` if
Firefox is outside its default Windows location.

No toolbar panel, video detection, subtitle parser, overlay, dictionary, or flashcards
yet. Parse errors, missing videos, and denied file-URL access therefore have no UI
messages yet. Chrome's “Allow access to file URLs” toggle is currently a manual step.
See [CONTEXT.md](./CONTEXT.md) for the build plan and validation gaps.

## License

[MIT](./LICENSE)
