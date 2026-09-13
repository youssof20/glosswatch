import { browser } from 'wxt/browser';
import { CueIndex, alignTranslation, readSubtitles, type SubtitleTrack } from '../core/subtitles';
import { findVideos, observeVideos } from '../core/videos';
import { defaults, preferences, videoKey, type Preferences } from '../core/settings';
import { request, message } from '../core/client';
import { languages, type Definition } from '../core/dictionary';
import type { Card } from '../core/review';
import { button, element, select } from './dom';
import styles from './watch.css?inline';

export class Watch {
  readonly host = document.createElement('glosswatch-ui');
  readonly root = this.host.attachShadow({ mode: 'open' });
  private video?: HTMLVideoElement;
  private videos: HTMLVideoElement[] = [];
  private primary?: SubtitleTrack;
  private secondary?: SubtitleTrack;
  private mainIndex = new CueIndex([]);
  private secondIndex = new CueIndex([]);
  private prefs: Preferences = { ...defaults };
  private offset = 0;
  private secondOffset = 0;
  private settingsKey = '';
  private loadId = 0;
  private secondLoadId = 0;
  private wordId = 0;
  private lastText = '';
  private caption = '';
  private translation = '';
  private alive = true;
  private frame = 0;
  private lastPosition = 0;
  private files: { main?: File; second?: File } = {};
  private cleanups: (() => void)[] = [];
  private resize = new ResizeObserver(() => this.position());
  private sourceIdentity = '';
  private hoverTimer?: ReturnType<typeof setTimeout>;
  private panel: HTMLElement;
  private anchor: HTMLElement;
  private card: HTMLElement;
  private subtitle: HTMLElement;
  private mainLine: HTMLElement;
  private secondLine: HTMLElement;
  private toggleButton: HTMLButtonElement;
  private manualVideo = false;

  constructor() {
    const style = element('style'); style.textContent = styles;
    this.root.append(style);
    const body = element('div');
    body.innerHTML = `
      <div class="anchor">
        <button class="toggle" aria-label="Open Glosswatch" aria-expanded="false">Glosswatch</button>
        <section class="panel" aria-label="Glosswatch controls" hidden>
          <header><h2>Subtitles</h2><button class="quiet close" aria-label="Close subtitles panel">×</button></header>
          <p class="message" role="status" aria-live="polite" hidden></p>
          <div class="section stack">
            <p class="video-status muted"></p>
            <label class="video-picker" hidden>Video on this page<select aria-label="Video on this page"></select></label>
            <p class="file-name" hidden></p>
            <div class="row"><button class="primary add">Add subtitles</button><button class="remove quiet" hidden>Remove</button></div>
            <input class="file main-file" type="file" accept=".srt,.vtt,.ass,.ssa,.sub,.idx" aria-label="Subtitle file" hidden>
            <p class="hint">SRT, VTT, ASS or SSA. You can also drop a file onto the video.</p>
          </div>
          <div class="section main-settings stack" hidden>
            <div class="row"><label for="gw-offset">Timing offset</label><div><input id="gw-offset" type="number" step="0.05" min="-3600" max="3600" value="0" aria-label="Timing offset in seconds"> s</div></div>
            <input class="offset-slider" type="range" min="-10" max="10" step="0.05" value="0" aria-label="Timing offset slider">
            <div class="row muted"><span>Earlier</span><button class="quiet reset-offset">Reset timing</button><span>Later</span></div>
            <label><input class="visible" type="checkbox" checked> Show subtitles</label>
            <label>Word meanings<select class="language" aria-label="Word meanings"><option value="es">Spanish → English</option><option value="fr">French → English</option><option value="de">German → English</option><option value="it">Italian → English</option><option value="pt">Portuguese → English</option><option value="off">Off — subtitles only</option></select></label>
            <div class="row"><button class="add-translation quiet">Add translation subtitle</button><button class="remove-translation quiet" hidden>Remove</button></div>
            <input class="file second-file" type="file" accept=".srt,.vtt,.ass,.ssa,.sub,.idx" aria-label="Translation subtitle file" hidden>
            <div class="translation-settings stack" hidden>
              <p class="translation-name muted"></p>
              <label class="row">Translation offset (s)<input class="translation-offset" type="number" min="-3600" max="3600" step="0.05" value="0"></label>
              <label><input class="show-translation" type="checkbox" checked> Show translation</label>
            </div>
          </div>
          <div class="section main-settings" hidden>
            <details><summary>Appearance & text</summary><div class="stack">
              <label class="row">Text size<input class="font-size" type="range" min="16" max="56" value="28" aria-label="Text size"></label>
              <label class="row">Text color<input class="text-color" type="color" value="#ffffff" aria-label="Text color"></label>
              <label class="row">Background<input class="opacity" type="range" min="0" max="1" step="0.05" value="0.78" aria-label="Background opacity"></label>
              <label class="row">Height<input class="bottom" type="range" min="5" max="45" value="12" aria-label="Subtitle height"></label>
              <label>File encoding<select class="encoding"><option value="auto">Detect automatically</option><option value="utf-8">UTF-8</option><option value="windows-1252">Western European</option><option value="windows-1251">Cyrillic</option><option value="shift_jis">Japanese (Shift JIS)</option><option value="gb18030">Chinese (GB18030)</option><option value="euc-kr">Korean (EUC-KR)</option><option value="utf-16le">UTF-16 LE</option></select></label>
              <button class="reset-style quiet">Reset appearance</button>
            </div></details>
            <details class="transcript-details"><summary>Transcript</summary><div class="stack"><input class="transcript-search" type="search" placeholder="Find a line" aria-label="Find a subtitle line"><div class="transcript"></div></div></details>
          </div>
          <div class="section row"><button class="quiet player">Local player</button><button class="quiet review">Saved words</button><button class="quiet fullscreen" aria-label="Full screen with subtitles">Full screen</button></div>
        </section>
        <div class="subtitle" hidden><span class="line main-line" dir="auto"></span><div class="translation" hidden><span class="line second-line" dir="auto"></span></div></div>
        <div class="drop-target" hidden>Drop subtitles here</div>
      </div>
      <section class="word-card" role="dialog" aria-label="Word meaning" hidden></section>`;
    this.root.append(body);
    this.panel = this.get('.panel'); this.anchor = this.get('.anchor'); this.card = this.get('.word-card');
    this.subtitle = this.get('.subtitle'); this.mainLine = this.get('.main-line'); this.secondLine = this.get('.second-line');
    this.toggleButton = this.get('.toggle');
    document.documentElement.append(this.host);
    this.click('.toggle', () => this.toggle());
    this.click('.close', () => this.open(false));
    this.click('.add', () => this.get<HTMLInputElement>('.main-file').click());
    this.click('.add-translation', () => this.get<HTMLInputElement>('.second-file').click());
    this.click('.remove', () => this.remove(false)); this.click('.remove-translation', () => this.remove(true));
    this.click('.reset-offset', () => this.setOffset(0));
    this.click('.reset-style', () => { this.prefs = { ...this.prefs, fontSize: 28, color: '#ffffff', opacity: .78, bottom: 12 }; this.applyPreferences(); this.savePreferences(); });
    this.click('.player', () => this.run(() => request('page.open', { page: 'player' })));
    this.click('.review', () => this.run(() => request('page.open', { page: 'review' })));
    this.click('.fullscreen', () => this.run(async () => {
      if (!this.video?.isConnected) this.attach(findVideos()[0]);
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (this.video?.parentElement) await this.video.parentElement.requestFullscreen();
      else this.notice('Choose a video before entering full screen.', true);
    }));
    for (const [query, second] of [['.main-file', false], ['.second-file', true]] as const) {
      this.get<HTMLInputElement>(query).addEventListener('change', event => {
        const input = event.target as HTMLInputElement;
        if (input.files?.[0]) void this.load(input.files[0], second);
        input.value = '';
      });
    }
    for (const query of ['#gw-offset', '.offset-slider']) this.get<HTMLInputElement>(query).addEventListener('input', event => {
      const value = (event.target as HTMLInputElement).valueAsNumber;
      if (Number.isFinite(value)) this.setOffset(value);
    });
    this.get<HTMLInputElement>('.translation-offset').addEventListener('input', event => {
      const value = (event.target as HTMLInputElement).valueAsNumber;
      if (Number.isFinite(value)) { this.secondOffset = Math.max(-3600, Math.min(3600, value)); this.persistOffsets(); this.lastText = ''; }
    });
    const bind = (query: string, key: keyof Preferences, kind: 'number' | 'string' | 'boolean') => {
      this.get<HTMLInputElement>(query).addEventListener('input', event => {
        const input = event.target as HTMLInputElement;
        this.prefs = preferences({ ...this.prefs, [key]: kind === 'boolean' ? input.checked : kind === 'number' ? Number(input.value) : input.value });
        this.applyPreferences(); this.savePreferences(); this.lastText = '';
        if (key === 'language') this.closeCard();
      });
    };
    bind('.language', 'language', 'string'); bind('.visible', 'subtitlesVisible', 'boolean'); bind('.show-translation', 'showTranslation', 'boolean');
    bind('.font-size', 'fontSize', 'number'); bind('.text-color', 'color', 'string'); bind('.opacity', 'opacity', 'number'); bind('.bottom', 'bottom', 'number');
    this.get<HTMLSelectElement>('.encoding').addEventListener('change', () => {
      if (this.files.main) void this.load(this.files.main);
      if (this.files.second) void this.load(this.files.second, true);
    });
    this.get<HTMLSelectElement>('.video-picker select').addEventListener('change', event => {
      this.manualVideo = true; this.attach(this.videos[Number((event.target as HTMLSelectElement).value)]);
    });
    this.get('.transcript-details').addEventListener('toggle', () => this.renderTranscript());
    this.get('.transcript-search').addEventListener('input', () => this.renderTranscript());
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!this.card.hidden) this.closeCard();
        else if (!this.panel.hidden) this.open(false);
      }
    };
    document.addEventListener('keydown', keydown); this.cleanups.push(() => document.removeEventListener('keydown', keydown));
    const fullscreen = () => {
      const target = document.fullscreenElement ?? document.documentElement;
      if (target.tagName !== 'VIDEO') target.append(this.host);
      this.position();
    };
    document.addEventListener('fullscreenchange', fullscreen); this.cleanups.push(() => document.removeEventListener('fullscreenchange', fullscreen));
    const dropZone = this.get<HTMLElement>('.drop-target');
    const overVideo = (event: DragEvent) => {
      if (!this.video) return false;
      const r = this.video.getBoundingClientRect();
      return event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
    };
    const drag = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('Files') && overVideo(event)) { event.preventDefault(); dropZone.hidden = false; }
      else dropZone.hidden = true;
    };
    const drop = (event: DragEvent) => {
      dropZone.hidden = true;
      if (!overVideo(event)) return;
      const files = Array.from(event.dataTransfer?.files ?? []).filter(f => /\.(srt|vtt|ass|ssa|sub|idx)$/i.test(f.name));
      if (!files.length) return;
      event.preventDefault(); event.stopPropagation(); this.open(true);
      void (async () => { await this.load(files[0]!); if (files[1]) await this.load(files[1], true); })();
    };
    const leave = (event: DragEvent) => { if (!event.relatedTarget) dropZone.hidden = true; };
    document.addEventListener('dragover', drag); document.addEventListener('drop', drop); document.addEventListener('dragleave', leave);
    this.cleanups.push(() => { document.removeEventListener('dragover', drag); document.removeEventListener('drop', drop); document.removeEventListener('dragleave', leave); });
    const storage = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area === 'local' && changes.preferences) { this.prefs = preferences(changes.preferences.newValue as Partial<Preferences>); this.applyPreferences(); this.lastText = ''; }
    };
    browser.storage.onChanged.addListener(storage); this.cleanups.push(() => browser.storage.onChanged.removeListener(storage));
    this.run(async () => { const stored = await browser.storage.local.get('preferences'); this.prefs = preferences(stored.preferences as Partial<Preferences>); this.applyPreferences(); });
    this.cleanups.push(observeVideos(videos => {
      this.videos = videos;
      if (!this.video || !videos.includes(this.video) || !this.manualVideo) this.attach(videos[0]);
      this.updateVideoPicker();
    }));
    const tick = () => {
      if (!this.alive) return;
      if (performance.now() - this.lastPosition > 200) this.position();
      this.renderCue(); this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
    this.position();
  }

  private get<T extends HTMLElement>(query: string) { return select<T>(this.root, query); }
  private click(query: string, fn: () => void) { this.get(query).addEventListener('click', fn); }
  private run(fn: () => Promise<unknown>) { void fn().catch(error => this.notice(message(error), true)); }
  private notice(text: string, error = false) {
    const node = this.get('.message'); node.replaceChildren(document.createTextNode(text)); node.classList.toggle('error', error); node.hidden = !text;
    if (error) { this.open(true); this.panel.scrollTop = 0; }
  }
  open(value = true) {
    this.panel.hidden = !value; this.toggleButton.setAttribute('aria-expanded', String(value));
    this.toggleButton.setAttribute('aria-label', value ? 'Close Glosswatch' : 'Open Glosswatch');
    this.position();
    if (value) this.get<HTMLButtonElement>('.add').focus();
    else this.toggleButton.focus();
  }
  toggle() { this.open(this.panel.hidden); }
  private attach(video?: HTMLVideoElement) {
    if (video === this.video) return;
    this.resize.disconnect(); this.video = video; this.sourceIdentity = ''; this.lastText = ''; this.settingsKey = ''; this.closeCard();
    if (video) { this.resize.observe(video); this.run(() => this.restoreOffsets()); }
    this.position();
  }
  private updateVideoPicker() {
    const picker = this.get<HTMLSelectElement>('.video-picker select'); picker.replaceChildren();
    this.videos.forEach((video, index) => {
      const r = video.getBoundingClientRect();
      const option = element('option', `Video ${index + 1} · ${Math.round(r.width)} × ${Math.round(r.height)}`); option.value = String(index); picker.append(option);
    });
    picker.value = String(this.videos.indexOf(this.video!));
    this.get('.video-picker').hidden = this.videos.length < 2;
  }
  private position() {
    this.lastPosition = performance.now();
    if (!this.host.isConnected) document.documentElement.append(this.host);
    const identity = this.video ? `${location.pathname}|${this.video.dataset.glosswatchFile ?? this.video.currentSrc}` : '';
    if (identity !== this.sourceIdentity) {
      this.sourceIdentity = identity; this.settingsKey = '';
      if (this.primary) this.run(() => this.restoreOffsets());
    }
    const r = this.video?.getBoundingClientRect();
    const visible = !!r && r.width > 0 && r.bottom > 0 && r.top < innerHeight;
    this.toggleButton.hidden = !visible && this.panel.hidden;
    const left = visible ? Math.max(0, r!.left) : Math.max(0, innerWidth - 380);
    const top = visible ? Math.max(0, r!.top) : 0;
    const width = visible ? Math.min(innerWidth - left, r!.width) : 380;
    const height = visible ? Math.min(innerHeight - top, r!.height) : innerHeight;
    Object.assign(this.anchor.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`, right: 'auto', bottom: 'auto' });
    this.panel.style.maxHeight = `${Math.max(160, Math.min(640, innerHeight - top - 78))}px`;
    this.subtitle.style.setProperty('--font-size', `${Math.min(this.prefs.fontSize, Math.max(16, width / 20))}px`);
    this.get('.video-status').textContent = this.video ? (this.video.mediaKeys ? 'Protected video. Subtitles work when the player exposes its video element.' : this.primary ? 'Attached to this video.' : 'Drop a subtitle file to begin.') : "Couldn’t find a video on this page. Start the video, or open a file in the local player.";
    this.get<HTMLButtonElement>('.fullscreen').disabled = !this.video;
    if (!visible) this.subtitle.hidden = true;
  }
  async load(file: File, second = false) {
    const id = second ? ++this.secondLoadId : ++this.loadId;
    this.notice(`Reading ${file.name}…`);
    try {
      const track = await readSubtitles(file, this.get<HTMLSelectElement>('.encoding').value);
      if (!this.alive || id !== (second ? this.secondLoadId : this.loadId)) return;
      if (second) { this.secondary = track; this.secondIndex = new CueIndex(track.cues); this.files.second = file; }
      else { this.primary = track; this.mainIndex = new CueIndex(track.cues); this.files.main = file; }
      this.lastText = ''; this.closeCard(); this.updateTrackUI(); this.renderTranscript();
      await this.restoreOffsets();
      this.notice([`${track.cues.length.toLocaleString()} cues · ${track.encoding}`, ...track.warnings].join(' · '));
    } catch (error) {
      if (id === (second ? this.secondLoadId : this.loadId)) this.notice(message(error), true);
    }
  }
  private updateTrackUI() {
    this.get('.file-name').textContent = this.primary?.name ?? ''; this.get('.file-name').hidden = !this.primary;
    this.get('.add').textContent = this.primary ? 'Change subtitles' : 'Add subtitles'; this.get('.remove').hidden = !this.primary;
    this.root.querySelectorAll<HTMLElement>('.main-settings').forEach(node => node.hidden = !this.primary);
    this.get('.translation-settings').hidden = !this.secondary; this.get('.translation-name').textContent = this.secondary?.name ?? '';
    this.get('.remove-translation').hidden = !this.secondary; this.get('.add-translation').textContent = this.secondary ? 'Change translation' : 'Add translation subtitle';
  }
  private remove(second: boolean) {
    const old = second ? this.secondary : this.primary;
    if (second) { this.secondLoadId++; this.secondary = undefined; this.secondIndex = new CueIndex([]); }
    else { this.loadId++; this.primary = undefined; this.mainIndex = new CueIndex([]); }
    this.lastText = ''; this.closeCard(); this.updateTrackUI(); this.notice('Subtitle removed. ');
    this.get('.message').append(button('Undo', () => {
      if (second) { this.secondary = old; this.secondIndex = new CueIndex(old?.cues ?? []); }
      else { this.primary = old; this.mainIndex = new CueIndex(old?.cues ?? []); }
      this.lastText = ''; this.updateTrackUI(); this.notice('');
    }, 'quiet'));
  }
  private setOffset(value: number) {
    this.offset = Math.max(-3600, Math.min(3600, value));
    this.get<HTMLInputElement>('#gw-offset').value = String(this.offset);
    this.get<HTMLInputElement>('.offset-slider').value = String(this.offset);
    this.lastText = ''; this.persistOffsets();
  }
  private async restoreOffsets() {
    if (!this.video || !this.primary) return;
    const video = this.video, track = this.primary, secondary = this.secondary, identity = this.sourceIdentity;
    const key = `offset:${await videoKey(video)}:${track.hash}`;
    const secondaryKey = secondary ? `offset:${await videoKey(video)}:${secondary.hash}` : '';
    const stored = await browser.storage.local.get(secondaryKey ? [key, secondaryKey] : key);
    if (this.video !== video || this.primary !== track || this.secondary !== secondary || this.sourceIdentity !== identity) return;
    this.settingsKey = key;
    const safe = (n: unknown) => typeof n === 'number' && Number.isFinite(n) ? Math.max(-3600, Math.min(3600, n)) : 0;
    this.offset = safe(stored[key]); this.secondOffset = safe(stored[secondaryKey]);
    this.get<HTMLInputElement>('#gw-offset').value = String(this.offset); this.get<HTMLInputElement>('.offset-slider').value = String(this.offset);
    this.get<HTMLInputElement>('.translation-offset').value = String(this.secondOffset); this.lastText = '';
  }
  private persistOffsets() {
    if (!this.settingsKey) return;
    const data: Record<string, number> = { [this.settingsKey]: this.offset };
    if (this.secondary && this.primary) data[this.settingsKey.replace(this.primary.hash, this.secondary.hash)] = this.secondOffset;
    this.run(() => browser.storage.local.set(data));
  }
  private savePreferences() {
    this.run(() => browser.storage.local.set({ preferences: this.prefs }));
  }
  private applyPreferences() {
    this.subtitle.style.setProperty('--text-color', this.prefs.color);
    this.subtitle.style.setProperty('--caption-bg', `rgba(13,24,19,${this.prefs.opacity})`);
    this.subtitle.style.setProperty('--bottom', `${this.prefs.bottom}%`);
    for (const [query, key] of [['.language','language'],['.font-size','fontSize'],['.text-color','color'],['.opacity','opacity'],['.bottom','bottom']] as const) this.get<HTMLInputElement>(query).value = String(this.prefs[key]);
    this.get<HTMLInputElement>('.visible').checked = this.prefs.subtitlesVisible;
    this.get<HTMLInputElement>('.show-translation').checked = this.prefs.showTranslation;
    this.position();
  }
  private renderCue() {
    if (!this.video || !this.primary || !this.prefs.subtitlesVisible) { this.subtitle.hidden = true; return; }
    const time = this.video.currentTime;
    const current = this.mainIndex.at(time - this.offset);
    const caption = current.map(c => c.text).join('\n');
    const candidates = this.secondIndex.at(time - this.secondOffset);
    const translated = current.map(cue => alignTranslation(
      { ...cue, start: cue.start + this.offset, end: cue.end + this.offset },
      candidates.map(c => ({ ...c, start: c.start + this.secondOffset, end: c.end + this.secondOffset })),
    )).filter(Boolean);
    const translation = [...new Set(translated)].join('\n');
    const key = `${caption}|${translation}|${this.prefs.language}|${this.prefs.showTranslation}`;
    const bounds = this.video.getBoundingClientRect();
    this.subtitle.hidden = !caption || bounds.bottom < 0 || bounds.top > innerHeight;
    if (key === this.lastText) return;
    this.lastText = key; this.caption = caption; this.translation = translation;
    this.mainLine.replaceChildren();
    if (this.prefs.language === 'off') this.mainLine.textContent = caption;
    else {
      const segments = new Intl.Segmenter(this.prefs.language, { granularity: 'word' }).segment(caption);
      for (const token of segments) {
        if (!token.isWordLike) { this.mainLine.append(document.createTextNode(token.segment)); continue; }
        const word = button(token.segment, () => this.showWord(token.segment, word));
        word.className = 'word'; word.setAttribute('aria-label', `Meaning of ${token.segment}`);
        word.addEventListener('pointerenter', () => { clearTimeout(this.hoverTimer); this.hoverTimer = setTimeout(() => this.showWord(token.segment, word), 350); });
        word.addEventListener('pointerleave', () => clearTimeout(this.hoverTimer));
        this.mainLine.append(word);
      }
    }
    this.secondLine.textContent = translation || (this.secondary && caption ? 'No matching translation' : '');
    this.secondLine.parentElement!.hidden = !this.secondary || !this.prefs.showTranslation;
  }
  private closeCard() { this.wordId++; this.card.hidden = true; clearTimeout(this.hoverTimer); }
  private showWord(word: string, target: HTMLElement) {
    const id = ++this.wordId, language = this.prefs.language, sentence = this.caption, translation = this.translation;
    const r = target.getBoundingClientRect();
    this.card.hidden = false; this.card.replaceChildren(element('p', 'Looking up word…', 'muted'));
    const place = () => Object.assign(this.card.style, {
      left: `${Math.max(12, Math.min(innerWidth - 322, r.left + r.width / 2 - 155))}px`,
      top: `${Math.max(12, Math.min(innerHeight - this.card.offsetHeight - 12, r.top - this.card.offsetHeight - 12))}px`,
    });
    place();
    void request<Definition | null>('dictionary.lookup', { word, language }).then(definition => {
      if (id !== this.wordId || !this.alive) return;
      this.card.replaceChildren();
      const heading = element('div', '', 'row'); heading.append(element('h3', word), button('×', () => this.closeCard(), 'quiet'));
      heading.querySelector('button')!.setAttribute('aria-label', 'Close word meaning'); this.card.append(heading);
      if (!definition) {
        this.card.append(element('p', `No ${languages[language] ?? ''} definition found. You can still save this word with your own meaning.`, 'hint'));
      } else {
        this.card.append(element('p', `${definition.word}${definition.word !== word.toLowerCase() ? ' · base form' : ''} · ${definition.pos} ${definition.ipa}`, 'muted'));
        const list = element('ol'); definition.meanings.slice(0, 3).forEach(meaning => list.append(element('li', meaning))); this.card.append(list);
      }
      const custom = element('input'); custom.placeholder = 'Your meaning'; custom.setAttribute('aria-label', 'Your meaning');
      custom.addEventListener('input', () => custom.setCustomValidity(''));
      if (!definition) this.card.append(custom);
      const actions = element('div', '', 'actions');
      const save = button('Save word', () => this.run(async () => {
        const meaning = definition?.meanings.join('; ') || custom.value.trim();
        if (!meaning) { custom.focus(); custom.setCustomValidity('Add a meaning before saving.'); custom.reportValidity(); return; }
        save.disabled = true;
        try {
          const now = Date.now(), lemma = definition?.word ?? word.toLowerCase();
          await request<Card>('cards.save', { id: `${language}:${lemma}`, word, lemma, language, meaning, ipa: definition?.ipa ?? '', sentence, translation,
            source: this.files.main?.name ?? document.title, created: now, due: now, interval: 0, ease: 2.5, reviews: 0 });
          save.textContent = 'Saved';
        } catch (error) { save.disabled = false; throw error; }
      }), 'primary');
      actions.append(save);
      const localVoice = speechSynthesis.getVoices().find(voice => voice.localService && voice.lang.startsWith(language));
      if (localVoice) actions.append(button('Listen', () => {
        const utterance = new SpeechSynthesisUtterance(word); utterance.lang = localVoice.lang; utterance.voice = localVoice; speechSynthesis.speak(utterance);
      }));
      const source = element('a', 'Wiktionary · CC BY-SA'); source.href = `https://en.wiktionary.org/wiki/${encodeURIComponent(definition?.word ?? word)}#${languages[language]}`;
      source.target = '_blank'; source.rel = 'noopener noreferrer'; this.card.append(actions, source); place();
    }).catch(error => { if (id === this.wordId) { this.card.replaceChildren(element('p', message(error)), button('Close', () => this.closeCard())); place(); } });
  }
  private renderTranscript() {
    const container = this.get('.transcript'); container.replaceChildren();
    const query = this.get<HTMLInputElement>('.transcript-search').value.toLowerCase();
    const cues = this.primary?.cues.filter(c => c.text.toLowerCase().includes(query)) ?? [];
    for (const cue of cues.slice(0, 300)) {
      const seconds = Math.floor(cue.start);
      container.append(button(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}  ${cue.text}`, () => { if (this.video) this.video.currentTime = Math.max(0, cue.start + this.offset + .01); }));
    }
    if (cues.length > 300) container.append(element('p', 'Showing 300 lines. Search to narrow the transcript.', 'hint'));
    if (!cues.length) container.append(element('p', 'No matching lines.', 'hint'));
  }
  dispose() {
    this.alive = false; this.loadId++; this.secondLoadId++; this.wordId++;
    cancelAnimationFrame(this.frame); clearTimeout(this.hoverTimer);
    this.cleanups.forEach(fn => fn()); this.resize.disconnect(); this.host.remove();
  }
}
