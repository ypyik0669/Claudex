# Claudex Codex App UX audit and execution plan

Date: 2026-07-04

## Brief

Claudex should feel like a Codex App-style coding workspace, not a dashboard of exposed internals. The default screen should make one action obvious: choose a project, type the task, run Claude Code. Tools, environment, files, diffs, plugins, MCPs, marketplace, terminal, browser, and settings should be discoverable without competing for attention.

Visual thesis: quiet dark workspace, dense but calm controls, fewer visible boxes, one active working area, and tool details hidden until the user asks.

Interaction thesis:

- Primary chat and composer stay visually dominant.
- Side and bottom panels are contextual work surfaces, not permanent dashboards.
- Settings and plugins behave like app pages with real state, search, and reversible controls.

## Evidence reviewed

- Current running Claudex window via Computer Use.
- Reference Codex-style Claudex screenshot: `C:\Users\YPY\.codex\attachments\16fe2372-5a85-4e55-9000-07c6f716bdab\image-1.png`.
- Local screenshots from latest build: `qa/pass30-home.png`, `qa/pass30-bottom-panel.png`, `qa/pass30-settings-general.png`, `qa/pass30-plugins-surface.png`.

## What feels bad now

1. Main screen has too many competing regions.

   Evidence: the default view shows left navigation, top-right IDE/environment/output buttons, a large right Environment card, a Context card, four tool rows, Plugins and MCP, and the composer. The user's eye has no clear path.

   Fix: keep the composer and active project dominant. Right panel default should show a compact tool launcher first; detailed environment data moves into a collapsed section.

2. Right panel exposes implementation internals too early.

   Evidence: Git unavailable, Local path, Branch unavailable, Commit unavailable, subagents, sources, context status, and runtime details are all visible before any task starts.

   Fix: show only project name, Claude status, and the four tool entries by default. Environment rows, runtime details, sources, and subagents stay behind disclosure controls.

3. Settings feels half page, half modal.

   Evidence: Settings opens in the main area, but the global app sidebar remains visible and there is both "Back to app" and a close button. It feels like an overlay pretending to be a page.

   Fix: Settings should temporarily replace the app shell, like Codex settings. Hide the global sidebar while Settings is open. Keep one back action and a persistent save bar.

4. Plugins page looks empty and low-confidence.

   Evidence: the Plugins tab often shows one row in a huge blank area. It has search, filter, tabs, and icons, but does not explain what can be installed, enabled, disabled, refreshed, or routed through Claude Code.

   Fix: keep tabs and toggles, but add clearer source sections: installed local capabilities, Claude Code plugin commands, MCP status, skills, and Marketplace entry points. Any action not backed by real CLI output must be labeled as such.

5. Bottom panel currently adds another rectangle instead of reducing work.

   Evidence: when bottom panel is open, top buttons, right panel, bottom panel, and composer all coexist. This is useful for power users but too busy as a default mental model.

   Fix: bottom panel should be for live output and terminal/browser handoff only. Opening it should not duplicate data already in the right panel.

6. Composer is close but still over-explains runtime.

   Evidence: "Claude Code Sonnet 4.5", project pill, default permission pill, and send button all sit in the composer. This is acceptable, but visual weight should stay low.

   Fix: keep project and permission controls, reduce border contrast, and avoid extra runtime badges outside the composer unless the right panel is closed.

7. Left navigation is missing the Codex-style rail model.

   Evidence: the reference screenshot has a thin rail plus expanded sidebar. Current Claudex only has the expanded sidebar, so app-level navigation and project/chat navigation are visually mixed.

   Fix: later pass should add a thin icon rail for New/Search/Automations/Plugins/Settings/Collapse, with the expanded sidebar focused on Projects and Chats.

## Execution plan

### Pass 31 - reduce visible complexity

- Hide the global app sidebar while Settings is open.
- Change right panel header from Environment to Tools.
- Move detailed Environment card into a collapsed section.
- Put Workspace, Claude Code, Browser, Terminal first in the right panel.
- Keep Claude Code status compact and below primary tools.
- Keep bottom panel, but make it a secondary output tray.

### Pass 32 - make plugin and settings pages useful

- Add plugin/source sections that distinguish local capabilities, Claude Code CLI plugins, MCP status, skills, and marketplace commands.
- Add real refresh/run command affordances in the Plugins surface.
- Make Appearance, Configuration, Git, Environments, and MCP server sections show backed state instead of "Not implemented yet" where local data exists.

### Pass 33 - match Codex navigation

- Add a narrow left rail.
- Make sidebar collapse/expand feel native.
- Separate app navigation from project/chat lists.
- Tighten chat row density and date labels.

### Pass 34 - live Claude Code behavior parity

- Surface Claude Code stream events as activity lines: starting, reading, editing, running command, waiting for permission, done.
- Keep permission-denied tasks routed to Interactive Claude.
- Preserve Sonnet 4.5 as the active smoke model.

### Pass 35 - final QA

- Screenshot main, settings, plugins, right panel closed, right panel open, bottom panel, narrow desktop, and mobile.
- Run build and packaged smoke.
- Package a new `release-passXX` exe.

## Pass 31 acceptance checks

- The first screen has one visual focus: composer plus project context.
- Right panel default is a compact tool launcher, not a stack of diagnostic cards.
- Settings opens as a page, not a modal-shell hybrid.
- The user can still reach environment details, sources, subagents, IDE open, browser, terminal, and Claude Code commands.
- Build and screenshot smoke pass.
