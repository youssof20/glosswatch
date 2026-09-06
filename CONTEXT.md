# Glosswatch — Master Context

> **Read this whole file before writing any code.** This is the single source of truth for
> the project: what it is, why it's built this way, the architecture, the stack, the exact
> user flow, the feature/polish bar, the edge cases to defend against, and the phased plan.
>
> **Rule for Cursor:** after finishing each phase in "Build Phases" below, update the
> **"Current Status"** section at the very bottom of this file — mark the phase done, note
> what was actually built vs. planned, and list any deviations or new edge cases discovered.
> Do this before starting the next phase. This file is meant to stay perpetually current.

---

## 1. What this is

**Glosswatch** is a free, open-source browser extension that turns *any* video —
a show you're streaming on Netflix/YouTube/Prime/whatever, or a movie file sitting on
your hard drive — into an interactive language-learning session, using subtitle files
you already have or can find.

One-line pitch: **Lingopie's clickable-subtitle experience, without the content library,
the subscription, or the server.**

### Why it can be free forever
Everything runs **entirely client-side, in the browser, on the user's machine.**
No backend, no database, no API calls to us, no hosting bill that scales with users.
The only "cost" is the one-time Chrome Web Store developer fee (~$5) and Firefox is free.
This is a hard constraint on every architecture decision below — if a feature idea
requires a server, it gets redesigned or cut.

### What we are NOT doing
- Not hosting, storing, or distributing any copyrighted video or subtitle content.
  The user always supplies their own subtitle file (downloaded from OpenSubtitles,
  Subscene, etc. themselves) or their own video (their own streaming account, their
  own downloaded file). We are a **display/interaction layer only**. This is the exact
  legal posture Substital already operates under successfully.
- Not building a companion "content library." No licensing, no rights deals, ever.
- Not gating features behind a paywall. No premium tier. Free/open-source means
  everything, not a crippled free trial.

---

## 2. Competitive landscape (why we're building this, specifically)

**Lingopie** — paid ($6–14/mo), closed content library, clickable dual subtitles,
flashcards, pronunciation coach, quizzes. Strong product, but you're paying for a
curated Netflix-style catalog you don't need if you already have something to watch.

**Substital** — free, donation-funded, browser extension, injects a subtitle overlay
onto any site's `<video>` element, lets users search OpenSubtitles or upload their own
file. This proves the "extension overlay on arbitrary video" model works and is legally
fine. It has ~300K installs and a 4.3★ rating, but real, recurring complaints:

| Substital complaint (from Chrome/Firefox store reviews) | Our answer |
|---|---|
| Sync is unreliable; subtitles ahead/behind ~1 in 5 times; controls are fiddly and imprecise | Rebuild sync as a **precise, persistent, per-file offset** with live preview, saved automatically per video+subtitle pair, no re-fiddling every session |
| "After clicking anything, no subtitles for a few seconds" | Overlay must be resilient to player DOM re-renders (SPA route changes, ad breaks, fullscreen toggles) — re-attach automatically, no visible gap |
| No way to swap the subtitle file without starting over | One-click "Change subtitle" in the same panel, at any time, no reset of progress/settings |
| Firefox version buggy/inconsistent vs. Chrome | Build against `webextension-polyfill` from day one, test both browsers every phase, not "port to Firefox later" |
| Non-intuitive UI, settings icon hard to find/use | Single persistent, obvious control button anchored to the video, opens one panel, not buried menus |
| Breaks on major platforms (Netflix, Prime, HBO Max, Twitch) | Treat "find the video element reliably" as a first-class, tested problem per platform, not an afterthought |
| Restrictive free tier, one report of spam popups/tracking | No tiers. No popups. No tracking. Minimal permissions, and we say so explicitly in the store listing to build trust |
| Style/font customization "doesn't work" | Keep the style panel small and test it, rather than over-scoping options that half-work |

The dictionary/hover/click/flashcard layer — the actual language-learning part — is
something **neither product does well as an open, inspectable tool.** That's our wedge.

---

## 3. High-level architecture

**One deliverable: a single browser extension (Manifest V3), for Chrome and Firefox.**

```
┌─────────────────────────────────────────────────────────────┐
│                        Glosswatch Extension                  │
│                                                               │
│  ┌───────────────┐   ┌──────────────────┐   ┌─────────────┐ │
│  │ Content Script │   │  Background /    │   │  Extension- │ │
│  │  (injected on  │←→│  Service Worker   │←→│  hosted Local│ │
│  │  every page)   │   │  (state, storage, │   │  Player page│ │
│  │                │   │  cross-tab sync)  │   │  (for local  │ │
│  └───────┬───────┘   └──────────────────┘   │  .mkv files) │ │
│          │                                    └─────────────┘ │
│          ▼                                                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              CORE ENGINE (shared TS library)          │   │
│  │  - Subtitle parser (.srt/.vtt/.ass)                   │   │
│  │  - Charset detection + normalization                  │   │
│  │  - Dual-subtitle time alignment                       │   │
│  │  - Tokenizer/segmenter (per language)                 │   │
│  │  - Dictionary lookup (bundled data, per language)     │   │
│  │  - Overlay UI (subtitle render, hover/click card)     │   │
│  │  - Flashcard/SRS engine (IndexedDB)                   │   │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

**Why one extension covers both use cases (streaming AND local files):**
A content script can attach to *any* tab, including a `file://` tab, as long as the
user grants "allow access to file URLs" (a standard one-time toggle in the extension's
settings page — we'll prompt for this contextually, only when needed). So:

- **Streaming site** (Netflix, YouTube, etc.): user is already on the tab, clicks the
  Glosswatch toolbar icon, picks a subtitle file. Content script finds the page's
  `<video>` element and overlays it. Exactly Substital's model.
- **Local video file**: user drags the file into a new browser tab (or File → Open File),
  which for `.mp4`/`.webm` just works natively in Chrome/Firefox's built-in `<video>`
  rendering of `file://` URLs — same content script attaches the same way.
- **Local `.mkv` file** (very common for downloaded/torrented content, and NOT natively
  playable via a bare `<video>` tag in any major browser): the extension detects this
  case and offers to open the file in its **bundled internal player page**
  (`chrome-extension://.../player.html`), which uses a WASM remuxer (not a transcode —
  see §6) to repackage the MKV's H.264/AAC streams into fragmented MP4 that plays
  natively, then attaches the same overlay. This is still just one extension; the
  player page ships inside the `.zip`, nothing is hosted externally.

No separate web app to build, deploy, or maintain. No second codebase, no second URL
for users to remember, no "wait, do I need the extension or the website?" confusion.

---

## 4. The user flow (must be frictionless — this is the whole game)

Every extra click, every screen that isn't obvious, is a reason someone bounces.
Design target: **from "I want to do this" to "subtitles are clickable" in under 15
seconds, with zero configuration screens.**

### Flow A — streaming a show
1. User is watching something (Netflix, YouTube, whatever) in a normal tab.
2. Clicks the Glosswatch icon in the toolbar. A small panel opens, anchored near the
   video, not a separate popup window disconnected from what they're looking at.
3. Panel has exactly one primary action visible: **"Add subtitles"** → opens a file
   picker (drag-and-drop also works, drop the `.srt` right onto the video).
4. The moment a file is dropped, subtitles appear on the video immediately, styled
   sensibly by default (no configuration required to get a good-looking result).
5. A small, persistent, unobtrusive control tab stays anchored to a video corner
   (not a floating icon that gets lost) with three things always one click away:
   **Sync offset**, **Change subtitle**, **Learning language toggle** (if a word is
   clickable, i.e. we have dictionary data for this language).
6. Hovering (desktop) or tapping (touch) a word shows a small card: base-form meaning,
   pronunciation, and an "add to flashcards" button. Clicking a card option doesn't
   pause or disrupt playback.

### Flow B — a downloaded movie file
1. User drags their `.mp4`/`.mkv` file into a new browser tab, or opens it via
   File → Open File.
2. If it's `.mp4`/`.webm`: plays immediately, same as Flow A from step 3 onward.
3. If it's `.mkv` (or another unsupported container): Glosswatch detects the failed
   native playback and shows a one-click **"Open in Glosswatch Player"** prompt
   instead of a confusing browser error. That opens the bundled player page, which
   remuxes and plays it, then proceeds identically to Flow A.
4. Same subtitle drop, same overlay, same everything from here on — **the user should
   never consciously notice they're in a "different mode."**

### Flow C — dual subtitles (target language + native language)
1. After adding the first subtitle file, the panel offers **"+ Add translation
   subtitle"** as a secondary, clearly optional action — never forced, never blocking
   the primary flow.
2. Second file gets aligned against the first automatically (see §6 alignment
   algorithm). If alignment confidence is low for a chunk, we silently fall back to
   showing that chunk un-aligned rather than showing visibly wrong pairings — a
   quietly-imperfect experience beats a confidently-wrong one.

### Non-negotiable UX rules
- Never require an account, sign-in, or email.
- Never show an ad, a popup, or a cross-sell.
- Every setting has a sane default; nothing requires configuration to get first value.
- Every action is reversible/undoable in one click (wrong subtitle file, wrong sync,
  wrong language).
- The extension must degrade gracefully and say what's wrong in plain language
  ("Couldn't find a video on this page" / "This subtitle file looks corrupted") —
  never fail silently, never show a raw stack trace.

---

## 5. Feature set (v1 scope vs. later)

### v1 (ship this first, nail it before adding more)
- Subtitle overlay on any page's `<video>` element (streaming + local file flows)
- `.srt` and `.vtt` parsing (the two most common formats by far)
- Charset auto-detection (UTF-8, Windows-1252, etc.)
- Precise, persistent sync offset control (see §6)
- One-click subtitle file swap
- Word tokenization + hover/click dictionary card for **one pilot language pair**
  (recommend: Spanish→English, since tooling is simplest and the userbase is huge)
- Local flashcard capture (click "save," it's stored) — review UI can come in v1.5
- MKV fallback player page
- Chrome + Firefox builds from one codebase

### v1.5
- Full spaced-repetition flashcard review screen (local, IndexedDB-based)
- Dual-subtitle alignment (target + native language shown together)
- 3–4 more space-delimited languages (French, German, Italian, Portuguese) — these
  reuse the same tokenizer approach, just swap dictionary data
- Subtitle style customization (font size/color/background/position) — done narrowly
  and tested, learning from Substital's "doesn't work" complaints

### v2+
- Japanese (Kuromoji + JMdict) — first CJK language, well-documented path
- Chinese (jieba + CC-CEDICT)
- Playback-speed-aware subtitle timing (explicitly missing in Substital)
- Export flashcards to Anki (`.apkg`) — still zero-server, just a file export
- Korean, Hebrew (harder tokenization/RTL — treat as stretch goals, see §2 table)

---

## 6. The hard technical problems, solved

### 6.1 Reliable video-element detection across sites
Different sites structure their player DOM differently, use custom controls, and some
re-render the `<video>` element on route changes (SPA behavior — Netflix, YouTube are
both SPAs). Approach:
- On injection, run a `MutationObserver` on `document.body` watching for `<video>`
  nodes being added/removed, not a one-time `querySelector`.
- If a `<video>` element is replaced (same page, new element — happens on ad breaks,
  quality switches, or SPA navigation within the same site), re-attach the overlay to
  the new element automatically, without user action. This is the direct fix for the
  "no subtitles for a few seconds after clicking anything" complaint.
- If a page has multiple `<video>` elements (rare but possible — embedded previews,
  autoplaying ads), heuristically pick the largest visible one, and let the user
  override via the panel ("pick a different video on this page") if we guess wrong.

### 6.2 Sync offset — the #1 thing to get right
- Offset is stored **per (video source + subtitle file) pair**, not globally and not
  per-session — once a user finds the right offset for a specific file, it's
  remembered automatically next time (`chrome.storage.local`, keyed by a hash of the
  subtitle filename + page URL/local file name).
- Offer both a coarse slider (±10s) and a precise numeric input (type an exact value,
  e.g. `-1.240`), because Substital's slider-only approach was a specific complaint.
- Live preview: as the user drags the slider, subtitle timing updates in real time
  under the video — no "apply" button, no lag.
- A visible current-offset readout at all times when the panel is open, so the user
  always knows what's applied.

### 6.3 Subtitle parsing & charset handling
- `.srt`: simple format but wildly inconsistent about line endings, encoding, and
  malformed timestamp lines in the wild (files scraped from old sites) — parser needs
  to be lenient and skip/recover from malformed blocks rather than failing the whole
  file.
- `.vtt`: stricter, easier, mostly a straightforward WebVTT parse.
- `.ass`/`.ssa` (anime fansubs): defer to v1.5+, more complex (embedded styling tags,
  positioning) — worth supporting eventually since anime is a huge language-learning
  use case, but don't block v1 on it.
- Always run charset detection (e.g. `jschardet` or `chardet`-style heuristic) before
  decoding text — a large fraction of older subtitle files are Windows-1252 or
  ISO-8859-1, not UTF-8, and decoding them as UTF-8 produces garbled text
  ("mojibake") silently, which is a bad, confusing failure mode if not caught.
- Detect and explicitly reject image-based subtitle formats (`.sub`/`.idx` — VobSub)
  with a clear message ("this is an image-based subtitle, please find a text-based
  one") rather than failing mysteriously — OCR is out of scope.

### 6.4 Dual-subtitle time alignment
Two subtitle files for the "same" video (e.g. a Spanish `.srt` and an English `.srt`)
are very often from *different uploaders/releases* and do not line up 1:1 by index —
one translator merges two lines into one subtitle block, another splits them. A pure
global time-offset correction does not fix this.

Approach: align by **timestamp interval overlap**, not by line index —
for each subtitle block in file A, find the block(s) in file B whose time ranges
overlap it, weighted by overlap duration (this is the same family of technique as
Gale–Church sentence alignment in machine translation corpora). Where overlap
confidence is low (e.g. no meaningful overlap found, or multiple ambiguous
candidates), don't force a pairing — show that segment's translation as unavailable
rather than guessing wrong. This is worth **prototyping early, in isolation, before
UI work** — it's the single biggest technical risk in the whole project, more so than
the dictionary or tokenization work.

### 6.5 MKV playback without a server
Browsers natively decode MP4 (H.264/H.265 depending on browser) and WebM, but reject
`.mkv` outright via a plain `<video src>`. The fix is **remuxing, not transcoding**:
the actual H.264/AAC (or similar) elementary streams inside an MKV are usually
directly compatible with what the browser can decode — only the *container* format
(Matroska vs. MP4) is the problem. A WASM-based remuxer (e.g. `libav.js` compiled
for demux-only use, or `mp4box.js` for the MP4 side) can restructure the stream into
fragmented MP4 in the browser, in real time, with far less CPU cost than a full
re-encode. Flag to the user up front: HEVC-encoded content may still not decode on
all browsers (Chrome/Firefox HEVC support is inconsistent) — surface a clear message
rather than a silent black screen.

### 6.6 Tokenization & dictionary, by language (see also §2 table)
- **Space-delimited languages (Spanish, French, German, Italian, Portuguese, Dutch,
  Russian, Polish, Turkish, Greek):** tokenize on whitespace/punctuation; still need
  **lemmatization** (mapping "corriendo" → "correr") since dictionaries are keyed by
  base form — use a lemma-lookup table (e.g. derived from Wiktextract/Unimorph data)
  rather than attempting live morphological generation.
- **Dictionary data source:** Wiktextract / kaikki.org JSON dumps (structured,
  machine-readable extractions of Wiktionary, free, one dump per language, no API
  calls needed — bundle a filtered/compressed subset per supported language).
- **Pronunciation:** IPA transcriptions are often already present in Wiktextract
  entries; where missing, `espeak-ng` compiled to WASM can generate IPA/audio fully
  offline as a fallback, no server round-trip.
- **Japanese (v2):** Kuromoji (JS port of MeCab) for segmentation, JMdict for
  definitions — this is a mature, well-documented combination other open-source
  tools already use successfully.
- **Chinese (v2):** a JS/WASM jieba port for segmentation, CC-CEDICT for definitions
  (pinyin comes bundled in CC-CEDICT entries).
- Bundle dictionary data **inside the extension package**, don't fetch it from a
  server at runtime — keeps the zero-infrastructure promise intact, at the cost of
  a larger initial extension download size (acceptable trade-off; compress well).

### 6.7 Grammar/nuance — don't over-engineer this
Never present a literal word-by-word gloss as "the translation" of a line — that's
how you actively teach people wrong grammar. Primary translation shown is always the
*original human-translated subtitle line, verbatim*. Word-level click/hover meaning
is clearly a secondary, vocabulary-building action, visually distinct from the line
translation (e.g. smaller card, labeled "word meaning" not "translation").

---

## 7. Tech stack

- **Language:** TypeScript throughout — extension code and the shared core engine.
- **Extension framework:** Manifest V3, built with `CRXJS` (Vite plugin) or
  `WXT` (either is fine — WXT has better multi-browser output out of the box, which
  matters given the Firefox-parity goal; pick one at Phase 0 and don't revisit).
- **Cross-browser compatibility:** `webextension-polyfill` from day one — do not
  write Chrome-only `chrome.*` calls and "port to Firefox later."
- **Subtitle parsing:** hand-rolled lenient parser for `.srt`/`.vtt` (small, so worth
  owning directly rather than pulling in a heavier library with assumptions we don't
  want) — .ass parsing can use an existing library later (v1.5+).
- **Charset detection:** a small heuristic library (e.g. a JS port of `chardet`).
- **MKV remux:** `libav.js` (WASM build of ffmpeg's libav libraries, demux-only
  usage) or `mp4box.js` for the MP4 packaging side — evaluate both at Phase 4, pick
  based on bundle size and remux latency.
- **Dictionary data:** pre-processed, compressed JSON derived from Wiktextract/
  kaikki.org dumps, bundled as static extension assets, loaded lazily per selected
  learning language (don't load all languages' data at once).
- **Local storage:** `chrome.storage.local` for settings/offsets (small data),
  `IndexedDB` (via `Dexie.js` for a friendlier API) for flashcards/SRS state (larger,
  structured data).
- **UI:** plain TypeScript + a lightweight component approach (Preact is a good fit
  for extension content-script UI — small bundle size matters since this code injects
  into every page the user visits). Avoid full React in the content script if bundle
  size becomes a concern; the background/options pages can be more liberal.
- **Testing:** manual cross-browser (Chrome + Firefox) testing checklist per phase,
  plus unit tests for the subtitle parser and alignment algorithm specifically,
  since those are the highest-risk, most "silently wrong" pieces of logic.

---

## 8. Edge cases & error handling checklist

Treat this as a running checklist — add to it as new cases are discovered during
build (and log discoveries in the Current Status section at the bottom).

- [ ] Subtitle file with non-UTF-8 encoding → detect and decode correctly, don't
      silently show mojibake
- [ ] Subtitle file with malformed/missing timestamp lines → skip that block, keep
      parsing the rest, don't fail the whole file
- [ ] Image-based subtitle format (`.sub`/`.idx`) uploaded → clear rejection message,
      not a silent failure or crash
- [ ] `.mkv` file with HEVC video → clear message about limited browser support,
      not a black screen
- [ ] Page has zero `<video>` elements when the user opens the panel → clear "no
      video found on this page" message, not a broken/empty panel
- [ ] Page has multiple `<video>` elements → pick the largest visible one by default,
      offer manual override
- [ ] `<video>` element gets replaced by the page (SPA navigation, ad break, quality
      switch) → re-attach automatically, no visible subtitle gap
- [ ] Two subtitle files for dual-mode with low alignment confidence in places →
      don't force wrong pairings, gracefully show as unavailable for that segment
- [ ] User picks a subtitle file in a language we don't have dictionary data for →
      subtitles still display and are readable, just not clickable — communicate this
      plainly rather than pretending the feature exists
- [ ] Very long video (movie-length) with a large subtitle file → parse
      incrementally/lazily, don't block the main thread on load
- [ ] User on a slow machine — dictionary lookups and tokenization should not cause
      jank during video playback; do this work off the render path
- [ ] Full-screen mode → overlay and control panel must still render correctly and
      remain reachable (this is a common place overlays break)
- [ ] DRM-protected native players that render video via a protected pipeline the
      DOM can't fully see (rare but exists on some sites) → detect this failure mode
      and say so, rather than a mysterious blank overlay

---

## 9. Open-source & distribution plan

- License: MIT.
- Public repo from day one, even during early build — README states clearly what it
  is, what it isn't (no content library, no accounts, no tracking), and links to this
  CONTEXT.md as the design doc for contributors.
- No monetization beyond an optional "buy me a coffee"/GitHub Sponsors link — same
  model Substital already runs successfully, validating that this is viable without
  a subscription.
- Chrome Web Store + Firefox Add-ons listing, both built from the same source via the
  chosen multi-browser build tool.
- Store listing copy should explicitly state the minimal-permissions, no-tracking
  stance up front — this directly counters the one damaging "tracks shopping
  activity/spam popups" complaint pattern seen on Substital's listing, and builds
  trust from the first impression.

---

## 10. Build Phases

Work through these in order. Each phase should end in something runnable/testable,
not just code that compiles. **Update §11 (Current Status) after each phase.**

### Phase 0 — Project setup
- Choose and scaffold the extension build tool (WXT recommended) with Manifest V3,
  TypeScript, `webextension-polyfill`.
- Set up the repo, license, README, this CONTEXT.md checked in at the root.
- Confirm a "hello world" content script injects and logs on an arbitrary page in
  both Chrome and Firefox (load unpacked / temporary add-on).

### Phase 1 — Video detection & basic overlay
- Implement the `MutationObserver`-based video detection from §6.1.
- Render a simple, styled subtitle line (hardcoded test text) positioned correctly
  over the detected video, in both a normal site and a `file://` tab.
- Handle the "video element replaced" re-attachment case.
- Handle full-screen mode correctly.

### Phase 2 — Subtitle parsing & file input
- Build the lenient `.srt`/`.vtt` parser with charset detection (§6.3).
- Wire up drag-and-drop and file-picker input in the panel UI.
- Render real parsed subtitles, timed against `video.currentTime`.
- Implement the sync offset control (§6.2) — coarse slider + precise numeric input,
  persisted per (video source + subtitle file) pair.
- Implement one-click "change subtitle file."

### Phase 3 — Cross-site & cross-browser hardening
- Test against a representative set of real sites (YouTube, and at least one SPA
  streaming-style site) and fix video-detection or overlay-positioning breakage.
- Full Firefox parity pass — do not defer this to "later."
- Build out the error-handling/edge-case checklist in §8 for everything covered so
  far (parsing failures, no-video-found, multiple videos, DRM detection).

### Phase 4 — Local file playback, including MKV
- Confirm native `file://` `.mp4`/`.webm` playback works with the existing overlay
  (should mostly just work given Phase 1–3).
- Build the bundled internal player page for `.mkv` using the remux approach (§6.5).
- Detect failed native playback and prompt the user into the fallback player
  smoothly (§4, Flow B).

### Phase 5 — Dictionary layer, pilot language (Spanish)
- Process a Wiktextract/kaikki.org dump for Spanish into a compact bundled dataset.
- Implement tokenization + lemmatization for Spanish.
- Implement the hover/click word card UI (meaning, pronunciation, "save" button).
- This phase is the template for every future language — document the pipeline
  clearly (data processing script, format, integration points) so adding French/
  German/Italian/Portuguese later is mostly data-swapping, not new engineering.

### Phase 6 — Flashcards / local review
- IndexedDB (via Dexie.js) schema for saved words.
- Basic review UI (even a simple SRS scheduling algorithm — e.g. a simplified
  SM-2 — is fine for v1.5; don't over-build this initially).

### Phase 7 — Dual subtitles & alignment
- Implement the timestamp-overlap alignment algorithm from §6.4 as an isolated,
  unit-testable module first, before wiring it into the UI.
- Wire up the "+ Add translation subtitle" secondary flow (§4, Flow C).
- Handle and visibly communicate low-confidence alignment segments gracefully.

### Phase 8 — Polish pass
- Full pass against the §4 "non-negotiable UX rules" and the §2 complaint-response
  table — verify each Substital complaint has a concretely better answer in our build.
- Visual/styling pass on the overlay, panel, and word cards.
- Subtitle style customization (font/size/color/position) — keep scope narrow, test
  thoroughly rather than shipping half-working options.

### Phase 9 — Store submission
- Write store listings emphasizing the minimal-permissions/no-tracking stance.
- Submit to Chrome Web Store and Firefox Add-ons.
- Publish the public repo README/docs for contributors.

### Later (v2+, not blocking initial ship)
- Japanese (Kuromoji + JMdict), Chinese (jieba + CC-CEDICT)
- Playback-speed-aware subtitle timing
- Anki export
- `.ass`/`.ssa` subtitle format support
- Korean, Hebrew

---

## 11. Current Status

> **Cursor: update this section after completing each phase.** State which phase is
> done, what was actually built (vs. what was planned above, if it diverged), and any
> new edge cases or decisions discovered along the way. Keep old entries below new
> ones so this reads as a running log.

- **Phase 0:** Not started.
