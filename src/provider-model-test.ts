import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import * as vscode from 'vscode';
import { AnthropicAPI } from './anthropic-utils';
import { formatProviderErrorMessage } from './provider-error-utils';
import { GeminiAPI } from './gemini-utils';
import { logDebug } from './logger';
import {
  extractOpenAICompatibleResponseParts,
  OpenAICompatibleResponseParts,
  requestOpenAIChatCompletion
} from './openai-utils';
import { getProviderLabel } from './provider-registry';
import { ProviderRequestOptions } from './provider-request-options';
import { ResolvedProviderProfile } from './provider-types';

export type ProviderModelTestStatus = 'success' | 'warning' | 'error';

export type ProviderModelTestResult = {
  status: ProviderModelTestStatus;
  providerLabel: string;
  profileName: string;
  model: string;
  latencyMs: number;
  testedAt: string;
  responseText?: string;
  detailMessage?: string;
  reasoningText?: string;
};

type ProviderModelTestExecutors = {
  openai: (
    messages: ChatCompletionMessageParam[],
    resolvedProfile: ResolvedProviderProfile,
    resourceUri?: vscode.Uri,
    options?: ProviderRequestOptions
  ) => Promise<OpenAICompatibleResponseParts>;
  anthropic: typeof AnthropicAPI;
  gemini: typeof GeminiAPI;
};

const DEFAULT_TEST_EXECUTORS: ProviderModelTestExecutors = {
  openai: async (messages, resolvedProfile, resourceUri, options = {}) =>
    extractOpenAICompatibleResponseParts(
      await requestOpenAIChatCompletion(messages, resolvedProfile, resourceUri, options)
    ),
  anthropic: AnthropicAPI,
  gemini: GeminiAPI
};

const PRIMARY_MODEL_TEST_OPTIONS: ProviderRequestOptions = {
  temperature: 0,
  maxOutputTokens: 32,
  captureRenderedPrompt: false
};

const FALLBACK_MODEL_TEST_OPTIONS: ProviderRequestOptions = {
  temperature: 0,
  maxOutputTokens: 128,
  captureRenderedPrompt: false
};

export function buildProviderModelTestMessages(mode: 'strict' | 'fallback' = 'strict'): ChatCompletionMessageParam[] {
  if (mode === 'fallback') {
    return [
      {
        role: 'user',
        content: 'Reply with exactly "pong" and nothing else.'
      }
    ];
  }

  return [
    {
      role: 'system',
      content: 'Reply with exactly "pong" and nothing else.'
    },
    {
      role: 'user',
      content: 'ping'
    }
  ];
}

export function normalizeProviderModelTestResponse(
  response: string | null | undefined
): string | undefined {
  const normalized = response?.trim();
  return normalized ? normalized : undefined;
}

function normalizeProviderModelTestToken(response: string): string {
  return response
    .trim()
    .replace(/^["'`]+|["'`.!。]+$/g, '')
    .trim()
    .toLowerCase();
}

export function validateProviderModelTestResponse(
  response: string | null | undefined,
  diagnostics: { reasoningText?: string; refusalText?: string } = {}
): { status: ProviderModelTestStatus; detailMessage?: string } {
  const normalized = normalizeProviderModelTestResponse(response);
  if (!normalized) {
    if (diagnostics.refusalText) {
      return {
        status: 'warning',
        detailMessage: `Model returned a refusal instead of a final answer. Refusal: ${diagnostics.refusalText.slice(0, 160)}`
      };
    }

    if (diagnostics.reasoningText) {
      return {
        status: 'warning',
        detailMessage: `Model returned reasoning text but no final answer. Reasoning: ${diagnostics.reasoningText.slice(0, 160)}`
      };
    }

    return {
      status: 'error',
      detailMessage: 'Model returned an empty response.'
    };
  }

  if (normalizeProviderModelTestToken(normalized) !== 'pong') {
    return {
      status: 'warning',
      detailMessage: `Model is reachable and returned text, but did not fully follow the test prompt. Received: ${normalized.slice(0, 160)}`
    };
  }

  return { status: 'success' };
}

async function requestProviderModelTestResponse(
  resolvedProfile: ResolvedProviderProfile,
  resourceUri: vscode.Uri | undefined,
  executors: ProviderModelTestExecutors,
  messages: ChatCompletionMessageParam[],
  options: ProviderRequestOptions
): Promise<{
  responseText?: string;
  refusalText?: string;
  reasoningText?: string;
}> {
  switch (resolvedProfile.profile.driverKind) {
    case 'openai':
    case 'azure-openai':
      {
        const result = await executors.openai(
          messages,
          resolvedProfile,
          resourceUri,
          options
        );
        return {
          responseText: result.finalText,
          refusalText: result.refusalText,
          reasoningText: result.reasoningText
        };
      }
    case 'anthropic': {
      return {
        responseText: await executors.anthropic(
          messages,
          resolvedProfile,
          resourceUri,
          options
        )
      };
    }
    case 'gemini':
      return {
        responseText: await executors.gemini(
          messages,
          resolvedProfile,
          resourceUri,
          options
        )
      };
  }
}

export async function testProviderModelResponse(
  resolvedProfile: ResolvedProviderProfile,
  resourceUri?: vscode.Uri,
  executors: ProviderModelTestExecutors = DEFAULT_TEST_EXECUTORS
): Promise<ProviderModelTestResult> {
  const startedAt = Date.now();
  const providerLabel = getProviderLabel(resolvedProfile.profile.providerId);

  try {
    const strictMessages = buildProviderModelTestMessages('strict');
    let attempt = await requestProviderModelTestResponse(
      resolvedProfile,
      resourceUri,
      executors,
      strictMessages,
      PRIMARY_MODEL_TEST_OPTIONS
    );
    let responseText = normalizeProviderModelTestResponse(attempt.responseText);

    if (!responseText) {
      logDebug(
        'Provider model response test returned empty text; retrying with fallback prompt',
        {
          providerId: resolvedProfile.profile.providerId,
          profileName: resolvedProfile.profile.name,
          model: resolvedProfile.profile.model
        },
        resourceUri
      );
      attempt = await requestProviderModelTestResponse(
        resolvedProfile,
        resourceUri,
        executors,
        buildProviderModelTestMessages('fallback'),
        FALLBACK_MODEL_TEST_OPTIONS
      );
      responseText = normalizeProviderModelTestResponse(attempt.responseText);
    }

    const latencyMs = Date.now() - startedAt;
    const validation = validateProviderModelTestResponse(responseText, {
      reasoningText: attempt.reasoningText,
      refusalText: attempt.refusalText
    });

    return {
      status: validation.status,
      providerLabel,
      profileName: resolvedProfile.profile.name,
      model: resolvedProfile.profile.model,
      latencyMs,
      testedAt: new Date().toISOString(),
      responseText,
      detailMessage: validation.detailMessage,
      reasoningText: attempt.reasoningText
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const errorMessage = formatProviderErrorMessage(
      error,
      resolvedProfile.profile.driverKind
    );

    logDebug(
      'Provider model response test failed',
      {
        providerId: resolvedProfile.profile.providerId,
        profileName: resolvedProfile.profile.name,
        model: resolvedProfile.profile.model,
        errorMessage
      },
      resourceUri
    );

    return {
      status: 'error',
      providerLabel,
      profileName: resolvedProfile.profile.name,
      model: resolvedProfile.profile.model,
      latencyMs,
      testedAt: new Date().toISOString(),
      detailMessage: errorMessage
    };
  }
}
