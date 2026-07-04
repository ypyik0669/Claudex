# Claudex Pass 34 UX Audit And Fix Plan

Date: 2026-07-04

## Scope

Target: make Claudex feel closer to Codex App as a working desktop coding agent, not a UI shell.

Evidence used:

- Live Computer Use observation of the currently open Claudex window.
- Current open app path: `release-pass30/win-unpacked/Claudex.exe`.
- Latest packaged app observation: `release-pass33/win-unpacked/Claudex.exe`.
- Screenshot evidence:
  - `qa/packaged-pass33-home.png`
  - `qa/packaged-pass33-environment.png`
  - `qa/packaged-pass33-changes.png`
  - `qa/pass32-settings-general.png`
  - `qa/pass32-plugins.png`
  - `qa/pass32-marketplace.png`

## Main Verdict

Claudex still feels busy because it exposes the app's internal structure before the user has asked for it. The first screen should be a calm chat/work surface with one left navigation area and one composer. Instead, the current app shows multiple simultaneous control systems: left navigation, optional rail, top context controls, right tools panel, bottom panel, and repeated runtime/environment summaries.

## What Feels Bad

1. Default surface is overloaded

   Evidence: `qa/packaged-pass33-home.png` and live release-pass30 observation.

   Problems:

   - Left sidebar, icon rail, top context controls, and right tools are all visible at once.
   - The user sees framework controls before seeing a clear task flow.
   - The central composer is visually important, but surrounded by too many navigation affordances.

   Fix:

   - Default to left sidebar + central chat only.
   - Keep the right tools panel closed by default.
   - Remove the permanent icon rail from the normal layout.
   - Keep one top-left Projects/sidebar toggle only when needed.

2. Navigation has duplicate meanings

   Evidence: live release-pass30 observation and `qa/packaged-pass33-home.png`.

   Problems:

   - `Projects` appears in the left sidebar and again as a floating workspace button.
   - Environment appears in the top bar, side panel, and bottom panel.
   - Outputs appear in the bottom panel and as top context controls.

   Fix:

   - Left sidebar owns projects and chats.
   - Top bar owns compact work context shortcuts only.
   - Right panel owns deep tools only.
   - Bottom panel is temporary output/context, not always-on structure.

3. Right panel is too dominant

   Evidence: live release-pass30 observation and `qa/packaged-pass33-home.png`.

   Problems:

   - The side panel opens by default and makes the first screen feel like a dashboard.
   - It repeats workspace, Claude Code, browser, terminal, environment, and plugins before the user asks.
   - The most important action, typing a message, becomes visually secondary.

   Fix:

   - Right panel defaults closed.
   - Add one small `Tools` button in the top-right.
   - When opened, the panel should show only the selected tool and a concise tool list.

4. Settings is better than before but still needs clearer separation

   Evidence: live release-pass30 settings observation and `qa/pass32-settings-general.png`.

   Problems:

   - Old opened app still leaves chat/sidebar visible inside Settings.
   - Runtime/auth/API information is verbose and repeats state from the side panel.
   - The most common controls are not visually separated from advanced controls enough.

   Fix:

   - Use the latest full-width Settings surface.
   - Keep sidebar hidden while Settings is open.
   - Put runtime and language/appearance first.
   - Keep advanced Claude/API fields in collapsed sections unless active.

5. Plugins and Marketplace still feel sparse and ambiguous

   Evidence: live release-pass30 Plugins/Marketplace observation plus `qa/pass32-plugins.png` and `qa/pass32-marketplace.png`.

   Problems:

   - The page has a lot of empty space.
   - Marketplace and installed local capabilities are mixed.
   - Users cannot tell which actions use real Claude Code CLI state and which are local toggles.

   Fix:

   - Keep installed/plugin/skills/MCP/marketplace tabs.
   - Add compact status rows and clearer CLI-backed badges.
   - Avoid huge empty areas when CLI output is absent.

6. Terminology is too internal

   Evidence: live release-pass30 and pass33 screenshots.

   Problems:

   - Terms like `Context`, `Environment`, `Subagents`, `Outputs`, `MCPs`, and `Marketplace router` appear without hierarchy.
   - A user opening the app sees architecture names instead of task-oriented actions.

   Fix:

   - Use internal terms only in tool/settings surfaces.
   - First screen labels should stay simple: Projects, Chats, Tools, Changes, Output.
   - Empty states should say what is true now, not describe future parity.

## Codex App Alignment Principles

1. One primary working surface.

   The chat and composer are the default state. Everything else is secondary and collapsible.

2. Progressive disclosure.

   Projects/chats are visible. Tools, environment, changes, plugins, and raw CLI output are opened only when asked.

3. State over decoration.

   Show real branch/change/runtime state, but only in the place where the user needs it.

4. Compact but not fragmented.

   Small font and dense controls are good only if each region has one clear job.

5. Escape hatches stay available.

   Claude Code TUI, terminal, IDE, browser, and workspace tools should always be reachable, but not all visible at once.

## Pass 34 Implementation Checklist

1. Default layout

   - Remove the permanent icon rail from the default layout.
   - Keep left sidebar as one clean column.
   - Default right tools panel to closed.
   - Keep a small top-right `Tools` control to open it.

2. Top context controls

   - Show full context labels only when the right panel is closed.
   - When the right panel is open, collapse context controls into icons.
   - Do not show duplicate `Projects` in the workspace when the sidebar is visible.

3. Bottom panel

   - Keep it closed by default.
   - Use it only for temporary context: Output, Environment, Changes, Sources, Subagents, Terminal, Browser.
   - Keep the panel height bounded so it does not dominate the composer.

4. Settings

   - Keep the full settings surface behavior from Pass 32+.
   - Ensure old sidebar content does not show inside settings in the latest package.

5. Plugins/Marketplace

   - Keep real CLI-backed surfaces.
   - Replace empty dead space with concise empty states and actions.

6. Verification

   - `npm run build`
   - Electron screenshot smoke for home, sidebar hidden, settings, plugins, marketplace.
   - Packaged smoke for latest `Claudex.exe`.
   - Computer Use check against the latest package window.
