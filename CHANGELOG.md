# Changelog

All notable changes to Claudex will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-07-04

### Added

#### Core Features
- Dark three-panel Codex-inspired UI with sidebar, workspace, and context panel
- Real Claude Code CLI integration (v2.1.199+) with streaming output
- Dual execution modes: Claude Code CLI or Direct API
- Direct API support for OpenAI-compatible, Anthropic, and Ollama providers
- Project context persistence across sessions
- Chat history per project with auto-save
- Real-time streaming for messages, commands, and Claude Code operations

#### Workspace Tools
- File browser with hierarchical, interactive tree view — directories start collapsed, expand/collapse on click, sub-directories beyond the initial eager depth are lazy-loaded on demand
- File editor with syntax highlighting and line numbers
- Diff preview before save with additions/deletions count
- Unsaved state indicator with explicit save/discard actions
- Command runner with real-time stdout/stderr streaming
- Exit code, duration, and working directory display for commands
- Safety: No auto-save, explicit confirmation required

#### Claude Code Integration
- CLI status detection (version, authentication state)
- Auth status checking and management
- Plugin listing with install/update/disable operations
- Per-plugin status badges (✓ Enabled / ○ Disabled) sourced from `claude plugin list --json`, with loading/empty/error states and inline Enable/Disable actions that auto-refresh the list
- MCP (Model Context Protocol) listing and status
- Doctor command for diagnostics
- Real-time command output streaming
- Interactive Claude escape hatch for native TUI operations
- Contextual "Open Interactive Claude" banner shown on chat messages when the Claude Code CLI reports a non-empty `permission_denials` result, routing users to the native TUI right when a permission prompt was needed instead of leaving it as a purely manual escape hatch

#### Settings & Configuration
- Execution mode selection (Claude Code vs Direct API)
- Claude command path configuration (auto-detected)
- Permission mode control (auto, acceptEdits, plan, dontAsk, bypassPermissions)
- Model override for Claude Code mode
- Provider configuration (base URL, API key, model, temperature, timeout)
- API key encryption at rest using Electron safeStorage
- Language selection (Follow system, English, 中文)
- Data file location viewing and access

#### User Interface
- Comprehensive keyboard shortcuts system
- Sidebar with navigation, projects, chats, account row
- Composer with auto-grow textarea (max 6 lines before scroll)
- Model chip and send/stop controls
- Empty states for new chats and empty project
- Loading states with skeleton/spinner patterns
- Streaming indicators (breathing status dot)
- Success confirmations for saves and actions
- Error messages with specific recovery actions
- Toast notifications for quick feedback

#### Modals
- Settings modal with tabbed/scrollable sections
- Capabilities modal for enabling/disabling features
- Projects modal for project selection and management
- Command palette with fuzzy search (basic)
- Scheduled tasks modal (placeholder)
- Keyboard shortcuts modal (`Cmd/Ctrl+/`)

#### Keyboard Shortcuts
- `Cmd/Ctrl+K` - Command palette
- `Cmd/Ctrl+N` - New chat
- `Cmd/Ctrl+,` - Settings
- `Cmd/Ctrl+P` - Projects
- `Cmd/Ctrl+B` - Toggle sidebar
- `Cmd/Ctrl+\` - Toggle right panel
- `Cmd/Ctrl+Shift+F` - Search chats
- `Cmd/Ctrl+T` - Toggle browser
- `Cmd/Ctrl+/` - Show keyboard shortcuts
- `Escape` - Close modal/cancel operation
- `Enter` - Send message (in composer)
- `Shift+Enter` - New line (in composer)

#### Capabilities System
- Project context (keep workspace visible in requests)
- Code review (bias toward risks and regressions)
- Implementation plan (request steps before large edits)
- Terminal helper (shell access in project folder)
- Plugin router (remember enabled plugins)
- Debugger (prefer reproduction and root-cause fixes)
- Docs writer (generate usage documentation)
- Test writer (focus on behavior tests)

#### Documentation
- Comprehensive README with installation, features, and troubleshooting
- Detailed USER_GUIDE with execution modes, workspace tools, and FAQ
- Complete DEVELOPER guide with architecture, build process, and debugging
- Gap analysis and audit documentation
- Build and packaging logs
- CODEX_APP_UIUX_REBUILD_SPEC.md (40KB design specification)

### Changed
- Moved from white dashboard-style UI to dark Codex-like compact interface
- Changed from fake/demo controls to real Claude Code integration
- Improved streaming to show token-by-token deltas
- Enhanced error handling with specific recovery actions
- Refined composer to be more compact and focused
- Updated sidebar to match Codex App density and spacing
- Improved right panel to show contextual tools instead of demo cards
- Sidebar nav label renamed from "Scheduled" to "Automations" (EN and 中文: "自动化"), matching real Codex App terminology confirmed via official reference screenshots — the underlying scheduled-prompts feature and modal are unchanged
- Sidebar chat-row timestamp changed from an absolute date/time string to relative time (e.g. "9h", "3d", "1w"), matching Codex App's thread-list convention; in-thread per-message timestamps remain absolute

### Fixed
- Streaming auto-scroll behavior (sticks to bottom during stream)
- Unsaved file state tracking with clear dirty indicator
- Real-time command output display (no longer sudden回显)
- Desktop API guard for browser preview (no more undefined errors)
- Modal close on Escape key working across all modals
- Settings modal dirty state handling
- Keyboard shortcut conflicts with native shortcuts
- API key visibility (masked after save)
- Project selection persistence across restarts
- Chat history loading for selected project
- Modal keyboard focus trap: Tab/Shift+Tab now stays within the open modal instead of escaping into background content; focus auto-moves to the first control on open and restores to the trigger element on close
- Composer now sends on plain Enter (previously only Ctrl/Cmd+Enter worked), matching documented behavior; Shift+Enter still inserts a newline and IME composition (e.g. Chinese input candidate selection) is respected
- Composer textarea now genuinely auto-grows with typed content up to ~6 lines before scrolling, instead of staying a fixed height
- No confirmation before disabling a plugin (now shows an inline confirm/cancel banner)
- Disabled API key field lacked an explanatory tooltip when Ollama was selected
- Installed plugins had no visible enabled/disabled status (now shown as badges backed by real `claude plugin list --json` data, not previously surfaced anywhere in the UI)
- File browser dumped the entire tree fully expanded up to depth 2 with no way to collapse it (now starts collapsed with click-to-expand and lazy-loads sub-directories beyond the initial depth)
- Permission-limited responses (e.g. a mode that couldn't complete an action without a confirmation prompt) had no in-context way to reach Interactive Claude — users had to know to look for the manual escape hatch themselves (now surfaced as an inline banner directly on the affected message)
- Diff preview recomputed on every keystroke (an O(n) line-diff running synchronously inside the render path), causing typing lag on larger files — now debounced to 300ms so the diff only recomputes after typing pauses; the textarea itself was never blocked since it's an uncontrolled-cost native element, only the diff computation was
- Diff preview had no upper bound and would attempt a full line-by-line diff on files of any size — files over 1MB now skip diff computation entirely with an explanatory "Diff preview is disabled for files over 1MB to keep typing responsive." message instead of hitching the UI
- Re-opening a previously viewed file always re-read it from disk over IPC even if nothing had changed — now served from a 30-entry in-memory cache (evicted oldest-first, invalidated on save, cleared on manual tree refresh)
- Modals and toasts appeared instantly with no entrance transition (`.modal-backdrop`, `.settings-modal`, `.toast` had zero animation) — now fade/scale in over 140-160ms, matching the existing `.dirty-banner` animation vocabulary
- OS-level "reduce motion" accessibility preference was not respected anywhere in the app — a global `prefers-reduced-motion: reduce` media query now neutralizes all animation/transition durations to near-zero

### Security
- API keys encrypted at rest using Electron safeStorage
- No plaintext API keys in logs or console
- Secure IPC bridge with contextIsolation
- No arbitrary code execution from user input
- File operations restricted to selected project directory

### Known Issues

#### High Priority
- **Packaging fails if Claudex.exe is running**: Must close all instances before building. Workaround: Use different output directory with `--config.directories.output=release-v2`
- **Some ANSI colors not preserved**: Command output colors may not render correctly

#### Medium Priority
- **Browser panel minimal**: Basic iframe, no advanced features
- **Terminal panel routes to external**: No embedded xterm.js terminal
- **Syntax highlighting basic**: Not full IDE-level highlighting
- **No patch approval UI**: Must use Interactive Claude for granular accept/reject
- **No plugin "update available" indicator**: `claude plugin list --json` exposes no latest-version field and `claude plugin marketplace` doesn't provide an update-diff check, so this was deliberately not implemented rather than guessed at

#### Low Priority
- **Windows only**: macOS and Linux builds not yet available
- **Single instance**: Cannot run multiple Claudex windows
- **No cloud sync**: All data local to machine
- **No offline mode**: Requires network for AI inference

### Removed
- White background and dashboard cards
- Fake provider cards and decorative features
- Centered marketing copy
- Loud badges and multi-color icon grids
- API key warning in composer (moved to settings context)
- Oversized composer padding
- Demo-style Claude Code status cards

---

## [Unreleased]

### Planned for v0.2.0
- macOS and Linux support
- Embedded terminal with xterm.js
- Enhanced syntax highlighting
- Patch approval UI with granular accept/reject
- Plugin marketplace browsing UI
- Multi-window support
- Preferences sync across machines
- Theme customization (light theme, custom colors)
- Additional language support (Spanish, French, Japanese)

### Under Consideration
- Mobile companion app
- Browser extension integration
- Git operations UI
- Database query tools
- API testing tools
- Markdown preview
- Live collaboration features

---

## Version History

### v0.1.0 (2026-07-04) - Initial Release
First public release of Claudex desktop coding agent.

---

## Migration Notes

### From Previous Prototype Versions
If upgrading from earlier prototype builds:
1. Back up `%APPDATA%\Claudex\desktop-data.json` (single file holding settings, projects, and chat history)
2. Uninstall old version
3. Install v0.1.0
4. Settings and chat history should migrate automatically
5. If issues occur, restore from backup or start fresh

### Breaking Changes
None (initial release).

---

## Support

For issues, questions, or feature requests:
- Check Known Issues section above
- Review README.md Troubleshooting section
- See USER_GUIDE.md FAQ
- Check CODEX_APP_UIUX_REBUILD_SPEC.md for design rationale

---

## Credits

Built with:
- React 19.2.0
- Electron 43.0.0
- Vite 6.4.2
- Lucide React icons
- Claude Code CLI integration

Inspired by OpenAI Codex App design patterns.

---

**Note**: This changelog follows semantic versioning and Keep a Changelog format. All user-facing changes should be documented here with each release.
