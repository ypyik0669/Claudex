# Claudex Codex App Behavior Parity Plan

## Goal

Make Claudex feel like a compact Codex App-style desktop agent, while preserving real Claude Code CLI behavior. The app must not be a static UI shell: every visible control is either backed by local state/CLI/Electron APIs, disabled with a reason, or routed to the real Claude Code TUI.

## Current Audit

### Verified Current Strengths

- Electron desktop API exists for settings, chat sessions, Claude Code streaming, workspace files, command execution, browser opening, terminal opening, and plugin commands.
- Default model is `claude-sonnet-4-5-20250929`, displayed as Sonnet 4.5.
- `.env` can set `ANTHROPIC_BASE_URL` and `ANTHROPIC_MODEL` for a user's own provider.
- Workspace file editing already has a diff review gate before save.
- Claude Code panel can run auth, plugin, marketplace, MCP, doctor, and arbitrary Claude commands.

### UX Gaps Against Codex App References

1. Sidebar navigation was incomplete.
   - Scheduled and Plugins were hidden as bottom icon buttons instead of first-class sidebar rows.
   - Bottom profile looked like an account login surface, which conflicts with Claude Code CLI being local runtime driven.

2. Right panel behavior was too hidden.
   - The panel defaulted closed.
   - The right side was named Tools, not Environment/Outputs-style context.
   - Git branch, local environment, changes, sources, and subagent placeholders were missing.

3. Settings information architecture was too generic.
   - Settings opened as one stacked form.
   - Codex-style categories were missing.
   - Stubbed categories were not visible, making the app feel smaller than the requested Codex behavior.

4. Plugins/skills management felt like a demo grid.
   - Plugins, MCPs, Skills, and Marketplace were not separated into tabs.
   - Marketplace state was not clearly described as Claude Code CLI-backed.

5. Main workspace controls were not Codex-like enough.
   - When the right panel was closed, the top-right context controls were too minimal.
   - IDE selection/opening was missing.
   - The empty state was sparse and too dashboard-like in the browser preview.

6. Typography was not fully appropriate for coding-agent output.
   - Assistant message body used a serif stack, which feels wrong for code and CLI-heavy conversations.

## Behavior Targets

### Shell

- Left sidebar has New chat, Search, Scheduled, Plugins, Projects, Chats.
- Bottom left shows local Claude Code runtime, not a login profile.
- Right panel defaults open as Environment.
- If right panel is closed, top-right still exposes Environment and Outputs.
- Top-right includes IDE open/select when a supported IDE command is detected.

### Settings

- Settings uses left navigation categories matching Codex App:
  - General, Profile, Appearance, Configuration, Personalization, MCP servers, Browser, Computer use, Hooks, Connections, Git, Environments, Worktrees, Archived chats.
- General contains real backed controls:
  - Language, execution mode, permission mode, Claude model, Claude command, timeout, Direct API provider/model/base URL/API key, temperature, system prompt, storage.
- Non-backed categories show `Not implemented yet` with a clear reason. No fake controls.

### Plugins, Skills, Marketplace

- Modal uses tabs:
  - Plugins
  - MCPs
  - Skills
  - Marketplace
- Installed local capabilities can be toggled.
- Marketplace is clearly described as Claude Code CLI-backed.
- Live plugin marketplace output remains in the Claude Code panel until a direct marketplace API is implemented.

### Environment Panel

- Shows project, local path, Git availability, branch, change count, and IDE actions.
- Shows subagents and sources sections without fake data.
- Keeps Workspace, Claude Code, Browser, Terminal tool rows below environment context.

### Model Testing

- Test with Sonnet 4.5 only.
- Do not use Sonnet 5 names or aliases.
- Preferred Claude model ID: `claude-sonnet-4-5-20250929`.

## Implementation Slices

### Slice 1 - Shell Parity

- Add Scheduled and Plugins to sidebar nav.
- Remove login-like bottom profile and replace with local Claude Code runtime.
- Default right panel open.
- Add top-right Environment/Outputs/IDE controls.

### Slice 2 - Environment Truthfulness

- Add Electron IPC:
  - `app:get-environment`
  - `app:list-ide-options`
  - `app:open-ide`
- Detect VS Code, Cursor, and Windsurf from PATH.
- Read Git branch and changed-file count with `git status --short --branch`.

### Slice 3 - Settings IA

- Add Codex-like settings sidebar.
- Keep real controls in General.
- Render honest stubs for inactive categories.

### Slice 4 - Plugins/Skills IA

- Replace capability grid with tabs.
- Separate Plugins, MCPs, Skills, Marketplace.
- Keep toggles local and persistent.
- Route live Claude Code plugin operations through the Claude Code panel.

### Slice 5 - Visual Density

- Smaller base font.
- Sans message body.
- Compact side nav rows.
- Right panel rows stay dense and inspectable.

## Verification Checklist

- `node --check electron/main.cjs`
- `node --check electron/preload.cjs`
- `npm run build`
- Electron screenshot at 1920x1080:
  - Home
  - Environment panel open
  - Settings General
  - Plugins/Skills modal
- Runtime checks:
  - Right panel opens by default.
  - Scheduled and Plugins are visible in sidebar.
  - Settings categories switch.
  - Plugins, Skills, Marketplace tabs switch.
  - Environment panel shows project and Git state.
  - IDE button opens detected IDE or falls back to folder open.

## Known Boundaries

- Claude Code native permission prompts and slash-command pickers still require Interactive Claude.
- Marketplace live search is not yet embedded directly in the modal; the Claude Code panel can run the real marketplace command.
- Commit/push UI currently reports Git availability and routes the user to workspace/terminal rather than performing commits from a fake control.
