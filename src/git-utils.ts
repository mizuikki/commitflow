import simpleGit from 'simple-git';
import * as vscode from 'vscode';
import { logDebug } from './logger';

// Built-in Git extension Repository interface (only the fields we need).
// Not in @types/vscode — the Git extension exports this internally.
export interface GitExtensionRepository {
  rootUri: vscode.Uri;
  inputBox: vscode.SourceControlInputBox;
  diffIndexWithHEAD?(): Promise<string>;
}

export async function getDiffStaged(repo: GitExtensionRepository): Promise<string> {
  try {
    const rootPath =
      repo?.rootUri?.fsPath || vscode.workspace.workspaceFolders?.[0].uri.fsPath;

    if (!rootPath) {
      throw new Error('No workspace folder found');
    }

    // Prefer the built-in Git extension API when available, but only if it returns a diff string.
    // In some VS Code versions, diffIndexWithHead/HEAD may return a list of changes instead of the raw diff.
    const diffFn =
      typeof (repo as any).diffIndexWithHEAD === 'function'
        ? (repo as any).diffIndexWithHEAD
        : typeof (repo as any).diffIndexWithHead === 'function'
          ? (repo as any).diffIndexWithHead
          : undefined;

    if (diffFn) {
      const candidate = await diffFn.call(repo);
      logDebug(
        'Git extension diffIndexWithHead/HEAD result',
        {
          type: typeof candidate,
          length: typeof candidate === 'string' ? candidate.length : undefined
        },
        repo.rootUri
      );
      if (typeof candidate === 'string') {
        return candidate || 'No changes staged.';
      }
    }

    // Fallback: simple-git
    logDebug('Falling back to simple-git diff --staged', undefined, repo.rootUri);
    const git = simpleGit(rootPath);
    const diff = await git.diff(['--staged']);

    return diff || 'No changes staged.';
  } catch (error) {
    throw new Error(`Failed to get staged changes: ${error instanceof Error ? error.message : String(error)}`);
  }
}
