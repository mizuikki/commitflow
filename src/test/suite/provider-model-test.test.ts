import * as assert from 'assert';
import type {
  DriverKind,
  ProviderId,
  ResolvedProviderProfile
} from '../../provider-types';

suite('provider model test', () => {
  function createResolvedProfile(
    overrides: Partial<{
      providerId: ProviderId;
      driverKind: DriverKind;
      model: string;
      name: string;
    }> = {}
  ): ResolvedProviderProfile {
    return {
      profile: {
        id: 'profile-1',
        name: overrides.name ?? 'Test Profile',
        providerId: overrides.providerId ?? 'openai',
        driverKind: overrides.driverKind ?? 'openai',
        model: overrides.model ?? 'gpt-5.5',
        auth: { scheme: 'bearer' }
      },
      apiKey: 'test-key'
    };
  }

  test('builds a deterministic health-check prompt', async () => {
    const { buildProviderModelTestMessages } = await import('../../provider-model-test');
    const messages = buildProviderModelTestMessages();

    assert.deepStrictEqual(messages, [
      {
        role: 'system',
        content: 'Reply with exactly "pong" and nothing else.'
      },
      {
        role: 'user',
        content: 'ping'
      }
    ]);
  });

  test('accepts pong and rejects empty or mismatched content', async () => {
    const {
      normalizeProviderModelTestResponse,
      validateProviderModelTestResponse
    } = await import('../../provider-model-test');

    assert.strictEqual(normalizeProviderModelTestResponse('  pong  '), 'pong');
    assert.deepStrictEqual(validateProviderModelTestResponse('pong'), { status: 'success' });
    assert.deepStrictEqual(validateProviderModelTestResponse('"pong".'), { status: 'success' });
    assert.deepStrictEqual(validateProviderModelTestResponse('p\np'), {
      status: 'warning',
      detailMessage: 'Model is reachable and returned text, but did not fully follow the test prompt. Received: p\np'
    });
    assert.deepStrictEqual(
      validateProviderModelTestResponse('We are asked to reply with exactly "pong" and nothing else.'),
      {
        status: 'warning',
        detailMessage: 'Model is reachable and returned text, but did not fully follow the test prompt. Received: We are asked to reply with exactly "pong" and nothing else.'
      }
    );
    assert.deepStrictEqual(validateProviderModelTestResponse('   '), {
      status: 'error',
      detailMessage: 'Model returned an empty response.'
    });
    assert.deepStrictEqual(validateProviderModelTestResponse('hello'), {
      status: 'warning',
      detailMessage: 'Model is reachable and returned text, but did not fully follow the test prompt. Received: hello'
    });
  });

  test('returns a success result when the provider replies with pong', async () => {
    const { testProviderModelResponse } = await import('../../provider-model-test');
    const result = await testProviderModelResponse(
      createResolvedProfile(),
      undefined,
      {
        openai: async () => ({ finalText: 'pong' }),
        anthropic: async () => 'unused',
        gemini: async () => 'unused'
      }
    );

    assert.strictEqual(result.status, 'success');
    assert.strictEqual(result.detailMessage, undefined);
    assert.strictEqual(result.responseText, 'pong');
    assert.strictEqual(result.providerLabel, 'OpenAI');
    assert.strictEqual(result.profileName, 'Test Profile');
    assert.strictEqual(result.model, 'gpt-5.5');
  });

  test('treats any non-empty provider reply as a usable response', async () => {
    const { testProviderModelResponse } = await import('../../provider-model-test');
    const result = await testProviderModelResponse(
      createResolvedProfile(),
      undefined,
      {
        openai: async () => ({ finalText: 'hello there' }),
        anthropic: async () => 'unused',
        gemini: async () => 'unused'
      }
    );

    assert.strictEqual(result.status, 'warning');
    assert.ok(result.detailMessage?.includes('did not fully follow the test prompt'));
    assert.strictEqual(result.responseText, 'hello there');
  });

  test('normalizes provider auth errors into user-facing messages', async () => {
    const { testProviderModelResponse } = await import('../../provider-model-test');
    const result = await testProviderModelResponse(
      createResolvedProfile(),
      undefined,
      {
        openai: async () => {
          const error = new Error('401 from upstream') as Error & { status?: number };
          error.status = 401;
          throw error;
        },
        anthropic: async () => 'unused',
        gemini: async () => 'unused'
      }
    );

    assert.strictEqual(result.status, 'error');
    assert.strictEqual(result.detailMessage, 'Invalid API key or unauthorized access');
    assert.strictEqual(result.responseText, undefined);
  });

  test('treats reasoning-only responses as warning without final answer', async () => {
    const { testProviderModelResponse } = await import('../../provider-model-test');
    const result = await testProviderModelResponse(
      createResolvedProfile(),
      undefined,
      {
        openai: async () => ({
          finalText: undefined,
          reasoningText: 'We are asked to reply with exactly "pong" and nothing else.'
        }),
        anthropic: async () => 'unused',
        gemini: async () => 'unused'
      }
    );

    assert.strictEqual(result.status, 'warning');
    assert.ok(result.detailMessage?.includes('reasoning text but no final answer'));
    assert.strictEqual(result.responseText, undefined);
    assert.strictEqual(
      result.reasoningText,
      'We are asked to reply with exactly "pong" and nothing else.'
    );
  });

  test('dispatches to the matching provider driver', async () => {
    const { testProviderModelResponse } = await import('../../provider-model-test');
    let geminiCalls = 0;
    let openaiCalls = 0;
    const result = await testProviderModelResponse(
      createResolvedProfile({
        providerId: 'gemini',
        driverKind: 'gemini',
        model: 'gemini-3.5-flash'
      }),
      undefined,
      {
        openai: async () => {
          openaiCalls += 1;
          return { finalText: 'unused' };
        },
        anthropic: async () => 'unused',
        gemini: async () => {
          geminiCalls += 1;
          return 'pong';
        }
      }
    );

    assert.strictEqual(openaiCalls, 0);
    assert.strictEqual(geminiCalls, 1);
    assert.strictEqual(result.status, 'success');
    assert.strictEqual(result.detailMessage, undefined);
    assert.strictEqual(result.responseText, 'pong');
  });

  test('retries once with a fallback prompt when the first response is empty', async () => {
    const { testProviderModelResponse } = await import('../../provider-model-test');
    let calls = 0;
    const result = await testProviderModelResponse(
      createResolvedProfile({
        providerId: 'deepseek',
        driverKind: 'openai',
        model: 'deepseek-v4-flash'
      }),
      undefined,
      {
        openai: async () => {
          calls += 1;
          return calls === 1 ? { finalText: '' } : { finalText: 'pong' };
        },
        anthropic: async () => 'unused',
        gemini: async () => 'unused'
      }
    );

    assert.strictEqual(calls, 2);
    assert.strictEqual(result.status, 'success');
    assert.strictEqual(result.detailMessage, undefined);
    assert.strictEqual(result.responseText, 'pong');
  });
});
