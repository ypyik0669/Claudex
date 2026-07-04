# Claudex

Claudex is a desktop coding-agent app for Claude Code CLI. It provides a calm Codex-style workspace with local projects, chat sessions, Claude Code streaming, workspace tools, plugin/MCP management, Settings, and English/Chinese UI.

## Download

Go to the latest GitHub Release and download the build for your operating system:

- Windows: `Claudex-0.1.0.exe` installer or Windows `.zip`
- macOS: `.dmg` installer or macOS `.zip`

macOS preview builds are unsigned, so Gatekeeper may require manual approval the first time you open the app.

## Requirements

- Windows 10/11 or macOS
- Claude Code CLI installed and authenticated for Claude Code mode
- Internet access for Claude Code or direct API providers

Claude Code setup:

```bash
claude --version
claude auth login
```

Direct API mode can also be configured inside Settings with an OpenAI-compatible, Anthropic, or Ollama endpoint.

## Features

- Codex-inspired desktop shell with left project/chat navigation and a focused composer
- Right-side Tools panel for workspace files, Claude Code commands, browser preview, terminal, and environment state
- Bottom context panel for outputs, environment, changes, sources, and subagents
- Settings for Claude Code mode, direct API mode, models, base URLs, permissions, language, and font size
- Plugins, skills, MCP, and marketplace management surfaces
- Local chat/project persistence
- English and Chinese interface support

## Development

```bash
npm install
npm run dev
npm run build
npm run desktop
```

Package locally:

```bash
npm run dist:win
npm run dist:mac
```

The macOS package command must run on macOS. The release workflow builds Windows on `windows-latest` and macOS on `macos-latest`.

## Release

Releases are created by pushing a version tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

GitHub Actions then builds Windows and macOS assets and uploads them to the GitHub Release.

## Security

- Do not commit `.env` or real API keys.
- Release packages do not bundle local API keys.
- API keys entered in the app are stored locally with Electron safeStorage when available.

## Repository Layout

```text
src/                 React UI
electron/            Electron main/preload process
build/               App icons and packaging assets
docs/                Design and implementation notes
qa/                  Local smoke-test scripts
.github/workflows/   Release automation
```

## License

No license has been selected yet.
