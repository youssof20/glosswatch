import { browser } from 'wxt/browser';
import { cards } from '../core/database';
import { lookup } from '../core/dictionary';
import { message } from '../core/client';
import type { Rating } from '../core/review';

export default defineBackground(() => {
  const frames = new Map<number, Map<number, number>>();
  browser.tabs.onRemoved.addListener(id => frames.delete(id));
  browser.action.onClicked.addListener(async tab => {
    if (!tab.id) return;
    try {
      frames.set(tab.id, new Map());
      await browser.tabs.sendMessage(tab.id, { type: 'watch.collect' });
      // Reports from cross-origin frames arrive independently of the first reply.
      await new Promise(resolve => setTimeout(resolve, 100));
      const candidates = [...(frames.get(tab.id)?.entries() ?? [])].sort((a,b) => b[1] - a[1]);
      const frameId = candidates[0]?.[1] ? candidates[0][0] : 0;
      await browser.tabs.sendMessage(tab.id, { type: 'watch.toggle' }, { frameId });
    } catch {
      const notice = tab.url?.startsWith('file:') ? 'file-access' : 'restricted';
      await browser.tabs.create({ url: browser.runtime.getURL(`/player.html?notice=${notice}`) });
    }
  });

  browser.runtime.onMessage.addListener((input, sender) => {
    if (sender.id !== browser.runtime.id || !input || typeof input.type !== 'string') return;
    const { type, payload = {} } = input;
    if (type === 'watch.report') {
      if (sender.tab?.id && typeof payload.area === 'number' && Number.isFinite(payload.area)) frames.get(sender.tab.id)?.set(sender.frameId ?? 0, payload.area);
      return Promise.resolve({ ok: true });
    }
    if (!['dictionary.lookup','cards.list','cards.save','cards.restore','cards.remove','cards.rate','cards.import','page.open','extension.settings'].includes(type)) return;
    return (async () => {
      try {
        let data: unknown;
        switch (type) {
          case 'dictionary.lookup':
            if (typeof payload.word !== 'string' || payload.word.length > 100 || typeof payload.language !== 'string') throw new Error('Choose a subtitle word.');
            data = await lookup(payload.language, payload.word); break;
          case 'cards.list': data = await cards.list(); break;
          case 'cards.save': data = await cards.save(payload); break;
          case 'cards.restore': data = await cards.restore(payload); break;
          case 'cards.remove': data = await cards.remove(String(payload.id)); break;
          case 'cards.rate': data = await cards.rate(String(payload.id), payload.rating as Rating); break;
          case 'cards.import': data = await cards.import(payload); break;
          case 'page.open':
            if (!['player','review'].includes(payload.page)) throw new Error('Unknown Glosswatch page.');
            await browser.tabs.create({ url: browser.runtime.getURL(payload.page === 'player' ? '/player.html' : '/review.html') }); break;
          case 'extension.settings':
            await browser.tabs.create({ url: import.meta.env.BROWSER === 'firefox' ? 'about:addons' : `chrome://extensions/?id=${browser.runtime.id}` }); break;
        }
        if (type.startsWith('cards.') && type !== 'cards.list') await browser.storage.local.set({ cardsRevision: Date.now() });
        return { ok: true, data };
      } catch (error) { return { ok: false, error: message(error) }; }
    })();
  });
});
