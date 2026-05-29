import * as fs from 'fs-extra';
import * as vscode from 'vscode';
import { COMMITFLOW_NAMESPACE, ConfigKeys, ConfigurationManager, PromptPreset } from './config';
import { buildCommitTypeReferenceTable, getGitmojiForCommitType } from './gitmoji';

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
    return `### Output Format

\`\`\`
<type>(<scope>): <emoji> <subject>

- <body bullet>
- <body bullet>
\`\`\`

### Rules

- Output exactly ONE header line in Conventional Commits form
- Keep the full header under 72 characters
- Keep the subject under 50 characters
- If changes span multiple categories, pick the most impactful <type> for the header
- Describe all other changes as "-" bullets in the body
- Do NOT add additional "<type>(<scope>): <subject>" lines anywhere in the message`;
  }

  return `### Output Format

\`\`\`
<type>(<scope>): <subject>

- <body bullet>
- <body bullet>
\`\`\`

### Rules

- Output exactly ONE header line in Conventional Commits form
- Keep the full header under 72 characters
- Keep the subject under 50 characters
- If changes span multiple categories, pick the most impactful <type> for the header
- Describe all other changes as "-" bullets in the body
- Do NOT add additional "<type>(<scope>): <subject>" lines anywhere in the message`;
}

export function buildGitmojiRules(includeGitmoji: boolean): string {
  return includeGitmoji
    ? `### Gitmoji

- Use exactly one emoji from the Type Reference table
- Place the emoji inside the subject (after ":") instead of prefixing the type
- Example: feat(auth): ✨ add oauth2 login
- Choose emojis only from the Type Reference table
- Do not output Gitmoji shortcodes such as ":bug:"`
    : '';
}

export function buildExample(language: string, includeGitmoji: boolean): string {
  const exampleHeader = includeGitmoji
    ? `refactor(server): ${getGitmojiForCommitType('refactor')} <subject in ${language}>`
    : `refactor(server): <subject in ${language}>`;
  const settingsExampleHeader = includeGitmoji
    ? `chore(settings): ${getGitmojiForCommitType('chore')} set setting value`
    : 'chore(settings): set setting value';

  return `\`\`\`
${exampleHeader}

- <body bullet in ${language}>
- <body bullet in ${language}>

${settingsExampleHeader}

- Set \`tool.option\` to \`enabled\`
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
  const config = vscode.workspace.getConfiguration(COMMITFLOW_NAMESPACE, resourceUri);
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
        'Prompt preset is set to custom, but commitflow.systemPrompt is empty.'
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
    ConfigKeys.COMMIT_LANGUAGE,
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
