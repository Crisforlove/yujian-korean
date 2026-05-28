/**
 * LLM Analysis facade — the primary public API for sentence analysis in the app.
 *
 * Consumers (UI components, history flows, etc.) should import from here:
 *   import { analyzeSentenceWithKey, AnalysisError } from '@/lib/llm/analyzer';
 *
 * Current implementation:
 * - Always routes through the secure server endpoint /api/analyze
 *   (this guarantees the user's Anthropic key is never exposed to the browser bundle
 *    and is used only ephemerally on the server).
 *
 * Error handling & graceful degradation:
 * - Typed AnalysisError with machine-readable codes
 * - Clear, user-facing messages (no key leakage)
 * - Network / upstream / validation failures are normalized
 * - Callers can catch specific codes (INVALID_KEY, RATE_LIMIT, etc.) and react accordingly
 *   (e.g. prompt user to check their key, show "try again later")
 *
 * Future extensions (outside Task 4 scope):
 * - Direct Anthropic path with server-only keys (env)
 * - Caching / deduping of identical sentences
 * - Offline fallback heuristics or local models
 */

import type { AnalyzedSentence } from '../types';
import type { SupportedProvider } from './schema';

// --------------------------------------------------------------------------
// Error type (consistent with DatabaseError pattern in history-service)
// --------------------------------------------------------------------------

export class AnalysisError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly code?: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'AnalysisError';
  }
}

// --------------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------------

export interface AnalyzeOptions {
  /** AbortSignal for cancellation (e.g. user types fast) */
  signal?: AbortSignal;
}

/**
 * Analyze a Korean sentence using the user's Anthropic API key.
 *
 * The key travels only as far as our controlled /api/analyze route and is
 * discarded immediately after the Claude call.
 *
 * @throws {AnalysisError} with helpful codes for UI handling
 */
export async function analyzeSentenceWithKey(
  sentence: string,
  apiKey: string,
  provider: SupportedProvider = 'anthropic',
  model?: string,
  options: AnalyzeOptions = {}
): Promise<AnalyzedSentence> {
  const operation = 'analyzeSentenceWithKey';

  if (!sentence || typeof sentence !== 'string' || !sentence.trim()) {
    throw new AnalysisError('Sentence must be a non-empty string.', operation, 'INVALID_INPUT');
  }
  if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 10) {
    throw new AnalysisError(
      'A valid API key is required for the selected provider.',
      operation,
      'MISSING_KEY'
    );
  }

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sentence: sentence.trim(),
        provider,
        apiKey,
        model,
      }),
      signal: options.signal,
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok || json?.success === false) {
      const message =
        json?.error ||
        (res.status === 401
          ? 'Invalid Anthropic API key. Please double-check it.'
          : res.status === 429
          ? 'Too many requests to the analysis service. Please wait a moment.'
          : 'Analysis request failed.');

      throw new AnalysisError(
        message,
        operation,
        json?.code || `HTTP_${res.status}`,
        json
      );
    }

    if (!json?.data) {
      throw new AnalysisError(
        'Analysis succeeded but no data was returned.',
        operation,
        'NO_DATA'
      );
    }

    // The data coming from the route has already been validated against the schema
    // and normalized. We cast to the domain type (they are structurally identical).
    return json.data as AnalyzedSentence;
  } catch (err) {
    if (err instanceof AnalysisError) {
      throw err;
    }

    // Fetch / network / abort / JSON parse errors
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new AnalysisError('Analysis was cancelled.', operation, 'ABORTED', err);
    }

    const message =
      err instanceof Error
        ? err.message
        : 'Network or unexpected error while contacting the analysis service.';

    throw new AnalysisError(message, operation, 'NETWORK_OR_UNEXPECTED', err);
  }
}

/**
 * Convenience wrapper that gracefully degrades when no key is supplied.
 * Returns a clear AnalysisError with code 'MISSING_KEY' instead of throwing
 * a low-level error. Useful for UI flows that conditionally call analysis.
 */
export async function analyzeSentence(
  sentence: string,
  apiKey: string | undefined | null,
  provider: SupportedProvider = 'anthropic',
  model?: string,
  options: AnalyzeOptions = {}
): Promise<AnalyzedSentence> {
  if (!apiKey) {
    throw new AnalysisError(
      'Please provide your API key to enable AI analysis.',
      'analyzeSentence',
      'MISSING_KEY'
    );
  }
  return analyzeSentenceWithKey(sentence, apiKey, provider, model, options);
}
