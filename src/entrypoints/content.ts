import { browser } from 'wxt/browser';
import { Watch } from '../ui/watch';
import { findVideos } from '../core/videos';

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_idle',
  main(ctx) {
    const watch = new Watch();
    const listener = (input: { type?: string }) => {
      if (input?.type === 'watch.collect') {
        const box = findVideos()[0]?.getBoundingClientRect();
        return browser.runtime.sendMessage({ type: 'watch.report', payload: { area: box ? box.width * box.height : 0 } });
      }
      if (input?.type !== 'watch.toggle') return;
      if (window.top === window || document.querySelector('video')) watch.toggle();
      return Promise.resolve({ ok: true });
    };
    browser.runtime.onMessage.addListener(listener);
    ctx.onInvalidated(() => { watch.dispose(); browser.runtime.onMessage.removeListener(listener); });
  },
});
