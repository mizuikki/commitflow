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
