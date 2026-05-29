import { ProviderId } from './provider-types';

export interface ProviderModelPresetEntry {
  providerId: ProviderId;
  recommendedModel?: string;
  modelPresets: string[];
}

export const PROVIDER_MODEL_PRESETS: ProviderModelPresetEntry[] = [
  {
    providerId: 'openai',
    recommendedModel: 'gpt-5.5',
    modelPresets: [
      'gpt-5.5',
      'gpt-5.4',
      'gpt-5.4-pro',
      'gpt-5.4-mini',
      'gpt-5.4-nano',
      'gpt-5',
      'gpt-5-mini',
      'gpt-5-nano'
    ]
  },
  {
    providerId: 'azure-openai',
    recommendedModel: 'gpt-5.5',
    modelPresets: [
      'gpt-5.5',
      'gpt-5.4',
      'gpt-5.4-pro',
      'gpt-5.4-mini',
      'gpt-5.4-nano',
      'gpt-5',
      'gpt-5-mini',
      'gpt-5-nano'
    ]
  },
  {
    providerId: 'anthropic',
    recommendedModel: 'claude-sonnet-4-5-20250929',
    modelPresets: [
      'claude-opus-4-5-20251101',
      'claude-sonnet-4-5-20250929',
      'claude-haiku-4-5-20251001',
      'claude-opus-4-1-20250805',
      'claude-opus-4-20250514',
      'claude-sonnet-4-20250514'
    ]
  },
  {
    providerId: 'gemini',
    recommendedModel: 'gemini-3.5-flash',
    modelPresets: [
      'gemini-3.5-flash',
      'gemini-3.1-pro',
      'gemini-3.1-pro-preview',
      'gemini-3.1-flash-lite',
      'gemini-3.1-flash-image',
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite'
    ]
  },
  {
    providerId: 'deepseek',
    recommendedModel: 'deepseek-v4-flash',
    modelPresets: [
      'deepseek-v4-flash',
      'deepseek-v4-pro'
    ]
  },
  {
    providerId: 'openrouter',
    recommendedModel: 'openai/gpt-5.4',
    modelPresets: [
      'openai/gpt-5.4',
      'openai/gpt-5.4-mini',
      'openai/gpt-5.4-nano',
      'openai/gpt-chat-latest',
      'openai/gpt-oss-120b',
      'google/gemini-3.5-flash',
      'anthropic/claude-opus-4.8',
      'anthropic/claude-opus-4.8-fast',
      'openai/gpt-oss-20b'
    ]
  },
  {
    providerId: 'groq',
    recommendedModel: 'openai/gpt-oss-120b',
    modelPresets: [
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'meta-llama/llama-4-scout-17b-16e-instruct',
      'qwen/qwen3-32b',
      'groq/compound',
      'groq/compound-mini'
    ]
  }
];

const PROVIDER_MODEL_PRESET_REGISTRY = new Map(
  PROVIDER_MODEL_PRESETS.map((entry) => [entry.providerId, entry])
);

export function getProviderModelPresetEntry(providerId: ProviderId): ProviderModelPresetEntry {
  return PROVIDER_MODEL_PRESET_REGISTRY.get(providerId) ?? {
    providerId,
    modelPresets: []
  };
}

export function getProviderModelPresets(providerId: ProviderId): string[] {
  return getProviderModelPresetEntry(providerId).modelPresets;
}

export function getRecommendedProviderModel(providerId: ProviderId): string | undefined {
  return getProviderModelPresetEntry(providerId).recommendedModel;
}
