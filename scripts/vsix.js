#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

/**
 * Reads the extension package metadata used to name VSIX artifacts.
 *
 * @returns {{ name: string, version: string }} The extension name and version from package.json.
 * @throws {Error} Throws when package.json cannot be read or is missing required fields.
 * @sideEffects Reads package.json from disk.
 */
function getPackageMetadata() {
  const packageJsonPath = path.resolve(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  if (!packageJson.name || !packageJson.version) {
    throw new Error('package.json must define both "name" and "version".');
  }

  return {
    name: packageJson.name,
    version: packageJson.version
  };
}

/**
 * Returns the versioned VSIX output path for the current package version.
 *
 * @returns {string} Absolute path to the versioned VSIX artifact.
 * @throws {Error} Throws when package metadata is invalid.
 * @sideEffects None.
 */
function getVsixPath() {
  const { name, version } = getPackageMetadata();
  return path.resolve(__dirname, '..', 'artifacts', `${name}-${version}.vsix`);
}

/**
 * Ensures the VSIX output directory exists before packaging.
 *
 * @returns {void} Nothing.
 * @throws {Error} Throws when the output directory cannot be created.
 * @sideEffects Creates the artifacts directory on disk when needed.
 */
function ensureArtifactsDirectory() {
  fs.mkdirSync(path.dirname(getVsixPath()), { recursive: true });
}

/**
 * Runs the local vsce CLI with the provided arguments.
 *
 * @param {string[]} args - Arguments passed to the vsce executable.
 * @returns {void} Nothing.
 * @throws {Error} Throws when vsce exits with a non-zero status or cannot be started.
 * @sideEffects Spawns the vsce CLI and forwards stdio to the current terminal.
 */
function runVsce(args) {
  const vsceCommand = process.platform === 'win32' ? 'vsce.cmd' : 'vsce';
  const result = spawnSync(vsceCommand, args, {
    stdio: 'inherit'
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`vsce exited with status ${result.status}.`);
  }
}

/**
 * Runs the VS Code CLI with the provided arguments.
 *
 * @param {string[]} args - Arguments passed to the code executable.
 * @returns {void} Nothing.
 * @throws {Error} Throws when code exits with a non-zero status or cannot be started.
 * @sideEffects Spawns the VS Code CLI and forwards stdio to the current terminal.
 */
function runCode(args) {
  const codeCommand = process.platform === 'win32' ? 'code.cmd' : 'code';
  const result = spawnSync(codeCommand, args, {
    stdio: 'inherit'
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`code exited with status ${result.status}.`);
  }
}

/**
 * Packages the extension into a versioned VSIX artifact.
 *
 * @returns {void} Nothing.
 * @throws {Error} Throws when packaging fails.
 * @sideEffects Creates the artifacts directory and writes the VSIX file to disk.
 */
function packageVsix() {
  ensureArtifactsDirectory();
  runVsce(['package', '--no-dependencies', '--out', getVsixPath()]);
}

/**
 * Publishes the already packaged versioned VSIX artifact.
 *
 * @returns {void} Nothing.
 * @throws {Error} Throws when publishing fails.
 * @sideEffects Invokes vsce publish for the computed VSIX artifact path.
 */
function publishVsix() {
  runVsce(['publish', '--packagePath', getVsixPath()]);
}

/**
 * Installs the already packaged versioned VSIX artifact into the local VS Code.
 *
 * @param {boolean} force - Whether to force overwrite an existing installation.
 * @returns {void} Nothing.
 * @throws {Error} Throws when the VSIX artifact is missing or installation fails.
 * @sideEffects Invokes the VS Code CLI to install the computed VSIX artifact.
 */
function installVsix(force) {
  const vsixPath = getVsixPath();

  if (!fs.existsSync(vsixPath)) {
    throw new Error(`VSIX not found at ${vsixPath}. Run "npm run package" first.`);
  }

  runCode(['--install-extension', vsixPath, ...(force ? ['--force'] : [])]);
}

/**
 * Executes the requested VSIX helper command.
 *
 * @returns {void} Nothing.
 * @throws {Error} Throws when the command is unknown or execution fails.
 * @sideEffects May print to stdout, create directories, or invoke vsce.
 */
function main() {
  const command = process.argv[2];
  const force = process.argv.includes('--force');

  switch (command) {
    case 'path':
      process.stdout.write(getVsixPath());
      break;
    case 'package':
      packageVsix();
      break;
    case 'publish':
      publishVsix();
      break;
    case 'install':
      installVsix(force);
      break;
    default:
      throw new Error('Usage: node scripts/vsix.js <path|package|publish|install> [--force]');
  }
}

main();
