/**
 * Zod schemas for LLM structured output validation.
 *
 * These schemas exactly mirror the domain types in lib/types.ts (Token, AnalyzedSentence)
 * with additional runtime validation suitable for parsing untrusted LLM JSON responses.
 *
 * Used by:
 * - app/api/analyze/route.ts (to validate Anthropic tool output)
 * - lib/llm/analyzer.ts (for graceful parsing + error reporting)
 *
 * Design:
 * - Strict by default (no extra keys allowed via .strict() where appropriate)
 * - Helpful refinements (min lengths, ISO date checks)
 * - Reusable etymology enum
 * - Input schema for the secure /api/analyze route (sentence + user-provided key)
 *
 * Never contains API keys or secrets.
 */

import { z } from 'zod';

// --------------------------------------------------------------------------
// Supported providers (keep in sync with lib/llm/providers.ts)
// --------------------------------------------------------------------------

export const providerSchema = z.enum([
  'anthropic',
  'openai',
  'gemini',
  'deepseek',
]);

export type SupportedProvider = z.infer<typeof providerSchema>;

// --------------------------------------------------------------------------
// Core enums & primitives (match lib/types.ts)
// --------------------------------------------------------------------------

export const etymologySchema = z.enum([
  'native',
  'sino-korean',
  'loanword',
  'unknown',
]);

export type EtymologyTag = z.infer<typeof etymologySchema>;

// --------------------------------------------------------------------------
// Token schema (matches Token interface + etymology focus for Chinese learners)
// --------------------------------------------------------------------------

export const tokenSchema = z
  .object({
    /** Stable unique id (uuid or index-based) */
    id: z.string().min(1, 'token id is required'),

    /** Exact surface text as written */
    text: z.string().min(1, 'token text is required'),

    /** Lemma / dictionary form (optional when identical to text) */
    lemma: z.string().optional(),

    /** Detailed POS / morphological tag (e.g. "topic-particle", "honorific-verb-ending") */
    pos: z.string().min(1, 'pos is required'),

    /** Etymology classification — critical for Chinese learners */
    etymology: etymologySchema,

    /** Brief gloss (English or Chinese) */
    gloss: z.string().optional(),

    /** Grammatical function in sentence context */
    grammarRole: z.string().optional(),

    /** Hanja (Chinese characters) for Sino-Korean terms when helpful */
    hanja: z.string().optional(),
  })
  .strict();

export type TokenSchema = z.infer<typeof tokenSchema>;

// --------------------------------------------------------------------------
// AnalyzedSentence schema (primary structured output contract)
// --------------------------------------------------------------------------

export const analyzedSentenceSchema = z
  .object({
    /** uuid — should match what we generate before calling LLM or accept from LLM */
    id: z.string().min(1),

    /** The exact original Korean input sentence */
    original: z.string().min(1, 'original sentence is required'),

    /** Ordered, exhaustive token breakdown */
    tokens: z.array(tokenSchema).min(1, 'at least one token is required'),

    /** High-level, learner-friendly grammatical analysis (rich prose) */
    grammarAnalysis: z.string().min(20, 'grammarAnalysis must be substantive'),

    /** Natural English translation (optional but recommended) */
    englishTranslation: z.string().optional(),

    /** Natural Chinese translation (primary target for audience) */
    chineseTranslation: z.string().optional(),

    /** Pedagogical notes: nuances, pitfalls, variants, cultural context */
    notes: z.string().optional(),

    /** ISO 8601 timestamp */
    createdAt: z.string().datetime({ offset: true }).or(z.string().min(10)),

    /** Provenance (e.g. "user", "example") */
    source: z.string().optional(),
  })
  .strict();

export type AnalyzedSentenceSchema = z.infer<typeof analyzedSentenceSchema>;

// --------------------------------------------------------------------------
// Route input schema (client -> /api/analyze)
// - sentence: the Korean text to analyze
// - provider: which LLM to use
// - apiKey: user's personal key for the chosen provider
// --------------------------------------------------------------------------

export const analyzeRequestSchema = z
  .object({
    sentence: z
      .string()
      .min(1, 'sentence is required')
      .max(500, 'sentence too long (max 500 chars for analysis)'),
    provider: providerSchema.default('anthropic'),
    apiKey: z.string().min(10, 'API key appears too short').max(200, 'API key too long'),
  })
  .strict();

export type AnalyzeRequestSchema = z.infer<typeof analyzeRequestSchema>;

// --------------------------------------------------------------------------
// Helper: safe parse with detailed errors (used by analyzer & route)
// --------------------------------------------------------------------------

export function safeParseAnalyzedSentence(data: unknown): {
  success: true;
  data: AnalyzedSentenceSchema;
} | {
  success: false;
  error: string;
  issues?: z.ZodIssue[];
} {
  const result = analyzedSentenceSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: 'LLM output failed validation against AnalyzedSentence schema',
    issues: result.error.issues,
  };
}

export function safeParseAnalyzeRequest(data: unknown) {
  return analyzeRequestSchema.safeParse(data);
}
