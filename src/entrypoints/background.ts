export default defineBackground(() => {
  const manifest = browser.runtime.getManifest();
  console.log('[Glosswatch] background ready', {
    id: browser.runtime.id,
    name: manifest.name,
    version: manifest.version,
    browser: import.meta.env.BROWSER,
  });

  browser.action.onClicked.addListener((tab) => {
    console.log('[Glosswatch] toolbar icon clicked', {
      tabId: tab.id,
      url: tab.url,
    });
  });
});
