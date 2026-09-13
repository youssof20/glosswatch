# Release 0.1

## Build and check

```sh
npm ci
npm run licenses
npm test
npm run compile
npm run build
npm run build:firefox
npm run test:browsers
npm run test:fixtures
npm run test:browser
npm run test:firefox
npx web-ext lint --source-dir .output/firefox-mv3
npm run zip
npm run zip:firefox
```

Browser fixtures require ffmpeg on PATH. On Linux, `npm run test:browsers --
--with-deps` also installs Playwright's system dependencies. Test profiles and
screenshots go into `.cache/`; they are not part of the extension.

The archives are `.output/glosswatch-0.1.0-chrome.zip` and
`.output/glosswatch-0.1.0-firefox.zip`. Firefox's source archive is produced alongside
them. Load the unpacked builds for development; store installation needs a published,
approved package. No store listing has been submitted yet.

## Listing draft

**Name:** Glosswatch

**Summary:** Learn words from your videos with local subtitles, offline dictionaries,
and saved-word review.

**Description:**

Use your own subtitle files with web videos or local video files. Glosswatch adds a
subtitle layer to accessible video players, with timing controls and word lookup.

Load SRT, VTT, ASS or SSA subtitles. Change the file, adjust its timing, or add a
second subtitle track for translation. Hover over a word to see an offline English
definition for Spanish, French, German, Italian or Portuguese. Save the word with
its original line, then review it in your saved-word collection.

The local player opens MP4, WebM and MOV. It can prepare MKV files without
re-encoding when their video and audio codecs are supported by your browser.

There are no accounts, ads, tracking, subscriptions or uploads. Settings and saved
words stay on your device. Export a JSON backup or a text file for Anki at any time.

Glosswatch does not supply videos or subtitles. Browser-only pages, closed players,
image subtitles and unsupported media codecs cannot be handled. Use the panel's
Full screen control to keep subtitles visible in fullscreen.

## Permissions and privacy

Content scripts run on web pages and frames to locate video elements and attach the
subtitle UI. Active-tab access lets the toolbar control the current page and show
file-access or restricted-page guidance. Storage access saves settings and words.

No browsing content, videos, subtitles or vocabulary are uploaded. Dictionary data
ships with the package. Pronunciation uses an offline system voice when one exists.
The only external links in the product are user-opened source and license pages.
Uninstalling removes extension settings and saved words; export a backup first.

The same privacy explanation ships on `about.html`. Publisher contact information,
the hosted privacy-policy URL, and store screenshots must be supplied when the
publisher creates the listing. Test screenshots under `.cache/screenshots` are QA
evidence, not a claim of store approval.

## Submission status

Local packages and this listing draft are prepared. Chrome Web Store and Firefox
Add-ons submission require publisher account access and the publisher's approval.
No store fees, account changes, submissions or publication have been performed.
