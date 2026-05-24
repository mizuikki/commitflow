import * as fs from 'fs-extra';
import * as vscode from 'vscode';
import { ConfigKeys, ConfigurationManager, PromptPreset } from './config';
import { buildCommitTypeReferenceTable, getGitmojiForCommitType } from './gitmoji';

const AI_COMMIT_NAMESPACE = 'ai-commit-plus';
const DEFAULT_PROMPT_PRESET: PromptPreset = 'without-gitmoji';
const COMMIT_PROMPT_TEMPLATE_PATH = 'prompt/commit.md';

let commitPromptTemplateCache: string | undefined;

async function getCommitPromptTemplate(): Promise<string> {
  if (!commitPromptTemplateCache) {
    const configManager = ConfigurationManager.getInstance();
    const templatePath = configManager.asAbsolutePath(COMMIT_PROMPT_TEMPLATE_PATH);
    commitPromptTemplateCache = await fs.readFile(templatePath, 'utf8');
  }

  return commitPromptTemplateCache;
}

export function buildOutputFormat(includeGitmoji: boolean): string {
  if (includeGitmoji) {
    return `### Single Type Changes

\`\`\`
<emoji> <type>(<scope>): <subject>
  <body>
\`\`\`

### Multiple Type Changes

\`\`\`
<emoji> <type>(<scope>): <subject>
  <body of type 1>

<emoji> <type>(<scope>): <subject>
  <body of type 2>
...
\`\`\``;
  }

  return `### Single Type Changes

\`\`\`
<type>(<scope>): <subject>
  <body>
\`\`\`

### Multiple Type Changes

\`\`\`
<type>(<scope>): <subject>
  <body of type 1>

<type>(<scope>): <subject>
  <body of type 2>
...
\`\`\``;
}

export function buildGitmojiRules(includeGitmoji: boolean): string {
  return includeGitmoji
    ? `### Gitmoji

- Prefix every subject line with the emoji that matches the selected type
- Choose emojis only from the Type Reference table
- Do not output Gitmoji shortcodes such as ":bug:"`
    : '';
}

export function buildExample(language: string, includeGitmoji: boolean): string {
  const exampleHeader = includeGitmoji
    ? `${getGitmojiForCommitType('refactor')} refactor(server): <subject in ${language}>`
    : `refactor(server): <subject in ${language}>`;

  return `\`\`\`
${exampleHeader}

- <body bullet in ${language}>
- <body bullet in ${language}>
\`\`\``;
}

export async function buildCommitPrompt(language: string, includeGitmoji: boolean): Promise<string> {
  const template = await getCommitPromptTemplate();
  const replacements: Record<string, string> = {
    LANGUAGE: language,
    OUTPUT_FORMAT: buildOutputFormat(includeGitmoji),
    TYPE_REFERENCE: buildCommitTypeReferenceTable(includeGitmoji),
    GITMOJI_RULES: buildGitmojiRules(includeGitmoji),
    EXAMPLE: buildExample(language, includeGitmoji)
  };

  return template.replace(/\{\{([A-Z_]+)\}\}/g, (match, key: string) => {
    return replacements[key] ?? match;
  });
}

function getConfiguredPromptPreset(resourceUri?: vscode.Uri): PromptPreset {
  return ConfigurationManager.getInstance().getConfig<PromptPreset>(
    ConfigKeys.PROMPT_PRESET,
    DEFAULT_PROMPT_PRESET,
    resourceUri
  );
}

function hasExplicitPromptPreset(resourceUri?: vscode.Uri): boolean {
  const config = vscode.workspace.getConfiguration(AI_COMMIT_NAMESPACE, resourceUri);
  const inspectedPreset = config.inspect<PromptPreset>(ConfigKeys.PROMPT_PRESET);

  return (
    inspectedPreset?.globalValue !== undefined ||
    inspectedPreset?.workspaceValue !== undefined ||
    inspectedPreset?.workspaceFolderValue !== undefined
  );
}

function getCustomSystemPrompt(resourceUri?: vscode.Uri): string | undefined {
  const prompt = ConfigurationManager.getInstance().getConfig<string>(
    ConfigKeys.SYSTEM_PROMPT,
    '',
    resourceUri
  );
  const trimmedPrompt = prompt?.trim();
  return trimmedPrompt ? trimmedPrompt : undefined;
}

async function resolvePromptContent(language: string, resourceUri?: vscode.Uri): Promise<string> {
  const customPrompt = getCustomSystemPrompt(resourceUri);
  const promptPreset = getConfiguredPromptPreset(resourceUri);

  if (promptPreset === 'custom') {
    if (!customPrompt) {
      throw new Error(
        'Prompt preset is set to custom, but AI_COMMIT_SYSTEM_PROMPT is empty.'
      );
    }
    return customPrompt;
  }

  // Preserve existing behavior for users who already set a custom prompt before presets existed.
  if (customPrompt && !hasExplicitPromptPreset(resourceUri)) {
    return customPrompt;
  }

  return buildCommitPrompt(language, promptPreset === 'with-gitmoji');
}

/**
 * Retrieves the main commit prompt.
 *
 * @param {vscode.Uri} resourceUri - The optional repository URI used to resolve resource-scoped settings.
 * @returns {Promise<Array<Object>>} - A promise that resolves to an array of prompts.
 */
export const getMainCommitPrompt = async (resourceUri?: vscode.Uri) => {
  const language = ConfigurationManager.getInstance().getConfig<string>(
    ConfigKeys.AI_COMMIT_LANGUAGE,
    'English',
    resourceUri
  );

  return [
    {
      role: 'system',
      content: await resolvePromptContent(language, resourceUri)
    }
  ];
};
