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

  suite('provider schema', () => {
    test('normalizes nested Azure provider profiles', async () => {
      const { normalizeProviderProfile } = await import('../../provider-types');
      const profile = normalizeProviderProfile({
        id: 'profile-1',
        name: 'Azure Work',
        providerId: 'azure-openai',
        driverKind: 'azure-openai',
        model: 'gpt-5.5',
        auth: { scheme: 'api-key' },
        connection: {
          endpoint: 'https://example.openai.azure.com',
          deployment: 'gpt-5.5',
          apiVersion: '2024-10-21'
        },
        inference: {
          temperature: 0.3
        }
      });

      assert.ok(profile);
      assert.strictEqual(profile?.providerId, 'azure-openai');
      assert.strictEqual(profile?.connection?.endpoint, 'https://example.openai.azure.com');
      assert.strictEqual(profile?.inference?.temperature, 0.3);
    });

    test('rejects legacy flat provider profiles', async () => {
      const { normalizeProviderProfile } = await import('../../provider-types');
      const profile = normalizeProviderProfile({
        id: 'profile-1',
        name: 'Legacy',
        type: 'openai-compatible',
        model: 'gpt-5.5',
        baseURL: 'https://api.openai.com/v1',
        azureApiVersion: '2024-10-21'
      });

      assert.strictEqual(profile, undefined);
    });

    test('validates Azure required fields separately from generic config', async () => {
      const { validateProviderProfile } = await import('../../provider-registry');
      const errors = validateProviderProfile({
        id: 'profile-1',
        name: 'Azure Broken',
        providerId: 'azure-openai',
        driverKind: 'azure-openai',
        model: 'gpt-5.5',
        auth: { scheme: 'api-key' },
        connection: {
          endpoint: 'https://example.openai.azure.com'
        }
      } as any);

      assert.ok(errors.some((error: string) => error.includes('Deployment is required')));
      assert.ok(errors.some((error: string) => error.includes('API version is required')));
    });

    test('uses current recommended OpenAI model defaults', async () => {
      const { createDefaultProfileDraft } = await import('../../provider-registry');
      const draft = createDefaultProfileDraft('openai');

      assert.strictEqual(draft.model, 'gpt-5.5');
    });

    test('uses official DeepSeek base URL default', async () => {
      const { createDefaultProfileDraft } = await import('../../provider-registry');
      const draft = createDefaultProfileDraft('deepseek');

      assert.strictEqual(draft.connection.baseURL, 'https://api.deepseek.com');
    });
  });
});
