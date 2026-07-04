# Claudex User Guide

## Table of Contents
1. [Getting Started](#getting-started)
2. [Execution Modes](#execution-modes)
3. [Project Management](#project-management)
4. [Workspace Tools](#workspace-tools)
5. [Settings Configuration](#settings-configuration)
6. [Plugins and MCP](#plugins-and-mcp)
7. [Interactive Claude](#interactive-claude)
8. [Keyboard Shortcuts](#keyboard-shortcuts)
9. [FAQ](#faq)

---

## Getting Started

### First Launch

When you first open Claudex, you'll see three main areas:

1. **Left Sidebar**: Navigation, projects, and chat history
2. **Center Workspace**: Where you compose messages and view responses
3. **Right Panel**: Contextual tools (Workspace, Claude Code, Browser, Terminal)

### Initial Setup

1. **Choose Execution Mode** (Settings → Execution):
   - **Claude Code**: Uses your local Claude Code CLI (recommended)
   - **Direct API**: Connects to AI APIs directly

2. **Configure Provider** (if using Direct API):
   - Select provider (OpenAI-compatible, Anthropic, Ollama)
   - Enter API key (encrypted automatically)
   - Choose model

3. **Select Project**:
   - Press `Cmd/Ctrl+P` or click "Choose project"
   - Navigate to your code project folder
   - Claudex will remember this for future sessions

4. **Start Working**:
   - Type in the composer at the bottom
   - Press Enter to send your message
   - Watch the streaming response appear in real-time

---

## Execution Modes

Claudex supports two execution modes, each with different capabilities and requirements.

### Claude Code Mode (Recommended)

**What it is**: Integrates directly with Claude Code CLI installed on your system.

**Benefits**:
- Inherits your Claude Code authentication
- Supports all Claude Code features (skills, plugins, MCP)
- Respects your permission preferences
- Uses your Claude Code configuration
- Full TUI access via Interactive Claude button

**Requirements**:
- Claude Code CLI v2.1.199+ installed
- Authenticated (`claude auth login`)
- In system PATH

**How to verify**:
```bash
claude --version  # Should show: 2.1.199 (Claude Code)
claude auth status  # Should show: Logged in
```

**Settings**:
- **Claude Command**: Auto-detected (usually `claude` or full path)
- **Permission Mode**: auto, acceptEdits, plan, dontAsk, bypassPermissions
- **Model Override**: Leave blank to use Claude Code default, or specify model

### Direct API Mode

**What it is**: Connects directly to AI provider APIs without Claude Code CLI.

**Benefits**:
- No Claude Code installation required
- Works with multiple providers
- Full control over model and parameters
- Supports local models via Ollama

**Limitations**:
- No Claude Code skills or plugins
- No permission prompt system
- No native TUI features
- Requires API key (except Ollama)

**Supported Providers**:

1. **OpenAI-compatible**:
   - OpenAI (api.openai.com/v1)
   - OpenRouter (openrouter.ai/api/v1)
   - LM Studio (localhost:1234/v1)
   - Any OpenAI API-compatible gateway

2. **Anthropic**:
   - Direct Anthropic API (api.anthropic.com/v1)
   - Requires Anthropic API key

3. **Ollama**:
   - Local models (localhost:11434)
   - No API key required
   - Must have Ollama running locally

**Settings per Provider**:
- **Base URL**: API endpoint
- **API Key**: Provider-specific key (encrypted at rest)
- **Model**: Model identifier (e.g., gpt-4, claude-sonnet-4-5, qwen2.5-coder:latest)
- **Temperature**: 0.0 (deterministic) to 2.0 (creative)
- **Timeout**: Request timeout in milliseconds

---

## Project Management

### Selecting a Project

**Via Command Palette**:
1. Press `Cmd/Ctrl+P`
2. Choose from recent projects or "Add project"
3. Navigate to project folder
4. Click "Select"

**Via Sidebar**:
1. Click "Projects" section
2. Click existing project or "+ Add"
3. Browse to folder

**What Happens**:
- Project path is saved to settings
- Chat history switches to this project's chats
- Workspace panel shows project files
- Commands run from project directory

### Project Context

When "Project context" capability is enabled (default):
- Every AI request includes your project path
- Claude understands your workspace structure
- File references are relative to project root
- Commands execute in project directory

### Multiple Projects

Claudex can switch between multiple projects:
- Each project has independent chat history
- Settings are global (not per-project)
- Recently used projects appear in quick list

---

## Workspace Tools

The Workspace tab in the right panel provides file and command tools.

### File Browser

**Browsing**:
- Shows files in selected project
- Folders appear before files
- System folders hidden (.git, node_modules, dist)

**Opening Files**:
- Click any file to open in editor
- Editor shows syntax highlighting
- Line numbers displayed

### File Editor

**Editing**:
- Make changes directly in editor
- Unsaved indicator (•) appears in tab
- Original content preserved until save

**Diff Preview**:
- Click "Save" to see diff
- Shows additions (green) and deletions (red)
- Line-by-line comparison

**Actions**:
- **Save**: Applies changes to disk
- **Discard**: Reverts to original content
- **Close**: Returns to file list

**Safety**:
- No auto-save
- Diff always shown before save
- Explicit confirmation required

### Command Runner

**Running Commands**:
1. Enter command in input field (e.g., `npm test`)
2. Click "Run" or press Enter
3. Watch real-time output stream
4. See exit code and duration when complete

**Output Display**:
- Stdout and stderr shown in real-time
- Exit code (0 = success, non-zero = error)
- Working directory (cwd) displayed
- Duration in seconds
- Output preserved after completion

**Safety**:
- Commands run inside project directory only
- No path escape allowed
- Destructive commands should be confirmed manually

**Examples**:
```bash
node --version
npm test
git status
npm run build
python script.py
```

---

## Settings Configuration

Access settings via `Cmd/Ctrl+,` or Settings icon in sidebar.

### Execution Settings

**Execution Mode**:
- Claude Code: Uses local Claude CLI
- Direct API: Connects to AI APIs

**Claude Command** (Claude Code mode):
- Usually auto-detected as `claude`
- Can specify full path if needed
- Must be in PATH or use absolute path

**Permission Mode** (Claude Code mode):
- `auto`: Prompt for each action (default)
- `acceptEdits`: Auto-accept file edits
- `plan`: Require plan approval
- `dontAsk`: Skip most prompts
- `bypassPermissions`: Skip all prompts (use with caution)

**Model Override** (Claude Code mode):
- Leave blank: Use Claude Code default
- Specify model: Override for this session

### Provider Settings (Direct API mode)

**Provider Selection**:
- OpenAI-compatible (default)
- Anthropic
- Ollama / local

**Base URL**:
- API endpoint for selected provider
- Examples:
  - OpenAI: `https://api.openai.com/v1`
  - Anthropic: `https://api.anthropic.com/v1`
  - Ollama: `http://localhost:11434`
  - LM Studio: `http://localhost:1234/v1`

**API Key**:
- Provider-specific authentication key
- Encrypted automatically before storage
- Shows "Saved" if key exists (actual key hidden)
- Leave blank when updating other settings to keep existing key
- Not required for Ollama

**Model**:
- Model identifier string
- Examples:
  - OpenAI: `gpt-4`, `gpt-4-turbo`
  - Anthropic: `claude-sonnet-4-5`, `claude-opus-4`
  - Ollama: `qwen2.5-coder:latest`, `llama3:70b`

**Temperature**:
- Controls randomness (0.0 to 2.0)
- 0.0: Deterministic, focused
- 0.7: Balanced (default)
- 1.5+: Creative, varied

**Timeout**:
- Request timeout in milliseconds
- Default: 60000 (60 seconds)
- Increase for long-running requests

### Language Settings

**UI Language**:
- Follow system
- English
- 中文 (Simplified Chinese)

Changes apply immediately.

### Data Settings

**View Information**:
- Data file location
- Encryption status
- Storage used

**Actions**:
- Open data folder: Opens file explorer

---

## Plugins and MCP

### Claude Code Plugins

Plugins extend Claude Code with additional capabilities.

**Viewing Plugins**:
1. Open Claude Code tab in right panel
2. Click "Plugins" button
3. See list of installed plugins

**Installing Plugins**:
1. Enter plugin name in input field
2. Click "Install"
3. Watch installation output
4. Plugin available after installation completes

**Managing Plugins**:
- **Update**: Updates plugin to latest version
- **Disable**: Temporarily disables plugin
- **Enable**: Re-enables disabled plugin

**Plugin Status**:
- ✓ Enabled and active
- ○ Installed but disabled
- Updates show version numbers

### MCP (Model Context Protocol)

MCP tools provide additional context and capabilities.

**Viewing MCP Tools**:
1. Open Claude Code tab
2. Click "MCP" button
3. See configured MCP servers

**MCP Information**:
- Server name
- Status (running/stopped)
- Configuration preview

**Managing MCP**:
- Configure via Claude Code CLI
- Claudex displays status only
- Use Interactive Claude for advanced MCP operations

---

## Interactive Claude

Some operations require the full Claude Code TUI (text user interface) with native prompts, patch approval, or interactive controls. For these, use the **Interactive Claude** button.

### When to Use

Use Interactive Claude for:
- **Permission prompts**: Operations requiring explicit approval
- **Patch approval**: Reviewing and accepting code changes line-by-line
- **Slash commands**: Running Claude Code commands like `/review`, `/implement`
- **Interactive operations**: Anything requiring back-and-forth in TUI
- **Full feature access**: When Claudex's non-interactive mode isn't sufficient

### How It Works

1. Click "Interactive Claude" button (in Claude Code panel or elsewhere)
2. External terminal opens running Claude Code CLI
3. Full TUI interface available
4. Work completes in terminal
5. Close terminal when done
6. Return to Claudex

### Context Preservation

When launching Interactive Claude:
- Project context passed via working directory
- Claude Code authentication preserved
- Plugin and MCP config available
- Independent session from Claudex chat

---

## Keyboard Shortcuts

Master these shortcuts for faster navigation.

### Global Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl+K` | Open command palette |
| `Cmd/Ctrl+N` | New chat |
| `Cmd/Ctrl+,` | Open settings |
| `Cmd/Ctrl+P` | Select project |
| `Cmd/Ctrl+B` | Toggle sidebar |
| `Cmd/Ctrl+\` | Toggle right panel |
| `Cmd/Ctrl+Shift+F` | Search chats |
| `Cmd/Ctrl+/` | Show keyboard shortcuts |
| `Escape` | Close modal/cancel |

### Composer Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message |
| `Shift+Enter` | New line |

### Tips

- **Mac**: Uses `Cmd` (Command key)
- **Windows/Linux**: Uses `Ctrl` (Control key)
- **View all shortcuts**: Press `Cmd/Ctrl+/`
- **Muscle memory**: Practice common shortcuts (K, N, P, ,) for speed

---

## FAQ

### General

**Q: What's the difference between Claudex and Claude Code?**  
A: Claude Code is the CLI tool from Anthropic. Claudex is a desktop GUI that integrates with Claude Code CLI (or connects to APIs directly). Think of Claudex as a visual interface for AI coding assistance.

**Q: Do I need Claude Code installed?**  
A: Only if using "Claude Code" execution mode (recommended). "Direct API" mode works without Claude Code CLI.

**Q: Is my data sent to the cloud?**  
A: Only API requests go to cloud providers. Chat history, settings, and project data stay local on your machine.

**Q: Are API keys secure?**  
A: Yes. API keys are encrypted at rest using Electron's safeStorage module before being saved to disk.

### Execution Modes

**Q: Which execution mode should I use?**  
A: Claude Code mode if you have it installed (better features, skills, plugins). Direct API mode if you want simplicity or use non-Claude models.

**Q: Can I switch between modes?**  
A: Yes, change "Execution Mode" in Settings. Chat history persists across mode changes.

**Q: Why use Ollama mode?**  
A: Run local models without API costs or internet dependency. Requires Ollama installed and running.

### Features

**Q: Can I use this for non-coding tasks?**  
A: Yes, but it's optimized for coding. General chat and writing work fine.

**Q: Does it support multiple AI models?**  
A: Yes, configure model in Settings. Claude Code mode uses Claude models; Direct API mode supports any compatible model.

**Q: Can I customize the theme?**  
A: Dark theme only in v0.1.0. Customization planned for future releases.

**Q: Does it work offline?**  
A: No, both execution modes require network for AI inference.

### Troubleshooting

**Q: "Claude Code not detected" error?**  
A: Ensure Claude CLI is installed, in PATH, and authenticated. Run `claude --version` in terminal to verify.

**Q: API key not working?**  
A: Check key validity, correct base URL, and internet connection. Re-enter key in Settings if needed.

**Q: Streaming freezes or times out?**  
A: Increase timeout in Settings. Check network connection. Try switching execution mode.

**Q: Can't save edited files?**  
A: Verify write permissions to project folder. Check disk space. Ensure project path is valid.

**Q: Application crashes on startup?**  
A: Check Windows version (requires 10/11 64-bit). Launch from a terminal with `npm run desktop` (dev) or by running `Claudex.exe` from a console window to see startup errors printed to stdout.

### Advanced

**Q: How do I use custom models with Ollama?**  
A: Pull model with `ollama pull model-name`, then set model in Settings to match exact name.

**Q: Can I use a proxy?**  
A: System proxy settings are respected. For custom proxy, configure at OS level.

**Q: Where is data stored?**  
A: `%APPDATA%\Claudex\desktop-data.json` on Windows — one JSON file holding settings (API keys encrypted), projects, and chat sessions. View the exact path in Settings → Data.

**Q: How do I backup my chats?**  
A: Copy the single `%APPDATA%\Claudex\desktop-data.json` file, or use Settings → Data → "Open data file" to access it directly.

**Q: Can I run multiple instances?**  
A: No, only one Claudex instance at a time currently.

**Q: How do I update Claudex?**  
A: Download new version and reinstall. Settings and chats are preserved.

---

## Need More Help?

- **Check README.md** for installation and overview
- **See DEVELOPER.md** for technical details
- **Review CODEX_APP_UIUX_REBUILD_SPEC.md** for design rationale
- **Check errors** via in-app DevTools (Ctrl+Shift+I) for renderer issues, or the terminal running `npm run desktop` for main-process issues
