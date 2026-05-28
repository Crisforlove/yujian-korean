<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# 语见 (Yujian) — Agent Guidelines (Minimal)

**Project**: Calm, elegant Korean learning tool for Chinese speakers. Etymology-first (固有词/汉字词/外来词), local-only, privacy-first. MVP complete as of Task 10.

## Key Commands

```bash
npm run dev          # Start development server (http://localhost:3000)
npm run build        # Production build (must succeed cleanly)
npm run lint         # ESLint (target: 0 errors, 0 warnings)
npx tsc --noEmit     # TypeScript check (always run before commit)

# Real-time monitoring (strongly recommended)
tail -f WORKLOG.md   # Live subagent / task progress (append-only)
watch -n 2 cat PROGRESS.md

# Git
git status
git diff
git commit -m "feat/scope: concise message (reference task #)"
```

**Quality gate before any commit**: lint clean + tsc clean + build succeeds.

## Architecture Notes (MVP)

- **Single-page app**: All UI lives in `app/page.tsx` (no new pages/routes/components files unless explicitly required). Three views switched via `activeView` state: `analyzer` | `history` | `settings`.
- **Secure LLM path only**: Sentence analysis → `analyzeSentenceWithKey` (lib/llm/analyzer.ts) → `POST /api/analyze` (app/api/analyze/route.ts). User Anthropic key travels **only** to this route, used ephemerally in memory, **never** logged or returned.
- **Persistence**: Dexie (IndexedDB) via `lib/db.ts`. **Never** touch `db` directly from UI — always go through `lib/history-service.ts` (addToHistory, saveWordEntry, getHistory, clearAllData, mark*, etc.).
- **Data models**: Defined in `lib/types.ts` (AnalyzedSentence, Token, EtymologyTag, WordEntry, HistoryItem). Etymology is first-class (`native | 'sino-korean' | loanword | unknown`).
- **Design system**: `lib/design-tokens.ts` + `app/globals.css`. All new UI **must** reuse existing tokens, etymology badge classes (`.etymology-badge-*`), token-card, word-detail-modal patterns. Healing, low-saturation, generous whitespace, Hangul priority.
- **No external state**: Zero server persistence. Exports (JSON + MD) are client-side blobs only.
- **Keyboard & a11y**: Global listeners in page.tsx. Support roving focus on view tabs, Esc for modals, / and ? shortcuts.
- **Task discipline** (from history): 
  - Prefer editing existing files only.
  - Each major task ends with clean lint/tsc/build + WORKLOG append + single focused commit.
  - Sub-agents update WORKLOG at key points via terminal (never mutate without reason).

## Prompt / LLM Specific

- Real prompts & schema: `lib/llm/prompt.ts`, `schema.ts`.
- Route enforces Zod validation + sanitised errors (never leak keys).
- Legacy stub `lib/llm/client.ts` is intentionally unused scaffolding.

## Documentation & Logging

- **Always** append progress to `WORKLOG.md` (timestamped, via `cat >>`) at start, major checkpoints, and completion of tasks.
- Keep `PROGRESS.md` high-level when updating (usually by main agent).
- README.md is the public face — keep it excellent and up-to-date.
- Record limitations transparently (see current README "已知限制" section).

## What Not To Do

- Do not introduce new routes, new top-level component files, or new DB tables without strong justification and plan approval.
- Never persist Anthropic keys server-side or in any logs.
- Do not bypass history-service for Dexie access.
- Avoid heavy animations or high-saturation visuals — stay faithful to Task 2 tokens.
- Do not hardcode or commit any real API keys.

## Quick Reference Files

- `app/page.tsx` — the entire MVP experience
- `app/api/analyze/route.ts` — the only server boundary
- `lib/history-service.ts` — the data contract
- `app/globals.css` — visual language
- `WORKLOG.md` — living execution history

Follow the spirit of previous tasks: calm, precise, high-quality, fully validated.

Last updated during Task 10 (Final MVP Validation).

