import * as fs from 'fs-extra';
import * as vscode from 'vscode';
import {
  COMMITFLOW_NAMESPACE,
  ConfigKeys,
  ConfigurationManager,
  DEFAULT_PROMPT_PRESET,
  PromptPreset,
  normalizePromptPreset
} from './config';
import {
  buildCommitTypeReferenceTable,
  buildGitmojiReferenceTable,
  getGitmojiEmojiByCode
} from './gitmoji';

const COMMIT_PROMPT_TEMPLATE_PATH = 'prompt/commit.md';
type GitmojiPlacement = 'none' | 'prefix' | 'suffix';

let commitPromptTemplateCache: string | undefined;

async function getCommitPromptTemplate(): Promise<string> {
  if (!commitPromptTemplateCache) {
    const configManager = ConfigurationManager.getInstance();
    const templatePath = configManager.asAbsolutePath(COMMIT_PROMPT_TEMPLATE_PATH);
    commitPromptTemplateCache = await fs.readFile(templatePath, 'utf8');
  }

  return commitPromptTemplateCache;
}

function getGitmojiPlacement(promptPreset: PromptPreset): GitmojiPlacement {
  switch (promptPreset) {
    case 'gitmoji-prefix':
      return 'prefix';
    case 'gitmoji-suffix':
      return 'suffix';
    default:
      return 'none';
  }
}

export function buildOutputFormat(gitmojiPlacement: GitmojiPlacement): string {
  if (gitmojiPlacement === 'prefix') {
    return `\`\`\`
<emoji> <type>(<scope>): <subject>

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

  if (gitmojiPlacement === 'suffix') {
    return `\`\`\`
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

  return `\`\`\`
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

export function buildGitmojiRules(gitmojiPlacement: GitmojiPlacement): string {
  if (gitmojiPlacement === 'prefix') {
    const gitmojiReference = `### Gitmoji Reference

${buildGitmojiReferenceTable()}`;

    return `### Gitmoji

- Use exactly one emoji from the Gitmoji Reference table
- Prefix the emoji before the commit type
- Example: ✨ feat(auth): add oauth2 login
- Choose the emoji independently from the Conventional Commit type
- Choose the emoji by matching the staged diff intent to the Gitmoji Reference
- Do not use fixed mappings such as feat always using ✨ or fix always using 🐛
- Do not output Gitmoji shortcodes such as ":bug:"

${gitmojiReference}`;
  }

  if (gitmojiPlacement === 'suffix') {
    const gitmojiReference = `### Gitmoji Reference

${buildGitmojiReferenceTable()}`;

    return `### Gitmoji

- Use exactly one emoji from the Gitmoji Reference table
- Place the emoji inside the subject (after ":") instead of prefixing the type
- Example: feat(auth): ✨ add oauth2 login
- Choose the emoji independently from the Conventional Commit type
- Choose the emoji by matching the staged diff intent to the Gitmoji Reference
- Do not use fixed mappings such as feat always using ✨ or fix always using 🐛
- Do not output Gitmoji shortcodes such as ":bug:"

${gitmojiReference}`;
  }

  return '';
}

export function buildSettingsActionExamples(gitmojiPlacement: GitmojiPlacement): string {
  switch (gitmojiPlacement) {
    case 'prefix':
      return [
        `- Good: ${getGitmojiEmojiByCode(':wrench:')} chore(settings): set gitmoji prompt preset`,
        `- Bad: ${getGitmojiEmojiByCode(':wrench:')} chore(settings): add gitmoji prompt preset setting`
      ].join('\n');
    case 'suffix':
      return [
        `- Good: chore(settings): ${getGitmojiEmojiByCode(':wrench:')} set gitmoji prompt preset`,
        `- Bad: chore(settings): ${getGitmojiEmojiByCode(':wrench:')} add gitmoji prompt preset setting`
      ].join('\n');
    default:
      return [
        '- Good: chore(settings): set gitmoji prompt preset',
        '- Bad: chore(settings): add gitmoji prompt preset setting'
      ].join('\n');
  }
}

export function buildExample(language: string, gitmojiPlacement: GitmojiPlacement): string {
  const exampleHeader =
    gitmojiPlacement === 'prefix'
      ? `${getGitmojiEmojiByCode(':recycle:')} refactor(server): <subject in ${language}>`
      : gitmojiPlacement === 'suffix'
        ? `refactor(server): ${getGitmojiEmojiByCode(':recycle:')} <subject in ${language}>`
        : `refactor(server): <subject in ${language}>`;
  const settingsExampleHeader =
    gitmojiPlacement === 'prefix'
      ? `${getGitmojiEmojiByCode(':wrench:')} chore(settings): set setting value`
      : gitmojiPlacement === 'suffix'
        ? `chore(settings): ${getGitmojiEmojiByCode(':wrench:')} set setting value`
        : 'chore(settings): set setting value';

  return `\`\`\`
${exampleHeader}

- <body bullet in ${language}>
- <body bullet in ${language}>

${settingsExampleHeader}

- Set \`tool.option\` to \`enabled\`
\`\`\``;
}

export async function buildCommitPrompt(
  language: string,
  gitmojiPlacement: GitmojiPlacement
): Promise<string> {
  const template = await getCommitPromptTemplate();
  const replacements: Record<string, string> = {
    LANGUAGE: language,
    OUTPUT_FORMAT: buildOutputFormat(gitmojiPlacement),
    TYPE_REFERENCE: buildCommitTypeReferenceTable(),
    GITMOJI_RULES: buildGitmojiRules(gitmojiPlacement),
    SETTINGS_ACTION_EXAMPLES: buildSettingsActionExamples(gitmojiPlacement),
    EXAMPLE: buildExample(language, gitmojiPlacement)
  };

  return template.replace(/\{\{([A-Z_]+)\}\}/g, (match, key: string) => {
    return replacements[key] ?? match;
  });
}

function getConfiguredPromptPreset(resourceUri?: vscode.Uri): PromptPreset {
  return normalizePromptPreset(
    ConfigurationManager.getInstance().getConfig<string>(
      ConfigKeys.PROMPT_PRESET,
      DEFAULT_PROMPT_PRESET,
      resourceUri
    ),
    DEFAULT_PROMPT_PRESET
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

  return buildCommitPrompt(language, getGitmojiPlacement(promptPreset));
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
