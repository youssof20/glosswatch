# Glosswatch

**Lingopie's clickable-subtitle experience, without the content library, the subscription, or the server.**

Glosswatch is a free, open-source browser extension that turns any video — a show you're streaming, or a file on disk — into an interactive language-learning session, using subtitle files you already have.

Everything runs **entirely on your machine**. No backend, no accounts, no tracking, no ads.

> This is early development (Phase 0). Subtitle overlay, dictionary, and flashcards are not built yet. The design doc is [CONTEXT.md](./CONTEXT.md).

## What this is / isn't

| This is | This is not |
|---|---|
| A display/interaction layer for **your** video and **your** subtitle files | A content library, streaming service, or subtitle host |
| Client-side only — MIT licensed, inspectable | A SaaS product with a server bill |
| Chrome + Firefox from one codebase (Manifest V3) | Chrome-only with a "Firefox later" promise |
| Minimal permissions, no telemetry | A free trial with a paywall |

We do not host, store, or distribute copyrighted video or subtitles. You supply the file (or you're already logged into the streaming site). We overlay and make the text clickable.

## Develop

Requires [Node.js](https://nodejs.org/) 22+.

```bash
npm install
npm run dev          # Chrome, unpacked + live reload
npm run dev:firefox  # Firefox, temporary add-on + live reload
```

Or build once and load manually:

```bash
npm run build          # → .output/chrome-mv3
npm run build:firefox  # → .output/firefox-mv3
```

- **Chrome:** `chrome://extensions` → Developer mode → Load unpacked → select `.output/chrome-mv3`
- **Firefox:** `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → select `.output/firefox-mv3/manifest.json`

Phase 0 smoke test: open any page, open DevTools → Console, and look for `[Glosswatch] content script loaded`. In the inspector, `<html>` should have `data-glosswatch="loaded"`. Automated check (Firefox, requires a local Firefox install):

```bash
npm run build:firefox
npm run smoke
```

Local `file://` videos need an extra one-time toggle (Chrome: extension details → "Allow access to file URLs"). We'll prompt for this later, only when needed.

## License

[MIT](./LICENSE)

## Contributing

Read [CONTEXT.md](./CONTEXT.md) first. It is the source of truth for architecture, UX rules, edge cases, and the phased build plan.
