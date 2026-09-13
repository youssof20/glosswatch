export function findVideos(root: Document | ShadowRoot = document): HTMLVideoElement[] {
  const found = Array.from(root.querySelectorAll('video'));
  for (const node of root.querySelectorAll('*')) {
    if (node.shadowRoot && node.tagName !== 'GLOSSWATCH-UI') found.push(...findVideos(node.shadowRoot));
  }
  return found.filter(video => {
    const box = video.getBoundingClientRect();
    const style = getComputedStyle(video);
    return box.width >= 80 && box.height >= 45 && style.display !== 'none' && style.visibility !== 'hidden';
  }).sort((a, b) => {
    const area = (v: HTMLVideoElement) => { const r = v.getBoundingClientRect(); return r.width * r.height; };
    return area(b) - area(a);
  });
}

export function observeVideos(onChange: (videos: HTMLVideoElement[]) => void) {
  let previous: HTMLVideoElement[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const scan = () => {
    const next = findVideos();
    if (next.length !== previous.length || next.some((v, i) => v !== previous[i])) {
      previous = next; onChange(next);
    }
  };
  const observer = new MutationObserver(records => {
    if (records.every(record => (record.target as Element).closest?.('glosswatch-ui'))) return;
    clearTimeout(timer); timer = setTimeout(scan, 100);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  const interval = setInterval(scan, 1500); // Includes players inside newly attached open shadow roots.
  scan();
  return () => { observer.disconnect(); clearInterval(interval); clearTimeout(timer); };
}
