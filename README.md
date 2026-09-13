# Glosswatch

A Chrome and Firefox extension for learning words from videos. Load your own
subtitles, look up a word without leaving the video, and save it for review.

No content library, accounts, tracking, or server. Videos, subtitle files, settings,
and saved words stay on your device.

## What works

- SRT, VTT, ASS and SSA files, including legacy encodings. Timing and appearance
  controls, file replacement, a searchable transcript, and two subtitle tracks.
- Offline word meanings and inflections for Spanish, French, German, Italian and
  Portuguese. Save a word with its original line and review it later.
- A local player for MP4, WebM and MOV, plus MKV remuxing when the browser supports
  the video and audio codecs. No transcoding or uploads.
- Saved-word search, editing, undo, JSON backups, and TSV export for Anki.

## Install from source

Requires Node.js 22.12+ and npm.

```sh
npm ci
npm run build
npm run build:firefox
```

Chrome: open `chrome://extensions`, enable Developer mode, and load unpacked from
`.output/chrome-mv3`. Firefox: open `about:debugging#/runtime/this-firefox` and load
`.output/firefox-mv3/manifest.json` as a temporary add-on.

Start a video and click Glosswatch on the toolbar or video. Add a subtitle file.
The same panel opens the local player and saved-word collection. Chrome file tabs
need “Allow access to file URLs” enabled; the local player does not.

## Develop

`npm run dev` starts Chrome development mode; `npm run dev:firefox` targets Firefox.
If Chrome is missing, load `.output/chrome-mv3-dev` manually while dev is running.
`npm run compile` checks types; `npm test` runs the parser, timing, review and startup
checks. Browser tests need ffmpeg on PATH:

```sh
npm run test:browsers
npm run test:fixtures
npm run test:browser
npm run test:firefox
```

### Troubleshooting

Set `CHROME_PATH` to your Chrome/Chromium executable, or save a manual binary in the
ignored `web-ext.config.ts`. WXT calls web-ext’s `chromiumBinary` setting `binaries.chrome`:

```ts
import { defineWebExtConfig } from 'wxt';
export default defineWebExtConfig({
  binaries: { chrome: 'C:/path/to/chrome.exe' },
});
```

## Limits

Browser-only pages and inaccessible players cannot be overlaid. Use the panel’s
Full screen button for subtitles in fullscreen. Image subtitles and unsupported
codecs need another file. Dictionaries are word meanings, not sentence translation.
Store publication is pending. See [CONTEXT.md](./CONTEXT.md) for architecture and
validation, and [RELEASE.md](./RELEASE.md) for packaging.

## License

Original code: [MIT](./LICENSE). Dictionary data: Wiktionary contributors,
[CC BY-SA 4.0](./public/dictionaries/NOTICE.txt). Bundled dependency licenses are in
[THIRD-PARTY-NOTICES.txt](./public/THIRD-PARTY-NOTICES.txt).
