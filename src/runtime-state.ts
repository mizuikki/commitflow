let commitGenerationDepth = 0;

export function beginCommitGeneration(): void {
  commitGenerationDepth += 1;
}

export function endCommitGeneration(): void {
  commitGenerationDepth = Math.max(0, commitGenerationDepth - 1);
}

export function isCommitGenerationInProgress(): boolean {
  return commitGenerationDepth > 0;
}

