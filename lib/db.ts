/**
 * Dexie (IndexedDB) database setup for 语见.
 * Local-first persistence for analyzed sentences, history, and word entries.
 * 
 * This is a minimal scaffold. Full schema and migrations will be expanded in later tasks.
 */

import Dexie, { type Table } from 'dexie';
import type { AnalyzedSentence, HistoryItem, WordEntry } from './types';

export class YujianDatabase extends Dexie {
  // Core tables
  sentences!: Table<AnalyzedSentence, string>; // id is primary key
  history!: Table<HistoryItem, string>;
  words!: Table<WordEntry, string>;

  constructor() {
    super('yujianDB');

    // Initial schema - version 1
    this.version(1).stores({
      // Primary keys + common query indexes
      sentences: 'id, createdAt, source',
      history: 'id, addedAt, reviewCount',
      words: 'id, word, etymology, level',
    });

    // Hook example for future: auto-update timestamps etc.
    // this.history.hook('creating', ...);
  }
}

// Singleton instance — import { db } from '@/lib/db'
export const db = new YujianDatabase();

// Optional: open on import for early connection (can be lazy in real usage)
db.open().catch((err) => {
  console.error('Failed to open Yujian DB:', err);
});
