/**
 * Secure server Route Handler: /api/analyze
 *
 * Accepts a Korean sentence + the user's own API key + chosen provider.
 * The key is used ONLY for this single request, then discarded.
 *
 * SECURITY CONTRACT (never violate):
 * - The API key is NEVER logged.
 * - The API key is NEVER returned to the client.
 * - The API key is NEVER persisted.
 * - All errors returned to client are sanitized.
 *
 * Supported providers: anthropic | openai | gemini | deepseek
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

import {
  analyzeRequestSchema,
  analyzedSentenceSchema,
  type AnalyzedSentenceSchema,
  type SupportedProvider,
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

function sanitizeErrorForClient(err: unknown, provider: SupportedProvider = 'anthropic'): { message: string; code?: string } {
  const providerName = provider === 'anthropic' ? 'Anthropic' : 
                       provider === 'openai' ? 'OpenAI' :
                       provider === 'gemini' ? 'Gemini' : 'DeepSeek';

  if (err instanceof Error) {
    const msg = err.message.toLowerCase();

    // 403 specific handling (common with invalid key / permission issues)
    if (msg.includes('403') || msg.includes('forbidden')) {
      return { 
        message: `${providerName} 返回 403（权限不足或 Key 无效）。请检查：1) Key 是否正确 2) 账户是否有余额/额度 3) 是否已开通该模型权限`, 
        code: 'INVALID_KEY' 
      };
    }

    if (msg.includes('api key') || msg.includes('apikey') || msg.includes('unauthorized') || msg.includes('invalid key')) {
      return { message: `Invalid or unauthorized ${providerName} API key.`, code: 'INVALID_KEY' };
    }
    if (msg.includes('rate limit') || msg.includes('429')) {
      return { message: `${providerName} rate limit exceeded. Please try again later.`, code: 'RATE_LIMIT' };
    }
    if (msg.includes('service') || msg.includes('unavailable') || msg.includes('500')) {
      return { message: `${providerName} service temporarily unavailable.`, code: 'UPSTREAM_ERROR' };
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
  let provider: SupportedProvider = 'anthropic';

  try {
    // 1. Parse & validate request body
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

    const { sentence, apiKey: providedKey, provider: requestedProvider } = parsed.data;
    apiKey = providedKey;
    provider = requestedProvider;

    let finalAnalysis: AnalyzedSentenceSchema;

    // ========================================================================
    // Provider dispatch
    // ========================================================================

    if (provider === 'anthropic') {
      finalAnalysis = await callAnthropic(sentence, providedKey, parsed.data.model);
    } else if (provider === 'openai' || provider === 'deepseek') {
      // Allow user-provided baseURL for relays (中转站). Fall back to official endpoints.
      const defaultBase = provider === 'deepseek' ? 'https://api.deepseek.com' : undefined;
      const effectiveBaseURL = parsed.data.baseURL || defaultBase;

      finalAnalysis = await callOpenAICompatible(sentence, providedKey, provider, effectiveBaseURL, parsed.data.model);
    } else if (provider === 'gemini') {
      finalAnalysis = await callGemini(sentence, providedKey, parsed.data.model);
    } else {
      return NextResponse.json(
        { success: false, error: 'Unsupported provider', code: 'UNSUPPORTED_PROVIDER' },
        { status: 400 }
      );
    }

    // 7. Return ONLY the analysis — key is never included
    return NextResponse.json(
      {
        success: true,
        data: finalAnalysis,
      },
      { status: 200 }
    );
  } catch (err) {
    const safe = sanitizeErrorForClient(err, provider);
    console.error('[analyze/route] Analysis request failed', {
      provider,
      code: safe.code,
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
    apiKey = undefined;
  }
}

// ============================================================================
// Provider implementations
// ============================================================================

async function callAnthropic(sentence: string, apiKey: string, model?: string): Promise<AnalyzedSentenceSchema> {
  const anthropic = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 1 });

  const response = await anthropic.messages.create({
    model: model || 'claude-3-5-sonnet-20241022',
    max_tokens: 8192,
    temperature: 0.2,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(sentence) }],
    tools: [ANALYSIS_TOOL as unknown as Anthropic.Tool],
    tool_choice: { type: 'tool', name: 'analyze_korean_sentence' },
  });

  const toolUseBlock = response.content.find(
    (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use'
  );

  if (!toolUseBlock) {
    throw new Error('Model did not return structured analysis');
  }

  const validated = analyzedSentenceSchema.parse(toolUseBlock.input);
  return normalizeAnalysis(validated, sentence);
}

async function callOpenAICompatible(
  sentence: string,
  apiKey: string,
  provider: 'openai' | 'deepseek',
  baseURL?: string,
  modelOverride?: string
): Promise<AnalyzedSentenceSchema> {
  const openaiConfig: any = {
    apiKey,
    baseURL: baseURL || undefined,
    timeout: 60_000,
    maxRetries: 1,
  };

  // For official endpoints, send a nice User-Agent.
  // For relays (custom baseURL), do NOT send custom User-Agent at all,
  // to maximize compatibility with strict 中转站.
  if (!baseURL) {
    openaiConfig.defaultHeaders = {
      'User-Agent': 'Yujian/1.0 (https://github.com/Crisforlove/yujian-korean)',
    };
  }

  const openai = new OpenAI(openaiConfig);

  const model = modelOverride || (provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o');

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(sentence) },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'analyze_korean_sentence',
        schema: ANALYSIS_TOOL.input_schema, // reuse the same schema
      },
    },
    temperature: 0.2,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('No response from model');

  const parsed = JSON.parse(content);
  const validated = analyzedSentenceSchema.parse(parsed);
  return normalizeAnalysis(validated, sentence);
}

async function callGemini(sentence: string, apiKey: string, modelOverride?: string): Promise<AnalyzedSentenceSchema> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelOverride || 'gemini-1.5-flash',
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- schema typing from provider (pre-existing)
      responseSchema: ANALYSIS_TOOL.input_schema as any,
    },
    systemInstruction: SYSTEM_PROMPT,
  });

  const result = await model.generateContent(buildUserPrompt(sentence));
  const text = result.response.text();

  const parsed = JSON.parse(text);
  const validated = analyzedSentenceSchema.parse(parsed);
  return normalizeAnalysis(validated, sentence);
}

// Shared normalization
function normalizeAnalysis(
  validated: AnalyzedSentenceSchema,
  originalSentence: string
): AnalyzedSentenceSchema {
  return {
    ...validated,
    id: generateId(),
    original: originalSentence,
    createdAt: nowIso(),
    source: validated.source || 'user',
    englishTranslation: validated.englishTranslation,
    chineseTranslation: validated.chineseTranslation,
    notes: validated.notes,
  };
}

// Optional: reject other methods explicitly (Next handles 405, but explicit is clearer)
export function GET() {
  return NextResponse.json({ error: 'Method not allowed. Use POST.' }, { status: 405 });
}
