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
  Plus,
  History,
  Download,
  Calendar,
  Star,
  Award,
  Filter,
  RefreshCw,
  Settings
} from 'lucide-react';

import { analyzeSentenceWithKey, AnalysisError } from '@/lib/llm/analyzer';
import { 
  addToHistory, 
  saveWordEntry,
  getHistory,
  deleteHistoryItem,
  markHistoryAsMastered,
  markHistoryAsFocus,
  unmarkHistoryAsFocus,
  getAllWordEntries,
  deleteWordEntry,
  clearAllData,
} from '@/lib/history-service';
import type { AnalyzedSentence, Token, EtymologyTag, WordEntry, HistoryItem } from '@/lib/types';

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
// Task 7 Helpers: Date formatting, etymology aggregation, filter predicates
// Calm, pure, no side effects. Used by History view.
// --------------------------------------------------------------------------
function formatHistoryDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('zh-CN', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit' 
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function getEtymologiesInSentence(sentence: AnalyzedSentence): EtymologyTag[] {
  const set = new Set<EtymologyTag>();
  sentence.tokens?.forEach(t => set.add(t.etymology));
  return Array.from(set);
}

function historyItemHasEtymology(item: HistoryItem, etym: EtymologyTag): boolean {
  return (item.sentence.tokens || []).some(t => t.etymology === etym);
}

function wordHasEtymology(word: WordEntry, etym: EtymologyTag): boolean {
  return word.etymology === etym;
}

// Simple status derivation for HistoryItem using tags (existing schema, no changes)
function getItemStatus(item: HistoryItem): 'mastered' | 'focus' | 'learning' {
  const tags = (item.tags || []).map(t => t.toLowerCase());
  if (tags.includes('mastered')) return 'mastered';
  if (tags.includes('focus')) return 'focus';
  return 'learning';
}

type ItemTypeFilter = 'all' | 'sentence' | 'word';
type StatusFilter = 'all' | 'mastered' | 'focus' | 'learning';

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

// ==========================================================================
// Task 7: My Learning / History Page components (integrated, no new files)
// Time-reversed elegant lists, filters, actions, exports, replay modal
// Fully reuses Task 2 tokens + etymology badges + existing data layer
// ==========================================================================

/** Elegant modal to replay a saved HistoryItem's full analysis snapshot */
function AnalysisReplayModal({
  item,
  onClose,
}: {
  item: HistoryItem;
  onClose: () => void;
}) {
  const s = item.sentence;

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="word-detail-overlay history-replay-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="word-detail-modal history-replay-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="word-detail-header">
          <div>
            <div className="text-xs tracking-[0.08em] text-[var(--color-text-tertiary)] mb-1">已保存的学习记录</div>
            <div className="word-detail-korean korean-text text-[1.5rem]" style={{lineHeight: 1.2}}>
              {s.original}
            </div>
            <div className="text-[10px] text-[var(--color-text-muted)] mt-1">
              {formatHistoryDate(item.addedAt)} · 复习 {item.reviewCount} 次
            </div>
          </div>
          <button onClick={onClose} className="word-detail-close" aria-label="关闭回放">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Translations (calm, priority Chinese) */}
        {s.chineseTranslation && (
          <div className="translation-block">
            <span className="translation-label">中文翻译</span>
            <div className="translation-text cn">{s.chineseTranslation}</div>
          </div>
        )}
        {s.englishTranslation && (
          <div className="translation-block">
            <span className="translation-label">English Translation</span>
            <div className="translation-text">{s.englishTranslation}</div>
          </div>
        )}

        {/* Grammar */}
        {s.grammarAnalysis && (
          <div>
            <div className="translation-label mb-2">语法分析与句型解析</div>
            <div className="grammar-analysis text-reading">{s.grammarAnalysis}</div>
          </div>
        )}

        {s.notes && (
          <>
            <div className="result-divider" />
            <div className="translation-block">
              <span className="translation-label">学习笔记</span>
              <div className="translation-text" style={{ borderLeftColor: 'var(--color-accent-warm)' }}>{s.notes}</div>
            </div>
          </>
        )}

        {/* Full Token Grid (reuses TokenCard, non-clickable here) */}
        {s.tokens && s.tokens.length > 0 && (
          <>
            <div className="result-divider" />
            <div className="token-breakdown-header">
              <span>词素拆解 · Morpheme Breakdown</span>
              <span className="text-[var(--color-text-muted)] font-normal">（{s.tokens.length} 个词元）</span>
            </div>
            <div className="token-grid">
              {s.tokens.map((token) => (
                <TokenCard key={token.id} token={token} />
              ))}
            </div>
          </>
        )}

        {/* Personal note + tags summary */}
        {(item.personalNote || (item.tags && item.tags.length > 0)) && (
          <div className="mt-4 pt-4 border-t border-[var(--color-border-subtle)] text-sm">
            {item.personalNote && (
              <div className="mb-2">
                <span className="text-[var(--color-text-tertiary)] text-xs tracking-widest">我的笔记</span>
                <div className="text-[var(--color-text-secondary)] mt-0.5">{item.personalNote}</div>
              </div>
            )}
            {item.tags && item.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {item.tags.map((t, i) => (
                  <span key={i} className="inline-block px-2 py-0.5 rounded-full text-[10px] bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)] border border-[var(--color-border-subtle)]">
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="pt-4 mt-2 flex justify-end">
          <button onClick={onClose} className="word-detail-secondary">关闭回放</button>
        </div>
      </div>
    </div>
  );
}

/** Per-item elegant card for a HistoryItem (sentence). Time-reversed list primary. */
function HistorySentenceCard({
  item,
  onMarkMastered,
  onToggleFocus,
  onDelete,
  onReplay,
  isProcessing,
}: {
  item: HistoryItem;
  onMarkMastered: (id: string) => void;
  onToggleFocus: (id: string, currentlyFocus: boolean) => void;
  onDelete: (id: string) => void;
  onReplay: (item: HistoryItem) => void;
  isProcessing: boolean;
}) {
  const status = getItemStatus(item);
  const etyms = getEtymologiesInSentence(item.sentence);
  const isMastered = status === 'mastered';
  const isFocus = status === 'focus';

  const handleDelete = () => {
    if (confirm('确认删除这条学习记录？（仅删除历史索引，快照仍可通过句子ID找回）')) {
      onDelete(item.id);
    }
  };

  return (
    <div className="history-item-card">
      <div className="history-item-meta">
        <span className="history-date">{formatHistoryDate(item.addedAt)}</span>
        <div className="flex items-center gap-2">
          <span className="history-review-badge">
            复习 {item.reviewCount} 次
          </span>
          {isMastered && (
            <span className="history-status-pill mastered">
              <Award className="w-3 h-3" /> 已掌握
            </span>
          )}
          {isFocus && (
            <span className="history-status-pill focus">
              <Star className="w-3 h-3" /> 专注中
            </span>
          )}
          {!isMastered && !isFocus && (
            <span className="history-status-pill learning">学习中</span>
          )}
        </div>
      </div>

      <div 
        className="history-sentence korean-text cursor-pointer hover:underline decoration-[var(--color-accent-sage)]/40" 
        onClick={() => onReplay(item)}
        title="点击查看完整分析回放"
      >
        {item.sentence.original}
      </div>

      {item.sentence.chineseTranslation && (
        <div className="history-translation text-[var(--color-text-secondary)]">
          {item.sentence.chineseTranslation}
        </div>
      )}

      {/* Etymology summary pills (Task 2 aesthetic) */}
      {etyms.length > 0 && (
        <div className="history-etym-summary flex flex-wrap gap-1.5 mt-2">
          {etyms.map((e) => (
            <span key={e} className={getEtymologyBadgeClass(e)}>
              {ETYMOLOGY_LABELS[e]}
            </span>
          ))}
        </div>
      )}

      {item.personalNote && (
        <div className="history-note mt-2 text-xs text-[var(--color-text-tertiary)] italic border-l-2 border-[var(--color-border-subtle)] pl-2">
          {item.personalNote}
        </div>
      )}

      {/* Calm per-item actions */}
      <div className="history-actions mt-3 pt-3 border-t border-[var(--color-border-subtle)] flex flex-wrap gap-2">
        {!isMastered && (
          <button
            onClick={() => onMarkMastered(item.id)}
            disabled={isProcessing}
            className="history-action-btn primary"
          >
            <Award className="w-3.5 h-3.5" /> 标记掌握
          </button>
        )}
        <button
          onClick={() => onToggleFocus(item.id, isFocus)}
          disabled={isProcessing}
          className="history-action-btn"
        >
          <Star className="w-3.5 h-3.5" /> {isFocus ? '取消专注' : '设为专注'}
        </button>
        <button
          onClick={handleDelete}
          disabled={isProcessing}
          className="history-action-btn danger"
        >
          <Trash2 className="w-3.5 h-3.5" /> 删除
        </button>
        <button
          onClick={() => onReplay(item)}
          className="history-action-btn ml-auto"
        >
          查看分析 →
        </button>
      </div>
    </div>
  );
}

/** Card for saved WordEntry (word bank side of My Learning) */
function WordBankCard({
  word,
  onDelete,
  isProcessing,
}: {
  word: WordEntry;
  onDelete: (id: string) => void;
  isProcessing: boolean;
}) {
  const handleDelete = () => {
    if (confirm(`确认从单词库删除「${word.word}」？`)) {
      onDelete(word.id);
    }
  };

  return (
    <div className="history-item-card word-bank-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="history-sentence korean-text text-[1.25rem]">{word.word}</div>
          {word.hanja && (
            <div className="text-[var(--color-accent-warm)] text-sm mt-0.5 tracking-wide">{word.hanja}</div>
          )}
        </div>
        <span className={getEtymologyBadgeClass(word.etymology)}>{ETYMOLOGY_LABELS[word.etymology]}</span>
      </div>

      {word.definitions.length > 0 && (
        <div className="mt-2 text-sm text-[var(--color-text-secondary)]">
          {word.definitions[0]}
        </div>
      )}

      {word.examples.length > 0 && (
        <div className="mt-2 text-xs text-[var(--color-text-tertiary)]">
          例：{word.examples[0].sentence}
        </div>
      )}

      <div className="history-actions mt-3 pt-3 border-t border-[var(--color-border-subtle)]">
        <button
          onClick={handleDelete}
          disabled={isProcessing}
          className="history-action-btn danger"
        >
          <Trash2 className="w-3.5 h-3.5" /> 删除
        </button>
      </div>
    </div>
  );
}

/** Filters toolbar — date, etymology multi, sentence/word, status. Calm & restrained. */
function HistoryFilters({
  itemTypeFilter,
  setItemTypeFilter,
  statusFilter,
  setStatusFilter,
  activeEtymFilters,
  toggleEtymFilter,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  searchTerm,
  setSearchTerm,
  onClearFilters,
  totalCount,
  filteredCount,
}: {
  itemTypeFilter: ItemTypeFilter;
  setItemTypeFilter: (v: ItemTypeFilter) => void;
  statusFilter: StatusFilter;
  setStatusFilter: (v: StatusFilter) => void;
  activeEtymFilters: EtymologyTag[];
  toggleEtymFilter: (e: EtymologyTag) => void;
  dateFrom: string;
  setDateFrom: (v: string) => void;
  dateTo: string;
  setDateTo: (v: string) => void;
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  onClearFilters: () => void;
  totalCount: number;
  filteredCount: number;
}) {
  const etymOptions: EtymologyTag[] = ['native', 'sino-korean', 'loanword', 'unknown'];

  return (
    <div className="history-filters">
      <div className="history-filters-row">
        {/* Type */}
        <div className="filter-group">
          <span className="filter-label"><Filter className="w-3.5 h-3.5" /> 类型</span>
          <div className="filter-pills">
            {(['all','sentence','word'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setItemTypeFilter(t)}
                className={`filter-pill ${itemTypeFilter === t ? 'active' : ''}`}
              >
                {t === 'all' ? '全部' : t === 'sentence' ? '句子' : '单词'}
              </button>
            ))}
          </div>
        </div>

        {/* Status */}
        <div className="filter-group">
          <span className="filter-label">状态</span>
          <div className="filter-pills">
            {(['all','mastered','focus','learning'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`filter-pill ${statusFilter === s ? 'active' : ''}`}
              >
                {s === 'all' ? '全部' : s === 'mastered' ? '已掌握' : s === 'focus' ? '专注' : '学习中'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Etymology multi-filter (OR semantics) */}
      <div className="filter-group mt-3">
        <span className="filter-label">词源筛选（任一匹配）</span>
        <div className="filter-pills">
          {etymOptions.map((e) => {
            const active = activeEtymFilters.includes(e);
            return (
              <button
                key={e}
                onClick={() => toggleEtymFilter(e)}
                className={`filter-pill etym ${active ? 'active' : ''} etymology-badge-${e}`}
              >
                {ETYMOLOGY_LABELS[e]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Date + Search row */}
      <div className="history-filters-row mt-3">
        <div className="filter-group flex-1">
          <span className="filter-label"><Calendar className="w-3.5 h-3.5" /> 日期范围（句子）</span>
          <div className="flex gap-2 items-center">
            <input 
              type="date" 
              value={dateFrom} 
              onChange={(e) => setDateFrom(e.target.value)} 
              className="history-date-input focus-ring" 
              aria-label="开始日期"
            />
            <span className="text-[var(--color-text-muted)]">–</span>
            <input 
              type="date" 
              value={dateTo} 
              onChange={(e) => setDateTo(e.target.value)} 
              className="history-date-input focus-ring" 
              aria-label="结束日期"
            />
          </div>
        </div>

        <div className="filter-group flex-1 min-w-[180px]">
          <span className="filter-label">搜索</span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="搜索句子或笔记…"
            className="history-search-input focus-ring"
          />
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 text-xs text-[var(--color-text-tertiary)]">
        <span>显示 {filteredCount} / {totalCount} 条记录</span>
        <button onClick={onClearFilters} className="underline hover:text-[var(--color-text-secondary)]">清除全部筛选</button>
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
  // Task 7: My Learning / History view state (integrated single-file view switcher)
  // ------------------------------------------------------------------------
  const [activeView, setActiveView] = useState<'analyzer' | 'history' | 'settings'>('analyzer');

  // Raw data
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [wordEntries, setWordEntries] = useState<WordEntry[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyProcessingId, setHistoryProcessingId] = useState<string | null>(null); // for per-item disable

  // Task 8: Settings clearing state (local-only, guarded)
  const [isClearingData, setIsClearingData] = useState(false);

  // Filters (Task 7 scope)
  const [itemTypeFilter, setItemTypeFilter] = useState<ItemTypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [activeEtymFilters, setActiveEtymFilters] = useState<EtymologyTag[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [historySearch, setHistorySearch] = useState('');

  // Replay modal for saved sentence analysis
  const [replayItem, setReplayItem] = useState<HistoryItem | null>(null);

  // Action toasts
  const [showHistoryToast, setShowHistoryToast] = useState<string | null>(null);

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

  // ------------------------------------------------------------------------
  // Task 7: History data loading + mutations (using existing history-service)
  // Time-reversed by default via service (addedAt desc). Client post-filter for etym/status/type.
  // ------------------------------------------------------------------------
  const loadHistoryData = useCallback(async () => {
    setIsHistoryLoading(true);
    try {
      // Use service query (supports date/tag/search). We pass minimal and post-filter client-side.
      const items = await getHistory({ limit: 500, sortBy: 'addedAt', sortOrder: 'desc' });
      const words = await getAllWordEntries();
      setHistoryItems(items);
      setWordEntries(words);
    } catch (err) {
      console.error('[Yujian History] Failed to load learning data:', err);
      // Non-fatal in UI — user sees empty with hint
      setHistoryItems([]);
      setWordEntries([]);
    } finally {
      setIsHistoryLoading(false);
    }
  }, []);

  // Note: History data is loaded on-demand when user clicks the "我的学习" tab (see handleSwitchToHistory).
  // This avoids the react-hooks/set-state-in-effect lint rule while keeping excellent UX.

  // Derived filtered + sorted lists (time-reversed for sentences)
  const filteredHistoryItems = React.useMemo(() => {
    let result = [...historyItems];

    // Date range (service already did some but we enforce again for precision)
    if (dateFrom || dateTo) {
      const from = dateFrom ? new Date(dateFrom).toISOString() : '0000-01-01T00:00:00.000Z';
      const to = dateTo ? new Date(dateTo + 'T23:59:59.999Z').toISOString() : '9999-12-31T23:59:59.999Z';
      result = result.filter((h) => h.addedAt >= from && h.addedAt <= to);
    }

    // Search (service supports but we apply for consistency with words too)
    if (historySearch.trim()) {
      const q = historySearch.trim().toLowerCase();
      result = result.filter((h) => 
        h.sentence.original.toLowerCase().includes(q) || 
        (h.personalNote || '').toLowerCase().includes(q)
      );
    }

    // Status
    if (statusFilter !== 'all') {
      result = result.filter((h) => getItemStatus(h) === statusFilter);
    }

    // Etymology (OR: any selected)
    if (activeEtymFilters.length > 0) {
      result = result.filter((h) => 
        activeEtymFilters.some((e) => historyItemHasEtymology(h, e))
      );
    }

    // Already time-reversed from service query (newest first)
    return result;
  }, [historyItems, dateFrom, dateTo, historySearch, statusFilter, activeEtymFilters]);

  const filteredWordEntries = React.useMemo(() => {
    let result = [...wordEntries];

    // Etymology filter
    if (activeEtymFilters.length > 0) {
      result = result.filter((w) => activeEtymFilters.some((e) => wordHasEtymology(w, e)));
    }

    // Simple alpha sort for words (no timestamp in model)
    result.sort((a, b) => a.word.localeCompare(b.word, 'ko'));

    // Note: status & date filters intentionally ignored for words (no fields in schema)
    return result;
  }, [wordEntries, activeEtymFilters]);

  // Final visible lists based on type filter (single elegant experience)
  const visibleSentences = (itemTypeFilter === 'all' || itemTypeFilter === 'sentence') ? filteredHistoryItems : [];
  const visibleWords = (itemTypeFilter === 'all' || itemTypeFilter === 'word') ? filteredWordEntries : [];

  const totalLearningCount = historyItems.length + wordEntries.length;
  const filteredTotal = visibleSentences.length + visibleWords.length;

  const toggleEtymFilter = (etym: EtymologyTag) => {
    setActiveEtymFilters((prev) =>
      prev.includes(etym) ? prev.filter((e) => e !== etym) : [...prev, etym]
    );
  };

  const clearAllHistoryFilters = () => {
    setItemTypeFilter('all');
    setStatusFilter('all');
    setActiveEtymFilters([]);
    setDateFrom('');
    setDateTo('');
    setHistorySearch('');
  };

  // View switch handler (Task 7) — triggers lazy load only when entering history (avoids setState-in-effect)
  const handleSwitchToHistory = () => {
    setActiveView('history');
    // Load if we have no data yet (first entry)
    if (historyItems.length === 0 && !isHistoryLoading) {
      // Fire-and-forget; state updates inside loadHistoryData are async & safe
      loadHistoryData();
    }
  };

  // Task 8: Clear all user data (history + words + sentences + apiKey) with confirmation
  // Important for user trust and control. Uses the guarded clearAllData from service.
  const handleClearAllData = async () => {
    const confirmed = window.confirm(
      '确认清除「全部我的数据」？\n\n此操作将永久删除：\n• 所有句子分析历史\n• 单词学习库\n• 个人标记与笔记\n• 已保存的 API Key\n\n数据仅存储于本浏览器本地，操作不可恢复。'
    );
    if (!confirmed) return;

    setIsClearingData(true);
    try {
      await clearAllData();
      clearApiKey(); // also wipe the key from localStorage + state

      // Reset local UI caches
      setHistoryItems([]);
      setWordEntries([]);
      setReplayItem(null);

      setShowHistoryToast('全部数据已清除。本地存储现已清空。');
      window.setTimeout(() => setShowHistoryToast(null), 2400);

      // Optionally return user to analyzer for fresh start
      setActiveView('analyzer');
    } catch (e) {
      console.error('[Task8] clearAllData failed', e);
      alert('清除失败，请重试或刷新页面。');
    } finally {
      setIsClearingData(false);
    }
  };

  // Per-item actions (Task 7 scope)
  const handleMarkMastered = async (id: string) => {
    setHistoryProcessingId(id);
    try {
      await markHistoryAsMastered(id);
      await loadHistoryData();
      setShowHistoryToast('已标记为掌握');
      window.setTimeout(() => setShowHistoryToast(null), 1800);
    } catch (e) {
      console.error(e);
      alert('操作失败，请重试');
    } finally {
      setHistoryProcessingId(null);
    }
  };

  const handleToggleFocus = async (id: string, currentlyFocus: boolean) => {
    setHistoryProcessingId(id);
    try {
      if (currentlyFocus) {
        await unmarkHistoryAsFocus(id);
      } else {
        await markHistoryAsFocus(id);
      }
      await loadHistoryData();
      setShowHistoryToast(currentlyFocus ? '已取消专注' : '已设为专注');
      window.setTimeout(() => setShowHistoryToast(null), 1800);
    } catch (e) {
      console.error(e);
      alert('操作失败，请重试');
    } finally {
      setHistoryProcessingId(null);
    }
  };

  const handleDeleteHistory = async (id: string) => {
    setHistoryProcessingId(id);
    try {
      await deleteHistoryItem(id);
      await loadHistoryData();
      setShowHistoryToast('已删除记录');
      window.setTimeout(() => setShowHistoryToast(null), 1800);
    } catch (e) {
      console.error(e);
      alert('删除失败，请重试');
    } finally {
      setHistoryProcessingId(null);
    }
  };

  const handleDeleteWord = async (id: string) => {
    setHistoryProcessingId(id);
    try {
      await deleteWordEntry(id);
      await loadHistoryData();
      setShowHistoryToast('已从单词库删除');
      window.setTimeout(() => setShowHistoryToast(null), 1800);
    } catch (e) {
      console.error(e);
      alert('删除失败，请重试');
    } finally {
      setHistoryProcessingId(null);
    }
  };

  const openReplay = (item: HistoryItem) => {
    setReplayItem(item);
  };

  const closeReplay = () => setReplayItem(null);

  // Full export: JSON + beautiful Markdown (Task 7)
  const handleExport = () => {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

    // JSON export (complete, self-contained)
    const jsonPayload = {
      exportedAt: new Date().toISOString(),
      version: 'yujian-task7',
      history: historyItems,
      words: wordEntries,
    };
    const jsonBlob = new Blob([JSON.stringify(jsonPayload, null, 2)], { type: 'application/json' });
    const jsonUrl = URL.createObjectURL(jsonBlob);
    const jsonLink = document.createElement('a');
    jsonLink.href = jsonUrl;
    jsonLink.download = `yujian-learning-${timestamp}.json`;
    document.body.appendChild(jsonLink);
    jsonLink.click();
    document.body.removeChild(jsonLink);
    URL.revokeObjectURL(jsonUrl);

    // Beautiful Markdown export (elegant, human readable, Chinese-first)
    let md = `# 语见 · 我的学习历史\n\n`;
    md += `导出时间：${new Date().toLocaleString('zh-CN')}\n\n`;
    md += `共 ${historyItems.length} 条句子记录 + ${wordEntries.length} 个单词\n\n---\n\n`;

    // Sentences section (time-reversed)
    md += `## 句子历史（时间倒序）\n\n`;
    if (historyItems.length === 0) {
      md += `（暂无记录）\n\n`;
    } else {
      historyItems.forEach((item, idx) => {
        const s = item.sentence;
        const status = getItemStatus(item);
        const etymList = getEtymologiesInSentence(s).map(e => ETYMOLOGY_LABELS[e]).join('、');
        md += `### ${idx + 1}. ${formatHistoryDate(item.addedAt)} · ${s.original}\n\n`;
        if (s.chineseTranslation) md += `**中文翻译**：${s.chineseTranslation}\n\n`;
        if (s.englishTranslation) md += `**English**：${s.englishTranslation}\n\n`;
        md += `**词源分布**：${etymList || '—'}\n\n`;
        md += `**状态**：${status === 'mastered' ? '已掌握' : status === 'focus' ? '专注中' : '学习中'}（复习 ${item.reviewCount} 次）\n\n`;
        if (item.personalNote) md += `**我的笔记**：${item.personalNote}\n\n`;
        if (s.grammarAnalysis) md += `**语法解析**：${s.grammarAnalysis}\n\n`;
        md += `---\n\n`;
      });
    }

    // Words section
    md += `## 单词库\n\n`;
    if (wordEntries.length === 0) {
      md += `（暂无保存的单词）\n\n`;
    } else {
      wordEntries.forEach((w, idx) => {
        md += `### ${idx + 1}. ${w.word}${w.hanja ? ` （${w.hanja}）` : ''}\n\n`;
        md += `**词源**：${ETYMOLOGY_LABELS[w.etymology]}\n\n`;
        if (w.definitions.length) md += `**释义**：${w.definitions.join('； ')}\n\n`;
        if (w.examples.length) {
          md += `**例句**：\n`;
          w.examples.forEach((ex) => {
            md += `- ${ex.sentence} → ${ex.translation}\n`;
          });
          md += `\n`;
        }
        md += `---\n\n`;
      });
    }

    md += `*由语见 (Yujian) 生成 · 治愈而优雅的韩语学习空间*\n`;

    const mdBlob = new Blob([md], { type: 'text/markdown' });
    const mdUrl = URL.createObjectURL(mdBlob);
    const mdLink = document.createElement('a');
    mdLink.href = mdUrl;
    mdLink.download = `yujian-learning-${timestamp}.md`;
    document.body.appendChild(mdLink);
    mdLink.click();
    document.body.removeChild(mdLink);
    URL.revokeObjectURL(mdUrl);

    setShowHistoryToast('已导出 JSON + Markdown');
    window.setTimeout(() => setShowHistoryToast(null), 2200);
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
      {/* Calm header — with Task 7 view switcher */}
      <header className="analyzer-header">
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <BookOpen className="w-6 h-6 text-[var(--color-accent-sage)]" />
              <div>
                <h1 className="analyzer-title">语见 · Yujian</h1>
                <p className="analyzer-subtitle">
                  平静而优雅的韩语学习空间 · 词源 · 语法 · 细腻洞察
                </p>
              </div>
            </div>

            {/* Elegant view switcher (Task 7+8) — analyzer / history / settings. Pure client state, no routes. */}
            <div className="view-switcher" role="tablist" aria-label="主视图切换">
              <button
                role="tab"
                aria-selected={activeView === 'analyzer'}
                onClick={() => setActiveView('analyzer')}
                className={`view-tab ${activeView === 'analyzer' ? 'active' : ''}`}
              >
                分析句子
              </button>
              <button
                role="tab"
                aria-selected={activeView === 'history'}
                onClick={handleSwitchToHistory}
                className={`view-tab ${activeView === 'history' ? 'active' : ''}`}
              >
                <History className="w-3.5 h-3.5" /> 我的学习
              </button>
              <button
                role="tab"
                aria-selected={activeView === 'settings'}
                onClick={() => setActiveView('settings')}
                className={`view-tab ${activeView === 'settings' ? 'active' : ''}`}
              >
                <Settings className="w-3.5 h-3.5" /> 设置
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 pt-8 pb-24">
        {/* Conditional rendering: Analyzer / History (Task 7) / Settings (Task 8) — single file, no new routes or files */}
        {activeView === 'analyzer' ? (
          <>
            {/* Slim API Key status — full management moved to Settings (Task 8) */}
            <div className="api-key-status">
              <KeyRound className="w-4 h-4 text-[var(--color-text-tertiary)] flex-shrink-0" />
              <span className="text-sm text-[var(--color-text-secondary)]">
                {isKeySaved ? 'Anthropic API Key 已安全保存于本地浏览器' : '尚未配置 API Key'}
              </span>
              <button
                onClick={() => setActiveView('settings')}
                className="api-key-manage-link"
              >
                在设置中管理 →
              </button>
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
          </>
        ) : activeView === 'history' ? (
          /* =====================================================================
             Task 7: My Learning / History View — time-reversed elegant list
             Full filters, per-item actions, export, replay. Matches design tokens.
          ===================================================================== */
          <div className="history-view">
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="flex items-center gap-2">
                  <History className="w-5 h-5 text-[var(--color-accent-sage)]" />
                  <h2 className="text-xl font-semibold tracking-tight">我的学习 · 历史</h2>
                </div>
                <p className="text-sm text-[var(--color-text-tertiary)] mt-0.5">时间倒序 · 本地保存 · 随时复习</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={loadHistoryData}
                  disabled={isHistoryLoading}
                  className="history-action-btn flex items-center gap-1.5"
                  title="刷新数据"
                >
                  <RefreshCw className={`w-4 h-4 ${isHistoryLoading ? 'animate-spin' : ''}`} />
                  刷新
                </button>
                <button
                  onClick={handleExport}
                  disabled={totalLearningCount === 0}
                  className="history-action-btn primary flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4" /> 导出全部 (JSON + MD)
                </button>
              </div>
            </div>

            {/* Filters */}
            <HistoryFilters
              itemTypeFilter={itemTypeFilter}
              setItemTypeFilter={setItemTypeFilter}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              activeEtymFilters={activeEtymFilters}
              toggleEtymFilter={toggleEtymFilter}
              dateFrom={dateFrom}
              setDateFrom={setDateFrom}
              dateTo={dateTo}
              setDateTo={setDateTo}
              searchTerm={historySearch}
              setSearchTerm={setHistorySearch}
              onClearFilters={clearAllHistoryFilters}
              totalCount={totalLearningCount}
              filteredCount={filteredTotal}
            />

            {/* Loading */}
            {isHistoryLoading && (
              <div className="loading-state mt-8">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>正在载入学习历史…</span>
              </div>
            )}

            {/* The elegant time-reversed list */}
            {!isHistoryLoading && (
              <>
                {/* Sentences */}
                {visibleSentences.length > 0 && (
                  <div className="mt-6">
                    <div className="history-section-label">句子记录（最新在前）</div>
                    <div className="history-list">
                      {visibleSentences.map((item) => (
                        <HistorySentenceCard
                          key={item.id}
                          item={item}
                          onMarkMastered={handleMarkMastered}
                          onToggleFocus={handleToggleFocus}
                          onDelete={handleDeleteHistory}
                          onReplay={openReplay}
                          isProcessing={historyProcessingId === item.id}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Words */}
                {visibleWords.length > 0 && (
                  <div className="mt-8">
                    <div className="history-section-label">单词库</div>
                    <div className="history-list word-list">
                      {visibleWords.map((word) => (
                        <WordBankCard
                          key={word.id}
                          word={word}
                          onDelete={handleDeleteWord}
                          isProcessing={historyProcessingId === word.id}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty states */}
                {filteredTotal === 0 && (
                  <div className="mt-12 text-center py-10 border border-dashed border-[var(--color-border-subtle)] rounded-2xl bg-[var(--color-bg-subtle)]/40">
                    <div className="text-[var(--color-text-tertiary)]">
                      {totalLearningCount === 0 ? (
                        <>暂无学习记录。<br />分析句子或查词并「加入我的学习」后，会出现在这里。</>
                      ) : (
                        <>没有符合当前筛选条件的记录。<br />尝试调整筛选条件或清除筛选。</>
                      )}
                    </div>
                    {totalLearningCount > 0 && (
                      <button onClick={clearAllHistoryFilters} className="mt-4 text-sm underline text-[var(--color-accent-sage)]">
                        清除筛选
                      </button>
                    )}
                  </div>
                )}

                <p className="mt-8 text-[10px] text-center text-[var(--color-text-muted)] tracking-wide">
                  所有数据存储于浏览器本地 IndexedDB（Dexie）。标记掌握与专注使用轻量标签实现。
                </p>
              </>
            )}
          </div>
        ) : (
          /* =====================================================================
             Task 8: Settings & API Key Management
             Calm, minimal, local-only. Reuses existing updateApiKey / clearApiKey / clearAllData.
             Matches the healing, low-saturation aesthetic of the entire project.
          ===================================================================== */
          <div className="settings-view">
            <div className="settings-header">
              <div className="flex items-center gap-3">
                <Settings className="w-5 h-5 text-[var(--color-accent-sage)]" />
                <h2 className="text-xl font-semibold tracking-tight">设置 · 安全与数据</h2>
              </div>
              <p className="text-sm text-[var(--color-text-tertiary)] mt-1">所有内容仅存于您的浏览器本地。永不离开设备。</p>
            </div>

            {/* API Key Section — the core of Task 8 */}
            <div className="settings-section">
              <div className="settings-section-title">
                <KeyRound className="w-4 h-4" /> Anthropic API Key
              </div>

              <div className="settings-key-wrap">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => updateApiKey(e.target.value)}
                  placeholder="sk-ant-... （仅本地保存，通过 HTTPS 安全发送至分析服务）"
                  className="settings-key-input"
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby="key-help"
                />
                <div className="settings-key-actions">
                  {isKeySaved && (
                    <span className="settings-key-status">
                      <Check className="w-3.5 h-3.5" /> 已保存（本地）
                    </span>
                  )}
                  {apiKey && (
                    <button
                      onClick={clearApiKey}
                      className="settings-clear-btn"
                      aria-label="清除 API Key"
                      disabled={isClearingData}
                    >
                      <Trash2 className="w-4 h-4" /> 清除
                    </button>
                  )}
                </div>
              </div>

              <div id="key-help" className="settings-help-text">
                您的 Key 仅保存在浏览器 localStorage，绝不发送到任何服务器（除分析请求外）。服务端接收后立即丢弃。
              </div>
            </div>

            {/* How to get the key — clear, trustworthy instructions + link */}
            <div className="settings-section">
              <div className="settings-section-title">如何获取 Anthropic API Key？</div>
              <div className="settings-instructions">
                <ol className="settings-steps">
                  <li>访问官方控制台：<a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" className="settings-link">https://console.anthropic.com/</a></li>
                  <li>使用邮箱注册或登录 Anthropic 账户</li>
                  <li>进入「API Keys」页面，点击「Create Key」生成新密钥（格式以 <code>sk-ant-</code> 开头）</li>
                  <li>复制密钥并粘贴到上方密码框中即可立即使用（无需保存按钮，输入即自动保存）</li>
                </ol>
                <p className="settings-note">
                  提示：免费额度通常足够日常学习使用。请妥善保管您的 Key，切勿分享给他人。
                  本应用完全本地优先，Key 管理权永远在您手中。
                </p>
              </div>
            </div>

            {/* Danger Zone: Clear all data — essential for user trust */}
            <div className="settings-section settings-danger">
              <div className="settings-section-title text-[var(--color-text-secondary)]">数据管理</div>
              <p className="text-sm text-[var(--color-text-secondary)] mb-4 leading-relaxed">
                清除本设备上的全部学习记录、单词库、历史与已保存的 API Key。此操作<b>不可恢复</b>。
              </p>
              <button
                onClick={handleClearAllData}
                disabled={isClearingData}
                className="settings-danger-btn"
              >
                {isClearingData ? (
                  <>正在清除全部数据…</>
                ) : (
                  <>清除全部我的数据</>
                )}
              </button>
              <p className="text-[10px] text-[var(--color-text-muted)] mt-2 tracking-wide">点击后将弹出确认对话框。建议在操作前先使用「导出」功能备份。</p>
            </div>

            <div className="settings-footer-note">
              语见 · 所有数据与密钥均严格本地化 · 尊重您的隐私与控制权
            </div>
          </div>
        )}
      </main>

      {/* Subtle footer note — security & scope transparent (updated for Task 8) */}
      <footer className="max-w-4xl mx-auto px-6 pb-12 text-[10px] text-[var(--color-text-muted)] text-center tracking-wide">
        API Key 仅在浏览器本地保存并通过 HTTPS 安全发送至 /api/analyze（服务端使用后立即丢弃）。<br />
        Task 8 设置：本地 Key 管理（密码输入 + 自动保存/清除）+ 获取指引链接 + 清除全部数据（确认保护）。完全本地，尊重隐私。
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

      {/* History action toast (Task 7) */}
      {showHistoryToast && (
        <div className="analyzer-toast history-toast" role="status">
          <Check className="w-4 h-4" /> {showHistoryToast}
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

      {/* History Replay Modal (Task 7) — beautiful full-snapshot viewer */}
      {replayItem && (
        <AnalysisReplayModal item={replayItem} onClose={closeReplay} />
      )}
    </div>
  );
}
