import * as vscode from 'vscode';
import { CommandManager } from './commands';
import {
  COMMITFLOW_NAMESPACE,
  ConfigKeys,
  ConfigurationManager,
  DEFAULT_PROMPT_PRESET,
  PromptPreset,
  normalizePromptPreset
} from './config';
import { setLoggerContext } from './logger';

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

function getLanguageLabel(language: string): string {
  const labels: Record<string, string> = {
    'Simplified Chinese': 'ZH-CN',
    'Traditional Chinese': 'ZH-TW',
    Japanese: 'JA',
    Korean: 'KO',
    Czech: 'CS',
    German: 'DE',
    French: 'FR',
    Italian: 'IT',
    Dutch: 'NL',
    Portuguese: 'PT',
    Vietnamese: 'VI',
    English: 'EN',
    Spanish: 'ES',
    Swedish: 'SV',
    Russian: 'RU',
    Bahasa: 'ID',
    Polish: 'PL',
    Turkish: 'TR',
    Thai: 'TH'
  };

  return labels[language] ?? language;
}

function getShortProviderLabel(providerLabel: string): string {
  if (providerLabel === 'No profile') {
    return providerLabel;
  }

  const parts = providerLabel.split(/[-_\s]+/).filter(Boolean);
  const tail = parts.length > 0 ? parts[parts.length - 1] : providerLabel;

  if (tail.length <= 12) {
    return tail;
  }

  if (providerLabel.length <= 12) {
    return providerLabel;
  }

  return `${providerLabel.slice(0, 9)}...`;
}

function createCombinedStatusBarItem(
  context: vscode.ExtensionContext,
  configManager: ConfigurationManager
): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 80);

  const refresh = async () => {
    const resourceUri = getActiveResourceUri();
    const profile = await configManager.getActiveProviderProfile(resourceUri).catch(() => undefined);
    const promptPreset = normalizePromptPreset(
      configManager.getConfig<string>(ConfigKeys.PROMPT_PRESET, DEFAULT_PROMPT_PRESET, resourceUri),
      DEFAULT_PROMPT_PRESET
    );
    const language = configManager.getConfig<string>(
      ConfigKeys.COMMIT_LANGUAGE,
      'English',
      resourceUri
    );

    const providerLabel = profile?.profile.name ?? 'No profile';
    item.text = `$(hubot) ${getShortProviderLabel(providerLabel)} | ${getLanguageLabel(language)} | ${getPromptPresetLabel(promptPreset)}`;
    item.tooltip = [
      `Provider: ${providerLabel}`,
      `Language: ${language}`,
      `Prompt: ${getPromptPresetLabel(promptPreset)}`
    ].join('\n');
    item.command = 'commitflow.openStatusBarMenu';
    item.show();
  };

  const openMenu = async () => {
    const actions = await vscode.window.showQuickPick(
      [
        {
          label: 'Switch Provider Profile',
          description: 'Change the active AI provider profile',
          command: 'commitflow.switchProviderProfile'
        },
        {
          label: 'Set Commit Language for Current Repository',
          description: 'Change the commit message language for the active repository',
          command: 'commitflow.setCommitLanguageForCurrentRepository'
        },
        {
          label: 'Set Prompt Preset for Current Repository',
          description:
            'Switch between Gitmoji Prefix, Gitmoji Suffix, Without Gitmoji, or Custom presets',
          command: 'commitflow.setPromptPresetForCurrentRepository'
        }
      ],
      {
        placeHolder: 'Select what to configure'
      }
    );

    if (!actions) {
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
