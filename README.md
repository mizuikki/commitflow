<a name="readme-top"></a>

<div align="center">

<img height="120" src="./images/logo.png" alt="AI Commit Plus logo">

<h1>AI Commit Plus</h1>

Generate Conventional Commit messages from staged Git diffs with OpenAI-compatible and Gemini APIs, right inside VS Code.

**English** · [简体中文](./README.zh_CN.md) · [Report Bug][github-issues-link] · [Request Feature][github-issues-link]

[![][github-release-shield]][github-release-link]
[![][github-downloads-shield]][github-downloads-link]
[![][github-contributors-shield]][github-contributors-link]
[![][github-stars-shield]][github-stars-link]
[![][github-issues-shield]][github-issues-link]
[![][github-license-shield]][github-license-link]

![](./aicommit.gif)

</div>

## Highlights

- **AI-powered commit messages** - send staged diffs to OpenAI, Azure OpenAI, DeepSeek, or Gemini and get back a ready-to-use Conventional Commit message.
- **Gitmoji or plain Conventional Commits** - switch between emoji-prefixed and plain formats with one click.
- **19 languages** - generate commit subjects and bodies in English, Chinese, Japanese, Korean, French, and more.
- **Per-repository overrides** - set a different language, prompt preset, or provider profile for individual repositories.
- **Provider Profiles** - save multiple API configurations and switch between them without editing settings by hand.
- **Secure API keys** - keys are stored in VS Code SecretStorage, never in settings.json.
- **Extra context from the SCM input** - type a hint in the Source Control message box before generating, and the AI will incorporate it.

## Installation

AI Commit Plus is currently distributed as a VSIX package through GitHub Releases. It is not published to the Visual Studio Marketplace.

1. Download the latest `.vsix` from [GitHub Releases][github-release-link].
2. Run `Extensions: Install from VSIX...` from the Command Palette.
3. Select the downloaded `ai-commit-plus-<version>.vsix`.

> Requires Node.js `24.14.1` or later for local development and packaging.

## Quick Start

1. Install the `.vsix` package from GitHub Releases and enable `AI Commit Plus`.
2. Run `Manage Provider Profiles` from the Command Palette (`Ctrl+Shift+P`).
3. Create a profile: pick a provider type (OpenAI-compatible or Gemini), enter a name, model, and API key.
4. Stage the files you want to commit.
5. (Optional) Type extra context in the Source Control message box.
6. Click the **AI Commit Plus** button in the Source Control title area.
7. Review the generated message and commit.

The status bar shows the current provider, language, and prompt preset. Click it to change any of them on the fly.

## Provider Profiles

Profiles let you save and switch between multiple AI provider configurations. Each profile stores the provider type, display name, base URL, model, temperature, and Azure API version, while the API key is kept in VS Code SecretStorage.

| Command | Description |
| :--- | :--- |
| `Manage Provider Profiles` | Create, edit, copy, delete, or activate profiles |
| `Switch Provider Profile` | Quick shortcut to the profile switcher |

Supported provider types:

- **OpenAI-compatible** - OpenAI, Azure OpenAI, DeepSeek, and any API that speaks the OpenAI chat-completions protocol.
- **Gemini** - Google Gemini models.

## Commands

| Command | Description |
| :--- | :--- |
| `AI Commit Plus` | Generate a commit message from staged changes (available in the SCM title bar) |
| `Manage Provider Profiles` | Add, edit, copy, or delete provider profiles |
| `Switch Provider Profile` | Change the active provider profile |
| `Show Available OpenAI Models` | Browse and pick a model from an OpenAI-compatible endpoint |
| `Set Commit Language for Current Repository` | Override the commit language for the current repository |
| `Set Prompt Preset for Current Repository` | Override the prompt preset (Gitmoji / plain / custom) for the current repository |

## Configuration

All settings live under the `ai-commit-plus.` prefix.

| Setting | Type | Default | Notes |
| :--- | :---: | :---: | :--- |
| `PROVIDER_PROFILES` | array | `[]` | Saved provider profiles; API keys are stored in SecretStorage |
| `ACTIVE_PROVIDER_PROFILE_ID` | string | `""` | Active profile ID; can be overridden per workspace or folder |
| `AI_COMMIT_LANGUAGE` | string | `English` | Commit message language (19 options); supports per-repo overrides |
| `PROMPT_PRESET` | string | `with-gitmoji` | `with-gitmoji`, `without-gitmoji`, or `custom`; supports per-repo overrides |
| `AI_COMMIT_SYSTEM_PROMPT` | string | `""` | Custom system prompt used when `PROMPT_PRESET` is `custom` |

## Repository-Level Overrides

You can override the commit language, prompt preset, and active provider profile for individual repositories. Overrides are stored as VS Code workspace or folder settings (typically in `.vscode/settings.json`).

Run these commands from the Command Palette when the target repository is open:

- `Set Commit Language for Current Repository`
- `Set Prompt Preset for Current Repository`
- `Manage Provider Profiles` -> pick a profile -> **Set for current workspace**

> If `.vscode/settings.json` is tracked by Git, the override will appear as a local change.

## Local Development

```bash
git clone https://github.com/mizuikki/ai-commit-plus.git
cd ai-commit-plus
npm install
```

Open the project in VS Code and press `F5` to launch an Extension Development Host.

You can also develop with GitHub Codespaces:

[![][github-codespace-shield]][github-codespace-link]

## Contributing

Issues and pull requests are welcome. Use [GitHub Issues][github-issues-link] for bugs, feature requests, and discussion.

[![][pr-welcome-shield]][pr-welcome-link]

### Contributors

[![][github-contrib-shield]][github-contrib-link]

## Project History

AI Commit Plus began as a fork of [Sitoi/ai-commit](https://github.com/Sitoi/ai-commit) and has since evolved with independent branding, Provider Profiles, per-repository overrides, Gemini support, and a combined status bar.

## Credits

- **auto-commit** - <https://github.com/lynxife/auto-commit>
- **opencommit** - <https://github.com/di-sukharev/opencommit>

## License

This project is [MIT](./license) licensed.

[github-codespace-link]: https://codespaces.new/mizuikki/ai-commit-plus
[github-codespace-shield]: https://github.com/mizuikki/ai-commit-plus/blob/main/images/codespaces.png?raw=true
[github-contributors-link]: https://github.com/mizuikki/ai-commit-plus/graphs/contributors
[github-contributors-shield]: https://img.shields.io/github/contributors/mizuikki/ai-commit-plus?color=c4f042&labelColor=black&style=flat-square
[github-downloads-link]: https://github.com/mizuikki/ai-commit-plus/releases
[github-downloads-shield]: https://img.shields.io/github/downloads/mizuikki/ai-commit-plus/total?label=downloads&labelColor=black&style=flat-square
[github-issues-link]: https://github.com/mizuikki/ai-commit-plus/issues
[github-issues-shield]: https://img.shields.io/github/issues/mizuikki/ai-commit-plus?color=ff80eb&labelColor=black&style=flat-square
[github-license-link]: https://github.com/mizuikki/ai-commit-plus/blob/main/license
[github-license-shield]: https://img.shields.io/github/license/mizuikki/ai-commit-plus?color=white&labelColor=black&style=flat-square
[github-release-link]: https://github.com/mizuikki/ai-commit-plus/releases
[github-release-shield]: https://img.shields.io/github/v/release/mizuikki/ai-commit-plus?display_name=tag&label=release&color=blue&labelColor=black&style=flat-square
[github-stars-link]: https://github.com/mizuikki/ai-commit-plus/stargazers
[github-stars-shield]: https://img.shields.io/github/stars/mizuikki/ai-commit-plus?color=ffcb47&labelColor=black&style=flat-square
[pr-welcome-link]: https://github.com/mizuikki/ai-commit-plus/pulls
[pr-welcome-shield]: https://img.shields.io/badge/PRs-welcome-ffcb47?labelColor=black&style=for-the-badge
[github-contrib-link]: https://github.com/mizuikki/ai-commit-plus/graphs/contributors
[github-contrib-shield]: https://contrib.rocks/image?repo=mizuikki%2Fai-commit-plus
