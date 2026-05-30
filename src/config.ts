import { randomUUID } from 'crypto';
import * as vscode from 'vscode';
import { createClientForModelListing } from './api-utils';
import { logDebug } from './logger';
import { supportsModelListing, validateProviderProfile } from './provider-registry';
import {
  ProviderProfile,
  ProviderProfileInput,
  ResolvedProviderProfile,
  normalizeProviderProfile
} from './provider-types';
export type {
  AuthScheme,
  DriverKind,
  ProviderConnectionConfig,
  ProviderId,
  ProviderInferenceConfig,
  ProviderProfile,
  ProviderProfileInput,
  ResolvedProviderProfile
} from './provider-types';

export type PromptPreset =
  | 'gitmoji-prefix'
  | 'gitmoji-suffix'
  | 'without-gitmoji'
  | 'custom';
type LegacyPromptPreset = 'with-gitmoji';
type ConfiguredPromptPreset = PromptPreset | LegacyPromptPreset;

export const COMMITFLOW_NAMESPACE = 'commitflow';
const LEGACY_AI_COMMIT_NAMESPACE = 'ai-commit-plus';
const AVAILABLE_MODELS_KEY = 'availableProviderModels';
const LEGACY_CONFIG_MIGRATION_KEY = 'legacyAiCommitPlusConfigMigrated';
const PROMPT_PRESET_VALUE_MIGRATION_KEY = 'promptPresetValueMigrated';
const PROVIDER_SCHEMA_WARNING_KEY = 'providerProfilesV2WarningShown';
const PROFILE_API_KEY_PREFIX = 'providerProfiles.apiKey:';
export const DEFAULT_PROMPT_PRESET: PromptPreset = 'without-gitmoji';

export enum ConfigKeys {
  COMMIT_LANGUAGE = 'commitLanguage',
  PROMPT_PRESET = 'promptPreset',
  SYSTEM_PROMPT = 'systemPrompt',
  PROVIDER_PROFILES = 'providerProfiles',
  ACTIVE_PROVIDER_PROFILE_ID = 'activeProviderProfileId',
  DEBUG_LOGGING = 'debugLogging',
  MAX_DIFF_CHARS = 'maxDiffChars',
}

const LEGACY_CONFIG_KEY_MAP: Partial<Record<ConfigKeys, string>> = {
  [ConfigKeys.COMMIT_LANGUAGE]: 'AI_COMMIT_LANGUAGE',
  [ConfigKeys.PROMPT_PRESET]: 'PROMPT_PRESET',
  [ConfigKeys.SYSTEM_PROMPT]: 'AI_COMMIT_SYSTEM_PROMPT',
  [ConfigKeys.ACTIVE_PROVIDER_PROFILE_ID]: 'ACTIVE_PROVIDER_PROFILE_ID',
  [ConfigKeys.DEBUG_LOGGING]: 'DEBUG_LOGGING',
  [ConfigKeys.MAX_DIFF_CHARS]: 'MAX_DIFF_CHARS'
};

type InspectedConfigurationValue<T> = {
  globalValue?: T;
  workspaceValue?: T;
  workspaceFolderValue?: T;
};

export function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function parsePromptPreset(value: unknown): PromptPreset | undefined {
  switch (value) {
    case 'with-gitmoji':
    case 'gitmoji-prefix':
      return 'gitmoji-prefix';
    case 'gitmoji-suffix':
    case 'without-gitmoji':
    case 'custom':
      return value;
    default:
      return undefined;
  }
}

export function normalizePromptPreset(
  value: unknown,
  fallback: PromptPreset = DEFAULT_PROMPT_PRESET
): PromptPreset {
  return parsePromptPreset(value) ?? fallback;
}

export function createProviderProfileId(): string {
  return `profile-${randomUUID()}`;
}

function getProfileApiKeyStorageKey(profileId: string): string {
  return `${PROFILE_API_KEY_PREFIX}${profileId}`;
}

export function getConfigurationTargetForResource(
  resourceUri?: vscode.Uri
): vscode.ConfigurationTarget {
  // Prefer folder-scoped settings for repository roots, then workspace-level settings,
  // and fall back to global settings when no workspace context exists.
  return resourceUri && vscode.workspace.getWorkspaceFolder(resourceUri)
    ? vscode.ConfigurationTarget.WorkspaceFolder
    : vscode.workspace.workspaceFile || vscode.workspace.workspaceFolders?.length
      ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;
}

function getInspectedValueForTarget<T>(
  inspected: InspectedConfigurationValue<T> | undefined,
  target: vscode.ConfigurationTarget
): T | undefined {
  if (!inspected) {
    return undefined;
  }

  switch (target) {
    case vscode.ConfigurationTarget.Global:
      return inspected.globalValue;
    case vscode.ConfigurationTarget.Workspace:
      return inspected.workspaceValue;
    case vscode.ConfigurationTarget.WorkspaceFolder:
      return inspected.workspaceFolderValue;
  }

  return undefined;
}

/**
 * Manages the configuration for the AI commit extension.
 */
export class ConfigurationManager {
  private static instance: ConfigurationManager;
  private configCache: Map<string, any> = new Map();
  private disposable: vscode.Disposable;
  private context: vscode.ExtensionContext;
  private initialization?: Promise<void>;

  private constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.disposable = vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration(COMMITFLOW_NAMESPACE)) {
        return;
      }

      this.configCache.clear();

      if (
        event.affectsConfiguration(`${COMMITFLOW_NAMESPACE}.${ConfigKeys.PROVIDER_PROFILES}`)
      ) {
        this.updateModelList().catch((error) => {
          console.error('Failed to refresh provider model cache:', error);
        });
      }
    });
  }

  static getInstance(context?: vscode.ExtensionContext): ConfigurationManager {
    if (!this.instance && context) {
      this.instance = new ConfigurationManager(context);
    }
    return this.instance;
  }

  async initialize(): Promise<void> {
    this.initialization = Promise.resolve();
    await this.migrateLegacyConfiguration();
    await this.migratePromptPresetValues();
    await this.warnAboutLegacyProviderProfiles();
    await this.ensureActiveProfileExists();
  }

  private async migrateLegacyConfiguration(): Promise<void> {
    if (this.context.globalState.get<boolean>(LEGACY_CONFIG_MIGRATION_KEY)) {
      return;
    }

    await this.migrateLegacyConfigurationForTarget(vscode.ConfigurationTarget.Global);

    if (vscode.workspace.workspaceFile || vscode.workspace.workspaceFolders?.length) {
      await this.migrateLegacyConfigurationForTarget(vscode.ConfigurationTarget.Workspace);
    }

    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      await this.migrateLegacyConfigurationForTarget(
        vscode.ConfigurationTarget.WorkspaceFolder,
        folder.uri
      );
    }

    await this.context.globalState.update(LEGACY_CONFIG_MIGRATION_KEY, true);
    this.configCache.clear();
  }

  private async migrateLegacyConfigurationForTarget(
    target: vscode.ConfigurationTarget,
    resourceUri?: vscode.Uri
  ): Promise<void> {
    const currentConfig = vscode.workspace.getConfiguration(COMMITFLOW_NAMESPACE, resourceUri);
    const legacyConfig = vscode.workspace.getConfiguration(LEGACY_AI_COMMIT_NAMESPACE, resourceUri);

    for (const [currentKey, legacyKey] of Object.entries(LEGACY_CONFIG_KEY_MAP)) {
      const currentValue = getInspectedValueForTarget(
        currentConfig.inspect(currentKey),
        target
      );
      const legacyValue = legacyKey
        ? getInspectedValueForTarget(legacyConfig.inspect(legacyKey), target)
        : undefined;

      if (currentValue === undefined && legacyValue !== undefined) {
        await currentConfig.update(currentKey, legacyValue, target);
      }
    }
  }

  private async migratePromptPresetValues(): Promise<void> {
    if (this.context.globalState.get<boolean>(PROMPT_PRESET_VALUE_MIGRATION_KEY)) {
      return;
    }

    await this.migratePromptPresetValueForTarget(vscode.ConfigurationTarget.Global);

    if (vscode.workspace.workspaceFile || vscode.workspace.workspaceFolders?.length) {
      await this.migratePromptPresetValueForTarget(vscode.ConfigurationTarget.Workspace);
    }

    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      await this.migratePromptPresetValueForTarget(
        vscode.ConfigurationTarget.WorkspaceFolder,
        folder.uri
      );
    }

    await this.context.globalState.update(PROMPT_PRESET_VALUE_MIGRATION_KEY, true);
    this.configCache.clear();
  }

  private async migratePromptPresetValueForTarget(
    target: vscode.ConfigurationTarget,
    resourceUri?: vscode.Uri
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration(COMMITFLOW_NAMESPACE, resourceUri);
    const inspectedPromptPreset = config.inspect<ConfiguredPromptPreset>(ConfigKeys.PROMPT_PRESET);
    const currentValue = getInspectedValueForTarget(inspectedPromptPreset, target);

    if (currentValue !== 'with-gitmoji') {
      return;
    }

    await config.update(ConfigKeys.PROMPT_PRESET, 'gitmoji-prefix', target);
  }

  private getCacheKey(key: string, resourceUri?: vscode.Uri): string {
    return resourceUri ? `${key}:${resourceUri.toString()}` : key;
  }

  getConfig<T>(key: string, defaultValue?: T, resourceUri?: vscode.Uri): T {
    const cacheKey = this.getCacheKey(key, resourceUri);

    if (!this.configCache.has(cacheKey)) {
      const config = resourceUri
        ? vscode.workspace.getConfiguration(COMMITFLOW_NAMESPACE, resourceUri)
        : vscode.workspace.getConfiguration(COMMITFLOW_NAMESPACE);
      this.configCache.set(cacheKey, config.get<T>(key, defaultValue!));
    }
    return this.configCache.get(cacheKey);
  }

  async updateConfig<T>(
    key: string,
    value: T | undefined,
    target: vscode.ConfigurationTarget,
    resourceUri?: vscode.Uri
  ): Promise<void> {
    const config = resourceUri
      ? vscode.workspace.getConfiguration(COMMITFLOW_NAMESPACE, resourceUri)
      : vscode.workspace.getConfiguration(COMMITFLOW_NAMESPACE);

    await config.update(key, value, target);
    this.configCache.clear();
  }

  dispose() {
    this.disposable.dispose();
  }

  asAbsolutePath(relativePath: string): string {
    return this.context.asAbsolutePath(relativePath);
  }

  getProviderProfiles(): ProviderProfile[] {
    const rawProfiles = this.getConfig<unknown[]>(ConfigKeys.PROVIDER_PROFILES, []);
    return rawProfiles
      .map((item) => normalizeProviderProfile(item))
      .filter((item): item is ProviderProfile => {
        if (!item) {
          return false;
        }

        return validateProviderProfile(item).length === 0;
      });
  }

  async saveProviderProfiles(profiles: ProviderProfile[]): Promise<void> {
    await this.updateConfig(
      ConfigKeys.PROVIDER_PROFILES,
      profiles,
      vscode.ConfigurationTarget.Global
    );
  }

  async getProviderProfileApiKey(profileId: string): Promise<string | undefined> {
    return normalizeString(await this.context.secrets.get(getProfileApiKeyStorageKey(profileId)));
  }

  async setProviderProfileApiKey(profileId: string, apiKey: string): Promise<void> {
    await this.context.secrets.store(getProfileApiKeyStorageKey(profileId), apiKey);
  }

  async deleteProviderProfileApiKey(profileId: string): Promise<void> {
    await this.context.secrets.delete(getProfileApiKeyStorageKey(profileId));
  }

  getActiveProviderProfileId(resourceUri?: vscode.Uri): string | undefined {
    return this.getConfig<string>(ConfigKeys.ACTIVE_PROVIDER_PROFILE_ID, undefined, resourceUri);
  }

  getActiveProviderProfileOverrideId(resourceUri?: vscode.Uri): string | undefined {
    if (!resourceUri) {
      return undefined;
    }

    const config = vscode.workspace.getConfiguration(COMMITFLOW_NAMESPACE, resourceUri);
    const inspected = config.inspect<string>(ConfigKeys.ACTIVE_PROVIDER_PROFILE_ID);
    return normalizeString(inspected?.workspaceFolderValue ?? inspected?.workspaceValue);
  }

  async clearActiveProviderProfileOverride(resourceUri?: vscode.Uri): Promise<void> {
    if (!resourceUri) {
      return;
    }

    const config = vscode.workspace.getConfiguration(COMMITFLOW_NAMESPACE, resourceUri);
    const updateTargets = new Set<vscode.ConfigurationTarget>();

    if (vscode.workspace.getWorkspaceFolder(resourceUri)) {
      updateTargets.add(vscode.ConfigurationTarget.WorkspaceFolder);
    }

    if (vscode.workspace.workspaceFile || vscode.workspace.workspaceFolders?.length) {
      updateTargets.add(vscode.ConfigurationTarget.Workspace);
    }

    for (const target of updateTargets) {
      await config.update(ConfigKeys.ACTIVE_PROVIDER_PROFILE_ID, undefined, target);
    }
  }

  async setActiveProviderProfileId(
    profileId: string | undefined,
    target: vscode.ConfigurationTarget,
    resourceUri?: vscode.Uri
  ): Promise<void> {
    await this.updateConfig(ConfigKeys.ACTIVE_PROVIDER_PROFILE_ID, profileId, target, resourceUri);
  }

  async setActiveProviderProfileById(
    profileId: string,
    target: vscode.ConfigurationTarget,
    resourceUri?: vscode.Uri
  ): Promise<void> {
    const profiles = this.getProviderProfiles();
    if (!profiles.some((profile) => profile.id === profileId)) {
      throw new Error(`Provider profile not found: ${profileId}`);
    }

    await this.setActiveProviderProfileId(profileId, target, resourceUri);
  }

  async getActiveProviderProfile(resourceUri?: vscode.Uri): Promise<ResolvedProviderProfile> {
    const profiles = this.getProviderProfiles();
    const activeProfileId = this.getActiveProviderProfileId(resourceUri);
    const fallbackProfile = profiles[0];
    const profile =
      profiles.find((item) => item.id === activeProfileId) ?? fallbackProfile;

    if (!profile) {
      throw new Error('No provider profile is configured');
    }

    const apiKey = profile.auth.scheme === 'none'
      ? undefined
      : await this.getProviderProfileApiKey(profile.id);

    if (profile.auth.scheme !== 'none' && !apiKey) {
      throw new Error(`API key is missing for provider profile: ${profile.name}`);
    }

    return { profile, apiKey };
  }

  async upsertProviderProfile(
    profile: ProviderProfileInput,
    apiKey?: string,
    existingProfileId?: string
  ): Promise<ProviderProfile> {
    const profiles = this.getProviderProfiles();
    const profileId = existingProfileId ?? profile.id ?? createProviderProfileId();
    const nextProfile: ProviderProfile = {
      id: profileId,
      name: profile.name,
      providerId: profile.providerId,
      driverKind: profile.driverKind,
      model: profile.model,
      auth: profile.auth,
      connection: profile.connection,
      inference: profile.inference
    };

    const validationErrors = validateProviderProfile(nextProfile);
    if (validationErrors.length) {
      throw new Error(validationErrors[0]);
    }

    const nextProfiles = profiles.some((item) => item.id === profileId)
      ? profiles.map((item) => (item.id === profileId ? nextProfile : item))
      : [...profiles, nextProfile];

    await this.saveProviderProfiles(nextProfiles);

    if (nextProfile.auth.scheme === 'none') {
      await this.deleteProviderProfileApiKey(profileId);
    } else {
      const normalizedApiKey = normalizeString(apiKey);
      if (normalizedApiKey) {
        await this.setProviderProfileApiKey(profileId, normalizedApiKey);
      }
    }

    return nextProfile;
  }

  async deleteProviderProfile(profileId: string): Promise<void> {
    const profiles = this.getProviderProfiles();
    const nextProfiles = profiles.filter((profile) => profile.id !== profileId);

    await this.saveProviderProfiles(nextProfiles);
    await this.deleteProviderProfileApiKey(profileId);

    const activeProfileId = this.getActiveProviderProfileId();
    if (activeProfileId === profileId) {
      await this.setActiveProviderProfileId(
        nextProfiles[0]?.id,
        vscode.ConfigurationTarget.Global
      );
    }
  }

  async ensureActiveProfileExists(): Promise<void> {
    const profiles = this.getProviderProfiles();
    const activeProfileId = this.getActiveProviderProfileId();
    const workspaceProfileId = this.getActiveProviderProfileId(vscode.window.activeTextEditor?.document.uri);

    if (!profiles.length) {
      return;
    }

    if (!activeProfileId || !profiles.some((profile) => profile.id === activeProfileId)) {
      await this.setActiveProviderProfileId(
        profiles[0].id,
        vscode.ConfigurationTarget.Global
      );
    }

    if (workspaceProfileId && !profiles.some((profile) => profile.id === workspaceProfileId)) {
      await this.setActiveProviderProfileId(
        undefined,
        getConfigurationTargetForResource(vscode.window.activeTextEditor?.document.uri),
        vscode.window.activeTextEditor?.document.uri
      );
    }
  }

  async getAvailableModels(resourceUri?: vscode.Uri): Promise<string[]> {
    const { profile } = await this.getActiveProviderProfile(resourceUri);
    return this.getAvailableModelsForProfile(profile.id, resourceUri);
  }

  async getAvailableModelsForProfile(
    profileId: string,
    resourceUri?: vscode.Uri
  ): Promise<string[]> {
    const profile = this.getProviderProfiles().find((item) => item.id === profileId);
    if (!profile) {
      throw new Error(`Provider profile not found: ${profileId}`);
    }

    if (!supportsModelListing(profile)) {
      throw new Error(`Profile "${profile.name}" does not support model listing`);
    }

    const cacheKey = `${AVAILABLE_MODELS_KEY}:${profile.id}`;
    const cachedModels = this.context.globalState.get<string[]>(cacheKey);
    if (cachedModels?.length) {
      return cachedModels;
    }

    await this.updateModelList(profile, resourceUri);
    return this.context.globalState.get<string[]>(cacheKey, []);
  }

  private async updateModelList(
    profile?: ProviderProfile,
    resourceUri?: vscode.Uri
  ): Promise<void> {
    try {
      const activeProfile = profile ?? (await this.getActiveProviderProfile(resourceUri)).profile;

      if (!supportsModelListing(activeProfile)) {
        return;
      }

      const apiKey = activeProfile.auth.scheme === 'none'
        ? undefined
        : await this.getProviderProfileApiKey(activeProfile.id);

      if (activeProfile.auth.scheme !== 'none' && !apiKey) {
        return;
      }

      const client = createClientForModelListing(activeProfile, apiKey);
      const models = await client.models.list();
      const availableModels = models.data.map((model) => model.id);
      const cacheKey = `${AVAILABLE_MODELS_KEY}:${activeProfile.id}`;

      await this.context.globalState.update(cacheKey, availableModels);

      if (!availableModels.includes(activeProfile.model)) {
        const nextProfiles = this.getProviderProfiles().map((item) =>
          item.id === activeProfile.id
            ? {
                ...item,
                model: availableModels[0] ?? item.model
              }
            : item
        );

        await this.saveProviderProfiles(nextProfiles);
      }
    } catch (error) {
      logDebug(
        'Failed to fetch provider models',
        { error: error instanceof Error ? error.message : String(error) },
        resourceUri
      );
    }
  }

  private async warnAboutLegacyProviderProfiles(): Promise<void> {
    if (this.context.globalState.get<boolean>(PROVIDER_SCHEMA_WARNING_KEY)) {
      return;
    }

    const rawProfiles = this.getConfig<unknown[]>(ConfigKeys.PROVIDER_PROFILES, []);
    if (!rawProfiles.length) {
      await this.context.globalState.update(PROVIDER_SCHEMA_WARNING_KEY, true);
      return;
    }

    const invalidProfiles = rawProfiles.filter((item) => !normalizeProviderProfile(item));
    if (invalidProfiles.length) {
      vscode.window.showWarningMessage(
        'CommitFlow provider profiles now use a new schema. Legacy provider entries were ignored and need to be recreated in Manage Provider Profiles.'
      );
    }

    await this.context.globalState.update(PROVIDER_SCHEMA_WARNING_KEY, true);
  }
}
