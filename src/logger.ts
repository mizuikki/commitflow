import * as vscode from 'vscode';
import { COMMITFLOW_NAMESPACE, ConfigKeys } from './config';

let outputChannel: vscode.OutputChannel | undefined;
let extensionContext: vscode.ExtensionContext | undefined;

export function setLoggerContext(context: vscode.ExtensionContext) {
  extensionContext = context;
}

function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('CommitFlow');
    extensionContext?.subscriptions.push(outputChannel);
  }
  return outputChannel;
}

function isDebugEnabled(resourceUri?: vscode.Uri): boolean {
  const config = vscode.workspace.getConfiguration(COMMITFLOW_NAMESPACE, resourceUri);
  return Boolean(config.get<boolean>(ConfigKeys.DEBUG_LOGGING, false));
}

function formatDebugValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return 'undefined';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function logDebug(message: string, meta?: Record<string, unknown>, resourceUri?: vscode.Uri) {
  if (!isDebugEnabled(resourceUri)) {
    return;
  }

  const channel = getOutputChannel();
  const timestamp = new Date().toISOString();
  const suffix = meta ? ` ${formatDebugValue(meta)}` : '';
  channel.appendLine(`[${timestamp}] ${message}${suffix}`);
}
