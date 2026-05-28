/**
 * Core domain types for 语见 (Yujian) — Korean sentence grammar analysis tool.
 * 
 * All data is local-first. Interfaces are designed to be serializable for Dexie (IndexedDB)
 * and to support deep etymology tagging (native / Sino-Korean / loanword) + grammar analysis.
 */

export type EtymologyTag = 'native' | 'sino-korean' | 'loanword' | 'unknown';

/**
 * A single token / morpheme within an analyzed Korean sentence.
 * Captures surface form, grammar role, and etymology — the heart of the analysis feature.
 */
export interface Token {
  /** Stable unique id for this token in the context of its sentence (e.g. uuid or index-based) */
  id: string;
  /** Exact surface text as written in the sentence (including particles) */
  text: string;
  /** Dictionary / lemma form if different from surface */
  lemma?: string;
  /** Part-of-speech or detailed morphological tag (e.g. "noun", "verb", "topic-particle", "honorific-suffix") */
  pos: string;
  /** Critical etymology classification for learning insight */
  etymology: EtymologyTag;
  /** Brief gloss / meaning (English or Chinese) to aid comprehension */
  gloss?: string;
  /** Grammatical function / role this token plays in the sentence (e.g. "subject", "object marker", "causative") */
  grammarRole?: string;
  /** Hanja (Chinese characters) for Sino-Korean words when relevant */
  hanja?: string;
}

/**
 * Complete analysis result for a single Korean sentence.
 * This is the primary artifact produced by the LLM-assisted analysis pipeline.
 */
export interface AnalyzedSentence {
  /** Unique identifier (uuid) */
  id: string;
  /** The raw Korean sentence the user provided or selected */
  original: string;
  /** Ordered list of tokens with full linguistic breakdown */
  tokens: Token[];
  /** High-level grammatical analysis and sentence pattern explanation (beautifully written) */
  grammarAnalysis: string;
  /** Fluent natural English translation */
  englishTranslation?: string;
  /** Fluent natural Chinese translation (primary audience language) */
  chineseTranslation?: string;
  /** Additional pedagogical notes: nuances, common pitfalls, related patterns, cultural notes */
  notes?: string;
  /** ISO 8601 timestamp when analysis was created */
  createdAt: string;
  /** Optional source tag (e.g. "manual", "imported", "daily-example") */
  source?: string;
}

/**
 * A dictionary-style entry for an individual word or expression.
 * Supports the etymology focus and can be used for quick reference / SRS later.
 */
export interface WordEntry {
  /** Unique id */
  id: string;
  /** Headword (Korean) */
  word: string;
  /** Etymology classification */
  etymology: EtymologyTag;
  /** One or more clear definitions / translations */
  definitions: string[];
  /** Curated example usages with translations */
  examples: Array<{
    sentence: string;
    translation: string;
  }>;
  /** Hanja when the word is Sino-Korean */
  hanja?: string;
  /** Difficulty or frequency level (e.g. "TOPIK-1", "intermediate") */
  level?: string;
  /** Optional related words for exploration */
  related?: string[];
}

/**
 * An item in the user's personal analysis history.
 * Powers the "visually pleasing personal history" feature. Stores full snapshot for offline use.
 */
export interface HistoryItem {
  /** Unique history record id */
  id: string;
  /** The full analyzed sentence snapshot (embedded for self-contained history) */
  sentence: AnalyzedSentence;
  /** When this item was saved to history (ISO 8601) */
  addedAt: string;
  /** Freeform personal notes the user attached to this sentence */
  personalNote?: string;
  /** User-defined tags for organization and filtering (e.g. ["grammar", "travel", "honorific"]) */
  tags?: string[];
  /** How many times the user has reviewed / revisited this item */
  reviewCount: number;
}
