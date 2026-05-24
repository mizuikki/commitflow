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
    test('returns table with emoji column when includeGitmoji is true', async () => {
      const { buildCommitTypeReferenceTable } = await import('../../gitmoji');
      const result = buildCommitTypeReferenceTable(true);
      assert.ok(result.includes('feat'));
      assert.ok(result.includes('✨'));
    });

    test('returns table without emoji column when includeGitmoji is false', async () => {
      const { buildCommitTypeReferenceTable } = await import('../../gitmoji');
      const result = buildCommitTypeReferenceTable(false);
      assert.ok(result.includes('feat'));
      assert.ok(!result.includes('✨'));
    });
  });

  suite('buildOutputFormat', () => {
    test('returns format with emoji when includeGitmoji is true', async () => {
      const { buildOutputFormat } = await import('../../prompts');
      const result = buildOutputFormat(true);
      assert.ok(result.includes('<emoji>'));
      assert.ok(result.includes('<type>(<scope>): <subject>'));
    });

    test('returns format without emoji when includeGitmoji is false', async () => {
      const { buildOutputFormat } = await import('../../prompts');
      const result = buildOutputFormat(false);
      assert.ok(!result.includes('<emoji>'));
      assert.ok(result.includes('<type>(<scope>): <subject>'));
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
  });
});
