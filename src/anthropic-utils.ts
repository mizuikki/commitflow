import Anthropic from '@anthropic-ai/sdk';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import * as vscode from 'vscode';
import { ResolvedProviderProfile } from './config';
import { ProviderRequestOptions } from './provider-request-options';

function extractMessageContent(message: ChatCompletionMessageParam | { content?: unknown }): string {
  const content = message.content;

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === 'object' && part && 'text' in part
          ? String((part as { text?: unknown }).text ?? '')
          : ''
      )
      .join('');
  }

  return '';
}

export function createAnthropicClient(resolvedProfile: ResolvedProviderProfile) {
  if (resolvedProfile.profile.driverKind !== 'anthropic') {
    throw new Error(`Provider "${resolvedProfile.profile.name}" is not an Anthropic profile`);
  }

  if (!resolvedProfile.apiKey) {
    throw new Error(`API key is missing for provider profile: ${resolvedProfile.profile.name}`);
  }

  return new Anthropic({
    apiKey: resolvedProfile.apiKey,
    baseURL: resolvedProfile.profile.connection?.baseURL
  });
}

export async function AnthropicAPI(
  messages: ChatCompletionMessageParam[],
  resolvedProfile: ResolvedProviderProfile,
  _resourceUri?: vscode.Uri,
  options: ProviderRequestOptions = {}
) {
  const anthropic = createAnthropicClient(resolvedProfile);
  const { profile } = resolvedProfile;
  const system = messages
    .filter((message) => message.role === 'system')
    .map((message) => extractMessageContent(message))
    .join('\n');
  const userContent = messages
    .filter((message) => message.role !== 'system')
    .map((message) => extractMessageContent(message))
    .join('\n\n');

  const response = await anthropic.messages.create({
    model: profile.model,
    max_tokens: options.maxOutputTokens ?? 256,
    temperature: options.temperature ?? profile.inference?.temperature ?? 0.7,
    system: system || undefined,
    messages: [
      {
        role: 'user',
        content: userContent
      }
    ]
  });

  const firstBlock = response.content.find((block) => block.type === 'text');
  return firstBlock && 'text' in firstBlock ? firstBlock.text : undefined;
}
