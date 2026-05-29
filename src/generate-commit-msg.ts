import * as fs from 'fs-extra';
import * as vscode from 'vscode';
import { ConfigKeys, ConfigurationManager } from './config';
import { getDiffStaged, GitExtensionRepository } from './git-utils';
import { ChatGPTAPI } from './openai-utils';
import { getMainCommitPrompt } from './prompts';
import { ProgressHandler } from './utils';
import { GeminiAPI } from './gemini-utils';
import { logDebug } from './logger';

type HttpErrorLike = {
  status?: number;
  response?: { status?: number };
  error?: { message?: string };
  message?: string;
};

export function formatProviderErrorMessage(error: unknown, providerType: string): string {
  const e = error as HttpErrorLike | undefined;
  const status = e?.status ?? e?.response?.status;
  const apiMessage = e?.error?.message || e?.message;

  const defaultMessage = apiMessage || 'An unexpected error occurred';

  if (providerType !== 'openai-compatible') {
    return defaultMessage;
  }

  if (!status) {
    return defaultMessage;
  }

  switch (status) {
    case 400:
      return apiMessage ? `Bad request: ${apiMessage}` : 'Bad request';
    case 401:
      return 'Invalid API key or unauthorized access';
    case 402:
      return apiMessage ? `Insufficient balance: ${apiMessage}` : 'Insufficient balance';
    case 413:
      return apiMessage ? `Request too large: ${apiMessage}` : 'Request too large';
    case 422:
      return apiMessage ? `Invalid parameters: ${apiMessage}` : 'Invalid parameters';
    case 429:
      return 'Rate limit exceeded. Please try again later';
    case 500:
      return 'Server error. Please try again later';
    case 503:
      return 'Service is temporarily unavailable';
    default:
      return defaultMessage;
  }
}

/**
 * Generates a chat completion prompt for the commit message based on the provided diff.
 *
 * @param {string} diff - The diff string representing changes to be committed.
 * @param {string} additionalContext - Additional context for the changes.
 * @param {vscode.Uri} resourceUri - The optional repository URI used to resolve resource-scoped settings.
 * @returns {Promise<Array<{ role: string, content: string }>>} - A promise that resolves to an array of messages for the chat completion.
 */
const generateCommitMessageChatCompletionPrompt = async (
  diff: string,
  additionalContext?: string,
  resourceUri?: vscode.Uri
) => {
  const INIT_MESSAGES_PROMPT = await getMainCommitPrompt(resourceUri);
  const chatContextAsCompletionRequest = [...INIT_MESSAGES_PROMPT];

  if (additionalContext) {
    chatContextAsCompletionRequest.push({
      role: 'user',
      content: `Additional context for the changes. Use it only when it is consistent with the staged diff:\n${additionalContext}`
    });
  }

  chatContextAsCompletionRequest.push({
    role: 'user',
    content: diff
  });
  return chatContextAsCompletionRequest;
};

interface GenerateCommitMsgArg {
  rootUri?: vscode.Uri;
}

/**
 * Retrieves the repository associated with the provided argument.
 *
 * @param {GenerateCommitMsgArg} arg - The input argument containing the root URI of the repository.
 * @returns {Promise<GitExtensionRepository>} - A promise that resolves to the repository object.
 */
export async function getRepo(arg?: GenerateCommitMsgArg): Promise<GitExtensionRepository> {
  const gitApi = vscode.extensions.getExtension('vscode.git')?.exports.getAPI(1);
  if (!gitApi) {
    throw new Error('Git extension not found');
  }

  if (typeof arg === 'object' && arg.rootUri) {
    const resourceUri = arg.rootUri;
    const realResourcePath: string = fs.realpathSync(resourceUri!.fsPath);
    for (let i = 0; i < gitApi.repositories.length; i++) {
      const repo = gitApi.repositories[i];
      if (realResourcePath.startsWith(repo.rootUri.fsPath)) {
        return repo;
      }
    }
  }
  return gitApi.repositories[0];
}

/**
 * Generates a commit message based on the changes staged in the repository.
 *
 * @param {GenerateCommitMsgArg} arg - The input argument containing the root URI of the repository.
 * @returns {Promise<void>} - A promise that resolves when the commit message has been generated and set in the SCM input box.
 */
export async function generateCommitMsg(arg?: GenerateCommitMsgArg) {
  return ProgressHandler.withProgress('', async (progress) => {
    try {
      const configManager = ConfigurationManager.getInstance();
      const repo = await getRepo(arg);
      const resolvedProfile = await configManager.getActiveProviderProfile(repo.rootUri);

      progress.report({ message: 'Getting staged changes...' });
      const diff = await getDiffStaged(repo);

      logDebug(
        'Staged diff resolved',
        { diffLength: typeof diff === 'string' ? diff.length : null },
        repo.rootUri
      );

      const configMaxDiffChars = configManager.getConfig<number>(
        ConfigKeys.MAX_DIFF_CHARS,
        200000,
        repo.rootUri
      );

      if (!diff || diff === 'No changes staged.' || diff.trim().length < 20) {
        throw new Error('No changes staged for commit');
      }

      if (Number.isFinite(configMaxDiffChars) && diff.length > configMaxDiffChars) {
        throw new Error(
          `Staged diff is too large (${diff.length} chars). Please split the commit into smaller staged changes or increase commitflow.maxDiffChars.`
        );
      }

      const scmInputBox = repo.inputBox;
      if (!scmInputBox) {
        throw new Error('Unable to find the SCM input box');
      }

      const additionalContext = scmInputBox.value.trim();
      logDebug(
        'Commit generation context',
        {
          providerType: resolvedProfile.profile.type,
          profileName: resolvedProfile.profile.name,
          model: resolvedProfile.profile.model,
          baseURL: resolvedProfile.profile.baseURL
            ? (() => {
                try {
                  return new URL(resolvedProfile.profile.baseURL).origin;
                } catch {
                  return resolvedProfile.profile.baseURL;
                }
              })()
            : undefined,
          hasAdditionalContext: Boolean(additionalContext)
        },
        repo.rootUri
      );

      progress.report({
        message: additionalContext
          ? 'Analyzing changes with additional context...'
          : 'Analyzing changes...'
      });
      const messages = await generateCommitMessageChatCompletionPrompt(
        diff,
        additionalContext,
        repo.rootUri
      );
      logDebug(
        'Prepared model messages',
        { messageCount: messages.length, roles: messages.map((m) => (m as any).role) },
        repo.rootUri
      );

      progress.report({
        message: additionalContext
          ? 'Generating commit message with additional context...'
          : 'Generating commit message...'
      });
      try {
        let commitMessage: string | undefined;

        if (resolvedProfile.profile.type === 'gemini') {
          commitMessage = await GeminiAPI(messages as any[], repo.rootUri);
        } else {
          commitMessage = (await ChatGPTAPI(messages as any[], repo.rootUri)) ?? undefined;
        }


        if (commitMessage) {
          logDebug(
            'Commit message generated',
            { commitMessageLength: commitMessage.length },
            repo.rootUri
          );
          scmInputBox.value = commitMessage;
        } else {
          throw new Error('Failed to generate commit message');
        }
      } catch (err) {
        const errorMessage = formatProviderErrorMessage(err, resolvedProfile.profile.type);
        logDebug(
          'Provider request failed',
          { message: errorMessage },
          repo.rootUri
        );
        throw new Error(errorMessage);
      }
    } catch (error) {
      throw error;
    }
  });
}
