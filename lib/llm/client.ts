/**
 * LLM client scaffolding for 语见.
 * 
 * Will integrate @anthropic-ai/sdk for high-quality Korean grammar + etymology analysis.
 * 
 * Future responsibilities:
 * - Prompt engineering for accurate tokenization + etymology tagging
 * - Structured output validation (zod)
 * - Caching + rate limiting
 * - Fallbacks for offline
 * 
 * This file is a stub for Task 1 scaffolding.
 */

import Anthropic from '@anthropic-ai/sdk';
// import { z } from 'zod';
// import type { AnalyzedSentence } from '../types';

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
  // Add timeout, retries etc in real implementation
});

/**
 * Placeholder for the sentence analysis function.
 * Real implementation will come in later tasks.
 * (Not used by the active MVP flow — see lib/llm/analyzer.ts + /api/analyze)
 */
export async function analyzeSentence(): Promise<unknown> {
  // TODO (later tasks): call Claude with carefully engineered prompt
  // for grammar analysis + etymology tagging of every token.
  throw new Error('analyzeSentence not implemented yet (Task 1 scaffolding only)');
}

export default anthropic;
