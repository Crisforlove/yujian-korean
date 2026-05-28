'use client';

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  Settings,
  Pencil,
  ExternalLink
} from 'lucide-react';

import { analyzeSentenceWithKey, AnalysisError } from '@/lib/llm/analyzer';
import { PROVIDERS, DEFAULT_PROVIDER, RECOMMENDED_MODELS, type SupportedProvider } from '@/lib/llm/providers';
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

/** Calm spring physics for premium modal enter/exit — healing aesthetic, alive yet serene.
 *  Matches & extends existing TokenCard springs (stiffness ~260-380, high damping).
 *  Never linear or abrupt; physics feel premium and "alive".
 *  Single config used for both directions (shared transition prop); sufficient for calm consistent feel.
 */
const MODAL_SPRING = {
  type: "spring" as const,
  stiffness: 260,
  damping: 30,
  mass: 0.95,
};

/** Gentle looping pulse for skeleton elements — subtle life without distraction */
const SKELETON_PULSE = {
  opacity: [0.55, 0.92, 0.55],
  transition: { duration: 1.8, repeat: Infinity, ease: [0.42, 0, 0.58, 1] as const },
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

/** Premium deep links to Naver Dictionary — the best way to experience their excellent etymology + Hanja presentation */
function getNaverDictUrl(text: string): string {
  const q = encodeURIComponent(text.trim());
  // target=dic gives access to the full dictionary experience (including Korean-Chinese tab for our users)
  return `https://dict.naver.com/#/search?query=${q}&target=dic`;
}

function getNaverHanjaUrl(hanja: string): string {
  const q = encodeURIComponent(hanja.trim());
  return `https://hanja.dict.naver.com/#/search?query=${q}`;
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

  // Premium, alive yet restrained spring interactions (MagicUI + Josh Comeau + premium language tool references)
  // Goal: expensive tactile feel with breathing life, while staying deeply calm and healing.
  const cardVariants = {
    rest: {
      scale: 1,
      y: 0,
      boxShadow: '0 1px 2px rgba(47, 44, 39, 0.03), 0 0 0 1px rgba(0,0,0,0.025)',
    },
    hover: {
      scale: 1.025,
      y: -6,
      boxShadow: '0 35px 70px -18px rgb(0 0 0 / 0.16), 0 14px 28px -12px rgb(0 0 0 / 0.11), 0 0 0 1px rgba(127,143,122,0.25)',
    },
    tap: {
      scale: 0.978,
      y: 0,
      boxShadow: '0 1px 2px rgba(47, 44, 39, 0.03)',
    },
    focus: {
      scale: 1.016,
      y: -3,
      boxShadow: '0 16px 32px -12px rgb(0 0 0 / 0.14), 0 0 0 3.5px rgba(127,143,122,0.32)',
    },
  } as const;

  const hintVariants = {
    rest: { opacity: 0.65, x: 0 },
    hover: { opacity: 1, x: 5 },
    tap: { opacity: 0.8, x: 1 },
    focus: { opacity: 0.9, x: 2 },
  } as const;

  const surfaceVariants = {
    rest: { scale: 1 },
    hover: { scale: 1.008, transition: { type: "spring", stiffness: 500, damping: 18 } },
    tap: { scale: 0.996 },
    focus: { scale: 1.003 },
  } as const;

  return (
    <motion.div
      variants={cardVariants}
      initial="rest"
      animate="rest"
      whileHover={isClickable ? "hover" : undefined}
      whileTap={isClickable ? "tap" : undefined}
      whileFocus={isClickable ? "focus" : undefined}
      transition={{ type: "spring", stiffness: 400, damping: 28, mass: 0.9 }}
      className={`token-card ${isClickable ? 'token-card--clickable' : ''}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      aria-label={isClickable ? `查看「${token.text}」单词详情` : undefined}
    >
      {/* Korean surface form — visual priority, ultra-subtle lift on interaction */}
      <motion.div
        className="token-surface hangul korean-text"
        variants={surfaceVariants}
      >
        {token.text}
      </motion.div>

      {/* Lemma (dictionary form) when different */}
      {hasLemma && (
        <div className="token-lemma">词典形：{token.lemma}</div>
      )}

      {/* Meta row: etymology badge (Task 2) + POS */}
      <div className="token-meta">
        <motion.span
          className={getEtymologyBadgeClass(token.etymology)}
          whileHover={{
            scale: 1.18,
            y: -2,
            transition: { type: "spring", stiffness: 360, damping: 14 },
          }}
          whileTap={{ scale: 0.92 }}
          transition={{ type: "spring", stiffness: 300, damping: 18 }}
        >
          {ETYMOLOGY_LABELS[token.etymology]}
        </motion.span>
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

      {/* Naver deep link — our recommended way to access the absolute best etymology + Hanja visuals */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          window.open(getNaverDictUrl(token.text), '_blank', 'noopener,noreferrer');
        }}
        className="token-naver-link text-[10px] text-[var(--color-accent-sage)] hover:text-[var(--color-accent-warm)] transition-colors flex items-center gap-1 mt-1.5"
        title="在 Naver 词典中查看完整词源、汉字与例句"
      >
        在 Naver 查看 <ExternalLink className="w-3 h-3" />
      </button>

      {/* Gentle "click to see details" affordance — responds to card hover state via variants */}
      {isClickable && (
        <motion.div
          className="token-click-hint"
          variants={hintVariants}
          transition={{ type: "spring", stiffness: 320, damping: 24 }}
        >
          点击查看详情 →
        </motion.div>
      )}
    </motion.div>
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

  // Local success state for premium micro-interaction on the "加入我的学习" button
  // Resets naturally when modal unmounts (new token or close)
  const [addSuccess, setAddSuccess] = useState(false);

  // Naver quick preview (hybrid approach) — loads from our safe defensive route
  // Falls back silently to the strong "Open in Naver" buttons if data is incomplete or fetch fails
  const [naverPreview, setNaverPreview] = useState<{
    loading: boolean;
    items: any[];
    fetched: boolean;
  }>({ loading: false, items: [], fetched: false });

  const loadNaverPreview = useCallback(async () => {
    if (naverPreview.fetched) return;
    setNaverPreview((prev) => ({ ...prev, loading: true }));

    try {
      const res = await fetch(`/api/naver-dict/${encodeURIComponent(token.text)}`);
      if (!res.ok) throw new Error('fetch failed');
      const json = await res.json();
      setNaverPreview({ loading: false, items: json.items || [], fetched: true });
    } catch {
      setNaverPreview({ loading: false, items: [], fetched: true });
    }
  }, [token.text, naverPreview.fetched]);

  // Auto-load a lightweight preview when the modal opens (server-side cached + very defensive)
  React.useEffect(() => {
    loadNaverPreview();
  }, [loadNaverPreview]);

  const handleAdd = async () => {
    try {
      await onAddToLearning(token, context);
      setAddSuccess(true);
      // Modal intentionally stays open (per existing design) so user sees calm confirmation on button itself
    } catch {
      // Parent already handles error surfacing (alert + console); no additional noise here
    }
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
    <motion.div
      className="word-detail-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="word-detail-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={MODAL_SPRING}
    >
      <motion.div
        className="word-detail-modal"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 16, scale: 0.982 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.985 }}
        transition={MODAL_SPRING}
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

        {/* Naver Quick Preview (lightweight, from our safe api route) + strong CTA buttons */}
        {naverPreview.fetched && (
          <div className="word-detail-naver-preview mt-4 pt-4 border-t border-[var(--color-border-subtle)]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] text-[var(--color-text-tertiary)] tracking-wide">Naver 快速预览</span>
              {naverPreview.loading && (
                <span className="text-[10px] text-[var(--color-text-muted)] flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> 正在获取
                </span>
              )}
            </div>

            {!naverPreview.loading && naverPreview.items.length > 0 && (
              <div className="space-y-2 text-sm">
                {naverPreview.items.slice(0, 2).map((item, idx) => (
                  <div key={idx} className="rounded-lg bg-[var(--color-bg-surface)] p-3 border border-[var(--color-border-subtle)]">
                    {item.means && item.means.length > 0 && (
                      <div className="text-[var(--color-text-secondary)]">
                        {item.means[0]?.value}
                        {item.means[0]?.partOfSpeech && (
                          <span className="ml-1.5 text-[10px] text-[var(--color-text-muted)]">· {item.means[0].partOfSpeech}</span>
                        )}
                      </div>
                    )}
                    {item.examples && item.examples[0] && (
                      <div className="mt-1.5 text-xs text-[var(--color-text-tertiary)] korean-text">
                        {item.examples[0].origin}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!naverPreview.loading && naverPreview.items.length === 0 && (
              <div className="text-xs text-[var(--color-text-muted)]">预览数据暂不可用（已为您准备完整跳转）</div>
            )}

            <div className="mt-3 text-[10px] text-[var(--color-text-muted)]">
              预览来自 Naver · 完整词源、汉字讲解与更多例句请点击下方按钮
            </div>
          </div>
        )}

        {/* Naver Dictionary deep link — the best way to see rich etymology tags, Hanja visuals & full examples (recommended hybrid approach) */}
        <div className="word-detail-naver-cta mt-4 pt-4 border-t border-[var(--color-border-subtle)]">
          <div className="text-[11px] text-[var(--color-text-tertiary)] mb-2 tracking-wide">
            Naver 词典提供最完整的词源分类（固有词 / 汉字词 / 外来词）、汉字详解与丰富例句
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => window.open(getNaverDictUrl(token.text), '_blank', 'noopener,noreferrer')}
              className="naver-cta-button flex items-center gap-1.5"
            >
              在 Naver 词典查看完整内容
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
            {token.hanja && (
              <button
                onClick={() => window.open(getNaverHanjaUrl(token.hanja!), '_blank', 'noopener,noreferrer')}
                className="naver-cta-button flex items-center gap-1.5"
              >
                查看汉字词源
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="word-detail-actions">
          <motion.button
            onClick={handleAdd}
            disabled={isAdding || addSuccess}
            className={`add-learning-button relative ${addSuccess ? 'add-learning-button--success' : ''}`}
            whileTap={!(isAdding || addSuccess) ? { scale: 0.975 } : {}}
            animate={{ 
              scale: addSuccess ? [1, 1.04, 1.015] : 1,
            }}
            transition={{ type: "spring", stiffness: 240, damping: 18 }}
          >
            {/* Tasteful expanding ring — very light, premium, healing (expands softly outward and fades) */}
            <AnimatePresence>
              {addSuccess && (
                <motion.div
                  key="success-ring"
                  className="absolute inset-[-3px] rounded-[9999px] pointer-events-none z-0"
                  style={{ border: '1.75px solid rgba(127, 143, 122, 0.30)' }}
                  initial={{ scale: 0.62, opacity: 0.72 }}
                  animate={{ scale: 1.62, opacity: 0 }}
                  transition={{ duration: 0.68, ease: [0.23, 1, 0.32, 1] }}
                />
              )}
            </AnimatePresence>

            <span className="relative z-10 flex items-center justify-center gap-2">
              {isAdding ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> 正在加入学习…
                </>
              ) : addSuccess ? (
                <>
                  {/* Subtle hand-drawn checkmark with spring-friendly draw timing — calm & satisfying */}
                  <motion.svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0"
                  >
                    <motion.path
                      d="M20 6L9 17L4 12"
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={{ 
                        duration: 0.42, 
                        ease: [0.22, 1, 0.36, 1],
                        delay: 0.07 
                      }}
                    />
                  </motion.svg>
                  已加入我的学习
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" /> 加入我的学习
                </>
              )}
            </span>
          </motion.button>
          <button onClick={onClose} className="word-detail-secondary">
            关闭
          </button>
        </div>

        <p className="word-detail-footer-note">
          保存后可在“我的学习”中复习（数据存储于本地 Dexie）。
        </p>
      </motion.div>
    </motion.div>
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
    <motion.div
      className="word-detail-overlay history-replay-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.div
        className="word-detail-modal history-replay-modal"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 18, scale: 0.982 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 14, scale: 0.985 }}
        transition={MODAL_SPRING}
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
            {/* Improved staggered entrance with spring physics + parent staggerChildren for 灵动 yet calm reveal */}
            <motion.div
              className="token-grid"
              initial="hidden"
              animate="visible"
              variants={{
                visible: {
                  transition: {
                    staggerChildren: 0.028,
                    delayChildren: 0.04,
                  },
                },
              }}
            >
              {s.tokens.map((token) => (
                <motion.div
                  key={token.id}
                  variants={{
                    hidden: { opacity: 0, y: 9 },
                    visible: {
                      opacity: 1,
                      y: 0,
                      transition: { type: 'spring', stiffness: 340, damping: 26, mass: 0.85 },
                    },
                  }}
                >
                  <TokenCard token={token} />
                </motion.div>
              ))}
            </motion.div>
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
      </motion.div>
    </motion.div>
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
  entranceDelay = 0,
}: {
  item: HistoryItem;
  onMarkMastered: (id: string) => void;
  onToggleFocus: (id: string, currentlyFocus: boolean) => void;
  onDelete: (id: string) => void;
  onReplay: (item: HistoryItem) => void;
  isProcessing: boolean;
  entranceDelay?: number;
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
    <motion.div
      className="history-item-card"
      initial={{ opacity: 0, y: 7 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        type: "spring",
        stiffness: 265,
        damping: 28,
        delay: entranceDelay,
      }}
      whileHover={{
        y: -4,
        boxShadow: '0 30px 60px -15px rgb(0 0 0 / 0.15), 0 12px 24px -10px rgb(0 0 0 / 0.11)',
        transition: { type: "spring", stiffness: 320, damping: 22 },
      }}
      whileTap={{ scale: 0.98, y: 0.5 }}
    >
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

      <motion.div 
        className="history-sentence korean-text cursor-pointer hover:underline decoration-[var(--color-accent-sage)]/40" 
        onClick={() => onReplay(item)}
        title="点击查看完整分析回放"
        whileHover={{ 
          x: 1,
          transition: { type: "spring", stiffness: 380, damping: 26 }
        }}
        whileTap={{ x: 0 }}
      >
        {item.sentence.original}
      </motion.div>

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
          查看分析 <span className="replay-arrow">→</span>
        </button>
      </div>
    </motion.div>
  );
}

/** Card for saved WordEntry (word bank side of My Learning) */
function WordBankCard({
  word,
  onDelete,
  isProcessing,
  entranceDelay = 0,
}: {
  word: WordEntry;
  onDelete: (id: string) => void;
  isProcessing: boolean;
  entranceDelay?: number;
}) {
  const handleDelete = () => {
    if (confirm(`确认从单词库删除「${word.word}」？`)) {
      onDelete(word.id);
    }
  };

  return (
    <motion.div
      className="history-item-card word-bank-card"
      initial={{ opacity: 0, y: 7 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        type: "spring",
        stiffness: 265,
        damping: 28,
        delay: entranceDelay,
      }}
      whileHover={{
        y: -4,
        boxShadow: '0 30px 60px -15px rgb(0 0 0 / 0.15), 0 12px 24px -10px rgb(0 0 0 / 0.11)',
        transition: { type: "spring", stiffness: 320, damping: 22 },
      }}
      whileTap={{ scale: 0.98, y: 0.5 }}
    >
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
    </motion.div>
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

  // API Key (client-only)
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

  // Selected LLM Provider (new multi-provider support)
  const [provider, setProvider] = useState<SupportedProvider>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('yujian:provider') as SupportedProvider | null;
        return saved && PROVIDERS.some(p => p.id === saved) ? saved : DEFAULT_PROVIDER;
      } catch {
        return DEFAULT_PROVIDER;
      }
    }
    return DEFAULT_PROVIDER;
  });

  // Selected model (optional override, per provider friendly)
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      try {
        return localStorage.getItem('yujian:selectedModel') || '';
      } catch {
        return '';
      }
    }
    return '';
  });

  // Derived
  const isKeySaved = apiKey.trim().length > 0;
  const currentProviderConfig = PROVIDERS.find(p => p.id === provider)!;
  const recommendedModels = RECOMMENDED_MODELS[provider] || [];

  const isKeyFormatValid = (() => {
    const key = apiKey.trim();
    if (!key) return false;
    return key.startsWith(currentProviderConfig.keyPrefix);
  })();

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

  // Key test state (for in-Settings feedback)
  const [isTestingKey, setIsTestingKey] = useState(false);
  const [keyTestError, setKeyTestError] = useState<string | null>(null);

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
  // Task 9: Refs for keyboard support (view tabs + sentence input focus)
  // ------------------------------------------------------------------------
  const analyzerTabRef = React.useRef<HTMLButtonElement>(null);
  const historyTabRef = React.useRef<HTMLButtonElement>(null);
  const settingsTabRef = React.useRef<HTMLButtonElement>(null);
  const sentenceInputRef = React.useRef<HTMLTextAreaElement>(null);

  const viewOrder: ('analyzer' | 'history' | 'settings')[] = ['analyzer', 'history', 'settings'];

  // Centralized view switcher (allows keyboard + click unification)
  const switchView = (view: 'analyzer' | 'history' | 'settings') => {
    if (view === 'history') {
      handleSwitchToHistory();
    } else {
      setActiveView(view);
    }
  };

  // Full keyboard navigation for the view tablist (ARIA tabs pattern)
  // Arrows, Home, End — roving tabindex + focus management. No new files.
  const handleViewTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement> | React.KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = viewOrder.indexOf(activeView);
    let nextIndex = currentIndex;

    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        nextIndex = (currentIndex + 1) % viewOrder.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        nextIndex = (currentIndex - 1 + viewOrder.length) % viewOrder.length;
        break;
      case 'Home':
        e.preventDefault();
        nextIndex = 0;
        break;
      case 'End':
        e.preventDefault();
        nextIndex = viewOrder.length - 1;
        break;
      default:
        return;
    }

    const nextView = viewOrder[nextIndex];
    switchView(nextView);

    // Move focus to the newly active tab button
    const refs = [analyzerTabRef, historyTabRef, settingsTabRef];
    // Defer focus to after state update + re-render
    window.setTimeout(() => {
      refs[nextIndex].current?.focus();
    }, 0);
  };

  // ------------------------------------------------------------------------
  // API Key persistence helpers (writes only — no effect sets)
  // ------------------------------------------------------------------------
  const updateApiKey = useCallback((value: string) => {
    const trimmed = value.trim();
    setApiKey(trimmed);
    setKeyTestError(null); // clear previous test result when user changes the key

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

  // Provider persistence
  const updateProvider = useCallback((newProvider: SupportedProvider) => {
    setProvider(newProvider);
    setKeyTestError(null); // clear previous test result when switching provider
    try {
      localStorage.setItem('yujian:provider', newProvider);
    } catch {}
  }, []);

  const updateSelectedModel = useCallback((model: string) => {
    const trimmed = model.trim();
    setSelectedModel(trimmed);
    try {
      if (trimmed) {
        localStorage.setItem('yujian:selectedModel', trimmed);
      } else {
        localStorage.removeItem('yujian:selectedModel');
      }
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
      setError(`请先在「设置」中输入您的 ${currentProviderConfig.label} API Key。`);
      setErrorCode('MISSING_KEY');
      return;
    }

    setIsLoading(true);
    setError(null);
    setErrorCode(null);
    setResult(null);

    try {
      // Call the secure facade (routes through /api/analyze — key never leaves server scope)
      const customBase = (provider === 'openai' || provider === 'deepseek') 
        ? localStorage.getItem(`yujian:baseURL:${provider}`) || undefined 
        : undefined;
      const analysis = await analyzeSentenceWithKey(trimmedSentence, keyToUse, provider, selectedModel || undefined, customBase);

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
      const customBase = (provider === 'openai' || provider === 'deepseek') 
        ? localStorage.getItem(`yujian:baseURL:${provider}`) || undefined 
        : undefined;
      const analysis = await analyzeSentenceWithKey(trimmed, keyToUse, provider, selectedModel || undefined, customBase);

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
      switchView('analyzer');
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

  // ------------------------------------------------------------------------
  // Task 9: Global keyboard shortcuts (/, Esc for modals, etc.)
  // Placed after handler declarations so all referenced fns (close*) are defined.
  // Single listener at root for consistency across views. Respects inputs.
  // ------------------------------------------------------------------------
  React.useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      // '/' focuses sentence input (only in analyzer view, when not typing)
      if (e.key === '/' && !isTyping && activeView === 'analyzer') {
        e.preventDefault();
        sentenceInputRef.current?.focus();
        sentenceInputRef.current?.select?.(); // optional: select existing for overwrite ease
        return;
      }

      // Global Esc closes any open modal (WordDetail or Replay). Modals also listen locally (defensive).
      if (e.key === 'Escape') {
        if (selectedDetail) {
          closeWordDetail();
        } else if (replayItem) {
          closeReplay();
        }
        // (no else — don't swallow Esc from other native elements)
      }

      // Optional quality-of-life: '?' shows a tiny hint toast when idle in analyzer (non-intrusive)
      if (e.key === '?' && !isTyping && activeView === 'analyzer' && !result && !isLoading) {
        // non-blocking visual hint (reuse existing toast pattern for 1.6s)
        setShowHistoryToast('提示：按 / 聚焦输入框 · Cmd/Ctrl+Enter 分析 · 点击词元查详情');
        window.setTimeout(() => setShowHistoryToast(null), 1600);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [activeView, selectedDetail, replayItem, result, isLoading]);

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

  // Friendly error messages per code + current provider
  const getErrorGuidance = (code: string | null): string => {
    if (!code) return '';

    const providerName = currentProviderConfig.label;

    switch (code) {
      case 'MISSING_KEY':
        return `请在「设置」中输入有效的 ${providerName} API Key。`;
      case 'INVALID_KEY':
        return `API Key 无效或无权限（${providerName}）。请检查 Key 是否正确、是否有额度，并确认已开通对应模型权限。`;
      case 'RATE_LIMIT':
        return `${providerName} 请求过于频繁，请稍等 30 秒后再试。`;
      case 'INVALID_INPUT':
        return '请输入有效的韩语句子。';
      case 'KEY_ISSUE':
        return `提供的 ${providerName} API Key 有问题，请重新检查或更换 Key。`;
      default:
        return `分析失败（${providerName}）。请检查网络、Key 权限，或稍后再试。`;
    }
  };

  const canAnalyze = sentenceInput.trim().length > 0 && isKeySaved && isKeyFormatValid && !isLoading;

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
            <div 
              className="view-switcher" 
              role="tablist" 
              aria-label="主视图切换"
              onKeyDown={handleViewTabKeyDown}
            >
              <button
                ref={analyzerTabRef}
                role="tab"
                aria-selected={activeView === 'analyzer'}
                tabIndex={activeView === 'analyzer' ? 0 : -1}
                onClick={() => switchView('analyzer')}
                className={`view-tab ${activeView === 'analyzer' ? 'active' : ''}`}
              >
                <Pencil className="w-3.5 h-3.5" /> 分析句子
              </button>
              <button
                ref={historyTabRef}
                role="tab"
                aria-selected={activeView === 'history'}
                tabIndex={activeView === 'history' ? 0 : -1}
                onClick={handleSwitchToHistory}
                className={`view-tab ${activeView === 'history' ? 'active' : ''}`}
              >
                <History className="w-3.5 h-3.5" /> 我的学习
              </button>
              <button
                ref={settingsTabRef}
                role="tab"
                aria-selected={activeView === 'settings'}
                tabIndex={activeView === 'settings' ? 0 : -1}
                onClick={() => switchView('settings')}
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
            {/* Slim API Key status — full management in 设置 view */}
            <div className="api-key-status">
              <KeyRound className="w-4 h-4 text-[var(--color-text-tertiary)] flex-shrink-0" />
              <span className="text-sm text-[var(--color-text-secondary)]">
                {isKeySaved ? 'Anthropic API Key 已安全保存于本地浏览器' : '尚未配置 API Key'}
              </span>
              <button
                onClick={() => switchView('settings')}
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
                  ref={sentenceInputRef}
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

            {/* Premium calm analysis loading skeleton — alive, healing, no harsh spinner.
                Mimics upcoming result-panel + token grid with soft spring pulses. */}
            {isLoading && (
              <div className="analysis-loading mt-6">
                <div className="analysis-loading-header">
                  <span>正在进行形态拆解与词源标注</span>
                  <span className="text-[10px] opacity-60">（通常 4–9 秒）</span>
                </div>

                {/* Skeleton of the result sentence header */}
                <motion.div 
                  className="skeleton-sentence" 
                  animate={SKELETON_PULSE} 
                />

                {/* Skeleton translations */}
                <motion.div 
                  className="skeleton-translation" 
                  style={{ width: '82%' }} 
                  animate={SKELETON_PULSE} 
                  transition={{ ...SKELETON_PULSE.transition, delay: 0.12 }} 
                />
                <motion.div 
                  className="skeleton-translation" 
                  style={{ width: '61%' }} 
                  animate={SKELETON_PULSE} 
                  transition={{ ...SKELETON_PULSE.transition, delay: 0.22 }} 
                />

                {/* Calm skeleton token grid — feels like the morpheme breakdown coming to life */}
                <div className="skeleton-token-grid">
                  {[0,1,2,3,4,5].map((i) => (
                    <motion.div 
                      key={i} 
                      className="skeleton-token" 
                      animate={SKELETON_PULSE}
                      transition={{ ...SKELETON_PULSE.transition, delay: 0.08 * (i % 3) }}
                    />
                  ))}
                </div>

                <div className="mt-3 text-[10px] text-[var(--color-text-muted)] tracking-wide text-center">
                  正在安静地理解韩语句子的结构与词源…
                </div>
              </div>
            )}

            {/* Error display — soft and actionable */}
            {error && (
              <div className="error-card mt-6" role="alert">
                <AlertCircle className="icon w-4 h-4 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-medium mb-0.5">分析失败</div>
                  <div>{error}</div>
                  {errorCode && (
                    <div className="mt-1 text-xs opacity-75">
                      {getErrorGuidance(errorCode)}
                    </div>
                  )}

                  {(errorCode === 'INVALID_KEY' || errorCode === 'MISSING_KEY' || errorCode === 'KEY_ISSUE') && (
                    <button
                      onClick={() => setActiveView('settings')}
                      className="mt-2 text-sm text-[var(--color-accent-sage)] underline hover:no-underline"
                    >
                      前往「设置」检查或更换 {currentProviderConfig.label} Key →
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Beautiful analysis result (Korean priority throughout) */}
            {result && (
              <motion.div 
                className="result-panel"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 120, damping: 25, delay: 0.1 }}
              >
                <div className="result-header">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs tracking-[0.08em] font-semibold text-[var(--color-text-tertiary)]">分析完成</span>
                      <motion.span
                        className="save-indicator"
                        initial={{ opacity: 0, scale: 0.96, x: -4 }}
                        animate={{ opacity: 1, scale: 1, x: 0 }}
                        transition={{ type: "spring", stiffness: 380, damping: 26, delay: 0.35 }}
                      >
                        <Check className="w-3.5 h-3.5" /> 已自动保存至学习历史
                      </motion.span>
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

                    {/* Improved staggered entrance (spring + parent stagger) — tokens now gracefully cascade in after analysis with tasteful liveliness */}
                    <motion.div
                      className="token-grid"
                      initial="hidden"
                      animate="visible"
                      variants={{
                        visible: {
                          transition: {
                            staggerChildren: 0.032,
                            delayChildren: 0.06,
                          },
                        },
                      }}
                    >
                      {result.tokens.map((token) => (
                        <motion.div
                          key={token.id}
                          variants={{
                            hidden: { opacity: 0, y: 14, scale: 0.96 },
                            visible: {
                              opacity: 1,
                              y: 0,
                              scale: 1,
                              transition: { type: 'spring', stiffness: 300, damping: 24, mass: 0.9 },
                            },
                          }}
                        >
                          <TokenCard 
                            token={token} 
                            onClick={(t) => openWordDetail(t, result)} 
                          />
                        </motion.div>
                      ))}
                    </motion.div>

                    <p className="mt-3 text-[10px] text-[var(--color-text-muted)] tracking-wide">
                      每张卡片突出韩语本形，词源徽章（固有词 / 汉字词 / 外来词）。<strong>点击任意卡片</strong>打开单词详情（释义、例句、加入学习）。
                    </p>
                  </>
                )}
              </motion.div>
            )}

            {/* Poetic empty state — Subagent 4: a calm journal page inviting the first sentence */}
            {!result && !isLoading && !error && (
              <motion.div 
                className="poetic-empty"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="poetic-empty-content">
                  <motion.svg 
                    width="42" height="42" 
                    viewBox="0 0 48 48" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="1.25" 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    className="mx-auto"
                    animate={{ opacity: [0.7, 1, 0.7] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <path d="M9 8.5h24a3 3 0 013 3v25.5a3 3 0 01-3 3H9" />
                    <path d="M15 8.5v31" />
                    <path d="M20 15.5h10M20 21h10M20 26.5h7" />
                    <path d="M12 35.5c3.5 1.2 8 .8 12.5-1.2" opacity="0.5" />
                  </motion.svg>
                  <div className="poetic-empty-title">
                    纸页轻展。<br />静待第一缕韩语，像晨光落在松针。
                  </div>
                  <div className="poetic-empty-hint">
                    输入句子并按 <kbd>/</kbd> 聚焦 · Cmd/Ctrl + Enter 分析<br />
                    点击词元探索词源与例句，留下一段自己的学习痕迹
                  </div>
                </div>
              </motion.div>
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

            {/* Calm history loading skeleton — consistent premium feel */}
            {isHistoryLoading && (
              <div className="history-loading-skeleton mt-4">
                {[0,1,2].map((i) => (
                  <motion.div 
                    key={i} 
                    className="skeleton-history-item" 
                    animate={SKELETON_PULSE}
                    transition={{ ...SKELETON_PULSE.transition, delay: i * 0.09 }}
                  />
                ))}
                <div className="text-center text-[10px] text-[var(--color-text-muted)] mt-1 tracking-wide">
                  正在从本地 Dexie 取回你的学习记录…
                </div>
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
                      {visibleSentences.map((item, index) => (
                        <HistorySentenceCard
                          key={item.id}
                          item={item}
                          onMarkMastered={handleMarkMastered}
                          onToggleFocus={handleToggleFocus}
                          onDelete={handleDeleteHistory}
                          onReplay={openReplay}
                          isProcessing={historyProcessingId === item.id}
                          entranceDelay={index * 0.038}
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
                      {visibleWords.map((word, index) => (
                        <WordBankCard
                          key={word.id}
                          word={word}
                          onDelete={handleDeleteWord}
                          isProcessing={historyProcessingId === word.id}
                          entranceDelay={index * 0.038}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty states — poetic, calm, inviting (want to linger) */}
                {filteredTotal === 0 && (
                  <motion.div
                    className="history-empty-state mt-8 mb-4 poetic-empty history-empty"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 180, damping: 26, delay: 0.06 }}
                  >
                    <div className="mx-auto flex flex-col items-center text-center max-w-[340px] py-7">
                      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-bg-subtle)] text-[var(--color-accent-sage)]/75 ring-1 ring-inset ring-[var(--color-border-subtle)]/60">
                        <BookOpen className="h-5.5 w-5.5" />
                      </div>

                      {totalLearningCount === 0 ? (
                        <>
                          <div className="text-[11px] font-medium tracking-[0.14em] text-[var(--color-text-muted)] mb-1">心园 · 初启</div>
                          <div className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--color-text-secondary)] mb-3">静待第一缕墨痕</div>
                          <p className="text-[13px] leading-[1.65] text-[var(--color-text-tertiary)] max-w-[26ch]">
                            像一页未书写的宣纸。<br />开始分析一句韩语，或将词语珍藏，<br />这里便会悄然生长，陪伴漫步。
                          </p>
                          <button
                            onClick={() => switchView('analyzer')}
                            className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-4 py-1.5 text-sm text-[var(--color-text-secondary)] hover:border-[var(--color-accent-sage)] hover:text-[var(--color-accent-sage)] active:bg-[var(--color-bg-subtle)] transition-all duration-150"
                          >
                            <Plus className="w-3.5 h-3.5" /> 开始第一次分析
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="text-[11px] font-medium tracking-[0.14em] text-[var(--color-text-muted)] mb-1">风过无痕</div>
                          <div className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--color-text-secondary)] mb-3">纱帐轻垂，暂无此景</div>
                          <p className="text-[13px] leading-[1.65] text-[var(--color-text-tertiary)] max-w-[26ch]">
                            当前筛选如薄雾笼园。<br />松开几缕丝线，或让清风再过。
                          </p>
                          <button
                            onClick={clearAllHistoryFilters}
                            className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-4 py-1.5 text-sm text-[var(--color-text-secondary)] hover:border-[var(--color-accent-sage)] hover:text-[var(--color-accent-sage)] active:bg-[var(--color-bg-subtle)] transition-all duration-150"
                          >
                            让风吹过 · 清除筛选
                          </button>
                        </>
                      )}
                    </div>
                  </motion.div>
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

            {/* Provider Selection + API Key (multi-provider support) */}
            <div className="settings-section">
              <div className="settings-section-title">
                <KeyRound className="w-4 h-4" /> LLM 提供商
              </div>

              {/* Provider selector */}
              <div className="mb-4 flex flex-wrap gap-2">
                {PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => updateProvider(p.id)}
                    className={`rounded-full px-4 py-1.5 text-sm transition-all border ${
                      provider === p.id
                        ? 'bg-[var(--color-accent-sage)] text-white border-[var(--color-accent-sage)]'
                        : 'border-[var(--color-border)] hover:bg-[var(--color-bg-surface)]'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Recommended Models - quick selection */}
              {recommendedModels.length > 0 && (
                <div className="mb-4">
                  <div className="text-sm font-medium mb-2 text-[var(--color-text-secondary)]">
                    推荐模型（点击快速选择）
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recommendedModels.map((m) => (
                      <button
                        key={m}
                        onClick={() => updateSelectedModel(m)}
                        className={`px-3 py-1 rounded-full text-xs border transition ${
                          selectedModel === m
                            ? 'bg-[var(--color-accent-sage)] text-white border-[var(--color-accent-sage)]'
                            : 'border-[var(--color-border)] hover:bg-[var(--color-bg-surface)]'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                    {selectedModel && !recommendedModels.includes(selectedModel) && (
                      <button
                        onClick={() => updateSelectedModel('')}
                        className="px-3 py-1 rounded-full text-xs border border-red-300 text-red-600 hover:bg-red-50"
                      >
                        清除自定义
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={selectedModel}
                    onChange={(e) => updateSelectedModel(e.target.value)}
                    placeholder="或输入自定义模型名称（留空使用提供商默认）"
                    className="mt-2 w-full text-sm px-3 py-2 rounded border border-[var(--color-border)] bg-[var(--color-bg-surface)]"
                  />
                </div>
              )}

              {/* Key input - dynamic label & placeholder */}
              <div className="settings-key-wrap">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => updateApiKey(e.target.value)}
                  placeholder={`${currentProviderConfig.keyPlaceholder} （仅本地保存）`}
                  className={`settings-key-input ${apiKey && !isKeyFormatValid ? 'border-red-400 focus:border-red-500' : ''}`}
                  autoComplete="off"
                  spellCheck={false}
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

              {apiKey && !isKeyFormatValid && (
                <div className="mt-2 text-sm text-red-600">
                  当前 Key 格式与所选提供商不匹配（应以 <code>{currentProviderConfig.keyPrefix}</code> 开头）
                </div>
              )}

              <div className="mt-3">
                <button
                  onClick={async () => {
                    if (!apiKey.trim() || !isKeyFormatValid) return;
                    setIsTestingKey(true);
                    setKeyTestError(null);
                    try {
                      const modelToTest = selectedModel || currentProviderConfig.defaultModel || '';
                      // Pass custom baseURL if user has set one for relays
                      const customBase = (provider === 'openai' || provider === 'deepseek') 
                        ? (localStorage.getItem(`yujian:baseURL:${provider}`) || undefined) 
                        : undefined;
                      await analyzeSentenceWithKey('안녕하세요.', apiKey.trim(), provider, modelToTest || undefined, customBase);
                      alert('✅ Key 验证通过！可以正常使用。');
                    } catch (e: any) {
                      const message = e?.message || 'Key 测试失败';
                      setKeyTestError(message);
                    } finally {
                      setIsTestingKey(false);
                    }
                  }}
                  disabled={!isKeySaved || !isKeyFormatValid || isTestingKey}
                  className="text-sm px-4 py-1.5 rounded border border-[var(--color-border)] hover:bg-[var(--color-bg-surface)] disabled:opacity-50 active:scale-[0.985] transition-transform"
                >
                  {isTestingKey ? '正在测试...' : '测试当前 Key 是否可用'}
                </button>
                <span className="ml-2 text-xs text-[var(--color-text-muted)]">
                  （使用 {currentProviderConfig.label}{selectedModel ? ` / ${selectedModel}` : ''}，消耗极少 token）
                </span>

                {/* 中转站用户重要提示 */}
                {(provider === 'openai' || provider === 'deepseek') && (
                  <div className="mt-3 p-3 rounded-lg border border-amber-200 bg-amber-50 text-sm">
                    <div className="font-medium text-amber-800 mb-1">⚠️ 中转站用户注意事项</div>
                    <div className="text-amber-700 text-xs leading-relaxed">
                      很多中转站会主动封锁 Vercel 的服务器 IP，导致 403 错误（即使你的 Key 在其他地方完全正常）。
                      <br /><br />
                      <strong>推荐做法：</strong><br />
                      1. 先在本地运行 <code>npm run dev</code> 测试同一个 Key + Base URL<br />
                      2. 如果本地能用 → 基本可以确认是 Vercel IP 被封<br />
                      3. 此时建议改用自建服务器或接受偶尔 403 的情况
                    </div>
                  </div>
                )}

                {/* Custom Base URL for relays (中转站) */}
                {(provider === 'openai' || provider === 'deepseek') && (
                  <div className="mt-3">
                    <label className="block text-xs text-[var(--color-text-secondary)] mb-1">
                      自定义 Base URL（中转站专用，可选）
                    </label>
                    <input
                      type="text"
                      defaultValue={typeof window !== 'undefined' ? localStorage.getItem(`yujian:baseURL:${provider}`) || '' : ''}
                      onChange={(e) => {
                        const val = e.target.value.trim();
                        if (val) {
                          localStorage.setItem(`yujian:baseURL:${provider}`, val);
                        } else {
                          localStorage.removeItem(`yujian:baseURL:${provider}`);
                        }
                      }}
                      placeholder="https://api.example.com/v1"
                      className="w-full text-sm px-3 py-2 rounded border border-[var(--color-border)] bg-[var(--color-bg-surface)]"
                    />
                    <div className="text-[10px] text-[var(--color-text-muted)] mt-1">
                      如果你使用中转站（如 vpsairobot），请填写完整 Base URL（通常是 https://api.xxx.com/v1）
                    </div>
                    {provider === 'openai' && (
                      <div className="mt-1 text-[10px] text-[var(--color-accent-sage)]">
                        提示：vpsairobot 用户可尝试填写你的中转站地址
                      </div>
                    )}
                  </div>
                )}

                {keyTestError && (
                  <div className="mt-2 p-3 rounded border border-red-300 bg-red-50 text-sm text-red-800">
                    <div className="font-medium mb-1">Key 测试失败（403）</div>
                    <div>{keyTestError}</div>
                    <div className="mt-2 text-xs leading-relaxed">
                      常见原因（尤其是中转站）：<br/>
                      • 中转站限制了 Vercel / 云服务器 IP（最常见）<br/>
                      • Key 在中转站没有对应模型权限或额度<br/>
                      • Base URL 填写错误<br/>
                      • 中转站对请求头有严格校验<br/><br/>
                      建议：<br/>
                      1. 确认你填的 Base URL 是正确的（vpsairobot 用户通常是 https://api.vpsairobot.com/v1 或你专属的地址）<br/>
                      2. 在中转站后台检查这个 Key 的额度、模型权限和 IP 白名单<br/>
                      3. 尝试换一个其他中转站测试（很多中转站会封 Vercel IP）<br/>
                      4. 本地运行测试（`npm run dev`）如果本地能用，基本可以确认是 Vercel IP 被中转站封了
                    </div>
                  </div>
                )}
              </div>

              <div className="settings-help-text mt-2">
                您的 Key 仅保存在浏览器 localStorage，绝不发送到任何服务器（除分析请求外）。服务端接收后立即丢弃。
              </div>
            </div>

            {/* Dynamic instructions per provider */}
            <div className="settings-section">
              <div className="settings-section-title">如何获取 {currentProviderConfig.label} API Key？</div>
              <div className="settings-instructions">
                <ol className="settings-steps">
                  {provider === 'anthropic' && (
                    <>
                      <li>访问官方控制台：<a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" className="settings-link">https://console.anthropic.com/</a></li>
                      <li>注册/登录后进入「API Keys」，点击「Create Key」（格式以 <code>sk-ant-</code> 开头）</li>
                    </>
                  )}
                  {provider === 'openai' && (
                    <>
                      <li>访问 <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="settings-link">OpenAI API Keys</a></li>
                      <li>登录后点击「Create new secret key」（格式以 <code>sk-</code> 开头）</li>
                    </>
                  )}
                  {provider === 'gemini' && (
                    <>
                      <li>访问 <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="settings-link">Google AI Studio</a></li>
                      <li>点击「Create API Key」（格式以 <code>AIza</code> 开头）</li>
                    </>
                  )}
                  {provider === 'deepseek' && (
                    <>
                      <li>访问 <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener noreferrer" className="settings-link">DeepSeek 平台</a></li>
                      <li>登录后创建新 Key（格式以 <code>sk-</code> 开头，兼容 OpenAI）</li>
                    </>
                  )}
                  <li>复制密钥并粘贴到上方密码框中即可立即使用（输入即自动保存）</li>
                </ol>
                <p className="settings-note">
                  提示：不同厂商免费额度差异较大。Key 完全本地存储，管理权永远在您手中。
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

      {/* Subtle footer note — security & scope transparent */}
      <footer className="max-w-4xl mx-auto px-6 pb-12 text-[10px] text-[var(--color-text-muted)] text-center tracking-wide">
        API Key 仅在浏览器本地保存并通过 HTTPS 安全发送至 /api/analyze（服务端使用后立即丢弃）。<br />
        所有数据与密钥严格本地化 · 尊重您的隐私与控制权 · 按 / 聚焦输入 · 方向键导航标签页
      </footer>

      {/* Auto-save toast (sentence) — upgraded to consistent premium spring + AnimatePresence for calm, purposeful success feedback */}
      <AnimatePresence>
        {showSavedToast && (
          <motion.div
            className="analyzer-toast"
            role="status"
            initial={{ opacity: 0, y: 8, scale: 0.988 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.99 }}
            transition={{ type: "spring", stiffness: 310, damping: 26, mass: 0.9 }}
          >
            <Check className="w-4 h-4" /> 已自动保存到学习历史
          </motion.div>
        )}
      </AnimatePresence>

      {/* Word saved toast (Task 6) — enhanced with matching premium spring micro-interaction for analyzer context */}
      <AnimatePresence>
        {showWordSavedToast && (
          <motion.div
            className="analyzer-toast word-toast"
            role="status"
            initial={{ opacity: 0, y: 8, scale: 0.988 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.99 }}
            transition={{ type: "spring", stiffness: 310, damping: 26, mass: 0.9 }}
          >
            <Check className="w-4 h-4" /> 已加入我的学习
          </motion.div>
        )}
      </AnimatePresence>

      {/* History action toast (Task 7) */}
      {showHistoryToast && (
        <div className="analyzer-toast history-toast" role="status">
          <Check className="w-4 h-4" /> {showHistoryToast}
        </div>
      )}

      {/* Word Detail Modal (Task 6) — rendered at root level for proper overlay.
          AnimatePresence + spring motion now powers premium enter/exit physics (calm, alive). */}
      <AnimatePresence>
        {selectedDetail && (
          <WordDetailModal
            token={selectedDetail.token}
            context={selectedDetail.context}
            onClose={closeWordDetail}
            onAddToLearning={handleAddToLearning}
            isAdding={isAddingToLearning}
          />
        )}
      </AnimatePresence>

      {/* History Replay Modal (Task 7) — beautiful full-snapshot viewer.
          Now with spring-based exit that feels premium and healing. */}
      <AnimatePresence>
        {replayItem && (
          <AnalysisReplayModal item={replayItem} onClose={closeReplay} />
        )}
      </AnimatePresence>
    </div>
  );
}
