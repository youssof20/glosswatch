export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    if (import.meta.env.DEV) {
      console.debug('[Glosswatch] content script loaded');
    }

    // Used by scripts/smoke-phase0.mjs until the overlay provides a visible check.
    document.documentElement.dataset.glosswatch = 'loaded';
  },
});
