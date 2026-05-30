import * as assert from 'assert';

suite('commands', () => {
  suite('formatProviderErrorMessage', () => {
    let formatProviderErrorMessage: (error: unknown, providerType: string) => string;

    setup(async () => {
      const mod = await import('../../generate-commit-msg');
      formatProviderErrorMessage = (mod as any).formatProviderErrorMessage;
    });

    test('openai-compatible uses error message when no status', () => {
      const msg = formatProviderErrorMessage({ message: 'boom' }, 'openai-compatible');
      assert.strictEqual(msg, 'boom');
    });

    test('openai-compatible maps 401', () => {
      const msg = formatProviderErrorMessage({ status: 401 }, 'openai-compatible');
      assert.strictEqual(msg, 'Invalid API key or unauthorized access');
    });

    test('openai-compatible maps 400 and includes api message when present', () => {
      const msg = formatProviderErrorMessage(
        { status: 400, error: { message: 'bad model' } },
        'openai-compatible'
      );
      assert.strictEqual(msg, 'Bad request: bad model');
    });

    test('gemini returns raw message', () => {
      const msg = formatProviderErrorMessage({ status: 401, message: 'nope' }, 'gemini');
      assert.strictEqual(msg, 'nope');
    });
  });

  suite('formatStagedDiffForPrompt', () => {
    test('wraps staged diff in stable delimiters', async () => {
      const { formatStagedDiffForPrompt } = await import('../../generate-commit-msg');
      const diff = 'diff --git a/a.ts b/a.ts\n+const value = 1;';
      const result = formatStagedDiffForPrompt(diff);

      assert.ok(result.includes('Classify only the staged diff between these delimiters.'));
      assert.ok(result.includes('---BEGIN COMMITFLOW STAGED DIFF---'));
      assert.ok(result.includes('---END COMMITFLOW STAGED DIFF---'));
      assert.ok(result.includes(diff));
      assert.ok(result.indexOf('---BEGIN COMMITFLOW STAGED DIFF---') < result.indexOf(diff));
      assert.ok(result.indexOf(diff) < result.indexOf('---END COMMITFLOW STAGED DIFF---'));
    });
  });

  suite('normalizeMessagesForOpenAICompatibleAPI', () => {
    let normalizeMessagesForOpenAICompatibleAPI: (messages: any[]) => any[];
    let prepareMessagesForOpenAICompatibleAPI: (messages: any[]) => any[];
    let extractOpenAICompatibleResponseParts: (completion: any) => {
      finalText?: string;
      refusalText?: string;
      reasoningText?: string;
    };

    setup(async () => {
      const mod = await import('../../openai-utils');
      normalizeMessagesForOpenAICompatibleAPI = (mod as any).normalizeMessagesForOpenAICompatibleAPI;
      prepareMessagesForOpenAICompatibleAPI = (mod as any).prepareMessagesForOpenAICompatibleAPI;
      extractOpenAICompatibleResponseParts = (mod as any).extractOpenAICompatibleResponseParts;
    });

    test('keeps string content unchanged', () => {
      const input = [{ role: 'user', content: 'hello' }];
      const out = normalizeMessagesForOpenAICompatibleAPI(input);
      assert.deepStrictEqual(out, input);
    });

    test('coerces content parts into a string', () => {
      const input = [
        { role: 'user', content: [{ type: 'text', text: 'hello' }, { type: 'text', text: ' world' }] }
      ];
      const out = normalizeMessagesForOpenAICompatibleAPI(input);
      assert.strictEqual(out[0].content, 'hello world');
    });

    test('coerces proxy content parts without type into a string', () => {
      const input = [{ role: 'user', content: [{ text: 'hi' }] }];
      const out = normalizeMessagesForOpenAICompatibleAPI(input);
      assert.strictEqual(out[0].content, 'hi');
    });

    test('prepareMessagesForOpenAICompatibleAPI throws on empty content', () => {
      assert.throws(() => prepareMessagesForOpenAICompatibleAPI([{ role: 'user', content: '' }]), /empty content/);
    });

    test('prepareMessagesForOpenAICompatibleAPI coerces array content and preserves role', () => {
      const out = prepareMessagesForOpenAICompatibleAPI([
        { role: 'user', content: [{ type: 'text', text: 'hello' }] }
      ]);
      assert.strictEqual(out[0].role, 'user');
      assert.strictEqual(out[0].content, 'hello');
    });

    test('extractOpenAICompatibleResponseParts handles final string content', () => {
      const out = extractOpenAICompatibleResponseParts({
        choices: [{ message: { content: 'pong' } }]
      });
      assert.deepStrictEqual(out, { finalText: 'pong', refusalText: undefined, reasoningText: undefined });
    });

    test('extractOpenAICompatibleResponseParts handles array content parts', () => {
      const out = extractOpenAICompatibleResponseParts({
        choices: [{ message: { content: [{ text: 'pong' }] } }]
      });
      assert.deepStrictEqual(out, { finalText: 'pong', refusalText: undefined, reasoningText: undefined });
    });

    test('extractOpenAICompatibleResponseParts keeps reasoning separate from final content', () => {
      const out = extractOpenAICompatibleResponseParts({
        choices: [{ message: { content: null, reasoning_content: 'pong', refusal: 'no' } }]
      });
      assert.deepStrictEqual(out, { finalText: undefined, refusalText: 'no', reasoningText: 'pong' });
    });

    test('buildOpenAIChatCompletionPayload disables DeepSeek thinking by default', async () => {
      const { buildOpenAIChatCompletionPayload } = await import('../../openai-utils');
      const payload = buildOpenAIChatCompletionPayload(
        [{ role: 'user', content: 'hello' }],
        {
          id: 'profile-1',
          name: 'DeepSeek',
          providerId: 'deepseek',
          driverKind: 'openai',
          model: 'deepseek-v4-flash',
          auth: { scheme: 'bearer' }
        }
      );

      assert.deepStrictEqual((payload as any).thinking, { type: 'disabled' });
      assert.strictEqual((payload as any).reasoning_effort, undefined);
    });

    test('buildOpenAIChatCompletionPayload sends DeepSeek reasoning effort when thinking is enabled', async () => {
      const { buildOpenAIChatCompletionPayload } = await import('../../openai-utils');
      const payload = buildOpenAIChatCompletionPayload(
        [{ role: 'user', content: 'hello' }],
        {
          id: 'profile-1',
          name: 'DeepSeek',
          providerId: 'deepseek',
          driverKind: 'openai',
          model: 'deepseek-v4-pro',
          auth: { scheme: 'bearer' },
          inference: {
            deepseek: {
              thinking: 'enabled',
              reasoningEffort: 'max'
            }
          }
        }
      );

      assert.deepStrictEqual((payload as any).thinking, { type: 'enabled' });
      assert.strictEqual((payload as any).reasoning_effort, 'max');
    });

    test('buildOpenAIChatCompletionPayload omits DeepSeek fields for other providers', async () => {
      const { buildOpenAIChatCompletionPayload } = await import('../../openai-utils');
      const payload = buildOpenAIChatCompletionPayload(
        [{ role: 'user', content: 'hello' }],
        {
          id: 'profile-1',
          name: 'OpenAI',
          providerId: 'openai',
          driverKind: 'openai',
          model: 'gpt-5.5',
          auth: { scheme: 'bearer' },
          inference: {
            temperature: 0.2,
            deepseek: {
              thinking: 'enabled',
              reasoningEffort: 'max'
            }
          }
        } as any
      );

      assert.strictEqual((payload as any).thinking, undefined);
      assert.strictEqual((payload as any).reasoning_effort, undefined);
      assert.strictEqual(payload.temperature, 0.2);
    });
  });

  suite('validateTemperatureInput', () => {
    let validateTemperatureInput: (value: string) => string | undefined;

    setup(async () => {
      const mod = await import('../../commands');
      validateTemperatureInput = mod.validateTemperatureInput;
    });

    test('returns error for empty input', () => {
      assert.strictEqual(validateTemperatureInput(''), 'Temperature is required.');
    });

    test('returns error for whitespace-only input', () => {
      assert.strictEqual(validateTemperatureInput('   '), 'Temperature is required.');
    });

    test('returns error for non-numeric input', () => {
      const result = validateTemperatureInput('abc');
      assert.strictEqual(result, 'Temperature must be a number.');
    });

    test('returns error for negative temperature', () => {
      const result = validateTemperatureInput('-1');
      assert.strictEqual(result, 'Temperature must be between 0 and 2.');
    });

    test('returns error for temperature above 2', () => {
      const result = validateTemperatureInput('2.5');
      assert.strictEqual(result, 'Temperature must be between 0 and 2.');
    });

    test('returns undefined for valid temperature 0', () => {
      assert.strictEqual(validateTemperatureInput('0'), undefined);
    });

    test('returns undefined for valid temperature 2', () => {
      assert.strictEqual(validateTemperatureInput('2'), undefined);
    });

    test('returns undefined for valid temperature 0.7', () => {
      assert.strictEqual(validateTemperatureInput('0.7'), undefined);
    });
  });
});
