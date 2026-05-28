/**
 * Design tokens for 语见 (Yujian) — Korean learning for Chinese speakers.
 *
 * Philosophy: quiet, restrained, elegant, healing.
 * Low-saturation sophisticated neutrals. Generous breathing room.
 * Typography tuned specifically for long-form reading and Hangul clarity.
 *
 * Etymology badges (固有词 / 汉字词 / 外来词) are distinct yet calm and premium.
 */

export const colors = {
  // Canvas & surfaces — warm, soft off-whites for a healing, paper-like feel
  bg: {
    canvas: '#f8f6f1',      // primary warm cream background
    surface: '#ffffff',
    subtle: '#f1eee7',      // cards, panels
    elevated: '#faf8f3',    // hover / modals
  },

  // Text hierarchy — excellent contrast without harsh pure black
  text: {
    primary: '#2f2c27',     // main body text
    secondary: '#5c5750',   // supporting text
    tertiary: '#7a766f',    // captions, hints
    muted: '#9a958c',       // disabled / very subtle
    inverse: '#f8f6f1',
  },

  // Borders and dividers — soft, never stark
  border: {
    subtle: '#e5e0d5',
    default: '#d6d0c4',
    strong: '#b8b0a2',
  },

  // Very low-saturation, sophisticated accent hues (used sparingly)
  accent: {
    warm: '#a38f7a',        // taupe
    cool: '#7a8a8f',        // slate
    sage: '#7f8f7a',        // healing
  },

  // Etymology classification badges
  // Visually distinct by hue family, but all low-chroma, elegant, non-garish.
  // Used heavily in sentence analyzer for word etymology tagging.
  etymology: {
    // 固有词 — native Korean vocabulary (pure Korean roots)
    native: {
      bg: '#e8ede5',
      text: '#4a5c47',
      border: '#c8d5c3',
    },
    // 汉字词 — Sino-Korean (Hanja-derived)
    'sino-korean': {
      bg: '#f0e9e0',
      text: '#6b5c48',
      border: '#d8ccbb',
    },
    // 外来词 — loanwords / foreign origin
    loanword: {
      bg: '#e5e9ed',
      text: '#475b6b',
      border: '#c3ccd5',
    },
    // Fallback / unknown
    unknown: {
      bg: '#edebe6',
      text: '#5c5953',
      border: '#d4d0c6',
    },
  },
} as const;

export const spacing = {
  0: '0',
  px: '1px',
  '0.5': '0.125rem',
  1: '0.25rem',
  '1.5': '0.375rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  5: '1.25rem',
  6: '1.5rem',
  8: '2rem',
  10: '2.5rem',
  12: '3rem',
  16: '4rem',
  20: '5rem',
  24: '6rem',
} as const;

// Typography scale & measures optimized for:
// - Long comfortable reading sessions
// - Excellent Hangul legibility (slightly larger base, generous leading)
// - Beautiful mixed Chinese + Hangul + Latin rendering
export const typography = {
  fontSize: {
    xs: '0.6875rem',    // 11px — labels, badges
    sm: '0.8125rem',    // 13px — secondary
    base: '0.9375rem',  // 15px — primary reading size (ideal for Hangul)
    md: '1rem',         // 16px
    lg: '1.125rem',     // 18px — subheads
    xl: '1.3125rem',    // 21px
    '2xl': '1.5rem',    // 24px
    '3xl': '1.875rem',  // 30px
  },
  lineHeight: {
    tight: '1.25',
    snug: '1.4',
    normal: '1.6',
    relaxed: '1.75',    // excellent default for body prose
    loose: '1.9',       // very calm, spacious long-form
  },
  letterSpacing: {
    tight: '-0.02em',
    normal: '0em',
    wide: '0.015em',
    // Subtle negative for Hangul at text sizes improves density without crowding
    hangul: '-0.008em',
  },
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
} as const;

// Refined etymology badge tokens (used for consistent premium styling)
export const etymologyBadges = {
  paddingX: '0.5rem',
  paddingY: '0.0625rem',
  fontSize: typography.fontSize.xs,
  fontWeight: typography.fontWeight.medium,
  borderRadius: '0.375rem',
  borderWidth: '1px',
  letterSpacing: '0.03em',
  // Reference to color sets above
  variants: colors.etymology,
} as const;

export const designTokens = {
  colors,
  spacing,
  typography,
  etymologyBadges,
} as const;

export type DesignTokens = typeof designTokens;
export type EtymologyKey = keyof typeof colors.etymology;
