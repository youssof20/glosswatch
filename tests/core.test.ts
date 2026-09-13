import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CueIndex, alignTranslation, decodeSubtitle, parseSubtitles, plainText, readSubtitles, timestamp } from '../src/core/subtitles';
import { schedule, validCard, exportTsv, type Card } from '../src/core/review';
import { preferences } from '../src/core/settings';

test('SRT recovers malformed cues, handles CRLF and sorts timestamps', () => {
  const result = parseSubtitles('1\r\n00:00:03,000 --> 00:00:05,000\r\n<b>Later</b>\r\n\r\n2\r\ninvalid --> 00:00:03,000\r\nBad\r\n\r\n3\r\n00:00:01,000 --> 00:00:02,500\r\nHola &amp; mundo');
  assert.deepEqual(result.cues, [{ start: 1, end: 2.5, text: 'Hola & mundo' }, { start: 3, end: 5, text: 'Later' }]);
  assert.equal(result.warnings.length, 1);
});
test('VTT handles cue identifiers, settings and ignores metadata blocks', () => {
  const result = parseSubtitles('WEBVTT\n\nNOTE metadata\n00:00.000 --> 00:10.000\nignored\n\nSTYLE\n::cue {color:red}\n\nid\n00:01.200 --> 00:02.500 align:start\n<v Ana>Hola</v>\nsegunda línea', 'a.vtt');
  assert.deepEqual(result.cues, [{ start: 1.2, end: 2.5, text: 'Hola\nsegunda línea' }]);
});
test('ASS preserves dialogue commas and removes override styling', () => {
  const result = parseSubtitles('[Events]\nFormat: Layer, Start, End, Style, Text\nDialogue: 0,0:00:01.25,0:00:04.50,Default,{\\i1}Hola, mundo\\N¿Cómo estás?', 'a.ass');
  assert.deepEqual(result.cues, [{ start: 1.25, end: 4.5, text: 'Hola, mundo\n¿Cómo estás?' }]);
});
test('empty, image-only and invalid timestamp files fail with usable messages', () => {
  assert.throws(() => parseSubtitles('nothing'), /No readable subtitles/);
  assert.throws(() => parseSubtitles('anything', 'test.idx'), /Image subtitles/);
  assert.ok(Number.isNaN(timestamp('00:61:00.000')));
  assert.ok(Number.isNaN(timestamp('-01:00.000')));
  assert.equal(timestamp('02:03:04,05'), 7384.05);
});
test('no blank lines between numbered cues do not lose subtitles', () => {
  const result = parseSubtitles('1\n00:00:01,000 --> 00:00:02,000\nOne\n2\n00:00:02,000 --> 00:00:03,000\nTwo');
  assert.equal(result.cues.length, 2); assert.equal(result.cues[0]?.text, 'One');
});
test('subtitle text removes markup without interpreting content', () => {
  assert.equal(plainText('<img src=x onerror=alert(1)>Hola &lt;script&gt; &#x1f30d;'), 'Hola <script> 🌍');
});
test('decoding supports UTF-8, UTF-16 BOM and explicit legacy encoding', () => {
  assert.equal(decodeSubtitle(new TextEncoder().encode('¿Cómo estás?')).text, '¿Cómo estás?');
  assert.equal(decodeSubtitle(new Uint8Array([255,254,72,0,105,0])).text, 'Hi');
  assert.equal(decodeSubtitle(new Uint8Array([99,97,102,233]), 'windows-1252').text, 'café');
});
test('large subtitle imports yield to the event loop and retain all cues', async () => {
  const source = Array.from({ length: 4000 }, (_, i) => `${i + 1}\n00:00:01,000 --> 00:00:02,000\nLine ${i}\n`).join('\n');
  let ticks = 0; const timer = setInterval(() => ticks++, 1);
  try {
    const track = await readSubtitles(new File([source], 'large.srt'));
    assert.equal(track.cues.length, 4000); assert.ok(ticks >= 2); assert.equal(track.hash.length, 64);
  } finally { clearInterval(timer); }
});
test('oversized subtitle files fail before decoding', async () => {
  await assert.rejects(readSubtitles(new File([new Uint8Array(12 * 1024 * 1024 + 1)], 'large.srt')), /larger than 12 MB/);
});
test('cue index returns overlapping lines, excludes end boundaries, handles seeking', () => {
  const cues = [{ start: 0, end: 20, text: 'long' }, { start: 1, end: 2, text: 'short' }, { start: 3, end: 5, text: 'next' }];
  const index = new CueIndex(cues);
  assert.deepEqual(index.at(4).map(c => c.text), ['long','next']);
  assert.deepEqual(index.at(2).map(c => c.text), ['long']);
  assert.deepEqual(index.at(1.5).map(c => c.text), ['long','short']);
  assert.deepEqual(index.at(20), []);
});
test('translation alignment supports merged cues and rejects weak overlap', () => {
  const cue = { start: 1, end: 5, text: 'target' };
  assert.equal(alignTranslation(cue, [{ start: 1, end: 3, text: 'A' }, { start: 3, end: 5, text: 'B' }]), 'A\nB');
  assert.equal(alignTranslation(cue, [{ start: 4.9, end: 8, text: 'wrong' }]), '');
});
const card: Card = { id: 'es:hola', word: 'Hola', lemma: 'hola', language: 'es', meaning: 'hello', ipa: '', sentence: 'Hola mundo', translation: '', source: 'movie.srt', created: 0, due: 0, interval: 0, ease: 2.5, reviews: 0 };
test('review scheduling persists independent intervals and immediate retry', () => {
  assert.equal(schedule(card, 'again', 1000).due, 61000);
  const first = schedule(card, 'good', 0);
  assert.equal(first.interval, 1); assert.equal(first.due, 86400000);
  assert.equal(schedule(first, 'easy', first.due).interval, 3);
  assert.equal(card.reviews, 0);
});
test('imports reject malformed schedules before database mutation', () => {
  assert.equal(validCard(card), true);
  assert.equal(validCard({ ...card, due: Infinity }), false);
  assert.equal(validCard({ ...card, interval: -2 }), false);
  assert.equal(validCard({ ...card, meaning: null }), false);
});
test('TSV export neutralizes spreadsheet formulas and line separators', () => {
  const output = exportTsv([{ ...card, word: '=SUM(A1)', sentence: 'a\tb\nc' }]);
  assert.match(output, /'=SUM/); assert.match(output, /a b c/);
});
test('stored appearance values are bounded and validated', () => {
  const value = preferences({ fontSize: 10000, opacity: NaN, bottom: -100, color: 'url(x)', language: 'invalid' });
  assert.equal(value.fontSize, 56); assert.equal(value.opacity, .78); assert.equal(value.bottom, 5); assert.equal(value.color, '#ffffff'); assert.equal(value.language, 'es');
});
