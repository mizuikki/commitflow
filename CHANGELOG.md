# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.7] - 2026-05-27

### Added
- `ai-commit-plus.DEBUG_LOGGING` setting to emit troubleshooting logs to the **AI Commit Plus** Output channel.
- `ai-commit-plus.MAX_DIFF_CHARS` setting to prevent sending oversized staged diffs to provider APIs.
- Preflight validation + sanitization for OpenAI-compatible `messages` payloads (forces `content` to plain text).

### Fixed
- Improve OpenAI-compatible provider error messages by extracting API error details and mapping common HTTP status codes.
- Avoid DeepSeek/OpenAI-compatible 400 errors caused by `content` parts arrays by coercing them into a string.
- Improve staged diff retrieval by supporting both `diffIndexWithHEAD` and `diffIndexWithHead`, and falling back to `git diff --staged` when needed.

[Unreleased]: https://github.com/mizuikki/ai-commit-plus/compare/v0.3.7...HEAD
[0.3.7]: https://github.com/mizuikki/ai-commit-plus/compare/v0.3.6...v0.3.7
