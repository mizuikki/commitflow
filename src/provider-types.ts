export type ProviderId =
  | 'openai'
  | 'azure-openai'
  | 'anthropic'
  | 'gemini'
  | 'deepseek'
  | 'openrouter'
  | 'groq'
  | 'ollama'
  | 'lmstudio'
  | 'openai-compatible';

export type DriverKind = 'openai' | 'azure-openai' | 'anthropic' | 'gemini';

export type AuthScheme = 'api-key' | 'bearer' | 'none';

export interface ProviderConnectionConfig {
  baseURL?: string;
  endpoint?: string;
  deployment?: string;
  apiVersion?: string;
}

export type DeepSeekThinkingMode = 'enabled' | 'disabled';
export type DeepSeekReasoningEffort = 'high' | 'max';

export interface DeepSeekInferenceConfig {
  thinking?: DeepSeekThinkingMode;
  reasoningEffort?: DeepSeekReasoningEffort;
}

export interface ProviderInferenceConfig {
  temperature?: number;
  deepseek?: DeepSeekInferenceConfig;
}

export interface ProviderProfile {
  id: string;
  name: string;
  providerId: ProviderId;
  driverKind: DriverKind;
  model: string;
  auth: {
    scheme: AuthScheme;
  };
  connection?: ProviderConnectionConfig;
  inference?: ProviderInferenceConfig;
}

export interface ProviderProfileInput extends Omit<ProviderProfile, 'id'> {
  id?: string;
}

export interface ResolvedProviderProfile {
  profile: ProviderProfile;
  apiKey?: string;
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeTemperature(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  if (value < 0 || value > 2) {
    return undefined;
  }

  return value;
}

function normalizeDeepSeekThinking(value: unknown): DeepSeekThinkingMode | undefined {
  return value === 'enabled' || value === 'disabled' ? value : undefined;
}

function normalizeDeepSeekReasoningEffort(value: unknown): DeepSeekReasoningEffort | undefined {
  return value === 'high' || value === 'max' ? value : undefined;
}

function normalizeConnection(value: unknown): ProviderConnectionConfig | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const raw = value as Record<string, unknown>;
  const connection: ProviderConnectionConfig = {
    baseURL: normalizeString(raw.baseURL),
    endpoint: normalizeString(raw.endpoint),
    deployment: normalizeString(raw.deployment),
    apiVersion: normalizeString(raw.apiVersion)
  };

  return Object.values(connection).some(Boolean) ? connection : undefined;
}

function normalizeInference(value: unknown, providerId: ProviderId): ProviderInferenceConfig | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const raw = value as Record<string, unknown>;
  const rawDeepSeek =
    raw.deepseek && typeof raw.deepseek === 'object'
      ? (raw.deepseek as Record<string, unknown>)
      : undefined;
  const deepseek =
    providerId === 'deepseek' && rawDeepSeek
      ? {
          thinking: normalizeDeepSeekThinking(rawDeepSeek.thinking),
          reasoningEffort: normalizeDeepSeekReasoningEffort(rawDeepSeek.reasoningEffort)
        }
      : undefined;
  const inference: ProviderInferenceConfig = {
    temperature: normalizeTemperature(raw.temperature),
    deepseek:
      deepseek && Object.values(deepseek).some((item) => item !== undefined)
        ? deepseek
        : undefined
  };

  return Object.values(inference).some((item) => item !== undefined) ? inference : undefined;
}

export function normalizeProviderProfile(raw: unknown): ProviderProfile | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }

  const record = raw as Record<string, unknown>;
  const providerId = normalizeString(record.providerId) as ProviderId | undefined;
  const driverKind = normalizeString(record.driverKind) as DriverKind | undefined;
  const authScheme = normalizeString(
    record.auth && typeof record.auth === 'object'
      ? (record.auth as Record<string, unknown>).scheme
      : undefined
  ) as AuthScheme | undefined;

  if (
    !providerId ||
    !driverKind ||
    !authScheme ||
    !normalizeString(record.id) ||
    !normalizeString(record.name) ||
    !normalizeString(record.model)
  ) {
    return undefined;
  }

  if (!['openai', 'azure-openai', 'anthropic', 'gemini'].includes(driverKind)) {
    return undefined;
  }

  if (
    ![
      'openai',
      'azure-openai',
      'anthropic',
      'gemini',
      'deepseek',
      'openrouter',
      'groq',
      'ollama',
      'lmstudio',
      'openai-compatible'
    ].includes(providerId)
  ) {
    return undefined;
  }

  if (!['api-key', 'bearer', 'none'].includes(authScheme)) {
    return undefined;
  }

  return {
    id: normalizeString(record.id)!,
    name: normalizeString(record.name)!,
    providerId,
    driverKind,
    model: normalizeString(record.model)!,
    auth: { scheme: authScheme },
    connection: normalizeConnection(record.connection),
    inference: normalizeInference(record.inference, providerId)
  };
}
