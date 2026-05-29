import * as assert from 'assert';
import * as vscode from 'vscode';
import type { ResolvedProviderProfile } from '../../provider-types';

function createResolvedProfile(): ResolvedProviderProfile {
  return {
    profile: {
      id: 'profile-1',
      name: 'Debug Profile',
      providerId: 'openai',
      driverKind: 'openai',
      model: 'gpt-5.5',
      auth: { scheme: 'bearer' }
    },
    apiKey: 'secret-api-key'
  };
}

suite('prompt inspection', () => {
  setup(async () => {
    const { clearLastRenderedPrompt } = await import('../../prompt-inspection');
    clearLastRenderedPrompt();
  });

  test('records and returns the latest rendered prompt snapshot', async () => {
    const {
      getLastRenderedPrompt,
      recordLastRenderedPrompt
    } = await import('../../prompt-inspection');
    const firstPayload = { model: 'gpt-5.5', messages: [{ role: 'user', content: 'first' }] };
    const secondPayload = { model: 'gpt-5.5', messages: [{ role: 'user', content: 'second' }] };

    recordLastRenderedPrompt(
      createResolvedProfile(),
      'openai.chat.completions.create',
      firstPayload,
      vscode.Uri.file('/workspace/repo')
    );
    const latest = recordLastRenderedPrompt(
      createResolvedProfile(),
      'openai.chat.completions.create',
      secondPayload,
      vscode.Uri.file('/workspace/repo')
    );

    assert.deepStrictEqual(getLastRenderedPrompt(), latest);
    assert.deepStrictEqual(latest.payload, secondPayload);
    assert.strictEqual(latest.providerId, 'openai');
    assert.strictEqual(latest.driverKind, 'openai');
    assert.strictEqual(latest.profileName, 'Debug Profile');
    assert.strictEqual(latest.model, 'gpt-5.5');
    assert.strictEqual(latest.resourceUri, vscode.Uri.file('/workspace/repo').toString());
  });

  test('formats snapshots as JSON without API keys', async () => {
    const {
      formatRenderedPromptSnapshot,
      recordLastRenderedPrompt
    } = await import('../../prompt-inspection');
    const snapshot = recordLastRenderedPrompt(
      createResolvedProfile(),
      'openai.chat.completions.create',
      {
        model: 'gpt-5.5',
        messages: [{ role: 'user', content: 'staged diff' }],
        temperature: 0.7
      }
    );

    const formatted = formatRenderedPromptSnapshot(snapshot);
    const parsed = JSON.parse(formatted);

    assert.strictEqual(parsed.payloadKind, 'openai.chat.completions.create');
    assert.strictEqual(parsed.payload.messages[0].content, 'staged diff');
    assert.ok(!formatted.includes('secret-api-key'));
    assert.ok(!formatted.includes('apiKey'));
  });
});
