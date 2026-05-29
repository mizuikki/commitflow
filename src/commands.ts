import * as vscode from 'vscode';
import { generateCommitMsg, getRepo } from './generate-commit-msg';
import {
  ConfigKeys,
  COMMITFLOW_NAMESPACE,
  ConfigurationManager,
  DEFAULT_PROMPT_PRESET,
  PromptPreset,
  ProviderProfile,
  getConfigurationTargetForResource,
  normalizePromptPreset,
  parsePromptPreset
} from './config';
import { getProviderLabel } from './provider-registry';
import { ProviderManagementPanel } from './provider-panel';

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
    label: 'Without Gitmoji',
    description: 'Use Conventional Commit messages without emojis',
    promptPreset: 'without-gitmoji' as const
  },
  {
    label: 'Gitmoji Prefix',
    description: 'Prefix the header with a Gitmoji emoji',
    promptPreset: 'gitmoji-prefix' as const
  },
  {
    label: 'Gitmoji Suffix',
    description: 'Place a Gitmoji emoji after the colon',
    promptPreset: 'gitmoji-suffix' as const
  },
  {
    label: 'Custom',
    description: 'Use commitflow.systemPrompt',
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

function getCurrentResourceUri(): vscode.Uri | undefined {
  const activeEditorUri = vscode.window.activeTextEditor?.document.uri;
  if (activeEditorUri) {
    return vscode.workspace.getWorkspaceFolder(activeEditorUri)?.uri ?? activeEditorUri;
  }

  return vscode.workspace.workspaceFolders?.[0]?.uri;
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
  const config = vscode.workspace.getConfiguration(COMMITFLOW_NAMESPACE, resourceUri);
  const inspectedLanguage = config.inspect<string>(ConfigKeys.COMMIT_LANGUAGE);
  const effectiveLanguage = config.get<string>(ConfigKeys.COMMIT_LANGUAGE, 'English');

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
  const config = vscode.workspace.getConfiguration(COMMITFLOW_NAMESPACE, resourceUri);
  const inspectedPromptPreset = config.inspect<string>(ConfigKeys.PROMPT_PRESET);
  const effectivePromptPreset = normalizePromptPreset(
    config.get<string>(ConfigKeys.PROMPT_PRESET, DEFAULT_PROMPT_PRESET),
    DEFAULT_PROMPT_PRESET
  );

  let inheritedPromptPreset = normalizePromptPreset(
    inspectedPromptPreset?.defaultValue,
    DEFAULT_PROMPT_PRESET
  );
  let overridePromptPreset: PromptPreset | undefined;
  if (target === vscode.ConfigurationTarget.WorkspaceFolder) {
    overridePromptPreset = parsePromptPreset(inspectedPromptPreset?.workspaceFolderValue);
    inheritedPromptPreset = normalizePromptPreset(
      inspectedPromptPreset?.workspaceValue ??
        inspectedPromptPreset?.globalValue ??
        inspectedPromptPreset?.defaultValue,
      DEFAULT_PROMPT_PRESET
    );
  } else if (target === vscode.ConfigurationTarget.Workspace) {
    overridePromptPreset = parsePromptPreset(inspectedPromptPreset?.workspaceValue);
    inheritedPromptPreset = normalizePromptPreset(
      inspectedPromptPreset?.globalValue ?? inspectedPromptPreset?.defaultValue,
      DEFAULT_PROMPT_PRESET
    );
  } else {
    overridePromptPreset = parsePromptPreset(inspectedPromptPreset?.globalValue);
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
    case 'gitmoji-prefix':
      return 'Gitmoji Prefix';
    case 'gitmoji-suffix':
      return 'Gitmoji Suffix';
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
      ConfigKeys.COMMIT_LANGUAGE,
      undefined,
      languageState.target,
      resourceUri
    );
    await vscode.commands.executeCommand('commitflow.refreshStatusBar');
    vscode.window.showInformationMessage(
      `CommitFlow language for this repository now follows the inherited setting: ${languageState.inheritedLanguage}.`
    );
    return;
  }

  if (!selection.language) {
    return;
  }

  await configManager.updateConfig(
    ConfigKeys.COMMIT_LANGUAGE,
    selection.language,
    languageState.target,
    resourceUri
  );
  await vscode.commands.executeCommand('commitflow.refreshStatusBar');
  vscode.window.showInformationMessage(
    `CommitFlow language for this repository set to ${selection.language}.`
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
    await vscode.commands.executeCommand('commitflow.refreshStatusBar');
    vscode.window.showInformationMessage(
      `CommitFlow prompt preset for this repository now follows the inherited setting: ${getPromptPresetLabel(
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
  await vscode.commands.executeCommand('commitflow.refreshStatusBar');
  vscode.window.showInformationMessage(
    `CommitFlow prompt preset for this repository set to ${selection.label}.`
  );
}

async function manageProviderProfiles(
  context: vscode.ExtensionContext,
  options: { selectedProfileId?: string; preloadModelsForProfileId?: string } = {}
): Promise<void> {
  ProviderManagementPanel.createOrShow(context, {
    resourceUri: getCurrentResourceUri(),
    selectedProfileId: options.selectedProfileId,
    preloadModelsForProfileId: options.preloadModelsForProfileId
  });
}

async function switchProviderProfile(): Promise<void> {
  const configManager = ConfigurationManager.getInstance();
  const resourceUri = getCurrentResourceUri();
  const profiles = configManager.getProviderProfiles();
  const activeProfileId = configManager.getActiveProviderProfileId(resourceUri);

  if (!profiles.length) {
    throw new Error('No provider profiles are configured.');
  }

  const selection = await vscode.window.showQuickPick(
    profiles.map((profile) => ({
      label: profile.name,
      description:
        profile.id === activeProfileId
          ? `Current active profile • ${getProviderLabel(profile.providerId)}`
          : getProviderLabel(profile.providerId),
      detail: profile.model,
      profile
    })),
    {
      placeHolder: 'Select the active provider profile'
    }
  );

  if (!selection) {
    return;
  }

  const target = resourceUri
    ? getConfigurationTargetForResource(resourceUri)
    : vscode.ConfigurationTarget.Global;
  await configManager.setActiveProviderProfileId(selection.profile.id, target, resourceUri);
  await vscode.commands.executeCommand('commitflow.refreshStatusBar');
  vscode.window.showInformationMessage(
    `Active provider profile set to "${selection.profile.name}".`
  );
}

async function showAvailableModelsForProfile(context: vscode.ExtensionContext): Promise<void> {
  const configManager = ConfigurationManager.getInstance();
  const resourceUri = getCurrentResourceUri();
  const resolved = await configManager.getActiveProviderProfile(resourceUri);

  await manageProviderProfiles(context, {
    selectedProfileId: resolved.profile.id,
    preloadModelsForProfileId: resolved.profile.id
  });
}

export class CommandManager {
  private disposables: vscode.Disposable[] = [];

  constructor(private context: vscode.ExtensionContext) {}

  registerCommands() {
    this.registerCommand('commitflow.generateCommitMessage', generateCommitMsg);
    this.registerCommand(
      'commitflow.setCommitLanguageForCurrentRepository',
      setCommitLanguageForCurrentRepository
    );
    this.registerCommand(
      'commitflow.setPromptPresetForCurrentRepository',
      setPromptPresetForCurrentRepository
    );
    this.registerCommand('commitflow.openSettings', () =>
      vscode.commands.executeCommand('workbench.action.openSettings', COMMITFLOW_NAMESPACE)
    );
    this.registerCommand('commitflow.manageProviderProfiles', () =>
      manageProviderProfiles(this.context)
    );
    this.registerCommand('commitflow.switchProviderProfile', switchProviderProfile);
    this.registerCommand('commitflow.showAvailableModels', () =>
      showAvailableModelsForProfile(this.context)
    );
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
            COMMITFLOW_NAMESPACE
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
