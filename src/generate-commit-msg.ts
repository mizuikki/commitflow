import * as fs from 'fs-extra';
import * as vscode from 'vscode';
import { ConfigKeys, ConfigurationManager } from './config';
import { getDiffStaged, GitExtensionRepository } from './git-utils';
import { OpenAIChatAPI } from './openai-utils';
import { getMainCommitPrompt } from './prompts';
import { ProgressHandler } from './utils';
import { GeminiAPI } from './gemini-utils';
import { AnthropicAPI } from './anthropic-utils';
import { logDebug } from './logger';
import { formatProviderErrorMessage } from './provider-error-utils';
import { beginCommitGeneration, endCommitGeneration } from './runtime-state';

export { formatProviderErrorMessage } from './provider-error-utils';

async function generateWithProvider(
  resolvedProfile: Awaited<ReturnType<ConfigurationManager['getActiveProviderProfile']>>,
  messages: any[],
  resourceUri: vscode.Uri
) {
  switch (resolvedProfile.profile.driverKind) {
    case 'gemini':
      return GeminiAPI(messages, resolvedProfile, resourceUri);
    case 'anthropic':
      return AnthropicAPI(messages, resolvedProfile, resourceUri);
    case 'openai':
    case 'azure-openai':
      return OpenAIChatAPI(messages, resolvedProfile, resourceUri);
    default:
      throw new Error(`Unsupported provider driver: ${resolvedProfile.profile.driverKind}`);
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
    // Keep the staged diff as the primary source of truth and append the SCM input as
    // optional user context only when it exists.
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
    // Resolve symlinks before matching so nested workspaces map to the correct Git repo.
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
  beginCommitGeneration();
  void vscode.commands.executeCommand('commitflow.refreshStatusBar');

  try {
    return await ProgressHandler.withProgress('', async (progress) => {
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
          providerId: resolvedProfile.profile.providerId,
          driverKind: resolvedProfile.profile.driverKind,
          profileName: resolvedProfile.profile.name,
          model: resolvedProfile.profile.model,
          baseURL: resolvedProfile.profile.connection?.baseURL
            ? (() => {
                try {
                  return new URL(resolvedProfile.profile.connection.baseURL).origin;
                } catch {
                  return resolvedProfile.profile.connection?.baseURL;
                }
              })()
            : undefined,
          endpoint: resolvedProfile.profile.connection?.endpoint,
          deployment: resolvedProfile.profile.connection?.deployment,
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
        const commitMessage = (await generateWithProvider(
          resolvedProfile,
          messages as any[],
          repo.rootUri
        )) ?? undefined;

        if (!commitMessage) {
          throw new Error('Failed to generate commit message');
        }

        logDebug(
          'Commit message generated',
          { commitMessageLength: commitMessage.length },
          repo.rootUri
        );
        scmInputBox.value = commitMessage;
      } catch (err) {
        const errorMessage = formatProviderErrorMessage(err, resolvedProfile.profile.driverKind);
        logDebug(
          'Provider request failed',
          { message: errorMessage },
          repo.rootUri
        );
        throw new Error(errorMessage);
      }
    });
  } finally {
    endCommitGeneration();
    void vscode.commands.executeCommand('commitflow.refreshStatusBar');
  }
}
