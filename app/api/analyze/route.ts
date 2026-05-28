/**
 * Secure server Route Handler: /api/analyze
 *
 * Accepts a Korean sentence + the *user's own Anthropic API key* from the client.
 * The key is used ONLY for this single request to call Claude, then discarded.
 *
 * SECURITY CONTRACT (never violate):
 * - The API key is NEVER logged.
 * - The API key is NEVER returned to the client in any response (success or error).
 * - The API key is NEVER persisted to DB, cookies, or any storage.
 * - All errors returned to client are sanitized (no key fragments, no raw Anthropic traces).
 *
 * Responsibilities:
 * - Input validation via zod (sentence + key format)
 * - Construct one-off Anthropic client with the provided key
 * - Call Claude using SYSTEM_PROMPT + ANALYSIS_TOOL for structured output
 * - Validate + normalize the tool result against analyzedSentenceSchema
 * - Generate trustworthy id + createdAt server-side
 * - Return clean AnalyzedSentence or structured error
 *
 * This is the ONLY place in the app that talks to the Anthropic API for analysis.
 */

import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

import {
  analyzeRequestSchema,
  analyzedSentenceSchema,
  type AnalyzedSentenceSchema,
} from '@/lib/llm/schema';
import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  ANALYSIS_TOOL,
} from '@/lib/llm/prompt';

// --------------------------------------------------------------------------
// Helpers (modeled after lib/history-service patterns for consistency)
// --------------------------------------------------------------------------

function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'an_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

function nowIso(): string {
  return new Date().toISOString();
}

function sanitizeErrorForClient(err: unknown): { message: string; code?: string } {
  if (err instanceof Anthropic.APIError) {
    if (err.status === 401 || err.status === 403) {
      return { message: 'Invalid or unauthorized Anthropic API key.', code: 'INVALID_KEY' };
    }
    if (err.status === 429) {
      return { message: 'Anthropic rate limit exceeded. Please try again later.', code: 'RATE_LIMIT' };
    }
    if (err.status && err.status >= 500) {
      return { message: 'Anthropic service temporarily unavailable.', code: 'UPSTREAM_ERROR' };
    }
    return { message: 'Error from Anthropic API.', code: 'ANTHROPIC_ERROR' };
  }

  if (err instanceof Error) {
    // Never leak key material
    const msg = err.message.toLowerCase();
    if (msg.includes('api key') || msg.includes('apikey') || msg.includes('sk-ant')) {
      return { message: 'There was a problem with the provided API key.', code: 'KEY_ISSUE' };
    }
    return { message: err.message, code: 'INTERNAL' };
  }

  return { message: 'Unexpected error during analysis.', code: 'UNKNOWN' };
}

// --------------------------------------------------------------------------
// POST /api/analyze
// --------------------------------------------------------------------------

export async function POST(request: Request) {
  let apiKey: string | undefined;

  try {
    // 1. Parse & validate request body (never trust client)
    const body = await request.json();
    const parsed = analyzeRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request',
          issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
        { status: 400 }
      );
    }

    const { sentence, apiKey: providedKey } = parsed.data;
    apiKey = providedKey; // only in memory for this scope

    // 2. Create ephemeral Anthropic client using ONLY the user-supplied key
    const anthropic = new Anthropic({
      apiKey: providedKey,
      // Reasonable timeouts/retries for a grammar analysis call
      timeout: 60_000,
      maxRetries: 1,
    });

    // 3. Call Claude with carefully engineered prompts + forced structured tool use
    const claudeResponse = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 8192,
      temperature: 0.2, // low temp for factual linguistic analysis
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: buildUserPrompt(sentence),
        },
      ],
      tools: [ANALYSIS_TOOL as unknown as Anthropic.Tool], // schema matches Anthropic.Tool (name + input_schema) — double cast avoids `any` literal
      tool_choice: {
        type: 'tool',
        name: 'analyze_korean_sentence',
      },
    });

    // 4. Extract the forced tool_use result
    const toolUseBlock = claudeResponse.content.find(
      (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use'
    );

    if (!toolUseBlock) {
      return NextResponse.json(
        { success: false, error: 'Claude did not return the expected structured analysis.' },
        { status: 502 }
      );
    }

    const rawAnalysis = toolUseBlock.input;

    // 5. Validate + normalize with Zod (the source of truth)
    const zodResult = analyzedSentenceSchema.safeParse(rawAnalysis);

    if (!zodResult.success) {
      // Log only safe diagnostic info (never the key)
      console.error('[analyze/route] Zod validation failed on Claude output', {
        issues: zodResult.error.issues,
        sentenceLength: sentence.length,
      });

      return NextResponse.json(
        {
          success: false,
          error: 'The analysis returned by the model did not match the expected schema.',
          code: 'VALIDATION_FAILED',
        },
        { status: 422 }
      );
    }

    const validated = zodResult.data;

    // 6. Server-side normalization (authoritative id, timestamp, original, source)
    const finalAnalysis: AnalyzedSentenceSchema = {
      ...validated,
      id: generateId(),
      original: sentence, // always trust the actual request input
      createdAt: nowIso(),
      source: validated.source || 'user',
      // ensure optional fields exist as undefined rather than absent for consumers
      englishTranslation: validated.englishTranslation,
      chineseTranslation: validated.chineseTranslation,
      notes: validated.notes,
    };

    // Final strict validation (belt + suspenders)
    const finalCheck = analyzedSentenceSchema.safeParse(finalAnalysis);
    if (!finalCheck.success) {
      console.error('[analyze/route] Post-normalization validation failed (should never happen)');
      return NextResponse.json(
        { success: false, error: 'Internal processing error after analysis.' },
        { status: 500 }
      );
    }

    // 7. Return ONLY the analysis — key is never included
    return NextResponse.json(
      {
        success: true,
        data: finalCheck.data,
      },
      { status: 200 }
    );
  } catch (err) {
    const safe = sanitizeErrorForClient(err);
    // Never log the raw key
    console.error('[analyze/route] Analysis request failed', {
      code: safe.code,
      // only safe context
      hasKey: !!apiKey,
    });

    const status = safe.code === 'INVALID_KEY' ? 401 : safe.code === 'RATE_LIMIT' ? 429 : 500;

    return NextResponse.json(
      {
        success: false,
        error: safe.message,
        code: safe.code,
      },
      { status }
    );
  } finally {
    // Explicitly drop any reference (helps in some GC / memory inspection scenarios)
    apiKey = undefined;
  }
}

// Optional: reject other methods explicitly (Next handles 405, but explicit is clearer)
export function GET() {
  return NextResponse.json({ error: 'Method not allowed. Use POST.' }, { status: 405 });
}
