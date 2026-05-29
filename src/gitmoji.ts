import { gitmojis } from 'gitmojis';

interface CommitTypeReference {
  type: string;
  description: string;
  exampleScopes: string;
}

export const CONVENTIONAL_COMMIT_TYPE_REFERENCES: readonly CommitTypeReference[] = [
  {
    type: 'feat',
    description: 'New feature',
    exampleScopes: 'user, payment'
  },
  {
    type: 'fix',
    description: 'Bug fix',
    exampleScopes: 'auth, data'
  },
  {
    type: 'docs',
    description: 'Documentation',
    exampleScopes: 'README, API'
  },
  {
    type: 'style',
    description: 'Code structure or formatting',
    exampleScopes: 'formatting'
  },
  {
    type: 'refactor',
    description: 'Code refactoring',
    exampleScopes: 'utils, helpers'
  },
  {
    type: 'perf',
    description: 'Performance',
    exampleScopes: 'query, cache'
  },
  {
    type: 'test',
    description: 'Testing',
    exampleScopes: 'unit, e2e'
  },
  {
    type: 'build',
    description: 'Build system or packages',
    exampleScopes: 'webpack, npm'
  },
  {
    type: 'ci',
    description: 'CI config',
    exampleScopes: 'GitHub Actions, Jenkins'
  },
  {
    type: 'chore',
    description: 'Other maintenance changes',
    exampleScopes: 'scripts, config'
  },
  {
    type: 'i18n',
    description: 'Internationalization',
    exampleScopes: 'locale, translation'
  }
];

function getGitmojiByCode(code: string) {
  const gitmoji = gitmojis.find((item) => item.code === code);

  if (!gitmoji) {
    throw new Error(`Gitmoji not found for code: ${code}`);
  }

  return gitmoji;
}

export function buildCommitTypeReferenceTable(): string {
  return [
    '| Type | Description | Example Scopes |',
    '| ---- | ----------- | -------------- |',
    ...CONVENTIONAL_COMMIT_TYPE_REFERENCES.map(
      ({ type, description, exampleScopes }) =>
        `| ${type} | ${description} | ${exampleScopes} |`
    )
  ].join('\n');
}

export function buildGitmojiReferenceTable(): string {
  return [
    '| Emoji | Gitmoji Code | Description | Semver |',
    '| ----- | ------------ | ----------- | ------ |',
    ...gitmojis.map(
      ({ emoji, code, description, semver }) =>
        `| ${emoji} | ${code} | ${description} | ${semver ?? ''} |`
    )
  ].join('\n');
}

export function getGitmojiEmojiByCode(code: string): string {
  return getGitmojiByCode(code).emoji;
}
