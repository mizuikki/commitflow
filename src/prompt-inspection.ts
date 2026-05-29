import * as vscode from 'vscode';
import type { ResolvedProviderProfile } from './provider-types';

export type RenderedPromptPayloadKind =
  | 'openai.chat.completions.create'
  | 'gemini.models.generateContent'
  | 'anthropic.messages.create';

export interface RenderedPromptSnapshot {
  capturedAt: string;
  providerId: string;
  driverKind: string;
  profileName: string;
  model: string;
  resourceUri?: string;
  payloadKind: RenderedPromptPayloadKind;
  payload: unknown;
}

let lastRenderedPromptSnapshot: RenderedPromptSnapshot | undefined;

export function recordLastRenderedPrompt(
  resolvedProfile: ResolvedProviderProfile,
  payloadKind: RenderedPromptPayloadKind,
  payload: unknown,
  resourceUri?: vscode.Uri
): RenderedPromptSnapshot {
  const { profile } = resolvedProfile;
  lastRenderedPromptSnapshot = {
    capturedAt: new Date().toISOString(),
    providerId: profile.providerId,
    driverKind: profile.driverKind,
    profileName: profile.name,
    model: profile.model,
    resourceUri: resourceUri?.toString(),
    payloadKind,
    payload
  };

  return lastRenderedPromptSnapshot;
}

export function getLastRenderedPrompt(): RenderedPromptSnapshot | undefined {
  return lastRenderedPromptSnapshot;
}

export function clearLastRenderedPrompt(): void {
  lastRenderedPromptSnapshot = undefined;
}

export function formatRenderedPromptSnapshot(snapshot: RenderedPromptSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}
