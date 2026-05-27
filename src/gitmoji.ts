import { gitmojis } from 'gitmojis';

export type ConventionalCommitType =
  | 'feat'
  | 'fix'
  | 'docs'
  | 'style'
  | 'refactor'
  | 'perf'
  | 'test'
  | 'build'
  | 'ci'
  | 'chore'
  | 'i18n';

interface CommitTypeReference {
  type: ConventionalCommitType;
  gitmojiCode: string;
  description: string;
  exampleScopes: string;
}

export const COMMIT_TYPE_REFERENCES: readonly CommitTypeReference[] = [
  {
    type: 'feat',
    gitmojiCode: ':sparkles:',
    description: 'New feature',
    exampleScopes: 'user, payment'
  },
  {
    type: 'fix',
    gitmojiCode: ':bug:',
    description: 'Bug fix',
    exampleScopes: 'auth, data'
  },
  {
    type: 'docs',
    gitmojiCode: ':memo:',
    description: 'Documentation',
    exampleScopes: 'README, API'
  },
  {
    type: 'style',
    gitmojiCode: ':art:',
    description: 'Code structure or formatting',
    exampleScopes: 'formatting'
  },
  {
    type: 'refactor',
    gitmojiCode: ':recycle:',
    description: 'Code refactoring',
    exampleScopes: 'utils, helpers'
  },
  {
    type: 'perf',
    gitmojiCode: ':zap:',
    description: 'Performance',
    exampleScopes: 'query, cache'
  },
  {
    type: 'test',
    gitmojiCode: ':white_check_mark:',
    description: 'Testing',
    exampleScopes: 'unit, e2e'
  },
  {
    type: 'build',
    gitmojiCode: ':package:',
    description: 'Build system or packages',
    exampleScopes: 'webpack, npm'
  },
  {
    type: 'ci',
    gitmojiCode: ':construction_worker:',
    description: 'CI config',
    exampleScopes: 'GitHub Actions, Jenkins'
  },
  {
    type: 'chore',
    gitmojiCode: ':wrench:',
    description: 'Other maintenance changes',
    exampleScopes: 'scripts, config'
  },
  {
    type: 'i18n',
    gitmojiCode: ':globe_with_meridians:',
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

export function buildCommitTypeReferenceTable(includeGitmoji: boolean): string {
  if (!includeGitmoji) {
    return [
      '| Type | Description | Example Scopes |',
      '| ---- | ----------- | -------------- |',
      ...COMMIT_TYPE_REFERENCES.map(
        ({ type, description, exampleScopes }) =>
          `| ${type} | ${description} | ${exampleScopes} |`
      )
    ].join('\n');
  }

  return [
    '| Type | Emoji | Gitmoji Code | Description | Official Gitmoji Purpose | Example Scopes |',
    '| ---- | ----- | ------------ | ----------- | ------------------------ | -------------- |',
	    ...COMMIT_TYPE_REFERENCES.map(
	      ({ type, gitmojiCode, description, exampleScopes }) => {
	        const gitmoji = getGitmojiByCode(gitmojiCode);
	        const gitmojiPurpose =
	          type === 'chore' ? 'Maintain configuration or project metadata.' : gitmoji.description;
	        return `| ${type} | ${gitmoji.emoji} | ${gitmoji.code} | ${description} | ${gitmojiPurpose} | ${exampleScopes} |`;
	      }
	    )
  ].join('\n');
}

export function getGitmojiForCommitType(type: ConventionalCommitType): string {
  const reference = COMMIT_TYPE_REFERENCES.find((item) => item.type === type);

  if (!reference) {
    throw new Error(`Unsupported commit type: ${type}`);
  }

  return getGitmojiByCode(reference.gitmojiCode).emoji;
}
