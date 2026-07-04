# Claudex Codex App UI/UX Rebuild Spec

## 0. Purpose

This document is the complete planning artifact for rebuilding Claudex so it behaves and feels like the observable Codex desktop app, not like a generic web dashboard or a static UI shell.

The next implementation should not start by editing visuals. It should first use this spec as the source of truth, then execute in small verified slices.

## 1. Product Target

### 1.1 Goal

Claudex should become a desktop coding-agent app that closely matches the observable Codex App experience:

- Dark, compact, three-panel desktop shell.
- One focused composer-first work surface.
- Real project context, real Claude Code execution, real workspace tools.
- Complete state handling for empty, loading, streaming, success, error, disabled, and permission-limited states.
- No fake controls, placeholder panels, or decorative feature cards.
- Direct escape hatch to the real Claude Code TUI when a flow cannot be faithfully reproduced in non-interactive mode.

### 1.2 Non-goals

- Do not copy private OpenAI implementation internals.
- Do not claim full native Codex parity where only visible behavior is implemented.
- Do not turn Claudex into a marketing page, SaaS dashboard, or settings-heavy admin console.
- Do not add broad abstractions before the current UX is stable.
- Do not fake permission prompts, patch approval, plugin installation, browser control, or terminal output.

### 1.3 Product Standard

The product is acceptable only when:

- A user can open the packaged `.exe` and do real work without reading docs first.
- The opening screen looks calm, simple, and close to the Codex App screenshots.
- Every visible control either works or is clearly disabled with an explanation.
- Every destructive or file-changing action has a review path.
- Runtime status is visible before, during, and after long-running actions.
- Visual QA passes against reference screenshots at desktop and narrow widths.

## 2. Source Of Truth

### 2.1 Reference screenshots

Use these as the visual and interaction references:

- User-provided Codex App screenshots from July 3, 2026.
- Current Claudex screenshot showing the failed state:
  - Window too visibly separate from Codex App.
  - Sidebar has awkward density and spacing.
  - Main composer is oversized and generic.
  - Right panel is centered too low and feels like a demo card stack.
  - UX states are incomplete.

### 2.2 Current implementation location

Project root:

```text
C:\Users\YPY\Documents\Codex\2026-07-03\claude-code-tui-plugins-skills-tools-4\outputs\claude-code-app
```

Key files today:

```text
src\App.jsx
src\styles.css
electron\main.cjs
electron\preload.cjs
package.json
使用说明.md
design-qa.md
AGENTS.md
```

### 2.3 Existing verified runtime facts

- React + Vite + Electron.
- Real desktop API is exposed through `window.claudexDesktop`.
- Claude Code CLI exists locally as `2.1.199 (Claude Code)`.
- `claude plugin list` works when using the app's Windows command candidate resolution.
- `workspace:read-file`, `workspace:save-file`, and `workspace:run-command` are available through Electron.
- Default `release\win-unpacked` may be locked while Claudex is open; use `release-ux` or close running Claudex before packaging.

## 3. Guiding Principles

### 3.1 Codex-like, not dashboard-like

Use desktop product density:

- Small rows.
- Minimal cards.
- Thin dividers.
- Compact typography.
- Calm empty states.
- Controls hidden until relevant.

Avoid:

- Big dashboard cards.
- Centered marketing copy.
- Loud badges.
- Decorative gradients.
- Fake metrics.
- Multi-color icon grids.

### 3.2 Real UX over UI polish

Every screen must answer:

- What can the user do now?
- What is selected?
- What is running?
- What changed?
- What failed?
- What is safe to click?
- What requires the real Claude Code TUI?

### 3.3 One primary action per region

- Sidebar primary action: New chat.
- Main region primary action: Send task.
- Right panel primary action: Contextual tool action.
- Modal primary action: Save or run.

### 3.4 No silent mode switches

The user must always know whether Claudex is using:

- Claude Code CLI mode.
- Direct API mode.
- Browser preview mode without desktop APIs.
- Real packaged desktop mode.

### 3.5 State before features

Do not add another feature until existing feature states are complete:

- Empty.
- Loading.
- Streaming.
- Success.
- Error.
- Disabled.
- Permission-limited.

## 4. Information Architecture

## 4.1 App shell

The top-level app has five persistent zones:

```text
┌─────────────────────────────────────────────────────────────┐
│ Window chrome                                                │
├───────────────┬────────────────────────┬────────────────────┤
│ Sidebar       │ Conversation workspace │ Context panel       │
│               │                        │                    │
├───────────────┴────────────────────────┴────────────────────┤
│ Optional bottom terminal/browser panel                       │
└─────────────────────────────────────────────────────────────┘
```

### Shell responsibilities

- Own global layout.
- Own selected project.
- Own selected session.
- Own active contextual panel.
- Own modal stack.
- Own command palette.
- Own desktop/browser environment warning.

### Shell must not

- Own workspace file edit state.
- Own Claude command output state.
- Own provider form internals.
- Contain giant nested JSX for every feature.

## 4.2 Navigation hierarchy

Sidebar sections:

1. Primary nav
   - New chat
   - Search
   - Scheduled
   - Plugins
2. Projects
   - Current project list
   - Add/select project control
3. Chats
   - Current project conversations
   - Recent history
4. Account row
   - Avatar
   - User name
   - Plan/status
   - Settings/account popover

## 4.3 Main workspace hierarchy

Main states:

1. Empty new chat
2. Existing conversation
3. Streaming conversation
4. Error conversation
5. Search result conversation focus

## 4.4 Context panel hierarchy

Right panel tools:

1. Workspace
2. Claude Code
3. Browser
4. Terminal

Each tool has collapsed row and expanded detail state.

## 4.5 Modal hierarchy

Modal and popover surfaces:

- Command palette.
- Project picker.
- Settings.
- Plugins/skills management.
- Account menu.
- Scheduled prompts.
- Confirm dangerous action.
- Diff review.

## 5. Layout Specification

## 5.1 Desktop window

Target dimensions:

```text
Default width: 1480px
Default height: 960px
Minimum width: 1040px
Minimum height: 720px
```

Window background:

```text
#111111
```

Electron:

- `autoHideMenuBar: true`.
- App title: `Claudex`.
- Window background: `#111111`.
- Do not show browser-like frame inside app content.

## 5.2 Grid

Desktop grid:

```css
grid-template-columns: 336px minmax(520px, 1fr) minmax(420px, 40%);
```

Fallback under 1240px:

```css
grid-template-columns: 312px minmax(0, 1fr);
right-panel: hidden or drawer
```

Mobile under 860px:

- Sidebar becomes top/stacked nav or drawer.
- Main content full width.
- Right panel becomes modal drawer.
- No horizontal overflow.

## 5.3 Sidebar dimensions

```text
Width: 320-336px
Horizontal padding: 8-10px
Nav row height: 34-36px
Project row height: 34-36px
Thread row height: 34-44px
Account row height: 64-72px
```

## 5.4 Main empty state

Empty composer block:

```text
Width: min(736px, calc(100% - 64px))
Heading to composer gap: 42-48px
Vertical position: visually centered but slightly below center
```

Important: Do not add random prompt chips unless Codex reference shows them.

## 5.5 Right panel

Collapsed rows:

```text
Width: min(604px, calc(100% - 72px))
Row height: 44px
Gap: 8px
Icon: 16-17px
Text: 14px / 500
```

Expanded tool detail:

```text
Border: 1px solid #202020
Background: #0f0f0f
Radius: 10px
Padding: 14px
```

## 5.6 Bottom panel

When terminal/browser bottom panel is visible:

```text
Height: 280-340px default
Resizable: yes, later phase
Border top: 1px solid #262626
Tabs: compact, 32px height
Close button: top right
```

## 6. Visual Design Tokens

## 6.1 Colors

```css
--app-bg: #111111;
--panel-bg: #111111;
--sidebar-bg: #17212b;
--sidebar-bg-deep: #111c1f;
--sidebar-hover: #2b3440;
--surface-1: #0c0c0c;
--surface-2: #101010;
--surface-3: #171717;
--composer: #2d2d2d;
--composer-border: #3a3a3a;
--line: #2a2a2a;
--sidebar-line: #2d3a43;
--text: #eeeeee;
--text-strong: #f6f6f6;
--muted: #a2a7aa;
--faint: #777c7f;
--accent: #d18357;
--ok: #9bb36c;
--warning: #d6ad6a;
--danger: #d36a5c;
```

Rules:

- No pure black.
- One accent color.
- No neon glows.
- No AI purple/blue gradient.
- Error states use muted red, not bright red.

## 6.2 Typography

UI font:

```css
"Anthropic Sans", "Styrene B", "Space Grotesk", "DM Sans",
"Helvetica Neue", Helvetica, Arial,
"PingFang SC", "Microsoft YaHei", sans-serif
```

Mono font:

```css
"Anthropic Mono", "JetBrains Mono", "Fira Code", Consolas, monospace
```

Rules:

- Do not use serif for message body in this app. It makes coding output feel wrong.
- Use mono for CLI output, paths, timestamps, model IDs, exit codes.
- Use tabular numbers for times and counts.

Type scale:

```text
Sidebar nav: 14px / 500
Section labels: 13-14px / 400 / muted
Thread title: 14px / 500
Thread timestamp: 12px mono
Empty heading: 30-32px / 500 / -0.025em
Message body: 14-15px / 1.6
CLI output: 11-12px mono / 1.55
Buttons: 13-14px / 500
Modal title: 22-24px / 500
```

## 6.3 Radius

```css
--radius-xs: 6px;
--radius-sm: 7px;
--radius-md: 10px;
--radius-lg: 14px;
--radius-composer: 22px;
```

Rules:

- Sidebar rows: `7px`.
- Tool rows: `8px`.
- Modals: `12px`.
- Composer: `22px`.

## 6.4 Borders

```css
border-color-normal: #242424;
border-color-hover: #303030;
border-color-active: rgba(255, 255, 255, 0.08);
border-color-accent: rgba(209, 131, 87, 0.36);
```

Rules:

- Use borders more than shadows.
- Do not add large card shadows.
- Keep divider lines consistent.

## 6.5 Motion

```text
Hover: 150ms ease
Panel open: 180ms cubic-bezier(0.16, 1, 0.3, 1)
Modal open: 160ms ease-out
Pressed: translateY(1px)
Streaming pulse: 1.1s ease-in-out infinite
```

Rules:

- Animate opacity and transform only.
- Respect `prefers-reduced-motion`.
- No constant decorative motion except streaming/status dots.

## 7. Component Specifications

## 7.1 Window chrome

Required:

- App title shows `Claudex`.
- App icon is small and crisp.
- No double window chrome.
- No browser URL bar.
- No visible white flash on launch.

States:

- Active window.
- Inactive window.
- Maximized.
- Minimum supported size.

Acceptance:

- Screenshot should not look like a web page inside a browser.

## 7.2 Sidebar

### Structure

```text
New chat
Search
Scheduled
Plugins

Projects
  project row
  project row

Chats
  thread row
  thread row

Account row
```

### New chat row

States:

- Default.
- Hover.
- Active/pressed.
- Disabled while session creation is running.

Behavior:

- `Ctrl+N` creates a new session.
- New session inherits active project.
- Focus moves to composer.

### Search

Behavior:

- Inline sidebar search.
- Filters chats and projects.
- Empty search shows normal sidebar.
- No results shows compact empty row.

### Project list

Project row content:

- Folder icon.
- Project name.
- Optional path tooltip.

States:

- Active project.
- Hover.
- Missing path.
- Long name truncation.

Behavior:

- Click sets active project.
- Plus opens project picker.

### Chat list

Thread row content:

- Title.
- Relative or formatted time.
- Optional error marker.

States:

- Active.
- Hover.
- Streaming.
- Error.
- Empty.

### Account row

Content:

- Avatar initials.
- Display name.
- Plan/status.
- Settings/account button.

Popover:

- Email.
- Profile.
- Settings.
- Usage remaining.
- Upgrade.
- Learn more.
- Log out.

Acceptance:

- Must look like a compact Codex account menu, not a dashboard menu.

## 7.3 Composer

### Layout

```text
Textarea
Actions row:
  + attachment/project
  Custom mode dropdown
  Model/execution pill
  Voice disabled or hidden
  Send button
Project strip
```

### Textarea

Behavior:

- Placeholder: `Do anything` / `输入任何任务`.
- `Ctrl+Enter` or `Cmd+Enter` sends.
- Enter inserts newline.
- Auto-grow later phase; fixed height acceptable initially.

### Send button

States:

- Disabled when empty.
- Enabled when draft has content.
- Busy becomes stop/cancel button.
- Error state after failed send.

### Execution pill

Rules:

- If Claude Code mode: display `Claude Code`.
- If Direct API mode: display model name.
- Only show `Needs key` if Direct API mode and provider key is missing.

### Project strip

Behavior:

- Shows active project.
- Click opens project picker.
- If no project selected, show `Choose project`.

Acceptance:

- Composer should feel nearly identical to Codex App screenshots in size, weight, density, and hierarchy.

## 7.4 Conversation

### Empty state

Content:

- One heading only:
  - English: `What should we work on?`
  - Chinese: `今天要做什么？`
- Composer.

No extra explanatory text unless needed for setup error.

### Thread state

Header:

- Active thread label.
- Thread title.
- Model/execution chip.

Message list:

- User message.
- Assistant message.
- Error message.
- Streaming assistant.
- Tool event timeline later phase.

Message actions:

- Copy.
- Retry on error.
- Open settings on provider/setup error.

Streaming:

- Show live content.
- If no content yet, show status line with pulse dot.
- Auto-scroll unless user manually scrolled up.
- Cancel remains visible.

Error:

- Preserve failed user message.
- Show clear error.
- Offer retry and settings/terminal action.

## 7.5 Right contextual panel

### Base rows

Rows:

- Workspace.
- Claude Code.
- Browser.
- Terminal.

Each row:

- Icon.
- Label.
- Optional shortcut.
- Active selected state.

### Row behavior

- Click toggles detail.
- Opening one detail does not destroy another tool's state unless necessary.
- Esc collapses current detail.

## 7.6 Workspace tool

### States

- No project selected.
- Loading file tree.
- Tree loaded.
- File selected.
- File too large.
- Binary file blocked.
- Unsaved changes.
- Save success.
- Save error.
- Command running.
- Command success.
- Command error.

### File tree

Rules:

- Hide `.git`, `node_modules`, `dist`, `release`, `.npm-cache`, `.next`, `coverage`.
- Show folders before files.
- Limit entries and indicate truncation later phase.
- Use compact rows.

### File editor

Header:

- File name.
- Relative path.
- Unsaved marker.
- Save.
- Discard.

Diff:

- Show file-level diff before save.
- Count additions/deletions.
- Use mono font.
- Do not auto-save silently.

### Command runner

Input:

- Placeholder: `npm test`.
- Run button.

Output:

- Real-time stdout/stderr.
- Final code.
- Duration.
- cwd.
- Truncation message.

Safety:

- Run only inside active project.
- Do not allow path escape through file APIs.

## 7.7 Claude Code tool

### States

- CLI unknown.
- CLI available.
- CLI missing.
- Auth logged in.
- Auth missing.
- Plugin list loaded.
- MCP list loaded.
- Command running.
- Command success.
- Command error.
- Native TUI needed.

### Status card

Content:

- CLI version.
- Auth provider/method.
- Plugins/MCP details collapsed.
- Refresh status.

### Command actions

Buttons:

- Auth.
- Plugins.
- Marketplace.
- MCP.
- Doctor.
- Interactive Claude.

### Plugin operations

Input:

- Plugin name or `plugin@marketplace`.

Actions:

- Install.
- Update.
- Disable.
- Details later phase.

Behavior:

- Execute real `claude plugin ...` command.
- Stream stdout/stderr.
- Refresh plugin status after success.

### Interactive Claude

Purpose:

- Opens real Claude Code TUI in project directory.
- Used for native permission prompt, slash commands, plugin auth, or anything not faithful in `-p` mode.

Rules:

- Do not pretend Claudex owns interactive permission approval unless implemented with a real protocol.
- Explain when this escape hatch is needed.

## 7.8 Browser tool

Minimum:

- URL input.
- Open URL in system browser.
- Clear validation.

Future:

- Embedded browser panel if available.
- Current URL.
- Back/forward/reload.
- Capture page context.

States:

- Empty URL.
- Invalid URL normalized to `https://`.
- Open success toast.
- Open failure.

## 7.9 Terminal tool

Minimum:

- Show active project and path.
- Open system terminal in project.
- Open project folder.

Future:

- Embedded terminal.
- Multiple tabs.
- Scrollback.
- Kill process.

States:

- No project selected.
- Terminal opened.
- Open failed.

## 7.10 Plugins and Skills page

### Top-level tabs

- Plugins.
- MCPs.
- Skills.
- Marketplace.

### Installed plugin row

Content:

- Icon.
- Name.
- Source.
- Description.
- Enabled toggle.
- More menu.

States:

- Enabled.
- Disabled.
- Installing.
- Updating.
- Error.
- Requires restart.

### Marketplace row

Content:

- Icon.
- Name.
- Description.
- Install button.
- Details.

Rules:

- Do not show fake marketplace items unless backed by `claude plugin marketplace`.
- If marketplace output cannot be parsed, show raw output in a CLI-style panel.

## 7.11 Settings

Mirror Codex settings categories:

- General.
- Profile.
- Appearance.
- Configuration.
- Personalization.
- Pets.
- Keyboard shortcuts.
- Usage and billing.
- MCP servers.
- Browser.
- Computer use.
- Hooks.
- Connections.
- Git.
- Environments.
- Worktrees.
- Archived chats.

Only implement categories that have real backing state now; stub categories must show `Not implemented yet` with no fake controls.

### General settings

Controls:

- Work mode.
- Default permissions.
- Auto-review.
- Full access.
- Default file open destination.
- Agent environment.
- Integrated terminal shell.
- Execution mode.
- Claude command.
- Permission mode.
- Provider.
- Model.
- Base URL.
- API key.
- Language.
- System prompt.

States:

- Dirty.
- Saving.
- Saved.
- Error.
- Disabled due to execution mode.

## 7.12 Command palette

Shortcut:

```text
Ctrl+K
```

Searchable actions:

- New chat.
- Select project.
- Open terminal.
- Open browser.
- Open settings.
- Open plugins.
- Run doctor.
- Show Claude status.
- Review code prompt.
- Implementation plan prompt.

States:

- Empty query.
- Results.
- No results.
- Keyboard active result.

Behavior:

- Arrow keys move selection.
- Enter runs selected action.
- Esc closes.

## 7.13 Scheduled prompts

Minimum:

- Prompt.
- Time.
- Save.
- Run now.
- Delete.

States:

- Empty.
- Created.
- Invalid prompt.
- Run now loads prompt into composer.

Future:

- Actual background scheduler.
- Wake thread.
- Recurrence.

## 8. Functional Contracts

## 8.1 Desktop API contract

All desktop APIs must be guarded:

```text
If desktopApi is unavailable, show browser preview warning and disable desktop-only actions.
```

Required API groups:

- App state.
- Settings.
- Capabilities.
- Project selection.
- Chat sessions.
- Chat send/cancel/stream.
- Claude status/run/stream.
- Workspace files.
- Workspace commands/stream.
- System browser.
- System terminal.
- Interactive Claude terminal.

## 8.2 Chat contract

Send behavior:

1. Validate non-empty prompt.
2. Create request id.
3. Append optimistic user message.
4. Show streaming assistant status.
5. Call desktop API.
6. Stream deltas.
7. Save assistant or error.
8. Clear busy state.

Failure:

- Preserve request content.
- Show error message.
- Provide retry.
- Provide settings or terminal action if setup issue.

## 8.3 Claude Code contract

Modes:

```text
claude-code: use Claude Code CLI
api: use direct provider API
```

Claude Code chat:

```text
claude -p <prompt> --output-format stream-json --include-partial-messages --verbose --model <model> --permission-mode <mode> --append-system-prompt <context>
```

Limit:

- Non-interactive `-p` cannot fully reproduce interactive permission prompts.

Required UX:

- If command indicates permission/interactive limitation, offer `Interactive Claude`.

## 8.4 Workspace contract

File APIs:

- Resolve paths inside selected project only.
- Reject path traversal.
- Reject binary files.
- Reject files above size limit.
- Preserve UTF-8.

Command APIs:

- Run inside active project.
- Stream stdout/stderr.
- Limit output.
- Timeout long commands.
- Return code/duration/cwd.

## 8.5 Plugin contract

Plugin operations:

```text
list: claude plugin list
marketplace: claude plugin marketplace ...
install: claude plugin install <plugin>
update: claude plugin update <plugin>
disable: claude plugin disable <plugin>
details: claude plugin details <plugin>
```

UX:

- Never show install success before command success.
- Keep raw command output accessible.
- Refresh installed plugin state after mutation.

## 9. State Matrix

Every feature must implement the following states.

| Feature | Empty | Loading | Streaming | Success | Error | Disabled |
|---|---|---|---|---|---|---|
| Chat | No messages | Sending | Assistant delta | Saved reply | Model/CLI error | No desktop API |
| Project | No project | Selecting | N/A | Project active | Invalid path | Browser preview |
| Workspace tree | No project | Reading | N/A | Tree loaded | FS error | Browser preview |
| File editor | No file | Reading/saving | N/A | Saved | Read/save error | Binary/large |
| Command | No command | Starting | stdout/stderr | exit 0 | non-zero/timeout | No project |
| Claude status | Unknown | Refreshing | N/A | Version/auth | CLI missing | Browser preview |
| Plugin install | No plugin | Installing | stdout/stderr | Installed | CLI error | Empty input |
| Settings | Clean | Saving | N/A | Saved | Save error | Control-specific |
| Scheduled | No prompts | Saving | N/A | Saved | Invalid prompt | N/A |

## 10. Keyboard Shortcuts

Required:

```text
Ctrl+N: New chat
Ctrl+K: Command palette
Ctrl+T: Toggle browser tool
Ctrl+,: Settings
Esc: Close modal/detail
Ctrl+Enter: Send prompt
ArrowUp/ArrowDown: Palette navigation
Enter: Palette execute
```

Future:

```text
Ctrl+B: Toggle sidebar
Ctrl+J: Toggle bottom panel
Ctrl+Shift+P: Plugins
Ctrl+Shift+T: Terminal
```

## 11. Accessibility

Minimum:

- Every icon-only button has title or aria-label.
- Focus ring is visible.
- Modal traps focus later phase.
- Esc closes modal.
- Buttons use `<button>`, inputs use `<label>`.
- Error text is not color-only.
- CLI output is selectable.
- Disabled controls explain why.

## 12. Responsive Behavior

## 12.1 Desktop

- Full three-panel layout.
- Right panel visible.
- Composer centered in main workspace.

## 12.2 Medium width

- Hide right panel behind toggle/drawer.
- Sidebar remains visible at reduced width.
- Conversation fills rest.

## 12.3 Mobile/narrow

- Sidebar stacks or becomes drawer.
- Conversation full width.
- Composer fits without horizontal overflow.
- Tool details become modal/drawer.
- No right panel hard-coded offscreen.

## 13. Code Architecture Plan

Do not keep everything in `App.jsx`.

Recommended structure:

```text
src/
  App.jsx
  main.jsx
  styles.css
  data/
    copy.js
    providers.js
    capabilities.js
  lib/
    desktopApi.js
    formatting.js
    diff.js
    commandOutput.js
  components/
    shell/
      AppShell.jsx
      Sidebar.jsx
      AccountMenu.jsx
      CommandPalette.jsx
    chat/
      Conversation.jsx
      Composer.jsx
      Message.jsx
      StreamingMessage.jsx
    tools/
      ToolsPanel.jsx
      WorkspaceTool.jsx
      ClaudeCodeTool.jsx
      BrowserTool.jsx
      TerminalTool.jsx
    settings/
      SettingsModal.jsx
      SettingsSection.jsx
    plugins/
      PluginsModal.jsx
      PluginRow.jsx
    ui/
      Button.jsx
      IconButton.jsx
      Modal.jsx
      Toast.jsx
      EmptyState.jsx
```

Rules:

- `App.jsx` should compose state providers and major regions only.
- Feature components own local state.
- Shared UI primitives should stay small.
- Do not introduce global state library unless prop drilling becomes real friction.

## 14. Implementation Phases

## Phase 0 - Spec and audit

Deliverables:

- `CODEX_APP_UIUX_REBUILD_SPEC.md`.
- `IMPLEMENTATION_PLAN.md`.
- Updated screenshot inventory.

Validation:

- No UI code changes.

## Phase 1 - Shell fidelity

Scope:

- Window shell.
- Sidebar.
- Main empty state.
- Right panel collapsed rows.
- Account row.

Do not touch:

- Claude logic.
- Workspace logic.
- Settings logic.

Validation:

```text
npm run build
desktop screenshot at 1920x1080
compare against Codex screenshot
```

Acceptance:

- The app no longer looks like a web dashboard.
- Sidebar and composer match reference density.

## Phase 2 - Chat/composer UX

Scope:

- Composer states.
- Send/cancel/retry.
- Streaming assistant.
- Auto-scroll.
- Error handling.
- Message rendering.

Validation:

- Send real Claude Code test prompt.
- Cancel a long-running prompt.
- Trigger missing setup error in Direct API mode.

Acceptance:

- User always knows whether the model is working, stopped, failed, or done.

## Phase 3 - Workspace UX

Scope:

- File tree.
- File editor.
- Diff preview.
- Save/discard.
- Command runner.
- Streamed output.

Validation:

- Read `package.json`.
- Edit a temp file.
- Verify diff preview.
- Save.
- Run `node --version`.
- Run a failing command.

Acceptance:

- No blind file overwrite.
- Command output feels live.

## Phase 4 - Claude Code UX

Scope:

- Status.
- Auth/plugin/MCP/doctor.
- Plugin install/update/disable.
- Interactive Claude.
- Raw output history.

Validation:

- `claude --version`.
- `claude auth status`.
- `claude plugin list`.
- `claude mcp list`.
- Open Interactive Claude in project.

Acceptance:

- The user can manage Claude Code without leaving Claudex unless a native TUI is required.

## Phase 5 - Settings and plugins

Scope:

- Settings navigation.
- General settings.
- Execution mode.
- Provider config.
- Permission mode.
- Plugins/skills management.

Validation:

- Save settings.
- Relaunch app.
- Confirm persistence.
- Toggle capability.

Acceptance:

- Settings look like Codex App settings, not a generic form dump.

## Phase 6 - Polish and QA

Scope:

- Keyboard.
- Focus.
- Mobile/narrow layout.
- Empty/error states.
- Visual alignment.
- Documentation.

Validation:

- Desktop screenshot.
- Narrow screenshot.
- Packaged exe.
- Runtime smoke.

Acceptance:

- No material visual drift from reference.
- No obvious inert controls.

## 15. Verification Gates

## 15.1 Static checks

```powershell
node --check electron\main.cjs
node --check electron\preload.cjs
npm run build
```

## 15.2 Packaging

If no Claudex instance is running:

```powershell
npx electron-builder --win dir
```

If `release\win-unpacked` is locked:

```powershell
npx electron-builder --win dir --config.directories.output=release-ux
```

## 15.3 Runtime smoke

Run packaged exe:

```text
release-ux\win-unpacked\Claudex.exe
```

Smoke checklist:

- App opens without red preview warning.
- Select project.
- New chat focuses composer.
- Send prompt through Claude Code.
- Stream appears.
- Cancel works.
- Workspace tree loads.
- File read works.
- Diff preview appears after edit.
- Command output streams.
- Claude status refresh works.
- Plugin list works.
- Interactive Claude opens terminal.

## 15.4 Visual QA

Capture:

- Desktop 1920x1080.
- App default 1480x960.
- Narrow 390x900.

Compare:

- Sidebar width.
- Sidebar row heights.
- Composer width/height/radius.
- Main empty-state vertical placement.
- Right panel row density.
- Typography scale.
- Colors.
- Borders.
- Icon sizes.
- Account row.
- Modal/panel alignment.

## 16. Acceptance Checklist

### Shell

- [ ] No double chrome.
- [ ] No web-dashboard feel.
- [ ] Sidebar density matches Codex.
- [ ] Main empty state is calm.
- [ ] Right panel rows are compact.
- [ ] Account row is aligned.

### Chat

- [ ] Empty state is clean.
- [ ] Composer works.
- [ ] Ctrl+Enter sends.
- [ ] Streaming is visible.
- [ ] Cancel works.
- [ ] Error shows retry.
- [ ] Copy works.

### Workspace

- [ ] Project required state is clear.
- [ ] File tree loads.
- [ ] File editor handles large/binary files.
- [ ] Unsaved changes visible.
- [ ] Diff preview works.
- [ ] Save/discard work.
- [ ] Commands stream output.

### Claude Code

- [ ] CLI status works.
- [ ] Auth status works.
- [ ] Plugin list works.
- [ ] MCP list works.
- [ ] Doctor works.
- [ ] Plugin install/update/disable works.
- [ ] Interactive Claude opens real TUI.

### Settings/plugins

- [ ] Settings save state works.
- [ ] Execution mode clear.
- [ ] Direct API key warning only appears in Direct API mode.
- [ ] Dangerous permission modes are explained.
- [ ] Plugin UI does not fake marketplace data.

### QA

- [ ] Static checks pass.
- [ ] Build passes.
- [ ] Packaged exe created.
- [ ] Runtime smoke passes.
- [ ] Desktop screenshot inspected.
- [ ] Narrow screenshot inspected.
- [ ] Known limitations documented.

## 17. Known Technical Boundary

Claude Code `-p` non-interactive mode cannot perfectly reproduce all native interactive TUI flows.

Examples:

- Permission prompt approvals.
- Slash-command pickers.
- Some plugin auth/setup flows.
- Full-screen diff accept/reject unless parsed from command output or implemented separately.

Required product decision:

- Claudex should handle what can be faithfully implemented.
- Claudex should open `Interactive Claude` for native TUI flows.
- Claudex should not fake these flows.

## 18. High-quality Prompts For Future Agents

## 18.1 Full audit prompt

```text
Inspect the current Claudex app in the real repo. Do not edit files. Compare it to the provided Codex App screenshots and CODEX_APP_UIUX_REBUILD_SPEC.md. Produce a severity-ranked UI/UX gap report covering window chrome, sidebar, project/chat lists, composer, conversation states, right panel, workspace, Claude Code, terminal/browser, plugins/settings/account menus, keyboard shortcuts, loading/error/empty states, and functional truthfulness. Separate verified behavior from guesses. Include exact files and recommended implementation phases.
```

## 18.2 Design-spec refinement prompt

```text
Refine CODEX_APP_UIUX_REBUILD_SPEC.md into an implementation-ready design system. Extract exact tokens, dimensions, typography, row heights, component variants, motion timings, and state matrices from the Codex reference screenshots. Do not implement. Add any missing details needed for a developer to reproduce the Codex App shell faithfully.
```

## 18.3 Phase 1 implementation prompt

```text
Implement Phase 1 only from CODEX_APP_UIUX_REBUILD_SPEC.md: shell fidelity. Rework the app shell, sidebar, empty main workspace, right contextual panel collapsed rows, and account row to match the Codex App screenshots. Do not change Claude Code, workspace, settings, or plugin behavior. Keep changes surgical. Run node --check electron\main.cjs, node --check electron\preload.cjs, npm run build, and capture a desktop screenshot. Report visual mismatches that remain.
```

## 18.4 Phase 2 chat prompt

```text
Implement Phase 2 only: chat and composer UX. Make composer, send/cancel/retry, streaming assistant, message rendering, copy action, auto-scroll, and Direct API setup errors match CODEX_APP_UIUX_REBUILD_SPEC.md. Do not touch workspace, plugins, or settings beyond the minimum needed. Verify with a real Claude Code prompt, a cancel test, and npm run build.
```

## 18.5 Phase 3 workspace prompt

```text
Implement Phase 3 only: Workspace UX. File tree, file editor, unsaved marker, diff preview, save/discard, large/binary file errors, command runner, realtime stdout/stderr, final exit code, cwd, duration, and output truncation. Use real Electron APIs only. Verify by reading package.json, editing a temp file, saving through diff review, running node --version, and running one failing command.
```

## 18.6 Phase 4 Claude Code prompt

```text
Implement Phase 4 only: Claude Code UX. Status, auth, plugin list, marketplace entry, MCP, doctor, streamed command output, plugin install/update/disable/details, command history, and Interactive Claude terminal escape hatch. Do not fake native permission prompts. Verify with claude --version, claude auth status, claude plugin list, claude mcp list, and opening the real TUI in the active project.
```

## 18.7 Settings/plugins prompt

```text
Implement Phase 5 only: settings and plugins surfaces. Mirror the observable Codex App settings structure but only enable controls backed by real state. Add clean dirty/saving/saved/error states. Make execution mode, Claude command, permission mode, Direct API providers, language, capabilities, and plugin management clear. Do not show fake marketplace data. Verify save persistence after app relaunch.
```

## 18.8 Visual QA prompt

```text
Run a visual QA pass. Capture desktop 1920x1080, default app size 1480x960, and narrow 390x900 screenshots. Compare against Codex App references and CODEX_APP_UIUX_REBUILD_SPEC.md. Check sidebar width, row heights, active states, composer placement, right panel density, typography, colors, borders, radii, icon weight, account row, modals, and no fake/red preview errors. Fix only in-scope visual drift.
```

## 18.9 Release-readiness prompt

```text
Assess whether Claudex is ready to share with a team temporarily. Inspect the current repo, packaged output, design QA, usage docs, and runtime evidence. Give a direct verdict first: production, preview/UAT, or not ready. Separate verified behavior from known limitations. Include exact exe path, smoke commands, risks, and what users should avoid.
```

## 19. Suggested File Deliverables

Create or maintain:

```text
CODEX_APP_UIUX_REBUILD_SPEC.md
IMPLEMENTATION_PLAN.md
VISUAL_QA_LEDGER.md
RUNTIME_SMOKE.md
docs/screenshots/
```

Do not bury critical design decisions only in chat history.

## 20. Final Instruction To Implementers

Do not make Claudex prettier first.

Make it truthful, stateful, compact, and Codex-like first. Then polish.

If a control cannot be backed by real behavior, remove it, disable it with a reason, or route to `Interactive Claude`.

If a visual change makes the app look less like Codex App, revert it even if it looks more "designed".

