import * as assert from 'assert';
import * as vscode from 'vscode';

import { ConfigurationManager } from '../../config';

suite('prompts', () => {
  setup(() => {
    ConfigurationManager.getInstance(({
      subscriptions: [],
      secrets: {
        get: async () => undefined,
        store: async () => undefined,
        delete: async () => undefined
      },
      globalState: { get: () => undefined, update: async () => undefined, keys: () => [] },
      workspaceState: { get: () => undefined, update: async () => undefined, keys: () => [] },
      extensionPath: '',
      extensionUri: vscode.Uri.file(process.cwd()),
      environmentVariableCollection: {} as any,
      asAbsolutePath: (relativePath: string) => relativePath,
      storageUri: undefined,
      globalStorageUri: undefined,
      logUri: undefined
    }) as unknown as vscode.ExtensionContext);
  });

  suite('buildCommitTypeReferenceTable', () => {
    test('returns conventional commit types without gitmoji mappings', async () => {
      const { buildCommitTypeReferenceTable } = await import('../../gitmoji');
      const result = buildCommitTypeReferenceTable();

      assert.ok(result.includes('feat'));
      assert.ok(result.includes('chore'));
      assert.ok(!result.includes('✨'));
      assert.ok(!result.includes(':sparkles:'));
      assert.ok(!result.includes('Add or update configuration files.'));
    });
  });

  suite('buildGitmojiReferenceTable', () => {
    test('returns the full official gitmoji reference table', async () => {
      const { buildGitmojiReferenceTable } = await import('../../gitmoji');
      const result = buildGitmojiReferenceTable();

      assert.ok(result.includes('| Emoji | Gitmoji Code | Description | Semver |'));
      assert.ok(result.includes(':sparkles:'));
      assert.ok(result.includes(':bug:'));
      assert.ok(result.includes(':fire:'));
      assert.ok(result.includes('Add or update configuration files.'));
    });
  });

  suite('buildOutputFormat', () => {
    test('returns format with prefix gitmoji when placement is prefix', async () => {
      const { buildOutputFormat } = await import('../../prompts');
      const result = buildOutputFormat('prefix');
      assert.ok(result.includes('<emoji>'));
      assert.ok(result.includes('<emoji> <type>(<scope>): <subject>'));
      assert.ok(!result.includes('### Output Format'));
      assert.ok(result.includes('Keep the full header under 72 characters'));
      assert.ok(!result.includes('Multiple Type Changes'));
    });

    test('returns format with suffix gitmoji when placement is suffix', async () => {
      const { buildOutputFormat } = await import('../../prompts');
      const result = buildOutputFormat('suffix');
      assert.ok(result.includes('<emoji>'));
      assert.ok(result.includes('<type>(<scope>): <emoji> <subject>'));
      assert.ok(result.includes('Keep the full header under 72 characters'));
    });

    test('returns format without emoji when placement is none', async () => {
      const { buildOutputFormat } = await import('../../prompts');
      const result = buildOutputFormat('none');
      assert.ok(!result.includes('<emoji>'));
      assert.ok(result.includes('<type>(<scope>): <subject>'));
      assert.ok(result.includes('Keep the subject under 50 characters'));
      assert.ok(!result.includes('Multiple Type Changes'));
    });
  });

  suite('buildGitmojiRules', () => {
    test('returns prefix guidance when placement is prefix', async () => {
      const { buildGitmojiRules } = await import('../../prompts');
      const result = buildGitmojiRules('prefix');
      assert.ok(result.includes('Prefix the emoji before the commit type'));
      assert.ok(result.includes('✨ feat(auth): add oauth2 login'));
      assert.ok(result.includes('Gitmoji Reference'));
      assert.ok(result.includes(':sparkles:'));
      assert.ok(result.includes('Choose the emoji as a single-label classification task'));
      assert.ok(result.includes('Prefer outcome semantics over keyword matching'));
      assert.ok(result.includes('Gitmoji Decision Table'));
      assert.ok(result.includes('| Broken, incorrect, incompatible, or invalid behavior/output | 🐛 |'));
      assert.ok(result.includes('| New user-facing command, setting, workflow, or API | ✨ |'));
      assert.ok(result.includes('| Dependency add, remove, upgrade, downgrade, or pin | ➕ / ➖ / ⬆️ / ⬇️ / 📌 |'));
      assert.ok(result.includes('| Security or privacy fix | 🔒️ |'));
      assert.ok(result.includes('| Developer experience | 🧑‍💻 |'));
      assert.ok(result.includes('Fix duplicated prompt output heading -> 🐛, not 🎨'));
      assert.ok(result.includes('Improve model-facing prompt rules -> 🐛, not ✨ or 📝'));
      assert.ok(result.includes('Change config to fix broken behavior -> 🐛, not 🔧'));
    });

    test('returns suffix guidance when placement is suffix', async () => {
      const { buildGitmojiRules } = await import('../../prompts');
      const result = buildGitmojiRules('suffix');
      assert.ok(result.includes('Place the emoji inside the subject (after ":")'));
      assert.ok(result.includes('feat(auth): ✨ add oauth2 login'));
      assert.ok(result.includes('Gitmoji Reference'));
      assert.ok(result.includes(':bug:'));
      assert.ok(result.includes('Do not use fixed mappings such as feat always using ✨'));
      assert.ok(result.includes('Add an inspection/debugging command -> 🧐'));
      assert.ok(result.includes('| CI configuration | 👷 |'));
      assert.ok(result.includes('| Broken CI fix | 💚 |'));
      assert.ok(result.includes('| Types | 🏷️ |'));
      assert.ok(result.includes('| Move or rename | 🚚 |'));
      assert.ok(result.includes('| User experience or usability | 🚸 |'));
      assert.ok(result.includes('Upgrade a dependency -> ⬆️, not 📦️'));
      assert.ok(result.includes('Type-only changes -> 🏷️; refactor-only changes -> ♻️'));
    });

    test('returns no gitmoji reference when placement is none', async () => {
      const { buildGitmojiRules } = await import('../../prompts');
      const result = buildGitmojiRules('none');

      assert.strictEqual(result, '');
    });
  });

  suite('getMainCommitPrompt', () => {
    test('returns array with system role message', async () => {
      const { getMainCommitPrompt } = await import('../../prompts');
      const result = await getMainCommitPrompt();
      assert.ok(Array.isArray(result));
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].role, 'system');
      assert.ok(typeof result[0].content === 'string');
      assert.ok(result[0].content.length > 0);
    });

    test('includes settings action verb guidance', async () => {
      const { getMainCommitPrompt } = await import('../../prompts');
      const result = await getMainCommitPrompt();
      const content = String(result[0].content);
      assert.ok(!content.includes('## Output Format\n\n### Output Format'));
      assert.ok(
        content.includes(
          'Changes to generated output, formatting, validation, prompts, or templates are behavior changes; use fix when they correct invalid, misleading, or incompatible output'
        )
      );
      assert.ok(
        content.includes(
          'Prompt, template, validation, and generated-output instruction changes are not documentation changes unless the diff only updates user-facing docs such as README or API docs'
        )
      );
      assert.ok(
        content.includes(
          'Prompt and template rule changes that improve model instruction quality, selection behavior, or output correctness are fixes, not features, unless they add a user-visible command, setting, workflow, or API'
        )
      );
      assert.ok(
        content.includes(
          'Choose scope by the primary affected module, product area, or established repository scope'
        )
      );
      assert.ok(
        content.includes(
          'Do not choose scope by emoji labels, type names, generic commit-message words, or nouns that only appear in the subject'
        )
      );
      assert.ok(
        content.includes(
          'Use a prompt/prompts scope for prompt templates, prompt assembly, or model instruction guidance'
        )
      );
      assert.ok(
        content.includes(
          'Use a gitmoji scope only when Gitmoji data, official references, emoji mapping, or Gitmoji-specific behavior is the primary implementation change'
        )
      );
      assert.ok(
        content.includes(
          'If the diff changes an existing settings or configuration value, the subject must use "set", "enable", "disable", or "update"'
        )
      );
      assert.ok(
        content.includes(
          'Do not use "add" in the subject for settings value changes'
        )
      );
      assert.ok(content.includes('Good: chore(settings): set gitmoji prompt preset'));
      assert.ok(content.includes('Bad: chore(settings): add gitmoji prompt preset setting'));
      assert.ok(content.includes('chore(settings):'));
      assert.ok(content.includes('The staged diff is the source of truth'));
      assert.ok(content.includes('Use additional context only when it is consistent with the diff'));
    });
  });
});
