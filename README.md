<div align="center">

<img height="120" src="./images/logo-readme.png" alt="CommitFlow logo">

# CommitFlow

Turn staged Git diffs into clear Conventional Commit messages from inside VS Code.

[Releases][github-release-link] · [Issues][github-issues-link]

[![][github-release-shield]][github-release-link]
[![][github-downloads-shield]][github-downloads-link]
[![][github-license-shield]][github-license-link]
[![][github-stars-shield]][github-stars-link]
[![][github-issues-shield]][github-issues-link]

</div>

## Why CommitFlow

CommitFlow helps you move from staged changes to a reviewable commit message without leaving the Source Control view. It reads the staged diff, combines it with optional context from the SCM input box, and writes back a Conventional Commit message that you can edit before committing.

Workflow:

```text
Stage changes -> optionally type a hint in the SCM input -> click CommitFlow -> review the commit message
```

## Features

- Generate Conventional Commit messages from staged Git diffs.
- Use OpenAI-compatible providers, including OpenAI, Azure OpenAI, DeepSeek, and compatible gateways.
- Use Google Gemini providers.
- Store API keys in VS Code SecretStorage.
- Manage multiple provider profiles and switch between them quickly.
- Override language, prompt preset, and active provider per repository.
- Choose plain Conventional Commits or Gitmoji prefix/suffix output.
- Limit oversized staged diffs before they are sent to the provider.
- Enable debug logging when troubleshooting provider requests.

## Installation

CommitFlow is distributed as a VSIX package through GitHub Releases. It is not published to the Visual Studio Marketplace yet.

1. Download the latest `commitflow-<version>.vsix` from [GitHub Releases][github-release-link].
2. Open the VS Code Command Palette.
3. Run `Extensions: Install from VSIX...`.
4. Select the downloaded VSIX file.

## Quick Start

1. Install and enable CommitFlow.
2. Run `Manage Provider Profiles`.
3. Create a provider profile with a model and API key.
4. Stage the files you want to commit.
5. Optionally type extra context in the Source Control message box.
6. Click `CommitFlow` in the Source Control title bar.
7. Review and edit the generated commit message before committing.

## Providers

CommitFlow supports two provider types:

| Provider Type | Use For |
| :--- | :--- |
| `OpenAI-compatible` | OpenAI, Azure OpenAI, DeepSeek, or compatible chat-completions APIs |
| `Gemini` | Google Gemini models |

Provider profiles store the provider type, name, model, temperature, base URL, and Azure API version. API keys are stored separately in VS Code SecretStorage.

## Commands

| Command | Description |
| :--- | :--- |
| `CommitFlow` | Generate a commit message from staged changes |
| `Manage Provider Profiles` | Create, edit, copy, delete, activate, or set repository-specific profiles |
| `Switch Provider Profile` | Quickly switch the active profile |
| `Show Available OpenAI Models` | Load and select models from an OpenAI-compatible endpoint |
| `Set Commit Language for Current Repository` | Override commit message language for the current repository |
| `Set Prompt Preset for Current Repository` | Override Gitmoji prefix, Gitmoji suffix, plain, or custom prompt behavior |

## Settings

All settings use the `commitflow.` namespace.

| Setting | Default | Description |
| :--- | :--- | :--- |
| `commitLanguage` | `English` | Commit message language |
| `promptPreset` | `without-gitmoji` | `gitmoji-prefix`, `gitmoji-suffix`, `without-gitmoji`, or `custom` |
| `systemPrompt` | `""` | Full custom system prompt used when `promptPreset` is `custom` |
| `providerProfiles` | `[]` | Saved provider profiles |
| `activeProviderProfileId` | `""` | Active provider profile, with repository-level overrides |
| `debugLogging` | `false` | Write troubleshooting logs to the CommitFlow output channel |
| `maxDiffChars` | `200000` | Maximum staged diff length sent to the provider |

## Migration

CommitFlow is the independent successor to AI Commit Plus. On first launch, it copies existing `ai-commit-plus.*` settings into the new `commitflow.*` namespace when the new setting is not already configured. Existing provider profile API keys remain usable because SecretStorage keys are preserved.

## Development

```bash
git clone https://github.com/mizuikki/commitflow.git
cd commitflow
npm install
npm run compile
npm test
```

Useful commands:

| Command | Description |
| :--- | :--- |
| `npm run lint` | Run ESLint |
| `npm run compile` | Build the extension bundle |
| `npm test` | Run the VS Code extension test suite |
| `npm run package` | Build a versioned VSIX into `artifacts/` |

## Attribution

CommitFlow originated from AI Commit Plus, which was derived from [Sitoi/ai-commit](https://github.com/Sitoi/ai-commit). CommitFlow is independently maintained after the `v0.3.8` baseline and no longer tracks upstream changes.

## License

CommitFlow is licensed under the [MIT License](./LICENSE). See [NOTICE](./NOTICE) for source attribution.

[github-downloads-link]: https://github.com/mizuikki/commitflow/releases
[github-downloads-shield]: https://img.shields.io/github/downloads/mizuikki/commitflow/total?label=downloads&labelColor=black&style=flat-square
[github-issues-link]: https://github.com/mizuikki/commitflow/issues
[github-issues-shield]: https://img.shields.io/github/issues/mizuikki/commitflow?color=ff80eb&labelColor=black&style=flat-square
[github-license-link]: https://github.com/mizuikki/commitflow/blob/main/LICENSE
[github-license-shield]: https://img.shields.io/github/license/mizuikki/commitflow?color=white&labelColor=black&style=flat-square
[github-release-link]: https://github.com/mizuikki/commitflow/releases
[github-release-shield]: https://img.shields.io/github/v/release/mizuikki/commitflow?display_name=tag&label=release&color=blue&labelColor=black&style=flat-square
[github-stars-link]: https://github.com/mizuikki/commitflow/stargazers
[github-stars-shield]: https://img.shields.io/github/stars/mizuikki/commitflow?color=ffcb47&labelColor=black&style=flat-square
