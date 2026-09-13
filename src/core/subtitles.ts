import { detect } from 'jschardet';

export interface Cue { start: number; end: number; text: string }
export interface SubtitleTrack { name: string; hash: string; cues: Cue[]; warnings: string[]; encoding: string }
const LIMIT = 12 * 1024 * 1024;

export function decodeSubtitle(bytes: Uint8Array, encoding = 'auto') {
  if (encoding !== 'auto') return { text: new TextDecoder(encoding).decode(bytes), encoding };
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(bytes), encoding: 'UTF-16 LE' };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: new TextDecoder('utf-16be').decode(bytes), encoding: 'UTF-16 BE' };
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'UTF-8' };
  } catch {
    const sample = Array.from(bytes.subarray(0, 64000), n => String.fromCharCode(n)).join('');
    const guess = detect(sample);
    const charset = guess.confidence >= 0.5 ? guess.encoding : 'windows-1252';
    try { return { text: new TextDecoder(charset).decode(bytes), encoding: charset }; }
    catch { return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'windows-1252' }; }
  }
}

export function timestamp(value: string): number {
  const match = value.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/);
  if (!match || Number(match[2]) > 59 || Number(match[3]) > 59) return NaN;
  return Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]!.padEnd(3, '0')) / 1000;
}

export function plainText(text: string): string {
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return text.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/\{\\[^}]*\}/g, '').replace(/\\[Nn]/g, '\n')
    .replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (all, entity: string) => {
      if (entity[0] !== '#') return entities[entity] ?? all;
      const point = entity[1]?.toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : +entity.slice(1);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
    }).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
}

function* parseChunks(text: string, name: string): Generator<void, { cues: Cue[]; warnings: string[] }> {
  const cues: Cue[] = [];
  let skipped = 0, work = 0;
  const source = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (/\.(sub|idx)$/i.test(name)) throw new Error('Image subtitles are not supported. Choose a text subtitle file: SRT, VTT, ASS, or SSA.');
  if (/\.(ass|ssa)$/i.test(name)) {
    let fields: string[] = [];
    let events = false;
    const assTime = (s: string) => timestamp(s.replace(/\.(\d{2})$/, '.$10'));
    for (const line of source.split('\n')) {
      if (++work === 512) { work = 0; yield; }
      if (line.startsWith('[')) events = /^\[events\]/i.test(line);
      if (!events) continue;
      if (/^Format:/i.test(line)) fields = line.slice(7).split(',').map(s => s.trim().toLowerCase());
      if (!/^Dialogue:/i.test(line)) continue;
      const values = line.slice(9).trim().split(',');
      const ti = fields.indexOf('text');
      const start = assTime(values[fields.indexOf('start')] ?? '');
      const end = assTime(values[fields.indexOf('end')] ?? '');
      const body = ti >= 0 ? plainText(values.slice(ti).join(',')) : '';
      if (Number.isFinite(start) && end > start && body) cues.push({ start, end, text: body });
      else skipped++;
    }
  } else {
    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (++work === 512) { work = 0; yield; }
      if (/^(NOTE(?:\s|$)|STYLE$|REGION$)/.test(lines[i]!)) {
        while (i < lines.length && lines[i]!.trim()) i++;
        continue;
      }
      if (!lines[i]!.includes('-->')) continue;
      const [from = '', to = ''] = lines[i]!.split('-->');
      const start = timestamp(from);
      const end = timestamp(to.trim().split(/\s/)[0] ?? '');
      const body: string[] = [];
      while (i + 1 < lines.length && lines[i + 1]!.trim() && !lines[i + 1]!.includes('-->')) {
        // Recover files missing blank lines between numbered cues.
        if (/^\d+$/.test(lines[i + 1]!) && lines[i + 2]?.includes('-->')) { i++; break; }
        body.push(lines[++i]!);
      }
      const clean = plainText(body.join('\n'));
      if (Number.isFinite(start) && end > start && clean) cues.push({ start, end, text: clean });
      else skipped++;
    }
  }
  if (!cues.length) throw new Error('No readable subtitles found. Check the file contains timed SRT, VTT, ASS, or SSA subtitles.');
  cues.sort((a, b) => a.start - b.start || a.end - b.end);
  return { cues, warnings: skipped ? [`Skipped ${skipped} invalid subtitle ${skipped === 1 ? 'cue' : 'cues'}.`] : [] };
}

export function parseSubtitles(text: string, name = 'subtitles.srt') {
  const job = parseChunks(text, name);
  let step = job.next();
  while (!step.done) step = job.next();
  return step.value;
}

export async function readSubtitles(file: File, encoding = 'auto'): Promise<SubtitleTrack> {
  if (file.size > LIMIT) throw new Error('This subtitle file is larger than 12 MB. Choose a smaller text subtitle file.');
  if (!/\.(srt|vtt|ass|ssa|sub|idx)$/i.test(file.name)) throw new Error('Choose an SRT, VTT, ASS, or SSA subtitle file.');
  let buffer: ArrayBuffer;
  try { buffer = await file.arrayBuffer(); }
  catch { throw new Error('This subtitle file could not be read. Check that it is still on your device, then choose it again.'); }
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), n => n.toString(16).padStart(2, '0')).join('');
  const decoded = decodeSubtitle(new Uint8Array(buffer), encoding);
  const job = parseChunks(decoded.text, file.name);
  let step = job.next();
  while (!step.done) {
    await new Promise(resolve => setTimeout(resolve, 0));
    step = job.next();
  }
  return { name: file.name, hash, encoding: decoded.encoding, ...step.value };
}

/** Prefix maximum end times let overlapping cues be found without scanning the track. */
export class CueIndex {
  private ends: number[];
  constructor(public cues: Cue[]) {
    let max = 0;
    this.ends = cues.map(cue => max = Math.max(max, cue.end));
  }
  at(time: number): Cue[] {
    let low = 0, high = this.cues.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this.cues[mid]!.start <= time) low = mid + 1;
      else high = mid;
    }
    const found: Cue[] = [];
    for (let i = low - 1; i >= 0 && this.ends[i]! > time; i--) {
      if (this.cues[i]!.end > time) found.unshift(this.cues[i]!);
    }
    return found;
  }
}

export function alignTranslation(cue: Cue, candidates: Cue[]): string {
  return candidates.filter(other => {
    const overlap = Math.min(cue.end, other.end) - Math.max(cue.start, other.start);
    return overlap / Math.min(cue.end - cue.start, other.end - other.start) >= 0.5;
  }).map(c => c.text).join('\n');
}
