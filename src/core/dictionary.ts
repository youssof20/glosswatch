import { browser, type PublicPath } from 'wxt/browser';
export interface Definition { word: string; pos: string; meanings: string[]; ipa: string }
interface Dictionary { entries: Record<string, Definition>; forms: Record<string, string> }
export const languages: Record<string, string> = { es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese' };
let cache: { language: string; data: Promise<Dictionary> } | undefined;
export async function lookup(language: string, word: string): Promise<Definition | null> {
  if (!languages[language]) return null;
  if (cache?.language !== language) {
    const data = (async () => {
      const response = await fetch(browser.runtime.getURL(`/dictionaries/${language}.json.gz` as PublicPath));
      if (!response.ok || !response.body) throw new Error('The offline dictionary could not be opened. Reload Glosswatch and try again.');
      return await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json() as Dictionary;
    })();
    cache = { language, data };
    data.catch(() => { if (cache?.data === data) cache = undefined; });
  }
  const dictionary = await cache.data;
  const key = word.normalize('NFC').toLocaleLowerCase(language).replace(/’/g, "'");
  const lemma = Object.hasOwn(dictionary.forms, key) ? dictionary.forms[key] : undefined;
  return Object.hasOwn(dictionary.entries, key) ? dictionary.entries[key]! : (lemma && Object.hasOwn(dictionary.entries, lemma) ? dictionary.entries[lemma]! : null);
}
