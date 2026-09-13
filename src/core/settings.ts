export interface Preferences {
  language: string; fontSize: number; color: string; opacity: number; bottom: number;
  showTranslation: boolean; subtitlesVisible: boolean;
}
export const defaults: Preferences = { language: 'es', fontSize: 28, color: '#ffffff', opacity: .78, bottom: 12, showTranslation: true, subtitlesVisible: true };
export function preferences(value: Partial<Preferences> = {}): Preferences {
  const range = (n: unknown, fallback: number, min: number, max: number) => typeof n === 'number' && Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  return {
    language: ['es','fr','de','it','pt','off'].includes(value.language ?? '') ? value.language! : defaults.language,
    fontSize: range(value.fontSize, 28, 16, 56), bottom: range(value.bottom, 12, 5, 45), opacity: range(value.opacity, .78, 0, 1),
    color: /^#[0-9a-f]{6}$/i.test(value.color ?? '') ? value.color! : '#ffffff',
    showTranslation: typeof value.showTranslation === 'boolean' ? value.showTranslation : true,
    subtitlesVisible: typeof value.subtitlesVisible === 'boolean' ? value.subtitlesVisible : true,
  };
}
export async function videoKey(video: HTMLVideoElement): Promise<string> {
  const source = video.dataset.glosswatchFile || `${location.origin}${location.pathname}|${video.currentSrc || video.src}`;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source))), n => n.toString(16).padStart(2, '0')).join('');
}
