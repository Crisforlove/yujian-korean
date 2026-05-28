/**
 * Supported LLM Providers for 语见 (Yujian)
 *
 * Design goals:
 * - Good coverage for Chinese learners (quality + cost + accessibility)
 * - Easy to extend
 * - Clear labels in both Chinese and English
 */

export type SupportedProvider = 'anthropic' | 'openai' | 'gemini' | 'deepseek';

export type Provider = SupportedProvider; // alias for backward compatibility

export interface ProviderConfig {
  id: Provider;
  label: string;           // Chinese label for UI
  labelEn: string;         // English label
  keyPrefix: string;       // For basic client-side validation
  keyPlaceholder: string;
  description: string;     // Short help text
  defaultModel?: string;
}

export const PROVIDERS: ProviderConfig[] = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    labelEn: 'Anthropic (Claude)',
    keyPrefix: 'sk-ant-',
    keyPlaceholder: 'sk-ant-...',
    description: 'Claude 3.5/4 Sonnet，结构化能力最强，适合精细语法分析',
    defaultModel: 'claude-3-5-sonnet-20241022',
  },
  {
    id: 'openai',
    label: 'OpenAI (GPT)',
    labelEn: 'OpenAI (GPT)',
    keyPrefix: 'sk-',
    keyPlaceholder: 'sk-...',
    description: 'GPT-4o / GPT-4o-mini，生态成熟，质量稳定',
    defaultModel: 'gpt-4o',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    labelEn: 'Google Gemini',
    keyPrefix: 'AIza',
    keyPlaceholder: 'AIza...',
    description: 'Gemini 1.5 Flash/Pro，免费额度大，中文理解优秀',
    defaultModel: 'gemini-1.5-flash',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    labelEn: 'DeepSeek',
    keyPrefix: 'sk-',
    keyPlaceholder: 'sk-...',
    description: 'DeepSeek-V3 / R1，性价比极高，中文社区热门',
    defaultModel: 'deepseek-chat',
  },
];

export function getProviderConfig(provider: SupportedProvider): ProviderConfig {
  const found = PROVIDERS.find((p) => p.id === provider);
  if (!found) {
    throw new Error(`Unknown provider: ${provider}`);
  }
  return found;
}

export const DEFAULT_PROVIDER: Provider = 'anthropic';

export function isValidProvider(p: string): p is Provider {
  return PROVIDERS.some((config) => config.id === p);
}
