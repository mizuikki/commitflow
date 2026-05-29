import * as path from 'path';
import { runTests } from '@vscode/test-electron';

const VSCODE_TEST_VERSION = '1.121.0';
const VSCODE_DOWNLOAD_TIMEOUT_MS = 120_000;

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    await runTests({
      version: VSCODE_TEST_VERSION,
      timeout: VSCODE_DOWNLOAD_TIMEOUT_MS,
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: ['--disable-extensions']
    });
  } catch (err) {
    console.error('Failed to run tests:', err);
    process.exit(1);
  }
}

main();
