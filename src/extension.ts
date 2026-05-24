import * as vscode from 'vscode';
import { CommandManager } from './commands';
import { ConfigKeys, ConfigurationManager, PromptPreset } from './config';

function getPromptPresetLabel(promptPreset: PromptPreset): string {
  switch (promptPreset) {
    case 'with-gitmoji':
      return 'Gitmoji';
    case 'without-gitmoji':
      return 'No Emoji';
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
    const promptPreset = configManager.getConfig<PromptPreset>(
      ConfigKeys.PROMPT_PRESET,
      'without-gitmoji',
      resourceUri
    );
    const language = configManager.getConfig<string>(
      ConfigKeys.AI_COMMIT_LANGUAGE,
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
    item.command = 'ai-commit-plus.openStatusBarMenu';
    item.show();
  };

  const openMenu = async () => {
    const actions = await vscode.window.showQuickPick(
      [
        {
          label: 'Switch Provider Profile',
          description: 'Change the active AI provider profile',
          command: 'ai-commit-plus.switchProviderProfile'
        },
        {
          label: 'Set Commit Language for Current Repository',
          description: 'Change the commit message language for the active repository',
          command: 'ai-commit-plus.setCommitLanguageForCurrentRepository'
        },
        {
          label: 'Set Prompt Preset for Current Repository',
          description: 'Switch between Gitmoji, No Emoji, or Custom prompt presets',
          command: 'ai-commit-plus.setPromptPresetForCurrentRepository'
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
    vscode.commands.registerCommand('ai-commit-plus.refreshStatusBar', refresh),
    vscode.commands.registerCommand('ai-commit-plus.openStatusBarMenu', openMenu),
    vscode.window.onDidChangeActiveTextEditor(() => {
      void refresh();
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void refresh();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration(`ai-commit-plus.${ConfigKeys.AI_COMMIT_LANGUAGE}`) ||
        event.affectsConfiguration(`ai-commit-plus.${ConfigKeys.PROMPT_PRESET}`) ||
        event.affectsConfiguration(`ai-commit-plus.${ConfigKeys.ACTIVE_PROVIDER_PROFILE_ID}`) ||
        event.affectsConfiguration(`ai-commit-plus.${ConfigKeys.PROVIDER_PROFILES}`)
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
        await vscode.commands.executeCommand('ai-commit-plus.manageProviderProfiles');
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
        await vscode.commands.executeCommand('ai-commit-plus.manageProviderProfiles');
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
