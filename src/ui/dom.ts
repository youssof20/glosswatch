export function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;
  return node;
}
export function button(text: string, action: () => void, className = '') {
  const node = element('button', text, className);
  node.type = 'button'; node.addEventListener('click', action);
  return node;
}
export function select<T extends Element>(root: ParentNode, query: string): T {
  const node = root.querySelector<T>(query);
  if (!node) throw new Error(`Missing UI element: ${query}`);
  return node;
}
export function download(name: string, contents: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = element('a'); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
