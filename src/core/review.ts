export type Rating = 'again' | 'hard' | 'good' | 'easy';
export interface Card {
  id: string; word: string; lemma: string; language: string; meaning: string; ipa: string;
  sentence: string; translation: string; source: string; created: number;
  due: number; interval: number; ease: number; reviews: number;
}
export function schedule(card: Card, rating: Rating, now = Date.now()): Card {
  const ease = Math.max(1.3, Math.min(3, card.ease + (rating === 'easy' ? .15 : rating === 'hard' ? -.15 : rating === 'again' ? -.2 : 0)));
  const interval = rating === 'again' ? 0 : card.interval === 0 ? ({ hard: 1, good: 1, easy: 4 }[rating]) :
    Math.max(card.interval + 1, Math.round(card.interval * (rating === 'hard' ? 1.2 : rating === 'easy' ? ease * 1.3 : ease)));
  return { ...card, ease, interval, reviews: card.reviews + 1, due: now + (rating === 'again' ? 60000 : interval * 86400000) };
}
export function validCard(value: unknown): value is Card {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return ['id','word','lemma','language','meaning','ipa','sentence','translation','source'].every(k => typeof v[k] === 'string' && (v[k] as string).length <= 20000) &&
    ['created','due','interval','ease','reviews'].every(k => typeof v[k] === 'number' && Number.isFinite(v[k]) && (v[k] as number) >= 0) &&
    (v.id as string).length > 0 && (v.word as string).length > 0;
}
export function exportTsv(cards: Card[]): string {
  const clean = (s: string) => s.replace(/[\t\r\n]+/g, ' ').replace(/^[=+@-]/, "'$&");
  return ['Word\tMeaning\tSentence\tTranslation\tLanguage', ...cards.map(c => [c.word, c.meaning, c.sentence, c.translation, c.language].map(clean).join('\t'))].join('\n');
}
