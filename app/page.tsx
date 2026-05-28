'use client';

import React, { useState, useCallback } from 'react';
import { 
  Send, 
  Loader2, 
  AlertCircle, 
  Check, 
  Trash2, 
  KeyRound, 
  BookOpen,
  X,
  Search,
  Plus
} from 'lucide-react';

import { analyzeSentenceWithKey, AnalysisError } from '@/lib/llm/analyzer';
import { addToHistory, saveWordEntry } from '@/lib/history-service';
import type { AnalyzedSentence, Token, EtymologyTag, WordEntry } from '@/lib/types';

// --------------------------------------------------------------------------
// Etymology display (Chinese labels for our audience, matching Task 2 badges)
// --------------------------------------------------------------------------
const ETYMOLOGY_LABELS: Record<EtymologyTag, string> = {
  native: '固有词',
  'sino-korean': '汉字词',
  loanword: '外来词',
  unknown: '未分类',
};

function getEtymologyBadgeClass(etymology: EtymologyTag): string {
  // Maps directly to the refined classes in globals.css (Task 2)
  return `etymology-badge etymology-badge-${etymology}`;
}

/** Lightweight client-side ID generator (matches history-service pattern) */
function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'wd_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
}

// --------------------------------------------------------------------------
// Token Card — now clickable for Word Detail (Task 6)
// --------------------------------------------------------------------------
function TokenCard({ token, onClick }: { token: Token; onClick?: (token: Token) => void }) {
  const hasLemma = token.lemma && token.lemma !== token.text;
  const isClickable = !!onClick;

  const handleClick = () => {
    if (onClick) onClick(token);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick?.(token);
    }
  };

  return (
    <div
      className={`token-card ${isClickable ? 'token-card--clickable' : ''}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      aria-label={isClickable ? `查看「${token.text}」单词详情` : undefined}
    >
      {/* Korean surface form — visual priority */}
      <div className="token-surface hangul korean-text">{token.text}</div>

      {/* Lemma (dictionary form) when different */}
      {hasLemma && (
        <div className="token-lemma">词典形：{token.lemma}</div>
      )}

      {/* Meta row: etymology badge (Task 2) + POS */}
      <div className="token-meta">
        <span className={getEtymologyBadgeClass(token.etymology)}>
          {ETYMOLOGY_LABELS[token.etymology]}
        </span>
        <span className="token-pos">{token.pos}</span>
      </div>

      {/* Grammar role (if provided by LLM) */}
      {token.grammarRole && (
        <div className="token-grammar">语法角色：{token.grammarRole}</div>
      )}

      {/* Gloss — helpful Chinese or English for learners */}
      {token.gloss && (
        <div className="token-gloss">{token.gloss}</div>
      )}

      {/* Hanja for Sino-Korean — quiet scholarly touch */}
      {token.hanja && (
        <div className="token-hanja">{token.hanja}</div>
      )}

      {isClickable && (
        <div className="token-click-hint">点击查看详情 →</div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// Word Detail Modal / Drawer (Task 6) — calm, elegant, reuses Task 2 badge styles
// Shows: word + etymology, Hanja, meanings (from gloss), examples (contextual),
// + "Add to my learning" that persists a full WordEntry to Dexie via saveWordEntry
// --------------------------------------------------------------------------
function WordDetailModal({
  token,
  context,
  onClose,
  onAddToLearning,
  isAdding,
}: {
  token: Token;
  context?: AnalyzedSentence | null;
  onClose: () => void;
  onAddToLearning: (token: Token, context?: AnalyzedSentence | null) => Promise<void>;
  isAdding: boolean;
}) {
  const hasLemma = token.lemma && token.lemma !== token.text;
  const meaning = token.gloss || '暂无释义（分析时未提供）';

  // Build example(s) from sentence context when available (reuses analyzer output)
  const examples = context
    ? [
        {
          sentence: context.original,
          translation: context.chineseTranslation || context.englishTranslation || '',
        },
      ]
    : [];

  const handleAdd = async () => {
    await onAddToLearning(token, context);
  };

  // ESC to close (good UX, standard for modals)
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="word-detail-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="word-detail-title"
    >
      <div
        className="word-detail-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="word-detail-header">
          <div>
            <div className="word-detail-korean korean-text" id="word-detail-title">
              {token.text}
            </div>
            {hasLemma && (
              <div className="word-detail-lemma">词典形：{token.lemma}</div>
            )}
          </div>

          <div className="flex items-start gap-2">
            <span className={getEtymologyBadgeClass(token.etymology)}>
              {ETYMOLOGY_LABELS[token.etymology]}
            </span>
            <button
              onClick={onClose}
              className="word-detail-close"
              aria-label="关闭详情"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Hanja — prominent when present (Sino-Korean words) */}
        {token.hanja && (
          <div className="word-detail-hanja-block">
            <span className="word-detail-label">汉字</span>
            <div className="word-detail-hanja">{token.hanja}</div>
          </div>
        )}

        {/* Meanings */}
        <div className="word-detail-section">
          <span className="word-detail-label">释义 · Meanings</span>
          <div className="word-detail-meaning">{meaning}</div>
          {token.pos && (
            <div className="word-detail-pos-note">词性：{token.pos}</div>
          )}
        </div>

        {/* Grammar role if present */}
        {token.grammarRole && (
          <div className="word-detail-section">
            <span className="word-detail-label">语法角色</span>
            <div className="word-detail-grammar">{token.grammarRole}</div>
          </div>
        )}

        {/* Examples from context (when opened from analyzer result) */}
        <div className="word-detail-section">
          <span className="word-detail-label">例句 · Examples</span>
          {examples.length > 0 ? (
            examples.map((ex, idx) => (
              <div key={idx} className="word-detail-example">
                <div className="word-detail-example-korean korean-text">{ex.sentence}</div>
                {ex.translation && (
                  <div className="word-detail-example-cn">{ex.translation}</div>
                )}
              </div>
            ))
          ) : (
            <div className="word-detail-example-empty">
              独立查词时暂无上下文例句。可在句子分析结果中点击词元获得丰富例句。
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="word-detail-actions">
          <button
            onClick={handleAdd}
            disabled={isAdding}
            className="add-learning-button"
          >
            {isAdding ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> 正在加入学习…
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" /> 加入我的学习
              </>
            )}
          </button>
          <button onClick={onClose} className="word-detail-secondary">
            关闭
          </button>
        </div>

        <p className="word-detail-footer-note">
          保存后可在“我的学习”中复习（数据存储于本地 Dexie）。
        </p>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Main Sentence Analyzer Page (Core Experience — Task 5 + Task 6 Word Detail & Lookup)
// --------------------------------------------------------------------------
export default function SentenceAnalyzerPage() {
  // Input state
  const [sentenceInput, setSentenceInput] = useState('');

  // API Key (client-only, never sent anywhere except our /api/analyze)
  // Lazy initializer safely reads from localStorage on client mount (no setState-in-effect)
  const [apiKey, setApiKey] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        return localStorage.getItem('yujian:apiKey') || '';
      } catch {
        return '';
      }
    }
    return '';
  });

  // Derived — always truthful, no extra state mutations needed
  const isKeySaved = apiKey.trim().length > 0;

  // Analysis flow
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AnalyzedSentence | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  // Auto-save feedback toast
  const [showSavedToast, setShowSavedToast] = useState(false);

  // ------------------------------------------------------------------------
  // Task 6: Word Detail + Standalone Lookup state
  // ------------------------------------------------------------------------
  const [selectedDetail, setSelectedDetail] = useState<{
    token: Token;
    context: AnalyzedSentence | null;
  } | null>(null);
  const [isAddingToLearning, setIsAddingToLearning] = useState(false);
  const [showWordSavedToast, setShowWordSavedToast] = useState(false);

  // Standalone word lookup (reuses analyzer for accuracy + rich gloss/hanja/etymology)
  const [wordLookupInput, setWordLookupInput] = useState('');
  const [isWordLookupLoading, setIsWordLookupLoading] = useState(false);

  // ------------------------------------------------------------------------
  // API Key persistence helpers (writes only — no effect sets)
  // ------------------------------------------------------------------------
  const updateApiKey = useCallback((value: string) => {
    const trimmed = value.trim();
    setApiKey(trimmed);

    try {
      if (trimmed.length > 0) {
        localStorage.setItem('yujian:apiKey', trimmed);
      } else {
        localStorage.removeItem('yujian:apiKey');
      }
    } catch {
      // ignore storage errors (private mode, etc.)
    }
  }, []);

  const clearApiKey = useCallback(() => {
    setApiKey('');
    try {
      localStorage.removeItem('yujian:apiKey');
    } catch {}
  }, []);

  // ------------------------------------------------------------------------
  // Core analysis handler — wires directly to analyzeSentenceWithKey (Task 4)
  // Auto-saves via history-service (Task 3) on success
  // ------------------------------------------------------------------------
  const handleAnalyze = async () => {
    const trimmedSentence = sentenceInput.trim();
    if (!trimmedSentence) return;

    const keyToUse = apiKey.trim();
    if (!keyToUse) {
      setError('请先输入您的 Anthropic API Key（仅用于本次安全分析）。');
      setErrorCode('MISSING_KEY');
      return;
    }

    setIsLoading(true);
    setError(null);
    setErrorCode(null);
    setResult(null);

    try {
      // Call the secure facade (routes through /api/analyze — key never leaves server scope)
      const analysis = await analyzeSentenceWithKey(trimmedSentence, keyToUse);

      // Success! Set result immediately for beautiful rendering
      setResult(analysis);

      // Auto-save to Dexie layer (creates HistoryItem + stores the sentence snapshot)
      // This powers future "我的学习 / 历史" experience
      try {
        await addToHistory({
          sentence: analysis,
          reviewCount: 0,
          tags: [],
        });
        
        // Gentle non-blocking success indicator
        setShowSavedToast(true);
        window.setTimeout(() => setShowSavedToast(false), 2200);
      } catch (saveErr) {
        // Non-fatal: analysis succeeded even if save had a transient IndexedDB hiccup
        console.warn('[Yujian] Auto-save to history failed (non-fatal):', saveErr);
      }
    } catch (err) {
      if (err instanceof AnalysisError) {
        setError(err.message);
        setErrorCode(err.code || 'ANALYSIS_ERROR');
      } else {
        setError(
          err instanceof Error 
            ? err.message 
            : '分析时遇到未知问题，请稍后重试。'
        );
        setErrorCode('UNKNOWN');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl + Enter triggers analysis (common in writing tools)
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!isLoading) {
        handleAnalyze();
      }
    }
  };

  const clearResult = () => {
    setResult(null);
    setError(null);
    setErrorCode(null);
  };

  const clearAll = () => {
    setSentenceInput('');
    clearResult();
  };

  // ------------------------------------------------------------------------
  // Task 6 handlers: Word Detail (from clickable tokens or lookup) + Dexie save
  // ------------------------------------------------------------------------
  const openWordDetail = (token: Token, context?: AnalyzedSentence | null) => {
    setSelectedDetail({ token, context: context ?? null });
  };

  const closeWordDetail = () => {
    setSelectedDetail(null);
  };

  const handleAddToLearning = async (token: Token, context?: AnalyzedSentence | null) => {
    setIsAddingToLearning(true);
    try {
      const displayWord = (token.lemma && token.lemma !== token.text) ? token.lemma : token.text;
      const definitions = token.gloss ? [token.gloss] : [displayWord];
      const examples = context
        ? [{
            sentence: context.original,
            translation: context.chineseTranslation || context.englishTranslation || '',
          }]
        : [];

      const wordEntry: WordEntry = {
        id: generateId(),
        word: displayWord,
        etymology: token.etymology,
        definitions,
        examples,
        hanja: token.hanja,
        level: undefined,
        related: undefined,
      };

      await saveWordEntry(wordEntry);

      // Success feedback (reuse toast pattern)
      setShowWordSavedToast(true);
      window.setTimeout(() => setShowWordSavedToast(false), 2200);

      // Keep modal open so user sees confirmation; they can close manually
    } catch (err) {
      console.error('[Yujian] Failed to save word to learning:', err);
      // Non-blocking: show in console; user can retry. In real app would surface soft error.
      alert('保存失败，请稍后重试（数据存储于本地）。');
    } finally {
      setIsAddingToLearning(false);
    }
  };

  // Standalone word lookup: reuses the analyzer (treats word as input) → extracts primary token → opens detail
  // This fulfills "simple input that reuses the analyzer" without new endpoints or files.
  const handleWordLookup = async () => {
    const trimmed = wordLookupInput.trim();
    if (!trimmed) return;

    const keyToUse = apiKey.trim();
    if (!keyToUse) {
      alert('请先输入 Anthropic API Key 才能使用查词（仅发送至安全 /api/analyze）。');
      return;
    }

    setIsWordLookupLoading(true);
    try {
      // Reuse the exact same secure pipeline. LLM prompt handles single-word gracefully (returns 1 token).
      const analysis = await analyzeSentenceWithKey(trimmed, keyToUse);

      if (analysis.tokens && analysis.tokens.length > 0) {
        // Open detail using first token + the mini-analysis as context (provides example)
        openWordDetail(analysis.tokens[0], analysis);
        setWordLookupInput(''); // clear after successful lookup
      } else {
        alert('查词未返回有效词元，请尝试更完整的词或句子分析。');
      }
    } catch (err) {
      if (err instanceof AnalysisError) {
        alert(`查词失败：${err.message}`);
      } else {
        alert('查词时遇到问题，请检查 Key 或稍后重试。');
      }
    } finally {
      setIsWordLookupLoading(false);
    }
  };

  const handleWordLookupKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isWordLookupLoading) {
      handleWordLookup();
    }
  };

  // Friendly error messages per code (from analyzer + route)
  const getErrorGuidance = (code: string | null): string => {
    if (!code) return '';
    switch (code) {
      case 'MISSING_KEY':
      case 'INVALID_KEY':
        return '请确认 API Key 格式正确（sk-ant-...），且 Anthropic 账户有可用额度。';
      case 'RATE_LIMIT':
        return '服务请求过多，请稍等 30 秒后再试。';
      case 'INVALID_INPUT':
        return '请输入有效的韩语句子。';
      default:
        return '如持续失败，请检查网络或稍后再试。';
    }
  };

  const canAnalyze = sentenceInput.trim().length > 0 && apiKey.trim().length > 0 && !isLoading;

  // ------------------------------------------------------------------------
  // Render — elegant, calm, Korean-centric experience
  // ------------------------------------------------------------------------
  return (
    <div className="analyzer-page">
      {/* Calm header */}
      <header className="analyzer-header">
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex items-center gap-3">
            <BookOpen className="w-6 h-6 text-[var(--color-accent-sage)]" />
            <div>
              <h1 className="analyzer-title">语见 · Yujian</h1>
              <p className="analyzer-subtitle">
                平静而优雅的韩语学习空间 · 词源 · 语法 · 细腻洞察
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 pt-8 pb-24">
        {/* API Key — discreet but essential for core experience */}
        <div className="api-key-bar">
          <KeyRound className="w-4 h-4 text-[var(--color-text-tertiary)] flex-shrink-0" />
          <input
            type="password"
            value={apiKey}
            onChange={(e) => updateApiKey(e.target.value)}
            placeholder="sk-ant-... （您的 Anthropic API Key，仅发送至安全服务端）"
            className="api-key-input"
            autoComplete="off"
            spellCheck={false}
          />
          {isKeySaved && (
            <span className="text-[var(--color-accent-sage)] text-xs font-medium flex items-center gap-1 whitespace-nowrap">
              <Check className="w-3.5 h-3.5" /> 已保存
            </span>
          )}
          {apiKey && (
            <button
              onClick={clearApiKey}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] p-1 transition-colors"
              aria-label="清除 API Key"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Sentence input */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2 tracking-wide">
            输入韩语句子
          </label>
          <div className="sentence-input-wrapper">
            <textarea
              value={sentenceInput}
              onChange={(e) => setSentenceInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="例如：오늘 날씨가 정말 좋네요.&#10;或：제가 어제 산 책을 읽고 있어요."
              className="sentence-input focus-ring"
              disabled={isLoading}
            />
          </div>
          <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">
            支持 Cmd/Ctrl + Enter 快速分析 · 越完整的句子，词源与语法拆解越精准
          </p>
        </div>

        {/* Action row */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleAnalyze}
            disabled={!canAnalyze}
            className="analyze-button"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                正在深度分析…
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                分析句子
              </>
            )}
          </button>

          {(sentenceInput || result) && (
            <button
              onClick={clearAll}
              disabled={isLoading}
              className="text-sm text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] px-3 py-2 rounded-full transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              清空
            </button>
          )}
        </div>

        {/* Task 6: Standalone Word Lookup — simple input, reuses analyzer for full etymology + detail */}
        <div className="word-lookup-section mt-6">
          <div className="flex items-center gap-2 mb-2">
            <Search className="w-4 h-4 text-[var(--color-accent-sage)]" />
            <span className="text-sm font-medium text-[var(--color-text-secondary)] tracking-wide">快速查词</span>
            <span className="text-[10px] text-[var(--color-text-muted)]">（复用分析器，获得词源与释义）</span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={wordLookupInput}
              onChange={(e) => setWordLookupInput(e.target.value)}
              onKeyDown={handleWordLookupKeyDown}
              placeholder="输入单词，如：사랑 或 행복"
              className="word-lookup-input focus-ring"
              disabled={isWordLookupLoading || isLoading}
            />
            <button
              onClick={handleWordLookup}
              disabled={!wordLookupInput.trim() || isWordLookupLoading || !apiKey.trim()}
              className="word-lookup-button"
            >
              {isWordLookupLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                '查词'
              )}
            </button>
          </div>
          <p className="mt-1.5 text-[10px] text-[var(--color-text-muted)]">
            无需完整句子。查词成功后自动打开详情，可直接「加入我的学习」。
          </p>
        </div>

        {/* Loading indicator */}
        {isLoading && (
          <div className="loading-state mt-6">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Claude 正在进行形态拆解与词源标注（通常 4–9 秒）…</span>
          </div>
        )}

        {/* Error display — soft and actionable */}
        {error && (
          <div className="error-card mt-6" role="alert">
            <AlertCircle className="icon w-4 h-4" />
            <div>
              <div className="font-medium mb-0.5">分析失败</div>
              <div>{error}</div>
              {errorCode && (
                <div className="mt-1 text-xs opacity-75">
                  {getErrorGuidance(errorCode)}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Beautiful analysis result (Korean priority throughout) */}
        {result && (
          <div className="result-panel">
            <div className="result-header">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs tracking-[0.08em] font-semibold text-[var(--color-text-tertiary)]">分析完成</span>
                  <span className="save-indicator">
                    <Check className="w-3.5 h-3.5" /> 已自动保存至学习历史
                  </span>
                </div>
                <div className="original-sentence korean-text">{result.original}</div>
              </div>
              <button
                onClick={clearResult}
                className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
              >
                关闭结果
              </button>
            </div>

            {/* Chinese translation — priority for our users */}
            {result.chineseTranslation && (
              <div className="translation-block">
                <span className="translation-label">中文翻译</span>
                <div className="translation-text cn">{result.chineseTranslation}</div>
              </div>
            )}

            {/* English translation — secondary but available */}
            {result.englishTranslation && (
              <div className="translation-block">
                <span className="translation-label">English Translation</span>
                <div className="translation-text">{result.englishTranslation}</div>
              </div>
            )}

            {/* Grammar analysis — the pedagogical heart */}
            {result.grammarAnalysis && (
              <div>
                <div className="translation-label mb-2">语法分析与句型解析</div>
                <div className="grammar-analysis text-reading">
                  {result.grammarAnalysis}
                </div>
              </div>
            )}

            {/* Optional pedagogical notes */}
            {result.notes && (
              <>
                <div className="result-divider" />
                <div className="translation-block">
                  <span className="translation-label">学习笔记</span>
                  <div className="translation-text" style={{ borderLeftColor: 'var(--color-accent-warm)' }}>
                    {result.notes}
                  </div>
                </div>
              </>
            )}

            {/* Token / Morpheme Breakdown — the star of the experience */}
            {result.tokens && result.tokens.length > 0 && (
              <>
                <div className="result-divider" />
                <div className="token-breakdown-header">
                  <span>词素拆解 · Morpheme Breakdown</span>
                  <span className="text-[var(--color-text-muted)] font-normal">（{result.tokens.length} 个词元）</span>
                </div>

                <div className="token-grid">
                  {result.tokens.map((token) => (
                    <TokenCard 
                      key={token.id} 
                      token={token} 
                      onClick={(t) => openWordDetail(t, result)} 
                    />
                  ))}
                </div>

                <p className="mt-3 text-[10px] text-[var(--color-text-muted)] tracking-wide">
                  每张卡片突出韩语本形，词源徽章（固有词 / 汉字词 / 外来词）。<strong>点击任意卡片</strong>打开单词详情（释义、例句、加入学习）。
                </p>
              </>
            )}
          </div>
        )}

        {/* Empty / hint state */}
        {!result && !isLoading && !error && (
          <div className="mt-10 text-center text-[var(--color-text-tertiary)] text-sm">
            输入句子后点击「分析句子」即可获得完整的词源标注、语法解析与中英翻译。<br />
            结果中的每个词元卡片均可点击打开「单词详情」（Task 6），或直接使用上方的「快速查词」独立查找。
          </div>
        )}
      </main>

      {/* Subtle footer note — security & scope transparent */}
      <footer className="max-w-4xl mx-auto px-6 pb-12 text-[10px] text-[var(--color-text-muted)] text-center tracking-wide">
        API Key 仅在浏览器本地保存并通过 HTTPS 安全发送至 /api/analyze（服务端使用后立即丢弃）。<br />
        Task 5 句子分析 + Task 6 单词详情与查词（点击词元或使用快速查词打开精美详情，可保存至我的学习）。
      </footer>

      {/* Auto-save toast (sentence) */}
      {showSavedToast && (
        <div className="analyzer-toast" role="status">
          <Check className="w-4 h-4" /> 已自动保存到学习历史
        </div>
      )}

      {/* Word saved toast (Task 6) */}
      {showWordSavedToast && (
        <div className="analyzer-toast word-toast" role="status">
          <Check className="w-4 h-4" /> 已加入我的学习
        </div>
      )}

      {/* Word Detail Modal (Task 6) — rendered at root level for proper overlay */}
      {selectedDetail && (
        <WordDetailModal
          token={selectedDetail.token}
          context={selectedDetail.context}
          onClose={closeWordDetail}
          onAddToLearning={handleAddToLearning}
          isAdding={isAddingToLearning}
        />
      )}
    </div>
  );
}
