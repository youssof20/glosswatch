import Dexie, { type EntityTable } from 'dexie';
import { schedule, validCard, type Card, type Rating } from './review';

const db = new Dexie('glosswatch') as Dexie & { cards: EntityTable<Card, 'id'> };
db.version(1).stores({ cards: 'id, due, language, word, created' });

export const cards = {
  list: () => db.cards.orderBy('created').reverse().toArray(),
  async save(value: unknown) {
    if (!validCard(value)) throw new Error('This saved word is incomplete. Try saving it again.');
    return db.transaction('rw', db.cards, async () => {
      const previous = await db.cards.get(value.id);
      if (previous) return previous;
      await db.cards.put(value);
      return value;
    });
  },
  async restore(value: unknown) {
    if (!validCard(value)) throw new Error('This saved word could not be restored.');
    await db.cards.put(value);
  },
  async remove(id: string) {
    return db.transaction('rw', db.cards, async () => {
      const value = await db.cards.get(id);
      await db.cards.delete(id);
      return value;
    });
  },
  async rate(id: string, rating: Rating) {
    if (!['again','hard','good','easy'].includes(rating)) throw new Error('Choose a review rating.');
    return db.transaction('rw', db.cards, async () => {
      const value = await db.cards.get(id);
      if (!value) throw new Error('This word has been removed from your collection.');
      await db.cards.put(schedule(value, rating));
      return value;
    });
  },
  async import(values: unknown) {
    if (!Array.isArray(values) || values.length > 100000 || !values.every(validCard)) throw new Error('This is not a valid Glosswatch backup. Your saved words have not been changed.');
    return db.transaction('rw', db.cards, async () => {
      let added = 0;
      for (const card of values) {
        if (!await db.cards.get(card.id)) { await db.cards.add(card); added++; }
      }
      return added;
    });
  },
};
