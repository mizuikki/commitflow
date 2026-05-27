import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import * as vscode from 'vscode';
import { ConfigurationManager, ResolvedProviderProfile } from './config';
import { createOpenAIClient } from './api-utils';
import { logDebug } from './logger';

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

export async function resolveOpenAIProfile(resourceUri?: vscode.Uri): Promise<ResolvedProviderProfile> {
  const configManager = ConfigurationManager.getInstance();
  const resolved = await configManager.getActiveProviderProfile(resourceUri);

  if (resolved.profile.type !== 'openai-compatible') {
    throw new Error(`Active profile "${resolved.profile.name}" is not an OpenAI-compatible profile`);
  }

  return resolved;
}

export async function createOpenAIApi(resourceUri?: vscode.Uri): Promise<OpenAI> {
  const { profile, apiKey } = await resolveOpenAIProfile(resourceUri);
  return createOpenAIClient(profile, apiKey);
}

export async function ChatGPTAPI(
  messages: ChatCompletionMessageParam[],
  resourceUri?: vscode.Uri
) {
  const openai = await createOpenAIApi(resourceUri);
  const { profile } = await resolveOpenAIProfile(resourceUri);
  const temperature = profile.temperature ?? 0.7;

  const normalizedMessages = prepareMessagesForOpenAICompatibleAPI(messages);
  logDebug(
    'OpenAI-compatible payload prepared',
    {
      model: profile.model,
      temperature,
      messageSummary: sanitizeMessagesForLogging(normalizedMessages)
    },
    resourceUri
  );

  const completion = await openai.chat.completions.create({
    model: profile.model,
    messages: normalizedMessages,
    temperature
  });

  return completion.choices[0]!.message?.content;
}
