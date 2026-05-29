import * as assert from 'assert';
import { gitmojis } from 'gitmojis';

suite('gitmoji', () => {
  suite('buildGitmojiReferenceTable', () => {
    test('includes every official gitmoji entry', async () => {
      const { buildGitmojiReferenceTable } = await import('../../gitmoji');
      const result = buildGitmojiReferenceTable();
      const dataRows = result
        .split('\n')
        .filter((line) => line.startsWith('| ') && !line.includes('---'))
        .slice(1);

      assert.strictEqual(dataRows.length, gitmojis.length);
    });

    test('uses official gitmoji descriptions without local overrides', async () => {
      const { buildGitmojiReferenceTable } = await import('../../gitmoji');
      const result = buildGitmojiReferenceTable();

      assert.ok(result.includes(':sparkles:'));
      assert.ok(result.includes(':bug:'));
      assert.ok(result.includes(':fire:'));
      assert.ok(result.includes('Add or update configuration files.'));
      assert.ok(!result.includes('Maintain configuration or project metadata.'));
    });
  });

  suite('getGitmojiEmojiByCode', () => {
    test('returns emoji from official gitmoji code', async () => {
      const { getGitmojiEmojiByCode } = await import('../../gitmoji');

      assert.strictEqual(getGitmojiEmojiByCode(':recycle:'), '♻️');
    });

    test('throws for unknown code', async () => {
      const { getGitmojiEmojiByCode } = await import('../../gitmoji');

      assert.throws(() => getGitmojiEmojiByCode(':unknown:'));
    });
  });
});
