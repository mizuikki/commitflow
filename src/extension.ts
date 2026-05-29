import * as vscode from 'vscode';
import { CommandManager } from './commands';
import {
  COMMITFLOW_NAMESPACE,
  ConfigKeys,
  ConfigurationManager,
  DEFAULT_PROMPT_PRESET,
  PromptPreset,
  ProviderProfile,
  normalizePromptPreset
} from './config';
import { setLoggerContext } from './logger';
import { getProviderLabel, supportsModelListing } from './provider-registry';
import { isCommitGenerationInProgress } from './runtime-state';

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

function getActiveResourceUri(): vscode.Uri | undefined {
  const activeEditorUri = vscode.window.activeTextEditor?.document.uri;
  if (activeEditorUri) {
    return vscode.workspace.getWorkspaceFolder(activeEditorUri)?.uri ?? activeEditorUri;
  }

  return vscode.workspace.workspaceFolders?.[0]?.uri;
}

function getShortProviderLabel(providerLabel: string): string {
  if (providerLabel.length <= 18) {
    return providerLabel;
  }

  const parts = providerLabel.split(/[-_\s]+/).filter(Boolean);
  const tail = parts.length > 0 ? parts[parts.length - 1] : providerLabel;

  if (tail.length > 3 && tail.length <= 18) {
    return tail;
  }

  return `${providerLabel.slice(0, 15)}...`;
}

type StatusBarState = {
  resourceUri?: vscode.Uri;
  profiles: ProviderProfile[];
  activeProfile?: ProviderProfile;
  activeProfileId?: string;
  hasApiKey: boolean;
  language: string;
  promptPreset: PromptPreset;
  workspaceOverrideActive: boolean;
};

type StatusBarActionItem = vscode.QuickPickItem & {
  command?: string;
  disabled?: boolean;
};

async function getStatusBarState(configManager: ConfigurationManager): Promise<StatusBarState> {
  const resourceUri = getActiveResourceUri();
  const profiles = configManager.getProviderProfiles();
  const activeProfileId = configManager.getActiveProviderProfileId(resourceUri);
  const fallbackProfile = profiles[0];
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) ?? fallbackProfile;
  const hasApiKey = activeProfile
    ? activeProfile.auth.scheme === 'none' ||
      Boolean(await configManager.getProviderProfileApiKey(activeProfile.id))
    : false;
  const promptPreset = normalizePromptPreset(
    configManager.getConfig<string>(ConfigKeys.PROMPT_PRESET, DEFAULT_PROMPT_PRESET, resourceUri),
    DEFAULT_PROMPT_PRESET
  );
  const language = configManager.getConfig<string>(
    ConfigKeys.COMMIT_LANGUAGE,
    'English',
    resourceUri
  );
  const globalActiveProfileId = configManager.getActiveProviderProfileId();

  return {
    resourceUri,
    profiles,
    activeProfile,
    activeProfileId,
    hasApiKey,
    language,
    promptPreset,
    workspaceOverrideActive: Boolean(
      resourceUri &&
        activeProfileId &&
        activeProfileId !== globalActiveProfileId
    )
  };
}

function getProviderStatusLabel(state: StatusBarState): string {
  if (!state.profiles.length) {
    return 'CommitFlow: Setup';
  }

  if (!state.activeProfile) {
    return 'CommitFlow: No Provider';
  }

  return getShortProviderLabel(state.activeProfile.name);
}

function getProviderStatusDetail(state: StatusBarState): string {
  if (!state.activeProfile) {
    return 'No provider profile configured';
  }

  const providerLabel = getProviderLabel(state.activeProfile.providerId);
  return `${providerLabel} / ${state.activeProfile.model}`;
}

function getStatusBarIconName(state: StatusBarState): string {
  if (isCommitGenerationInProgress()) {
    return 'sync~spin';
  }

  if (!state.profiles.length || !state.activeProfile || !state.hasApiKey) {
    return 'warning';
  }

  return 'git-commit';
}

function buildStatusBarTooltip(state: StatusBarState): string {
  return [
    `Provider: ${state.activeProfile?.name ?? 'No profile'}`,
    state.activeProfile ? `Provider Type: ${getProviderLabel(state.activeProfile.providerId)}` : undefined,
    state.activeProfile ? `Model: ${state.activeProfile.model}` : undefined,
    `Language: ${state.language}`,
    `Prompt: ${getPromptPresetLabel(state.promptPreset)}`,
    state.workspaceOverrideActive ? 'Scope: Workspace override active' : 'Scope: Global active profile',
    isCommitGenerationInProgress() ? 'Status: Generating commit message...' : undefined,
    state.hasApiKey ? undefined : 'Status: API key missing'
  ].filter(Boolean).join('\n');
}

function createStatusInfoItem(state: StatusBarState): StatusBarActionItem {
  return {
    label: state.activeProfile
      ? `Active: ${state.activeProfile.name}`
      : 'Active: No provider configured',
    description: state.activeProfile
      ? getProviderLabel(state.activeProfile.providerId)
      : 'Setup required',
    detail: state.activeProfile
      ? `${state.activeProfile.model} · ${state.language} · ${getPromptPresetLabel(state.promptPreset)}`
      : 'Create a provider profile before generating commit messages.',
    disabled: true
  };
}

function buildControlCenterItems(state: StatusBarState): StatusBarActionItem[] {
  const items: StatusBarActionItem[] = [createStatusInfoItem(state)];

  if (!state.profiles.length) {
    items.push({
      label: 'Complete Provider Setup',
      description: 'Create your first provider profile',
      detail: 'Open the Provider Profiles panel.',
      command: 'commitflow.manageProviderProfiles'
    });
  } else if (!state.hasApiKey) {
    items.push({
      label: 'Fix Active Provider',
      description: 'API key is missing',
      detail: 'Open Provider Profiles and add the missing credential.',
      command: 'commitflow.manageProviderProfiles'
    });
  }

  items.push(
    {
      label: 'Manage Provider Profiles',
      description: 'Create, edit, test, delete, or activate profiles',
      detail: state.activeProfile ? getProviderStatusDetail(state) : 'Open the provider control panel.',
      command: 'commitflow.manageProviderProfiles'
    },
    {
      label: 'Switch Provider Profile',
      description: 'Change the active provider',
      detail: state.activeProfile
        ? `Current: ${state.activeProfile.name}`
        : 'No active provider profile.',
      command: 'commitflow.switchProviderProfile'
    }
  );

  if (state.activeProfile && supportsModelListing(state.activeProfile)) {
    items.push({
      label: 'Load Models for Active Profile',
      description: 'Fetch selectable models',
      detail: `Active: ${state.activeProfile.name}`,
      command: 'commitflow.showAvailableModels'
    });
  } else {
    items.push({
      label: 'Load Models for Active Profile',
      description: 'Not supported',
      detail: state.activeProfile
        ? `${getProviderLabel(state.activeProfile.providerId)} does not support model listing.`
        : 'Create or activate a provider profile first.',
      disabled: true
    });
  }

  items.push(
    {
      label: 'Set Commit Language',
      description: state.language,
      detail: 'Change the commit message language for the active repository.',
      command: 'commitflow.setCommitLanguageForCurrentRepository'
    },
    {
      label: 'Set Prompt Preset',
      description: getPromptPresetLabel(state.promptPreset),
      detail: 'Switch Gitmoji Prefix, Gitmoji Suffix, Without Gitmoji, or Custom.',
      command: 'commitflow.setPromptPresetForCurrentRepository'
    },
    {
      label: 'Open CommitFlow Settings',
      description: 'Advanced settings',
      detail: 'Open VS Code settings filtered to CommitFlow.',
      command: 'commitflow.openSettings'
    },
    {
      label: 'Generate Commit Message',
      description: 'Run CommitFlow',
      detail: 'Generate a Conventional Commit message from staged changes.',
      command: 'commitflow.generateCommitMessage'
    }
  );

  return items;
}

function createCombinedStatusBarItem(
  context: vscode.ExtensionContext,
  configManager: ConfigurationManager
): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 80);

  const refresh = async () => {
    const state = await getStatusBarState(configManager);
    item.text = `$(${getStatusBarIconName(state)}) ${getProviderStatusLabel(state)}`;
    item.tooltip = buildStatusBarTooltip(state);
    item.command = 'commitflow.openStatusBarMenu';
    item.show();
  };

  const openMenu = async () => {
    const state = await getStatusBarState(configManager);
    const actions = await vscode.window.showQuickPick(
      buildControlCenterItems(state),
      {
        placeHolder: 'CommitFlow Control Center'
      }
    );

    if (!actions || actions.disabled || !actions.command) {
      return;
    }

    await vscode.commands.executeCommand(actions.command);
  };

  void refresh();

  context.subscriptions.push(
    vscode.commands.registerCommand('commitflow.refreshStatusBar', refresh),
    vscode.commands.registerCommand('commitflow.openStatusBarMenu', openMenu),
    vscode.window.onDidChangeActiveTextEditor(() => {
      void refresh();
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void refresh();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration(`${COMMITFLOW_NAMESPACE}.${ConfigKeys.COMMIT_LANGUAGE}`) ||
        event.affectsConfiguration(`${COMMITFLOW_NAMESPACE}.${ConfigKeys.PROMPT_PRESET}`) ||
        event.affectsConfiguration(`${COMMITFLOW_NAMESPACE}.${ConfigKeys.ACTIVE_PROVIDER_PROFILE_ID}`) ||
        event.affectsConfiguration(`${COMMITFLOW_NAMESPACE}.${ConfigKeys.PROVIDER_PROFILES}`)
      ) {
        void refresh();
      }
    })
  );

  return item;
}

/**
 * Activates the extension and registers commands.
 *
 * @param {vscode.ExtensionContext} context - The context for the extension.
 */
export async function activate(context: vscode.ExtensionContext) {
  try {
    setLoggerContext(context);
    const configManager = ConfigurationManager.getInstance(context);
    await configManager.initialize();

    const commandManager = new CommandManager(context);
    commandManager.registerCommands();
    const statusBarItem = createCombinedStatusBarItem(context, configManager);

    context.subscriptions.push({
      dispose: () => {
        configManager.dispose();
        commandManager.dispose();
      }
    });
    context.subscriptions.push(statusBarItem);

    const activeProfile = configManager.getProviderProfiles()[0];
    if (!activeProfile) {
      const result = await vscode.window.showWarningMessage(
        'No provider profile is configured. Would you like to create one now?',
        'Yes',
        'No'
      );

      if (result === 'Yes') {
        await vscode.commands.executeCommand('commitflow.manageProviderProfiles');
      }
      return;
    }

    const activeProfileId = configManager.getActiveProviderProfileId();
    const activeApiKey = activeProfileId
      ? await configManager.getProviderProfileApiKey(activeProfileId)
      : undefined;

    if (!activeApiKey) {
      const result = await vscode.window.showWarningMessage(
        'The active provider profile is missing an API key. Would you like to configure it now?',
        'Yes',
        'No'
      );

      if (result === 'Yes') {
        await vscode.commands.executeCommand('commitflow.manageProviderProfiles');
      }
    }
  } catch (error) {
    console.error('Failed to activate extension:', error);
    throw error;
  }
}

/**
 * Deactivates the extension.
 * This function is called when the extension is deactivated.
 */
export function deactivate() {}
