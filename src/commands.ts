import * as vscode from 'vscode';
import { generateCommitMsg, getRepo } from './generate-commit-msg';
import {
  ConfigKeys,
  ConfigurationManager,
  PromptPreset,
  ProviderProfile,
  ProviderProfileType,
  getConfigurationTargetForResource
} from './config';

const COMMIT_LANGUAGE_OPTIONS = [
  { label: 'Simplified Chinese', description: '简体中文' },
  { label: 'Traditional Chinese', description: '繁體中文' },
  { label: 'Japanese', description: 'にほんご' },
  { label: 'Korean', description: '한국어' },
  { label: 'Czech', description: 'česky' },
  { label: 'German', description: 'Deutsch' },
  { label: 'French', description: 'française' },
  { label: 'Italian', description: 'italiano' },
  { label: 'Dutch', description: 'Nederlands' },
  { label: 'Portuguese', description: 'português' },
  { label: 'Vietnamese', description: 'tiếng Việt' },
  { label: 'English', description: 'english' },
  { label: 'Spanish', description: 'español' },
  { label: 'Swedish', description: 'Svenska' },
  { label: 'Russian', description: 'русский' },
  { label: 'Bahasa', description: 'bahasa' },
  { label: 'Polish', description: 'Polski' },
  { label: 'Turkish', description: 'Turkish' },
  { label: 'Thai', description: 'ไทย' }
] as const;

const PROMPT_PRESET_OPTIONS = [
  {
    label: 'With Gitmoji',
    description: 'Use emoji-prefixed commit messages',
    promptPreset: 'with-gitmoji' as const
  },
  {
    label: 'Without Gitmoji',
    description: 'Use Conventional Commit messages without emojis',
    promptPreset: 'without-gitmoji' as const
  },
  {
    label: 'Custom',
    description: 'Use AI_COMMIT_SYSTEM_PROMPT',
    promptPreset: 'custom' as const
  }
] as const;

interface CommitLanguageQuickPickItem extends vscode.QuickPickItem {
  language?: string;
  clearsOverride?: boolean;
}

interface PromptPresetQuickPickItem extends vscode.QuickPickItem {
  promptPreset?: PromptPreset;
  clearsOverride?: boolean;
}

interface ProviderProfileActionQuickPickItem extends vscode.QuickPickItem {
  action: 'activate' | 'edit' | 'copy' | 'delete' | 'set-repo';
}

interface ProviderProfileSelectionQuickPickItem extends vscode.QuickPickItem {
  profile?: ProviderProfile;
  action?: 'add';
}

interface ProviderProfileForm {
  name: string;
  type: ProviderProfileType;
  baseURL?: string;
  model: string;
  temperature?: number;
  azureApiVersion?: string;
  apiKey: string;
}

export function validateTemperatureInput(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'Temperature is required.';
  }

  const temperature = Number(trimmed);
  if (!Number.isFinite(temperature)) {
    return 'Temperature must be a number.';
  }

  if (temperature < 0 || temperature > 2) {
    return 'Temperature must be between 0 and 2.';
  }

  return undefined;
}

function getRepositoryLanguageTarget(resourceUri: vscode.Uri): vscode.ConfigurationTarget {
  return vscode.workspace.getWorkspaceFolder(resourceUri)
    ? vscode.ConfigurationTarget.WorkspaceFolder
    : vscode.workspace.workspaceFile || vscode.workspace.workspaceFolders?.length
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
}

function getRepositoryLanguageState(resourceUri: vscode.Uri) {
  const target = getRepositoryLanguageTarget(resourceUri);
  const config = vscode.workspace.getConfiguration('ai-commit-plus', resourceUri);
  const inspectedLanguage = config.inspect<string>(ConfigKeys.AI_COMMIT_LANGUAGE);
  const effectiveLanguage = config.get<string>(ConfigKeys.AI_COMMIT_LANGUAGE, 'English');

  let inheritedLanguage = inspectedLanguage?.defaultValue ?? 'English';
  let overrideLanguage: string | undefined;
  if (target === vscode.ConfigurationTarget.WorkspaceFolder) {
    overrideLanguage = inspectedLanguage?.workspaceFolderValue;
    inheritedLanguage =
      inspectedLanguage?.workspaceValue ??
      inspectedLanguage?.globalValue ??
      inspectedLanguage?.defaultValue ??
      'English';
  } else if (target === vscode.ConfigurationTarget.Workspace) {
    overrideLanguage = inspectedLanguage?.workspaceValue;
    inheritedLanguage =
      inspectedLanguage?.globalValue ?? inspectedLanguage?.defaultValue ?? 'English';
  } else {
    overrideLanguage = inspectedLanguage?.globalValue;
  }

  return {
    effectiveLanguage,
    inheritedLanguage,
    overrideLanguage,
    target
  };
}

function getRepositoryPromptPresetState(resourceUri: vscode.Uri) {
  const target = getRepositoryLanguageTarget(resourceUri);
  const config = vscode.workspace.getConfiguration('ai-commit-plus', resourceUri);
  const inspectedPromptPreset = config.inspect<PromptPreset>(ConfigKeys.PROMPT_PRESET);
  const effectivePromptPreset = config.get<PromptPreset>(
    ConfigKeys.PROMPT_PRESET,
    'without-gitmoji'
  );

  let inheritedPromptPreset = inspectedPromptPreset?.defaultValue ?? 'without-gitmoji';
  let overridePromptPreset: PromptPreset | undefined;
  if (target === vscode.ConfigurationTarget.WorkspaceFolder) {
    overridePromptPreset = inspectedPromptPreset?.workspaceFolderValue;
    inheritedPromptPreset =
      inspectedPromptPreset?.workspaceValue ??
      inspectedPromptPreset?.globalValue ??
      inspectedPromptPreset?.defaultValue ??
      'without-gitmoji';
  } else if (target === vscode.ConfigurationTarget.Workspace) {
    overridePromptPreset = inspectedPromptPreset?.workspaceValue;
    inheritedPromptPreset =
      inspectedPromptPreset?.globalValue ??
      inspectedPromptPreset?.defaultValue ??
      'without-gitmoji';
  } else {
    overridePromptPreset = inspectedPromptPreset?.globalValue;
  }

  return {
    effectivePromptPreset,
    inheritedPromptPreset,
    overridePromptPreset,
    target
  };
}

function createRepositoryLanguageQuickPickItems(
  effectiveLanguage: string,
  inheritedLanguage: string,
  overrideLanguage?: string
): CommitLanguageQuickPickItem[] {
  const clearOverrideLabel = overrideLanguage
    ? `Clear repository override (${inheritedLanguage})`
    : `Use inherited default (${inheritedLanguage})`;

  const clearOverrideDetail = overrideLanguage
    ? 'Remove the repository-specific language and fall back to the inherited setting.'
    : 'No repository-specific language is stored right now.';

  return [
    {
      label: clearOverrideLabel,
      description: 'Reset',
      detail: clearOverrideDetail,
      clearsOverride: true
    },
    ...COMMIT_LANGUAGE_OPTIONS.map((option) => ({
      label: option.label,
      description: option.description,
      detail:
        option.label === overrideLanguage
          ? 'Current repository override'
          : option.label === effectiveLanguage
            ? 'Current effective language'
            : undefined,
      language: option.label
    }))
  ];
}

function getPromptPresetLabel(promptPreset: PromptPreset): string {
  switch (promptPreset) {
    case 'with-gitmoji':
      return 'With Gitmoji';
    case 'without-gitmoji':
      return 'Without Gitmoji';
    case 'custom':
      return 'Custom';
  }
}

function createRepositoryPromptPresetQuickPickItems(
  effectivePromptPreset: PromptPreset,
  inheritedPromptPreset: PromptPreset,
  overridePromptPreset?: PromptPreset
): PromptPresetQuickPickItem[] {
  const inheritedLabel = getPromptPresetLabel(inheritedPromptPreset);
  const clearOverrideLabel = overridePromptPreset
    ? `Clear repository override (${inheritedLabel})`
    : `Use inherited default (${inheritedLabel})`;

  const clearOverrideDetail = overridePromptPreset
    ? 'Remove the repository-specific prompt preset and fall back to the inherited setting.'
    : 'No repository-specific prompt preset is stored right now.';

  return [
    {
      label: clearOverrideLabel,
      description: 'Reset',
      detail: clearOverrideDetail,
      clearsOverride: true
    },
    ...PROMPT_PRESET_OPTIONS.map((option) => ({
      label: option.label,
      description: option.description,
      detail:
        option.promptPreset === overridePromptPreset
          ? 'Current repository override'
          : option.promptPreset === effectivePromptPreset
            ? 'Current effective preset'
            : undefined,
      promptPreset: option.promptPreset
    }))
  ];
}

function createProviderProfileOverviewItems(
  profiles: ProviderProfile[],
  activeProfileId?: string,
  resourceProfileId?: string
): Array<ProviderProfileSelectionQuickPickItem | ProviderProfileActionQuickPickItem> {
  return [
    {
      label: 'Add profile',
      description: 'Create a new provider profile',
      action: 'add'
    },
    ...profiles.map((profile) => ({
      label: profile.name,
      description: profile.type === 'gemini' ? 'Gemini' : 'OpenAI-compatible',
      detail:
        profile.id === resourceProfileId
          ? 'Current repository profile'
          : profile.id === activeProfileId
            ? 'Current active profile'
            : profile.model,
      profile
    }))
  ];
}

function createProviderProfileActionItems(
  profile: ProviderProfile,
  activeProfileId?: string,
  resourceProfileId?: string
): ProviderProfileActionQuickPickItem[] {
  const items: ProviderProfileActionQuickPickItem[] = [
    {
      label: 'Activate profile',
      description: profile.id === activeProfileId ? 'Current active profile' : 'Switch globally',
      action: 'activate'
    },
    {
      label: 'Edit profile',
      description: 'Update settings',
      action: 'edit'
    },
    {
      label: 'Copy profile',
      description: 'Duplicate as a new profile',
      action: 'copy'
    },
    {
      label: 'Delete profile',
      description: 'Remove from storage',
      action: 'delete'
    }
  ];

  if (resourceProfileId !== profile.id) {
    items.unshift({
      label: 'Set for current workspace',
      description: 'Override active profile in this repository',
      action: 'set-repo'
    });
  }

  return items;
}

async function promptForProviderProfileType(
  initialType?: ProviderProfileType
): Promise<ProviderProfileType | undefined> {
  const selected = await vscode.window.showQuickPick(
    [
      {
        label: 'OpenAI-compatible',
        description: 'OpenAI / Azure OpenAI / DeepSeek / other compatible endpoints',
        type: 'openai-compatible' as const
      },
      {
        label: 'Gemini',
        description: 'Google Gemini models',
        type: 'gemini' as const
      }
    ],
    {
      placeHolder: 'Select a provider type',
      canPickMany: false
    }
  );

  if (!selected) {
    return undefined;
  }

  return selected.type ?? initialType;
}

async function promptForProviderProfileDetails(
  initialProfile?: Partial<ProviderProfile> & { apiKey?: string }
): Promise<ProviderProfileForm | undefined> {
  const type = await promptForProviderProfileType(initialProfile?.type);
  if (!type) {
    return undefined;
  }

  const name = await vscode.window.showInputBox({
    title: 'Provider profile name',
    value: initialProfile?.name ?? '',
    prompt: 'Enter a display name for this provider profile',
    ignoreFocusOut: true
  });
  if (!name) {
    return undefined;
  }

  const model = await vscode.window.showInputBox({
    title: 'Model',
    value: initialProfile?.model ?? '',
    prompt: 'Enter the model name to use',
    ignoreFocusOut: true
  });
  if (!model) {
    return undefined;
  }

  const temperatureInput = await vscode.window.showInputBox({
    title: 'Temperature',
    value: initialProfile?.temperature?.toString() ?? '0.7',
    prompt: 'Enter a value between 0 and 2',
    ignoreFocusOut: true,
    validateInput: validateTemperatureInput
  });
  if (temperatureInput === undefined) {
    return undefined;
  }

  const baseURL =
    type === 'openai-compatible'
      ? await vscode.window.showInputBox({
          title: 'Base URL',
          value: initialProfile?.baseURL ?? '',
          prompt: 'Enter the API base URL, or leave blank for the default endpoint',
          ignoreFocusOut: true
        })
      : undefined;

  if (type === 'openai-compatible' && baseURL === undefined) {
    return undefined;
  }

  const azureApiVersion =
    type === 'openai-compatible'
      ? await vscode.window.showInputBox({
          title: 'Azure API Version',
          value: initialProfile?.azureApiVersion ?? '',
          prompt: 'Enter the Azure API version, or leave blank if not needed',
          ignoreFocusOut: true
        })
      : undefined;

  if (type === 'openai-compatible' && azureApiVersion === undefined) {
    return undefined;
  }

  const apiKey = await vscode.window.showInputBox({
    title: 'API Key',
    value: '',
    prompt: initialProfile?.apiKey
      ? 'Enter a new API key, or leave blank to keep the current one'
      : 'Enter the API key for this provider profile',
    password: true,
    ignoreFocusOut: true
  });

  const resolvedApiKey = apiKey && apiKey.trim().length > 0 ? apiKey : initialProfile?.apiKey ?? '';
  if (!resolvedApiKey) {
    return undefined;
  }

  const temperature = Number(temperatureInput);

  return {
    name,
    type,
    baseURL: baseURL?.trim() || undefined,
    model,
    temperature: Number.isFinite(temperature) ? temperature : undefined,
    azureApiVersion: azureApiVersion?.trim() || undefined,
    apiKey: resolvedApiKey
  };
}

async function setCommitLanguageForCurrentRepository(arg?: any): Promise<void> {
  const repo = await getRepo(arg);
  const resourceUri = repo.rootUri;
  const configManager = ConfigurationManager.getInstance();
  const languageState = getRepositoryLanguageState(resourceUri);
  const selection = await vscode.window.showQuickPick(
    createRepositoryLanguageQuickPickItems(
      languageState.effectiveLanguage,
      languageState.inheritedLanguage,
      languageState.overrideLanguage
    ),
    {
      placeHolder: `Select a commit language for ${repo.rootUri.fsPath}`
    }
  );

  if (!selection) {
    return;
  }

  if (selection.clearsOverride) {
    await configManager.updateConfig<string>(
      ConfigKeys.AI_COMMIT_LANGUAGE,
      undefined,
      languageState.target,
      resourceUri
    );
    await vscode.commands.executeCommand('ai-commit-plus.refreshStatusBar');
    vscode.window.showInformationMessage(
      `AI Commit Plus language for this repository now follows the inherited setting: ${languageState.inheritedLanguage}.`
    );
    return;
  }

  if (!selection.language) {
    return;
  }

  await configManager.updateConfig(
    ConfigKeys.AI_COMMIT_LANGUAGE,
    selection.language,
    languageState.target,
    resourceUri
  );
  await vscode.commands.executeCommand('ai-commit-plus.refreshStatusBar');

  vscode.window.showInformationMessage(
    `AI Commit Plus language for this repository set to ${selection.language}.`
  );
}

async function setPromptPresetForCurrentRepository(arg?: any): Promise<void> {
  const repo = await getRepo(arg);
  const resourceUri = repo.rootUri;
  const configManager = ConfigurationManager.getInstance();
  const promptPresetState = getRepositoryPromptPresetState(resourceUri);
  const selection = await vscode.window.showQuickPick(
    createRepositoryPromptPresetQuickPickItems(
      promptPresetState.effectivePromptPreset,
      promptPresetState.inheritedPromptPreset,
      promptPresetState.overridePromptPreset
    ),
    {
      placeHolder: `Select a prompt preset for ${repo.rootUri.fsPath}`
    }
  );

  if (!selection) {
    return;
  }

  if (selection.clearsOverride) {
    await configManager.updateConfig<PromptPreset>(
      ConfigKeys.PROMPT_PRESET,
      undefined,
      promptPresetState.target,
      resourceUri
    );
    await vscode.commands.executeCommand('ai-commit-plus.refreshStatusBar');
    vscode.window.showInformationMessage(
      `AI Commit Plus prompt preset for this repository now follows the inherited setting: ${getPromptPresetLabel(
        promptPresetState.inheritedPromptPreset
      )}.`
    );
    return;
  }

  if (!selection.promptPreset) {
    return;
  }

  await configManager.updateConfig(
    ConfigKeys.PROMPT_PRESET,
    selection.promptPreset,
    promptPresetState.target,
    resourceUri
  );
  await vscode.commands.executeCommand('ai-commit-plus.refreshStatusBar');

  vscode.window.showInformationMessage(
    `AI Commit Plus prompt preset for this repository set to ${selection.label}.`
  );
}

async function createProviderProfile(): Promise<void> {
  const configManager = ConfigurationManager.getInstance();
  const form = await promptForProviderProfileDetails();
  if (!form) {
    return;
  }

  const profile = await configManager.upsertProviderProfile(
    {
      name: form.name,
      type: form.type,
      baseURL: form.baseURL,
      model: form.model,
      temperature: form.temperature,
      azureApiVersion: form.azureApiVersion
    },
    form.apiKey
  );

  await configManager.setActiveProviderProfileId(profile.id, vscode.ConfigurationTarget.Global);
  await vscode.commands.executeCommand('ai-commit-plus.refreshStatusBar');
  vscode.window.showInformationMessage(`Provider profile "${profile.name}" created.`);
}

async function editProviderProfile(profile: ProviderProfile): Promise<void> {
  const configManager = ConfigurationManager.getInstance();
  const currentApiKey = await configManager.getProviderProfileApiKey(profile.id);
  const form = await promptForProviderProfileDetails({
    ...profile,
    apiKey: currentApiKey
  });

  if (!form) {
    return;
  }

  const updatedProfile = await configManager.upsertProviderProfile(
    {
      id: profile.id,
      name: form.name,
      type: form.type,
      baseURL: form.baseURL,
      model: form.model,
      temperature: form.temperature,
      azureApiVersion: form.azureApiVersion
    },
    form.apiKey,
    profile.id
  );

  vscode.window.showInformationMessage(`Provider profile "${updatedProfile.name}" updated.`);
  await vscode.commands.executeCommand('ai-commit-plus.refreshStatusBar');
}

async function copyProviderProfile(profile: ProviderProfile): Promise<void> {
  const configManager = ConfigurationManager.getInstance();
  const currentApiKey = await configManager.getProviderProfileApiKey(profile.id);
  const form = await promptForProviderProfileDetails({
    ...profile,
    name: `${profile.name} Copy`,
    apiKey: currentApiKey
  });

  if (!form) {
    return;
  }

  const copiedProfile = await configManager.upsertProviderProfile(
    {
      name: form.name,
      type: form.type,
      baseURL: form.baseURL,
      model: form.model,
      temperature: form.temperature,
      azureApiVersion: form.azureApiVersion
    },
    form.apiKey
  );

  await configManager.setActiveProviderProfileId(
    copiedProfile.id,
    vscode.ConfigurationTarget.Global
  );
  await vscode.commands.executeCommand('ai-commit-plus.refreshStatusBar');
  vscode.window.showInformationMessage(`Provider profile "${copiedProfile.name}" copied.`);
}

async function deleteProviderProfile(profile: ProviderProfile): Promise<void> {
  const configManager = ConfigurationManager.getInstance();
  const confirmed = await vscode.window.showWarningMessage(
    `Delete provider profile "${profile.name}"?`,
    { modal: true },
    'Delete',
    'Cancel'
  );

  if (confirmed === 'Delete') {
    await configManager.deleteProviderProfile(profile.id);
    await vscode.commands.executeCommand('ai-commit-plus.refreshStatusBar');
    vscode.window.showInformationMessage(`Provider profile "${profile.name}" deleted.`);
  }
}

async function activateProviderProfile(
  profile: ProviderProfile,
  resourceUri?: vscode.Uri
): Promise<void> {
  const configManager = ConfigurationManager.getInstance();
  const target = resourceUri
    ? getConfigurationTargetForResource(resourceUri)
    : vscode.ConfigurationTarget.Global;

  await configManager.setActiveProviderProfileId(profile.id, target, resourceUri);
  await vscode.commands.executeCommand('ai-commit-plus.refreshStatusBar');
  vscode.window.showInformationMessage(`Active provider profile set to "${profile.name}".`);
}

async function setProviderProfileForCurrentWorkspace(
  profile: ProviderProfile,
  resourceUri?: vscode.Uri
): Promise<void> {
  const configManager = ConfigurationManager.getInstance();
  const targetUri = resourceUri ?? (await getRepo(undefined)).rootUri;
  const target = getConfigurationTargetForResource(targetUri);

  await configManager.setActiveProviderProfileId(profile.id, target, targetUri);
  await vscode.commands.executeCommand('ai-commit-plus.refreshStatusBar');
  vscode.window.showInformationMessage(
    `Repository profile set to "${profile.name}" for ${targetUri.fsPath}.`
  );
}

async function manageProviderProfiles(resourceUri?: vscode.Uri): Promise<void> {
  const configManager = ConfigurationManager.getInstance();
  const profiles = configManager.getProviderProfiles();
  const activeProfileId = configManager.getActiveProviderProfileId(resourceUri);
  const repositoryProfileId = configManager.getConfig<string>(
    ConfigKeys.ACTIVE_PROVIDER_PROFILE_ID,
    undefined,
    resourceUri
  );

  const overview = await vscode.window.showQuickPick(
    createProviderProfileOverviewItems(profiles, activeProfileId, repositoryProfileId),
    {
      placeHolder: profiles.length
        ? 'Select a provider profile to manage'
        : 'No provider profiles yet. Create one to get started.'
    }
  );

  if (!overview) {
    return;
  }

  if ('action' in overview && overview.action === 'add') {
    await createProviderProfile();
    return;
  }

  const selectedProfile = 'profile' in overview ? overview.profile : undefined;
  if (!selectedProfile) {
    return;
  }

  const action = await vscode.window.showQuickPick(
    createProviderProfileActionItems(selectedProfile, activeProfileId, repositoryProfileId),
    {
      placeHolder: `Manage "${selectedProfile.name}"`
    }
  );

  if (!action) {
    return;
  }

  switch (action.action) {
    case 'activate':
      await activateProviderProfile(selectedProfile, resourceUri);
      return;
    case 'edit':
      await editProviderProfile(selectedProfile);
      return;
    case 'copy':
      await copyProviderProfile(selectedProfile);
      return;
    case 'delete':
      await deleteProviderProfile(selectedProfile);
      return;
    case 'set-repo':
      await setProviderProfileForCurrentWorkspace(selectedProfile, resourceUri);
      return;
  }
}

async function showAvailableModelsForProfile(): Promise<void> {
  const configManager = ConfigurationManager.getInstance();
  const activeProfileId = configManager.getActiveProviderProfileId();
  const profiles = configManager
    .getProviderProfiles()
    .filter((profile) => profile.type === 'openai-compatible');

  if (!profiles.length) {
    throw new Error('No OpenAI-compatible provider profiles are configured');
  }

  const selectedProfile = await vscode.window.showQuickPick(
    profiles.map((profile) => ({
      label: profile.name,
      description: profile.id === activeProfileId ? `Current active profile • ${profile.model}` : profile.model,
      detail: profile.baseURL ?? 'Default OpenAI endpoint',
      profile
    })),
    {
      placeHolder: 'Select a provider profile to load models'
    }
  );

  if (!selectedProfile) {
    return;
  }

  const models = await configManager.getAvailableOpenAIModelsForProfile(
    selectedProfile.profile.id
  );
  const selectedModel = await vscode.window.showQuickPick(models, {
    placeHolder: `Select a model for "${selectedProfile.profile.name}"`
  });

  if (!selectedModel) {
    return;
  }

  const updatedProfiles = configManager.getProviderProfiles().map((item) =>
    item.id === selectedProfile.profile.id ? { ...item, model: selectedModel } : item
  );

  await configManager.saveProviderProfiles(updatedProfiles);
  vscode.window.showInformationMessage(
    `Model for "${selectedProfile.profile.name}" set to ${selectedModel}.`
  );
}

export class CommandManager {
  private disposables: vscode.Disposable[] = [];

  constructor(private context: vscode.ExtensionContext) {}

  registerCommands() {
    this.registerCommand('extension.ai-commit-plus', generateCommitMsg);
    this.registerCommand(
      'ai-commit-plus.setCommitLanguageForCurrentRepository',
      setCommitLanguageForCurrentRepository
    );
    this.registerCommand(
      'ai-commit-plus.setPromptPresetForCurrentRepository',
      setPromptPresetForCurrentRepository
    );
    this.registerCommand('extension.configure-ai-commit-plus', () =>
      vscode.commands.executeCommand('workbench.action.openSettings', 'ai-commit-plus')
    );
    this.registerCommand('ai-commit-plus.manageProviderProfiles', manageProviderProfiles);
    this.registerCommand('ai-commit-plus.switchProviderProfile', async () => {
      await manageProviderProfiles();
    });

    this.registerCommand('ai-commit-plus.showAvailableModels', showAvailableModelsForProfile);
  }

  private registerCommand(command: string, handler: (...args: any[]) => any) {
    const disposable = vscode.commands.registerCommand(command, async (...args) => {
      try {
        await handler(...args);
      } catch (error) {
        const result = await vscode.window.showErrorMessage(
          `Failed: ${error instanceof Error ? error.message : String(error)}`,
          'Retry',
          'Configure'
        );

        if (result === 'Retry') {
          await handler(...args);
        } else if (result === 'Configure') {
          await vscode.commands.executeCommand(
            'workbench.action.openSettings',
            'ai-commit-plus'
          );
        }
      }
    });

    this.disposables.push(disposable);
    this.context.subscriptions.push(disposable);
  }

  dispose() {
    this.disposables.forEach((d) => d.dispose());
  }
}
