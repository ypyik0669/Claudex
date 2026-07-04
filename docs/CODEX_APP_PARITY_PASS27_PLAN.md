# Claudex Codex App Parity Pass 27 Plan

## Goal

Make Claudex behave less like a polished prototype and more like a usable Codex App-style desktop agent:

- Calm default chat surface.
- Settings as a real multi-category management screen.
- Plugins, MCPs, Skills, and Marketplace as a searchable management screen.
- Right-side context panel for environment, outputs, changes, workspace, browser, terminal, and Claude Code.
- Claude Code CLI remains the primary runtime; Direct API is an explicit mode.
- Testing and runtime checks use Sonnet 4.5, not Sonnet 5.

## Current Evidence

Current packaged app inspected with Computer Use:

- Running executable: `release-pass26/win-unpacked/Claudex.exe`.
- Default screen is calmer than earlier screenshots.
- Composer shows project, permissions, `Claude Code`, and `Sonnet 4.5`.
- Tools panel can open on the right and Workspace is now single-column.

## Remaining UX Gaps

### 1. Settings Is Still Too Small

Codex App settings is a full management area with a left category rail and dense content. Claudex still uses a modal, so it feels like a form instead of an app-level control center.

Fix:

- Convert settings into a full-screen overlay.
- Add Codex-like categories:
  - General
  - Appearance
  - Configuration
  - Personalization
  - Keyboard shortcuts
  - MCP servers
  - Browser
  - Computer use
  - Hooks
  - Connections
  - Git
  - Environments
  - Worktrees
  - Archived chats
- Only real backed controls are editable.
- Unimplemented categories show an honest inactive state, not fake controls.

### 2. Plugins/Skills Needs A Real Management Page

The current capabilities modal is useful but not Codex-like. The target needs searchable tabs for Plugins, MCPs, Skills, and Marketplace, plus enable/disable state.

Fix:

- Replace the small capabilities modal with a full-screen management overlay.
- Tabs:
  - Plugins
  - MCPs
  - Skills
  - Marketplace
- Keep local capability toggles working.
- Use real Claude Code plugin commands from the right panel for install/update/disable.
- If marketplace cannot be parsed, show the raw command output in CLI style.

### 3. Left Bottom Profile Should Not Look Like Login

Claude Code CLI is not a profile-login product. The left bottom area should show local runtime/account status, not a consumer account menu.

Fix:

- Rename status to `Claude Code`.
- Show `Local runtime`.
- Keep the settings gear.
- Do not show email, plan, upgrade, or logout UI.

### 4. Right Panel Needs Codex Context Buckets

The right panel currently has useful tools, but the Codex App reference groups environment, changes, subagents, sources, outputs, and tool panels.

Fix:

- Add an Environment summary at the top.
- Include:
  - Runtime/auth/model/project.
  - Local changes placeholder until git plumbing exists.
  - Outputs placeholder from session attachments/artifacts.
  - Sources placeholder.
- Keep Workspace, Claude Code, Browser, and Terminal as expandable tools.

### 5. Model Testing Must Stay Sonnet 4.5

The user explicitly asked not to test with Sonnet 5.

Fix:

- Verify all tests and docs reference `claude-sonnet-4-5-20250929`.
- Treat `sonnet-5` only as stale config rejection text.

## Pass 27 Implementation Order

1. Add full-screen settings overlay shell.
2. Add full-screen plugins/skills manager overlay.
3. Rewire sidebar Plugins utility to the manager, not the old tiny modal.
4. Keep the composer permissions button opening the same manager.
5. Replace left-bottom account row with local Claude Code runtime row.
6. Add right-panel environment buckets.
7. Build and run targeted visual/behavior checks.
8. Repackage to `release-pass27`.

## Acceptance Checks

- Default screen remains calm with the right panel closed.
- Settings opens as a full app-level screen with category rail.
- General settings exposes real runtime controls.
- Direct API controls remain disabled unless Direct API mode is selected.
- Plugins manager opens as a full app-level screen.
- Plugins, MCPs, Skills, and Marketplace tabs exist and are searchable.
- Capability toggles still persist through Electron.
- Left bottom no longer implies email/login/upgrade/logout.
- Right panel shows environment-style context before tool rows.
- No Sonnet 5 testing path is introduced.
- `npm run build` passes.
- `claude --bare -p "Reply exactly OK." --model claude-sonnet-4-5-20250929` passes if the local Claude CLI account is available.

