import {
  AuthScheme,
  DeepSeekReasoningEffort,
  DeepSeekThinkingMode,
  DriverKind,
  ProviderConnectionConfig,
  ProviderId,
  ProviderInferenceConfig,
  ProviderProfile
} from './provider-types';
import { getRecommendedProviderModel } from './provider-model-presets';

export interface ProviderCatalogEntry {
  id: ProviderId;
  label: string;
  description: string;
  group: 'Hosted' | 'Local' | 'Custom';
  driverKind: DriverKind;
  authScheme: AuthScheme;
  supportsModelListing: boolean;
  defaults?: {
    connection?: ProviderConnectionConfig;
  };
  requiredFields: Array<keyof ProviderConnectionConfig>;
}

export const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    description: 'Official OpenAI API',
    group: 'Hosted',
    driverKind: 'openai',
    authScheme: 'bearer',
    supportsModelListing: true,
    requiredFields: []
  },
  {
    id: 'azure-openai',
    label: 'Azure OpenAI',
    description: 'Azure-hosted OpenAI deployments',
    group: 'Hosted',
    driverKind: 'azure-openai',
    authScheme: 'api-key',
    supportsModelListing: false,
    requiredFields: ['endpoint', 'deployment', 'apiVersion']
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    description: 'Claude via Anthropic API',
    group: 'Hosted',
    driverKind: 'anthropic',
    authScheme: 'api-key',
    supportsModelListing: false,
    requiredFields: []
  },
  {
    id: 'gemini',
    label: 'Gemini',
    description: 'Google Gemini API',
    group: 'Hosted',
    driverKind: 'gemini',
    authScheme: 'api-key',
    supportsModelListing: false,
    requiredFields: []
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    description: 'DeepSeek OpenAI-compatible API',
    group: 'Hosted',
    driverKind: 'openai',
    authScheme: 'bearer',
    supportsModelListing: true,
    defaults: {
      connection: {
        baseURL: 'https://api.deepseek.com'
      }
    },
    requiredFields: []
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    description: 'OpenRouter OpenAI-compatible gateway',
    group: 'Hosted',
    driverKind: 'openai',
    authScheme: 'bearer',
    supportsModelListing: true,
    defaults: {
      connection: {
        baseURL: 'https://openrouter.ai/api/v1'
      }
    },
    requiredFields: []
  },
  {
    id: 'groq',
    label: 'Groq',
    description: 'Groq OpenAI-compatible API',
    group: 'Hosted',
    driverKind: 'openai',
    authScheme: 'bearer',
    supportsModelListing: true,
    defaults: {
      connection: {
        baseURL: 'https://api.groq.com/openai/v1'
      }
    },
    requiredFields: []
  },
  {
    id: 'ollama',
    label: 'Ollama',
    description: 'Local Ollama OpenAI-compatible endpoint',
    group: 'Local',
    driverKind: 'openai',
    authScheme: 'none',
    supportsModelListing: true,
    defaults: {
      connection: {
        baseURL: 'http://localhost:11434/v1'
      }
    },
    requiredFields: []
  },
  {
    id: 'lmstudio',
    label: 'LM Studio',
    description: 'Local LM Studio OpenAI-compatible endpoint',
    group: 'Local',
    driverKind: 'openai',
    authScheme: 'none',
    supportsModelListing: true,
    defaults: {
      connection: {
        baseURL: 'http://localhost:1234/v1'
      }
    },
    requiredFields: []
  },
  {
    id: 'openai-compatible',
    label: 'Custom OpenAI-compatible',
    description: 'Any OpenAI-compatible endpoint',
    group: 'Custom',
    driverKind: 'openai',
    authScheme: 'bearer',
    supportsModelListing: true,
    requiredFields: ['baseURL']
  }
];

const PROVIDER_REGISTRY = new Map(PROVIDER_CATALOG.map((entry) => [entry.id, entry]));
const DEEPSEEK_THINKING_MODES: DeepSeekThinkingMode[] = ['enabled', 'disabled'];
const DEEPSEEK_REASONING_EFFORTS: DeepSeekReasoningEffort[] = ['high', 'max'];

export function getProviderCatalogEntry(providerId: ProviderId): ProviderCatalogEntry {
  const entry = PROVIDER_REGISTRY.get(providerId);
  if (!entry) {
    throw new Error(`Unsupported provider: ${providerId}`);
  }

  return entry;
}

export function getProviderLabel(providerId: ProviderId): string {
  return getProviderCatalogEntry(providerId).label;
}

export function supportsModelListing(profile: ProviderProfile): boolean {
  return getProviderCatalogEntry(profile.providerId).supportsModelListing;
}

export function validateProviderProfile(profile: ProviderProfile): string[] {
  const entry = getProviderCatalogEntry(profile.providerId);
  const errors: string[] = [];

  if (profile.driverKind !== entry.driverKind) {
    errors.push(`Provider "${entry.label}" must use driver "${entry.driverKind}".`);
  }

  if (profile.auth.scheme !== entry.authScheme) {
    errors.push(`Provider "${entry.label}" must use auth scheme "${entry.authScheme}".`);
  }

  if (!profile.name.trim()) {
    errors.push('Profile name is required.');
  }

  if (!profile.model.trim()) {
    errors.push('Model is required.');
  }

  for (const field of entry.requiredFields) {
    if (!profile.connection?.[field]?.trim()) {
      const label =
        field === 'baseURL'
          ? 'Base URL'
          : field === 'endpoint'
            ? 'Endpoint'
            : field === 'deployment'
              ? 'Deployment'
              : 'API version';
      errors.push(`${label} is required for ${entry.label}.`);
    }
  }

  const temperature = profile.inference?.temperature;
  if (temperature !== undefined && (!Number.isFinite(temperature) || temperature < 0 || temperature > 2)) {
    errors.push('Temperature must be between 0 and 2.');
  }

  const deepseekInference = profile.inference?.deepseek;
  if (deepseekInference !== undefined && profile.providerId !== 'deepseek') {
    errors.push('DeepSeek inference settings can only be used with DeepSeek.');
  }
  if (
    deepseekInference?.thinking !== undefined &&
    !DEEPSEEK_THINKING_MODES.includes(deepseekInference.thinking)
  ) {
    errors.push('DeepSeek thinking must be enabled or disabled.');
  }
  if (
    deepseekInference?.reasoningEffort !== undefined &&
    !DEEPSEEK_REASONING_EFFORTS.includes(deepseekInference.reasoningEffort)
  ) {
    errors.push('DeepSeek reasoning effort must be high or max.');
  }

  return errors;
}

function createDefaultInferenceConfig(providerId: ProviderId): ProviderInferenceConfig {
  return {
    temperature: 0.7,
    ...(providerId === 'deepseek'
      ? {
          deepseek: {
            thinking: 'disabled' as const
          }
        }
      : {})
  };
}

export function createDefaultProfileDraft(providerId: ProviderId) {
  const entry = getProviderCatalogEntry(providerId);
  return {
    providerId: entry.id,
    driverKind: entry.driverKind,
    authScheme: entry.authScheme,
    model: getRecommendedProviderModel(entry.id),
    connection: { ...(entry.defaults?.connection ?? {}) },
    inference: createDefaultInferenceConfig(entry.id)
  };
}
