/**
 * Dexie (IndexedDB) database setup for 语见 (Yujian).
 * Local-first persistence layer for analyzed sentences, word entries, and personal history.
 *
 * Production-ready foundation:
 * - Explicit schema versioning with migration strategy.
 * - Typed Table declarations using core domain interfaces.
 * - Indexes chosen for common history + exploration queries (date ranges, filters, search prefixes).
 * - Future-proof: placeholders for v2+ upgrades (e.g. adding mastery flags, full-text, denormalized fields).
 *
 * Usage: import { db } from '@/lib/db'  (or consume via history-service.ts)
 * All heavy logic and error boundaries live in the service layer.
 */

import Dexie, { type Table } from 'dexie';
import type { AnalyzedSentence, HistoryItem, WordEntry } from './types';

/**
 * Main Dexie database class for 语见.
 * Tables are declared with precise key + index specs.
 */
export class YujianDatabase extends Dexie {
  // Core tables — primary key is always 'id' (uuid string)
  sentences!: Table<AnalyzedSentence, string>;
  history!: Table<HistoryItem, string>;
  words!: Table<WordEntry, string>;

  constructor() {
    super('yujianDB');

    // ============================================
    // VERSION 1 (current baseline)
    // ============================================
    // Indexes support:
    // - Direct lookups by id (implicit PK)
    // - Date-based queries via createdAt / addedAt (range queries, sorting)
    // - Filtering by source / etymology / level / reviewCount
    // - Prefix search on words.word (via .startsWith)
    this.version(1).stores({
      sentences: 'id, createdAt, source',
      history: 'id, addedAt, reviewCount',
      words: 'id, word, etymology, level',
    });

    // ============================================
    // VERSION 2+ (migration strategy — add when schema changes)
    // ============================================
    // Example future upgrade (do NOT remove past versions):
    // this.version(2).stores({
    //   sentences: 'id, createdAt, source, [source+createdAt]', // compound index example
    //   history: 'id, addedAt, reviewCount, *tags', // multi-valued for tags array
    //   words: 'id, word, etymology, level, isMastered', // when we extend models
    // }).upgrade(async (tx) => {
    //   // Data migration logic here — e.g. backfill new fields
    //   // const historyTable = tx.table<HistoryItem>('history');
    //   // await historyTable.toCollection().modify(item => { item.foo = 'bar'; });
    // });
    //
    // Always increment version when changing stores() or needing data transforms.
    // Dexie guarantees safe upgrade path for users.

    // Future hooks (kept commented until needed):
    // this.history.hook('creating', (primKey, obj, trans) => { ... });
    // this.history.hook('updating', ...);
  }
}

/** Singleton DB instance. Safe to import anywhere (client-only usage expected). */
export const db = new YujianDatabase();

/**
 * Ensure DB is open. Call explicitly in services before first op if desired.
 * Auto-open on module import is convenient but swallows the promise here.
 */
export async function ensureDatabaseOpen(): Promise<void> {
  if (db.isOpen()) return;
  try {
    await db.open();
  } catch (err) {
    console.error('[YujianDB] Failed to open database:', err);
    throw err;
  }
}

// Eager open (non-blocking). Services should still guard critical paths.
db.open().catch((err) => {
  // Non-fatal at import time; real usage will surface via ensure + operations.
  console.warn('[YujianDB] Initial open encountered an issue (will retry on demand):', err);
});
