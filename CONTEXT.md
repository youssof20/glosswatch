# Development notes

This file records the implemented design and release scope. Update §11 when a
phase changes; distinguish tested behavior from assumptions about third-party sites.

## 1. Product

Glosswatch adds interactive subtitles to accessible HTML video elements and local
video files. Users provide the video and subtitles. There is no content service,
account system, telemetry, synchronization service, or runtime dictionary download.

## 2. Release scope

The 0.1 release includes the original v1 viewing flow, plus saved-word review, dual
subtitles, five dictionaries, subtitle styling, and text-only ASS/SSA support.
Image subtitle OCR, codec transcoding, CJK dictionaries and native Anki package
export are outside this release. TSV exports can be imported into Anki.

## 3. Architecture

- `src/entrypoints/content.ts` creates the shared `Watch` UI on web pages and frames.
- `src/ui/watch.ts` owns the current video, subtitle tracks, panel, transcript, word
  card and timing. The same component runs in the local player.
- `src/entrypoints/background.ts` routes toolbar actions to the largest reported
  video frame, resolves dictionary requests, and performs IndexedDB writes.
- `player.html` opens local files; `review.html` manages saved words and reviews;
  `about.html` explains usage, privacy and licenses.
- WXT, TypeScript, Vite and `webextension-polyfill` produce Manifest V3 packages for
  Chrome and Firefox. Firefox uses a background script; Chrome uses a service worker.

## 4. Video attachment

Video discovery ranks visible elements by displayed area. A MutationObserver catches
replacements; a periodic scan finds newly attached open shadow roots and changes in
visibility. Users can choose a different video. Embedded frames have their own
content script. Toolbar activation collects frame reports before selecting a target.

The UI lives in a shadow root and follows the video rectangle. In fullscreen it
moves into the fullscreen container. Native video-only fullscreen cannot contain
an overlay: the panel offers a container-fullscreen action. Closed shadow roots,
browser pages and players without accessible HTML video are not supported.

A page can replace its video or change the source on the same element. Track data
is retained; offset settings are looked up again for the new source. Subtitle timing
uses `video.currentTime`, so seeking and playback-speed changes need no separate clock.

## 5. Subtitle parsing and alignment

`src/core/subtitles.ts` handles SRT, WebVTT and the dialogue sections of ASS/SSA.
Styles and markup become plain text. Imported strings are inserted with text nodes,
never as HTML. Invalid timed cues are skipped; a wholly invalid file is rejected
without replacing the currently working track. Image subtitles get a specific error.

UTF-8 and UTF-16 BOMs are handled directly. jschardet detects other encodings; the
panel offers an explicit encoding override. Detection is heuristic, especially on
short files. Imports are limited to 12 MB and parsing yields every 512 work items.

A binary-search index with prefix maximum end times handles overlapping cues and
backward seeks. Translation pairing uses interval overlap relative to the shorter
cue, with a 50% threshold. Uncertain matches display “No matching translation.”
The translation file has an independent offset.

## 6. Storage

`browser.storage.local` holds appearance preferences and numeric offsets. An offset
key includes a SHA-256 hash of the video identity and the subtitle file contents;
raw page URLs are not stored. Local file identity uses name, size and modified time.
Signed or changing media URLs can produce a new identity and therefore a new offset.

Dexie manages the `glosswatch` IndexedDB database in the extension origin. The
background handles writes so content scripts do not store words in site databases.
Cards are unique by language and lemma. Duplicate saves preserve the existing review
schedule. Backup imports validate all cards before an atomic transaction and keep
existing cards. Editing, removal and review grading provide undo.

Review ratings schedule Again after one minute, with Hard/Good/Easy producing day
intervals. The ease factor is bounded. This is a simple local spaced-repetition
scheduler; no cross-device synchronization or statistical learning claims are made.

## 7. Dictionaries

Definitions, IPA where available, and inflections come from the English Wiktionary
via Kaikki/Wiktextract. They are bundled as compressed JSON and opened only when a
language is used. The background retains one language at a time. Each lookup can
resolve a surface form to a base form. Ambiguity and missing words remain possible;
users can save their own meaning and edit saved definitions.

| Language | Definition keys | Inflection mappings |
| --- | ---: | ---: |
| Spanish | 99,587 | 1,067,901 |
| French | 82,817 | 342,229 |
| German | 81,421 | 372,788 |
| Italian | 137,695 | 844,838 |
| Portuguese | 63,490 | 369,040 |

`python scripts/build-dictionary.py es` rebuilds Spanish from the current source.
Pass a second argument to use a saved JSONL or gzip snapshot. Substitute fr/de/it/pt
for the other dictionaries. The compressed payload records the source URL, SHA-256
of the input stream and license. Output keys are sorted and gzip timestamps fixed.
A new upstream snapshot can change the data; review it before committing.

Dictionary data remains CC BY-SA 4.0. The in-app source link points to the original
word page and contributor history. Full attribution and license text ship with the
extension. Listen appears only when an offline system voice is available; no remote
speech service is used.

## 8. Local playback

MP4, WebM and MOV are handed to the browser's native video element. MKV is read by
Mediabunny and copied into fragmented MP4 in origin-private storage. Only the primary
video and audio tracks are used. Copy mode is forced: no hidden transcoding and no
silent loss of a required track. The player checks codec support and free storage,
shows progress, and supports cancellation. It prepares the file before playback.

Media data is read from the File and written in chunks; the whole movie is not
loaded into a JavaScript buffer. Temporary files have cross-tab Web Locks leases.
They are removed on file replacement or leaving the player; startup cleanup removes
abandoned files without deleting a file being used by another player tab.

Supported codecs depend on the browser and operating system. A container change
cannot add an unavailable HEVC decoder or unsupported surround-audio codec. Those
cases show a message rather than attempting an expensive re-encode.

## 9. Verification

- `npm test`: parser recovery, encodings, markup handling, large-file yielding,
  timeline lookup, translation overlap, review scheduling, backup validation, TSV
  sanitization, preference bounds, and Chrome startup configuration.
- `npm run test:browser`: real Chromium extension tests for import, lookup, saved
  words, settings persistence, video replacement, fullscreen, local playback,
  cancellation, temporary-file leases, narrow layout and no external requests.
- `npm run test:firefox`: temporary extension installation in an isolated Firefox
  profile, subtitle import, translation, lookup, IndexedDB review persistence and
  MKV playback. `FIREFOX_PATH` can override the test browser.
- `npm run test:sites`: optional network check against public YouTube and Blender
  PeerTube pages. External sites can change; this is separate from deterministic CI.
- Firefox package validation uses `web-ext lint`. Chrome has its own manifest;
  Firefox-specific lint requirements do not apply to that package.

Browser tests use locally generated ffmpeg fixtures and isolated profiles. Cache,
profiles, media fixtures and screenshots are ignored. `.github/workflows/check.yml`
builds both targets and runs the deterministic checks; no hosted CI run is claimed
until that workflow has actually run on the remote repository.

## 10. Packaging

`npm run zip` and `npm run zip:firefox` produce installable archives in `.output`.
Firefox also gets a source archive. `npm run licenses` refreshes dependency notices
after a dependency update. See RELEASE.md for listing text and submission details.
No publisher account, store listing, store approval, or remote deployment is created
by a local build.

## 11. Current status

### 2026-09-13 — 0.1 implementation

- Phase 1: video selection, replacement detection and shared shadow-root overlay built.
- Phase 2: file import, parsing, encoding override, transcript and persistent timing built.
- Phase 3: Chromium/Firefox integration checks and public YouTube/PeerTube attachment
  checks pass. Private account-gated streaming services have not been tested.
- Phase 4: local native playback and MKV packet-copy playback built and exercised in
  both test browsers. Unsupported codecs and damaged files produce visible errors.
- Phase 5: five bundled dictionaries, inflection lookup, word cards and local-voice
  pronunciation built. Dictionary coverage is not universal.
- Phase 6: saved-word review, search, editing, undo, JSON backups and Anki TSV export built.
- Phase 7: dual tracks, independent offsets and conservative overlap pairing built.
- Phase 8: responsive pages, keyboard-accessible controls, visible errors and scoped
  styles built. Desktop and narrow viewport screenshots are part of browser checks.
- Phase 9: packaging and submission materials prepared; store submission is pending
  publisher access and approval. No store publication is claimed.

The original WASM-remux proposal was replaced with Mediabunny's TypeScript packet-copy
path. Data stays local without adding a WASM runtime or re-encoding step. Large-file
parsing yields between batches. Playback time comes directly from the video element.

### 2026-09-13 — setup maintenance

Fixed missing-Chrome dev startup with `CHROME_PATH`, local binary configuration and a
manual-load fallback. Preserved Firefox startup. Added project icons and metadata,
ignored local environment files, and removed inert setup code. At that point no
product UI existed. That limitation is superseded by the implementation above.

### 2026-09-08 — initial setup

WXT, TypeScript, Manifest V3, the browser polyfill and MIT license were selected.
Both targets built; the original injection smoke check was run in Firefox. Chrome
was unavailable on that setup machine. The old marker-only smoke script has now
been replaced by functional browser integration checks.
