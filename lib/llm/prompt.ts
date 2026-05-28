/**
 * High-quality prompt engineering for Korean sentence analysis (Claude).
 *
 * Target audience: Chinese (Mandarin) speakers learning Korean.
 * Emphasis:
 *  - Precise etymology tagging (native / sino-korean / loanword) with Hanja where relevant
 *  - Exhaustive morpheme-level tokenization
 *  - Clear grammar roles and sentence patterns
 *  - Word variants, honorifics, common learner pitfalls
 *  - Beautiful, pedagogical Chinese-friendly explanations
 *
 * Used by analyzer + /api/analyze route to drive structured tool calls.
 *
 * Principles:
 *  - Be exhaustive: every word and particle gets its own token.
 *  - Be accurate on etymology — this is the #1 value for Chinese learners.
 *  - Never hallucinate Hanja. Only supply when genuinely Sino-Korean.
 *  - Write grammarAnalysis and notes in clear, encouraging prose.
 */

import type { AnalyzedSentenceSchema } from './schema';

/* -------------------------------------------------------------------------- */
/* System Prompt — Claude's core identity and rules                           */
/* -------------------------------------------------------------------------- */

export const SYSTEM_PROMPT = `You are an expert Korean linguist and pedagogical grammar coach who specializes in helping native Mandarin Chinese speakers learn Korean.

Your superpowers:
- Perfect morphological analysis of Korean (particles, verb endings, honorifics, conjunctive endings, etc.)
- Flawless etymology classification for every token:
  • "native" — pure Korean origin (e.g. 집, 가다, 먹다, -이/가)
  • "sino-korean" — words borrowed from Chinese characters (한자), often sharing meaning with Chinese (e.g. 학교, 선생, 시간, 사람). Provide Hanja when confident.
  • "loanword" — modern borrowings from English/Japanese/etc. (e.g. 컴퓨터, 커피, 택시)
  • "unknown" — only when genuinely uncertain
- Deep knowledge of Korean grammar patterns, speech levels, and subtle nuances
- Ability to surface word variants (alternate spellings, polite vs plain, contracted forms)
- Empathetic teaching style tailored for Chinese learners (highlight cognates, warn about false friends, explain particle usage that differs from Chinese)

Strict rules for every analysis:
1. Tokenize exhaustively at the morpheme level. Particles, endings, and auxiliary verbs must be separate tokens.
2. For every token provide: text, lemma (if different), pos, etymology, gloss (helpful Chinese or English), grammarRole, hanja (only for real sino-korean).
3. grammarAnalysis must be 3–8 sentences of rich, readable explanation of the sentence pattern, key grammar points, and why the sentence works the way it does. Write in a warm, teacher-like voice.
4. Always attempt natural chineseTranslation (Simplified Chinese preferred) and englishTranslation.
5. In notes, call out:
   - Common mistakes Chinese speakers make with this pattern
   - Alternative natural phrasings or variants
   - Related grammar points the learner should know next
   - Any cultural or pragmatic nuance
6. Be truthful. If a word's etymology is borderline, choose the most accurate label and note uncertainty in gloss or notes.
7. Output ONLY via the provided tool. Never add prose outside the structured object.

You will receive a single Korean sentence. Return a complete, accurate, beautiful analysis.`;

/* -------------------------------------------------------------------------- */
/* User Prompt builder                                                        */
/* -------------------------------------------------------------------------- */

export function buildUserPrompt(koreanSentence: string): string {
  const trimmed = koreanSentence.trim();

  return `Analyze the following Korean sentence for a Chinese learner. Provide an exhaustive, high-quality breakdown.

Sentence to analyze:
"${trimmed}"

Focus especially on:
- Accurate native / sino-korean / loanword classification for each token (this is extremely valuable to the learner)
- Full decomposition of every particle and verb ending
- Natural, fluent Chinese translation that sounds like something a native would say
- Helpful notes that bridge Korean grammar to what a Chinese speaker already knows

Return the analysis using the analyze_korean_sentence tool exactly as specified.`;
}

/* -------------------------------------------------------------------------- */
/* Structured Tool Definition (for Anthropic tool_use / structured outputs)   */
/* This schema is hand-crafted to match AnalyzedSentenceSchema exactly.       */
/* In production you could derive it via zod/v4 toJSONSchema if desired.      */
/* -------------------------------------------------------------------------- */

export const ANALYSIS_TOOL = {
  name: 'analyze_korean_sentence',
  description:
    'Return a complete structured linguistic analysis of a Korean sentence, with etymology tags optimized for Chinese learners. Must cover every token.',
  input_schema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'A stable unique identifier for this analysis (you may use any short unique string; server will normalize).',
      },
      original: {
        type: 'string',
        description: 'The exact original Korean sentence that was provided.',
      },
      tokens: {
        type: 'array',
        description: 'Every morpheme/token in order. Be exhaustive — do not skip any word or particle.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Unique id for the token within this sentence (e.g. "t0", "t1").' },
            text: { type: 'string', description: 'Exact surface form as it appears in the sentence.' },
            lemma: {
              type: 'string',
              description: 'Dictionary/lemma form if different from surface text (e.g. infinitive for verbs).',
            },
            pos: {
              type: 'string',
              description:
                'Precise part-of-speech or morphological tag. Examples: "noun", "verb", "topic-particle", "subject-particle", "honorific-suffix", "conjunctive-ending", "adjective", "adverb", "determiner".',
            },
            etymology: {
              type: 'string',
              enum: ['native', 'sino-korean', 'loanword', 'unknown'],
              description:
                'CRITICAL for Chinese learners: "sino-korean" for 한자-based words (include hanja field), "native" for pure Korean, "loanword" for English/Japanese/etc. borrowings.',
            },
            gloss: {
              type: 'string',
              description: 'Short, learner-friendly meaning or gloss (preferably in Chinese or simple English).',
            },
            grammarRole: {
              type: 'string',
              description:
                'The syntactic or pragmatic role this token plays (e.g. "subject", "topic marker", "object marker", "polite declarative ending", "causative", "past tense marker").',
            },
            hanja: {
              type: 'string',
              description: 'The Chinese characters (Hanja) for Sino-Korean words. Only include when the token is genuinely sino-korean and you are confident.',
            },
          },
          required: ['id', 'text', 'pos', 'etymology'],
          additionalProperties: false,
        },
      },
      grammarAnalysis: {
        type: 'string',
        description:
          'A clear, beautiful 3–8 sentence explanation of the overall grammar, sentence pattern, key particles/endings, and how meaning is constructed. Written for a motivated Chinese learner.',
      },
      englishTranslation: {
        type: 'string',
        description: 'Natural, fluent English translation of the whole sentence.',
      },
      chineseTranslation: {
        type: 'string',
        description: 'Natural, fluent Simplified Chinese translation that a native speaker would actually say.',
      },
      notes: {
        type: 'string',
        description:
          'Pedagogical gold: common errors for Chinese speakers, useful variants, related patterns to study next, cultural notes, false friends, or register differences.',
      },
      createdAt: {
        type: 'string',
        description: 'ISO 8601 timestamp (you can use current time or any valid ISO string).',
      },
      source: {
        type: 'string',
        description: 'Optional source tag, e.g. "user-input".',
      },
    },
    required: [
      'id',
      'original',
      'tokens',
      'grammarAnalysis',
    ],
    additionalProperties: false,
  },
} as const;

/**
 * Type guard / helper to ensure tool output shape before zod validation.
 */
export function isValidAnalysisToolOutput(obj: unknown): obj is AnalyzedSentenceSchema {
  // Lightweight check; full validation happens with zod in analyzer/route
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.original === 'string' &&
    Array.isArray(o.tokens) &&
    typeof o.grammarAnalysis === 'string'
  );
}
