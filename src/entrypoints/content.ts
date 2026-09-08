export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    const manifest = browser.runtime.getManifest();
    console.log('[Glosswatch] content script loaded', {
      href: location.href,
      name: manifest.name,
      version: manifest.version,
      browser: import.meta.env.BROWSER,
    });

    // Inspector smoke-test: document.documentElement.dataset.glosswatch === 'loaded'
    document.documentElement.dataset.glosswatch = 'loaded';
  },
});
