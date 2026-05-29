import * as assert from 'assert';

suite('config', () => {
  suite('normalizeString', () => {
    test('returns undefined for empty string', async () => {
      const { normalizeString } = await import('../../config');
      assert.strictEqual(normalizeString(''), undefined);
    });

    test('returns undefined for whitespace-only string', async () => {
      const { normalizeString } = await import('../../config');
      assert.strictEqual(normalizeString('   '), undefined);
    });

    test('returns trimmed string for non-empty input', async () => {
      const { normalizeString } = await import('../../config');
      assert.strictEqual(normalizeString('  hello  '), 'hello');
    });

    test('returns undefined for non-string input', async () => {
      const { normalizeString } = await import('../../config');
      assert.strictEqual(normalizeString(42), undefined);
    });
  });

  suite('normalizePromptPreset', () => {
    test('maps legacy with-gitmoji to gitmoji-prefix', async () => {
      const { normalizePromptPreset } = await import('../../config');
      assert.strictEqual(normalizePromptPreset('with-gitmoji'), 'gitmoji-prefix');
    });

    test('preserves gitmoji-suffix', async () => {
      const { normalizePromptPreset } = await import('../../config');
      assert.strictEqual(normalizePromptPreset('gitmoji-suffix'), 'gitmoji-suffix');
    });

    test('falls back for unknown values', async () => {
      const { normalizePromptPreset } = await import('../../config');
      assert.strictEqual(normalizePromptPreset('unknown'), 'without-gitmoji');
    });
  });

  suite('createProviderProfileId', () => {
    test('generates id starting with profile- prefix', async () => {
      const { createProviderProfileId } = await import('../../config');
      const id = createProviderProfileId();
      assert.ok(id.startsWith('profile-'));
      assert.ok(id.length > 'profile-'.length);
    });

    test('generates unique ids', async () => {
      const { createProviderProfileId } = await import('../../config');
      const id1 = createProviderProfileId();
      const id2 = createProviderProfileId();
      assert.notStrictEqual(id1, id2);
    });
  });
});
