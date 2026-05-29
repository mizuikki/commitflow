import { GoogleGenAI } from '@google/genai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import * as vscode from 'vscode';
import { ResolvedProviderProfile } from './config';
import { recordLastRenderedPrompt } from './prompt-inspection';
import { ProviderRequestOptions } from './provider-request-options';

function extractMessageContent(message: ChatCompletionMessageParam | { content?: unknown }): string {
  const content = message.content;

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'object' && part && 'text' in part ? String((part as { text?: unknown }).text ?? '') : ''))
      .join('');
  }

  return '';
}

export function createGeminiAPIClient(resolvedProfile: ResolvedProviderProfile) {
  if (resolvedProfile.profile.driverKind !== 'gemini') {
    throw new Error(`Provider "${resolvedProfile.profile.name}" is not a Gemini profile`);
  }

  if (!resolvedProfile.apiKey) {
    throw new Error(`API key is missing for provider profile: ${resolvedProfile.profile.name}`);
  }

  return new GoogleGenAI({
    apiKey: resolvedProfile.apiKey,
    httpOptions: resolvedProfile.profile.connection?.baseURL
      ? {
          baseUrl: resolvedProfile.profile.connection.baseURL
        }
      : undefined
  });
}

export async function GeminiAPI(
  messages: ChatCompletionMessageParam[],
  resolvedProfile: ResolvedProviderProfile,
  resourceUri?: vscode.Uri,
  options: ProviderRequestOptions = {}
) {
  try {
    const ai = createGeminiAPIClient(resolvedProfile);
    const { profile } = resolvedProfile;
    const temperature = options.temperature ?? profile.inference?.temperature ?? 0.7;

    const systemInstruction = messages
      .filter((message) => message.role === 'system')
      .map((message) => extractMessageContent(message))
      .join('\n');
    const userContent = messages
      .filter((message) => message.role !== 'system')
      .map((message) => extractMessageContent(message))
      .join('\n\n');

    const payload = {
      model: profile.model,
      contents: userContent,
      config: {
        systemInstruction: systemInstruction || undefined,
        temperature,
        ...(options.maxOutputTokens !== undefined
          ? { maxOutputTokens: options.maxOutputTokens }
          : {})
      }
    };
    if (options.captureRenderedPrompt !== false) {
      recordLastRenderedPrompt(
        resolvedProfile,
        'gemini.models.generateContent',
        payload,
        resourceUri
      );
    }

    const response = await ai.models.generateContent(payload);

    return response.text;
  } catch (error) {
    if (error instanceof Error) {
      const msg = error.message;

      if (msg.includes('API_KEY_INVALID') || msg.includes('403')) {
        throw new Error('Invalid Gemini API key');
      }
      if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
        throw new Error('Gemini rate limit exceeded. Please try again later');
      }
      if (msg.includes('SAFETY') || msg.includes('blocked')) {
        throw new Error('Response blocked by Gemini safety filters');
      }
      if (msg.includes('UNAVAILABLE') || msg.includes('503') || msg.includes('500')) {
        throw new Error('Gemini service is temporarily unavailable');
      }
    }
    throw error;
  }
}
