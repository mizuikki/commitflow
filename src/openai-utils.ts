import OpenAI from 'openai';
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam
} from 'openai/resources/chat/completions';
import * as vscode from 'vscode';
import { ResolvedProviderProfile } from './config';
import { createOpenAIClient } from './api-utils';
import { logDebug } from './logger';
import { recordLastRenderedPrompt } from './prompt-inspection';
import { ProviderRequestOptions } from './provider-request-options';
import { supportsProviderReasoning } from './provider-registry';
import { ProviderReasoningEffort } from './provider-types';

function coerceChatMessageContentToString(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((part) => {
      if (typeof part === 'string') {
        return part;
      }

      if (!part || typeof part !== 'object') {
        return '';
      }

      // Support common "text part" shapes, including some OpenAI-compatible proxies.
      if ('text' in part) {
        return String((part as { text?: unknown }).text ?? '');
      }
      if ('input_text' in part) {
        return String((part as { input_text?: unknown }).input_text ?? '');
      }

      return '';
    })
    .join('');
}

type OpenAICompatibleMessage = ChatCompletionMessageParam & {
  content: string;
  name?: string;
};

type OpenAICompatibleReasoning = {
  enabled?: boolean;
  effort?: ProviderReasoningEffort;
};

type OpenAICompatibleChatCompletionPayload = Omit<
  ChatCompletionCreateParamsNonStreaming,
  'reasoning_effort' | 'reasoning'
> & {
  thinking?: {
    type: 'enabled' | 'disabled';
  };
  reasoning_effort?: ProviderReasoningEffort | 'none';
  reasoning?: OpenAICompatibleReasoning;
};

type OpenAICompatibleResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
      refusal?: unknown;
      reasoning_content?: unknown;
      reasoningContent?: unknown;
    };
  }>;
};

type OpenAICompatibleResponseMessage = NonNullable<
  NonNullable<OpenAICompatibleResponse['choices']>[number]['message']
>;

export type OpenAICompatibleResponseParts = {
  finalText?: string;
  refusalText?: string;
  reasoningText?: string;
};

function sanitizeOpenAICompatibleMessage(
  message: ChatCompletionMessageParam,
  index: number
): OpenAICompatibleMessage {
  const role = (message as any)?.role;
  if (typeof role !== 'string' || !role.trim()) {
    throw new Error(`Invalid chat message at index ${index}: missing role`);
  }

  const content = coerceChatMessageContentToString((message as any)?.content);
  if (!content.trim()) {
    throw new Error(`Invalid chat message at index ${index}: empty content`);
  }

  const sanitized: OpenAICompatibleMessage = {
    role: role.trim(),
    content
  } as OpenAICompatibleMessage;

  const name = (message as any)?.name;
  if (typeof name === 'string' && name.trim()) {
    sanitized.name = name.trim();
  }

  return sanitized;
}

export function prepareMessagesForOpenAICompatibleAPI(
  messages: ChatCompletionMessageParam[]
): OpenAICompatibleMessage[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('No messages prepared for the provider request');
  }

  return messages.map((message, index) => sanitizeOpenAICompatibleMessage(message, index));
}

export function normalizeMessagesForOpenAICompatibleAPI(
  messages: ChatCompletionMessageParam[]
): ChatCompletionMessageParam[] {
  // DeepSeek's OpenAI-compatible API expects `content` to be text (string).
  // Some clients/libraries may provide `content` as an array of parts; to improve compatibility,
  // we coerce any array form into a plain string by concatenating text parts.
  return messages.map((message) => {
    const content = (message as any)?.content;
    if (typeof content === 'string') {
      return message;
    }

    if (Array.isArray(content)) {
      return {
        ...(message as any),
        content: coerceChatMessageContentToString(content)
      } as ChatCompletionMessageParam;
    }

    return message;
  });
}

export function extractOpenAICompatibleResponseParts(
  completion: OpenAICompatibleResponse | null | undefined
): OpenAICompatibleResponseParts {
  const message = completion?.choices?.[0]?.message as OpenAICompatibleResponseMessage | undefined;
  const finalText = coerceChatMessageContentToString(message?.content).trim();
  const refusalText = coerceChatMessageContentToString(message?.refusal).trim();
  const reasoningText = coerceChatMessageContentToString(
    message?.reasoning_content ?? message?.reasoningContent
  ).trim();

  return {
    finalText: finalText || undefined,
    refusalText: refusalText || undefined,
    reasoningText: reasoningText || undefined
  };
}

function sanitizeMessagesForLogging(messages: ChatCompletionMessageParam[]) {
  return messages.map((message) => ({
    role: (message as any)?.role,
    contentType: typeof (message as any)?.content,
    contentLength:
      typeof (message as any)?.content === 'string'
        ? (message as any).content.length
        : Array.isArray((message as any)?.content)
          ? (message as any).content.length
          : undefined
  }));
}

export function buildOpenAIChatCompletionPayload(
  messages: ChatCompletionMessageParam[],
  profile: ResolvedProviderProfile['profile'],
  options: ProviderRequestOptions = {}
): OpenAICompatibleChatCompletionPayload {
  const temperature = options.temperature ?? profile.inference?.temperature ?? 0.7;
  const normalizedMessages = prepareMessagesForOpenAICompatibleAPI(messages);
  const payload: OpenAICompatibleChatCompletionPayload = {
    model: profile.model,
    messages: normalizedMessages,
    temperature,
    ...(options.maxOutputTokens !== undefined
      ? { max_tokens: options.maxOutputTokens }
      : {})
  };

  if (profile.providerId === 'deepseek') {
    const thinking = profile.inference?.deepseek?.thinking ?? 'disabled';
    payload.thinking = { type: thinking };
    if (thinking === 'enabled' && profile.inference?.deepseek?.reasoningEffort) {
      payload.reasoning_effort = profile.inference.deepseek.reasoningEffort;
    }
  } else if (supportsProviderReasoning(profile.providerId)) {
    const reasoning = profile.inference?.reasoning;
    const mode = reasoning?.mode ?? 'default';
    const effort = reasoning?.effort;

    if (profile.providerId === 'openrouter') {
      if (mode !== 'default' || effort) {
        payload.reasoning = {
          ...(mode === 'disabled' ? { enabled: false } : {}),
          ...(mode === 'enabled' ? { enabled: true } : {}),
          ...(effort ? { effort } : {})
        };
      }
    } else if (mode === 'disabled') {
      payload.reasoning_effort = 'none';
    } else if (effort) {
      payload.reasoning_effort = effort;
    } else if (mode === 'enabled') {
      // `medium` is the common interoperable enabled level across the supported drivers.
      payload.reasoning_effort = 'medium';
    }
  }

  return payload;
}

export function createOpenAIApi(resolvedProfile: ResolvedProviderProfile): OpenAI {
  if (
    resolvedProfile.profile.driverKind !== 'openai' &&
    resolvedProfile.profile.driverKind !== 'azure-openai'
  ) {
    throw new Error(`Provider "${resolvedProfile.profile.name}" is not OpenAI-based.`);
  }

  return createOpenAIClient(resolvedProfile.profile, resolvedProfile.apiKey);
}

export async function requestOpenAIChatCompletion(
  messages: ChatCompletionMessageParam[],
  resolvedProfile: ResolvedProviderProfile,
  resourceUri?: vscode.Uri,
  options: ProviderRequestOptions = {}
) {
  const openai = createOpenAIApi(resolvedProfile);
  const { profile } = resolvedProfile;
  const payload = buildOpenAIChatCompletionPayload(messages, profile, options);
  logDebug(
    'OpenAI-family payload prepared',
    {
      providerId: profile.providerId,
      model: profile.model,
      temperature: payload.temperature,
      deepseekThinking:
        profile.providerId === 'deepseek' ? payload.thinking?.type : undefined,
      deepseekReasoningEffort:
        profile.providerId === 'deepseek' ? payload.reasoning_effort : undefined,
      reasoningMode:
        profile.providerId !== 'deepseek' ? profile.inference?.reasoning?.mode : undefined,
      reasoningEffort:
        profile.providerId !== 'deepseek' ? payload.reasoning_effort ?? payload.reasoning?.effort : undefined,
      messageSummary: sanitizeMessagesForLogging(payload.messages)
    },
    resourceUri
  );

  if (options.captureRenderedPrompt !== false) {
    recordLastRenderedPrompt(
      resolvedProfile,
      'openai.chat.completions.create',
      payload,
      resourceUri
    );
  }

  return openai.chat.completions.create(payload as ChatCompletionCreateParamsNonStreaming);
}

export async function OpenAIChatAPI(
  messages: ChatCompletionMessageParam[],
  resolvedProfile: ResolvedProviderProfile,
  resourceUri?: vscode.Uri,
  options: ProviderRequestOptions = {}
) {
  const completion = await requestOpenAIChatCompletion(
    messages,
    resolvedProfile,
    resourceUri,
    options
  );

  return extractOpenAICompatibleResponseParts(completion).finalText;
}
