# Prototype Instructions

Run the local server yourself and open the preview in the in-app browser. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Prototype feedback: Claudex must not be a static UI shell. Treat UX completeness as real local state, visible running/loading/error states, useful empty states, streamed command output where possible, safe file-change review before save, and direct escape hatches to the real Claude Code TUI for flows that require native permission prompts or slash commands.
