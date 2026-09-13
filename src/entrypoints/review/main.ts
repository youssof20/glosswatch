import '../../ui/page.css';
import { browser } from 'wxt/browser';
import { request, message } from '../../core/client';
import { exportTsv, schedule, type Card, type Rating } from '../../core/review';
import { languages } from '../../core/dictionary';
import { select, element, button, download } from '../../ui/dom';

const get = <T extends HTMLElement>(query: string) => select<T>(document, query);
let collection: Card[] = [], limit = 50, editing: Card | undefined, deck: Card[] = [], index = 0;
let toastTimer: ReturnType<typeof setTimeout>;
const dialog = get<HTMLDialogElement>('#review-dialog');
const editDialog = get<HTMLDialogElement>('#edit-dialog');
function error(value: unknown) { const node = get('#error'); node.textContent = message(value); node.hidden = false; }
function run(fn: () => Promise<unknown>) { void fn().catch(error); }
function toast(text: string, undo?: () => Promise<unknown>) {
  clearTimeout(toastTimer); const node = get('#toast'); node.replaceChildren(document.createTextNode(text)); node.hidden = false;
  if (undo) node.append(button('Undo', () => run(async () => { await undo(); node.hidden = true; await refresh(); })));
  toastTimer = setTimeout(() => node.hidden = true, 10000);
}
async function refresh() { collection = await request<Card[]>('cards.list'); render(); }
function filtered() {
  const normalize = (text: string) => text.toLocaleLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  const query = normalize(get<HTMLInputElement>('#search').value.trim());
  const language = get<HTMLSelectElement>('#language').value;
  const sort = get<HTMLSelectElement>('#sort').value;
  return collection.filter(card => (language === 'all' || card.language === language) && normalize(`${card.word} ${card.lemma} ${card.meaning} ${card.sentence}`).includes(query))
    .sort((a, b) => sort === 'word' ? a.lemma.localeCompare(b.lemma) : sort === 'due' ? a.due - b.due : b.created - a.created);
}
function render() {
  const due = collection.filter(card => card.due <= Date.now()).length;
  get('#due').textContent = String(due); get<HTMLButtonElement>('#start-review').disabled = !due;
  get('#total').textContent = `${collection.length.toLocaleString()} saved ${collection.length === 1 ? 'word' : 'words'}`;
  const filteredCards = filtered(); const list = get('#words'); list.replaceChildren();
  get('#empty').hidden = !!collection.length;
  get('#more').hidden = filteredCards.length <= limit;
  get('#no-results').hidden = !collection.length || !!filteredCards.length;
  get('#result-count').hidden = !collection.length;
  get('#result-count').textContent = `${filteredCards.length.toLocaleString()} ${filteredCards.length === 1 ? 'word' : 'words'}${filteredCards.length > limit ? ` · showing ${limit}` : ''}`;
  for (const card of filteredCards.slice(0, limit)) {
    const row = element('article', '', 'word-row');
    const word = element('div'); word.append(element('h3', card.word), element('p', languages[card.language] ?? card.language, 'small muted'));
    const definition = element('div', '', 'definition');
    definition.append(element('p', card.meaning, 'meaning'));
    if (card.sentence) definition.append(element('p', `“${card.sentence}”`, 'example'));
    const date = card.due <= Date.now() ? 'Due now' : `Next review ${new Date(card.due).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
    definition.append(element('p', date, 'small muted'));
    const actions = element('div', '', 'row');
    actions.append(button('Edit', () => {
      editing = card; get('#edit-word').textContent = card.word; get<HTMLTextAreaElement>('#edit-meaning').value = card.meaning; editDialog.showModal();
    }, 'quiet'), button('Remove', () => run(async () => {
      const removed = await request<Card>('cards.remove', { id: card.id });
      await refresh(); toast('Word removed.', () => request('cards.restore', removed));
    }), 'quiet'));
    row.append(word, definition, actions); list.append(row);
  }
}
for (const query of ['#search','#language','#sort']) get(query).addEventListener('input', () => { limit = 50; render(); });
get('#clear-filters').addEventListener('click', () => {
  get<HTMLInputElement>('#search').value = ''; get<HTMLSelectElement>('#language').value = 'all'; limit = 50; render(); get('#search').focus();
});
get('#more').addEventListener('click', () => { limit += 50; render(); });
get('#start-review').addEventListener('click', () => {
  deck = collection.filter(card => card.due <= Date.now()).sort((a,b) => a.due - b.due); index = 0;
  if (!deck.length) { render(); return; }
  dialog.showModal(); renderReview();
});
get('#close-review').addEventListener('click', () => dialog.close());
function renderReview() {
  const card = deck[index];
  if (!card) { dialog.close(); toast(`Reviewed ${index} ${index === 1 ? 'word' : 'words'}. You’re done for now.`); run(refresh); return; }
  get('#review-progress').textContent = `${index + 1} / ${deck.length}`;
  get('#review-language').textContent = languages[card.language] ?? card.language;
  get('#review-word').textContent = card.word; get('#review-sentence').textContent = card.sentence;
  get('#review-meaning').textContent = card.meaning; get('#review-translation').textContent = card.translation;
  get('#answer').hidden = true; get('#ratings').hidden = true; get('#reveal').hidden = false; get<HTMLButtonElement>('#reveal').focus();
  for (const control of document.querySelectorAll<HTMLButtonElement>('[data-rating]')) {
    control.disabled = false;
    const rating = control.dataset.rating as Rating;
    const next = schedule(card, rating);
    control.textContent = `${rating[0]!.toUpperCase()}${rating.slice(1)} · ${rating === 'again' ? '1 min' : `${next.interval}d`}`;
  }
}
function reveal() { get('#answer').hidden = false; get('#ratings').hidden = false; get('#reveal').hidden = true; get<HTMLButtonElement>('[data-rating="good"]').focus(); }
get('#reveal').addEventListener('click', reveal);
let ratingBusy = false;
async function rate(rating: Rating) {
  const card = deck[index]; if (!card || ratingBusy) return; ratingBusy = true;
  try {
    const previous = await request<Card>('cards.rate', { id: card.id, rating });
    index++; renderReview(); await refresh();
    toast('Review saved.', () => request('cards.restore', previous));
  } finally { ratingBusy = false; }
}
for (const control of document.querySelectorAll<HTMLButtonElement>('[data-rating]')) control.addEventListener('click', () => run(() => rate(control.dataset.rating as Rating)));
dialog.addEventListener('keydown', event => {
  if (event.code === 'Space' && !get('#reveal').hidden) { event.preventDefault(); reveal(); }
  const ratings: Record<string, Rating> = { '1': 'again', '2': 'hard', '3': 'good', '4': 'easy' };
  if (ratings[event.key] && !get('#ratings').hidden) { event.preventDefault(); run(() => rate(ratings[event.key]!)); }
});
get('#cancel-edit').addEventListener('click', () => editDialog.close());
get('#edit-form').addEventListener('submit', event => {
  event.preventDefault(); if (!editing) return;
  const meaning = get<HTMLTextAreaElement>('#edit-meaning').value.trim(); if (!meaning) return;
  const old = editing;
  run(async () => { await request('cards.restore', { ...old, meaning }); editDialog.close(); await refresh(); toast('Meaning updated.', () => request('cards.restore', old)); });
});
get('#export-backup').addEventListener('click', () => download('glosswatch-backup.json', JSON.stringify({ version: 1, cards: collection }, null, 2)));
get('#export-tsv').addEventListener('click', () => download('glosswatch-anki.tsv', exportTsv(filtered()), 'text/tab-separated-values;charset=utf-8'));
get('#import').addEventListener('click', () => get<HTMLInputElement>('#import-file').click());
get<HTMLInputElement>('#import-file').addEventListener('change', event => {
  const input = event.target as HTMLInputElement, file = input.files?.[0]; input.value = ''; if (!file) return;
  run(async () => {
    if (file.size > 20 * 1024 * 1024) throw new Error('This backup is larger than 20 MB. Import a smaller Glosswatch backup.');
    let parsed;
    try { parsed = JSON.parse(await file.text()); } catch { throw new Error('This file is not valid JSON. Choose a Glosswatch backup.'); }
    if (parsed.version !== 1) throw new Error('This backup version is not supported. Your saved words have not changed.');
    const count = await request<number>('cards.import', parsed.cards); await refresh(); toast(`Imported ${count} new ${count === 1 ? 'word' : 'words'}. Existing words were kept.`);
  });
});
browser.storage.onChanged.addListener(changes => { if (changes.cardsRevision) run(refresh); });
setInterval(render, 60000);
run(refresh);
