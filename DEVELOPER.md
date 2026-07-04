# Claudex Developer Guide

## Table of Contents
1. [Development Setup](#development-setup)
2. [Project Structure](#project-structure)
3. [Architecture Overview](#architecture-overview)
4. [Build Process](#build-process)
5. [Packaging](#packaging)
6. [Debugging](#debugging)
7. [Code Patterns](#code-patterns)
8. [Contributing](#contributing)
9. [Release Process](#release-process)

---

## Development Setup

### Prerequisites

- **Node.js**: v18.0.0 or later
- **npm**: v9.0.0 or later
- **Git**: For version control
- **Windows**: Development primarily targets Windows (macOS/Linux support planned)
- **Claude Code CLI**: v2.1.199+ (optional, for testing Claude Code mode)

### Initial Setup

```bash
# Clone or navigate to repository
cd claude-code-app

# Install dependencies
npm install

# Verify installation
npm run dev  # Should start dev server
```

### Development Scripts

```bash
# Development mode (browser preview with HMR)
npm run dev

# Build production frontend
npm run build

# Run packaged desktop app (requires build first)
npm run desktop

# Package for Windows distribution
npm run dist:win

# Preview production build in browser
npm run preview
```

---

## Project Structure

```
claude-code-app/
├── src/
│   ├── App.jsx              # Main React component (1850+ lines)
│   │                        # Contains all UI components, state management, IPC handlers
│   ├── main.jsx             # React entry point
│   ├── styles.css           # Global styles (1745 lines)
│   │                        # CSS custom properties, component styles, responsive
│   └── hooks/
│       └── useKeyboard.js   # Keyboard shortcuts hook
│
├── electron/
│   ├── main.cjs             # Electron main process
│   │                        # Window management, IPC handlers, native APIs
│   └── preload.cjs          # Preload script
│                            # Secure IPC bridge, exposes claudexDesktop API
│
├── dist/                    # Built frontend (generated)
│   ├── index.html
│   ├── assets/              # Bundled JS, CSS, fonts
│   └── ...
│
├── release/                 # Packaged binaries (generated)
│   ├── win-unpacked/        # Unpacked Windows app
│   └── Claudex-*.exe        # Installers and distributables
│
├── docs/
│   └── superpowers/         # Implementation documentation
│       ├── audit/           # Gap analysis
│       ├── packaging/       # Build logs
│       ├── qa/              # Quality assurance reports
│       └── specs/           # Design specifications
│
├── build/                   # Build assets
│   └── icon.ico             # Application icon
│
├── package.json             # Dependencies, scripts, electron-builder config
├── package-lock.json        # Locked dependency versions
│
├── README.md                # User-facing documentation
├── USER_GUIDE.md            # Detailed usage guide
├── DEVELOPER.md             # This file
├── CODEX_APP_UIUX_REBUILD_SPEC.md  # Complete design specification
├── design-qa.md             # Design QA results
├── AGENTS.md                # Prototype instructions
└── 使用说明.md             # Chinese usage guide
```

### Key Files Deep Dive

**src/App.jsx**:
- Single-file React component architecture
- All UI components inline (Sidebar, Conversation, ToolsPanel, Modals)
- State management via useState hooks
- Desktop API integration via `window.claudexDesktop`
- ~1850 lines - consider splitting if grows beyond 2500

**electron/main.cjs**:
- Creates BrowserWindow
- Registers IPC handlers (saveSettings, runClaudeCommand, etc.)
- Handles file system operations
- Manages native dialogs
- Child process spawning for commands

**electron/preload.cjs**:
- Exposes safe IPC methods to renderer
- Creates `window.claudexDesktop` API
- Context isolation bridge
- No direct node.js access from renderer

**src/styles.css**:
- CSS custom properties for theming
- Component-scoped class names
- Responsive breakpoints (1240px, 860px, 560px)
- Dark theme only currently

---

## Architecture Overview

### Technology Stack

**Frontend**:
- React 19.2.0 (functional components, hooks)
- Vite 6.4.2 (build tool, dev server, HMR)
- Lucide React (icon library)
- No state management library (local state only)

**Desktop**:
- Electron 43.0.0
- electron-builder 26.15.3 (packaging)
- Native Node.js APIs in main process

**Fonts**:
- JetBrains Mono (monospace)
- Space Grotesk (sans-serif)
- Lora (serif, minimal use)

### Process Architecture

```
┌─────────────────────────────────────────┐
│  Main Process (electron/main.cjs)       │
│  - Window lifecycle                     │
│  - IPC handlers                         │
│  - File system operations               │
│  - Child process spawning               │
│  - Native APIs                          │
└─────────────────┬───────────────────────┘
                  │ IPC
        ┌─────────┴─────────┐
        │                   │
┌───────▼─────────┐ ┌───────▼──────────┐
│  Preload Script │ │  Renderer Process │
│  (preload.cjs)  │ │  (React App)      │
│  - IPC bridge   │ │  - UI rendering   │
│  - contextBridge│ │  - User interaction│
└─────────────────┘ │  - State management│
                    └────────────────────┘
```

### Data Flow

**Settings Persistence**:
```
User changes settings
→ React state update
→ IPC call: saveSettings(newSettings)
→ Main process: encrypt API keys, write JSON
→ IPC response: updated settings
→ React state update with confirmation
```

**Claude Code Execution**:
```
User sends message
→ IPC call: runClaudeCommand(message, settings)
→ Main process: spawn `claude -p --output-format json`
→ Stream output via IPC events
→ Renderer: append delta to message
→ Final: save complete message to chat history
```

**File Operations**:
```
User opens file in Workspace
→ IPC call: readFile(projectPath, relativePath)
→ Main process: fs.readFile
→ IPC response: file contents
→ Renderer: display in editor
→ User edits
→ User clicks Save (after reviewing diff)
→ IPC call: saveFile(projectPath, relativePath, newContent)
→ Main process: fs.writeFile
→ IPC response: success/error
→ Renderer: show confirmation
```

### State Management

**Global State** (App.jsx):
```javascript
const [state, setState] = useState({
  projects: [],
  sessions: [],
  settings: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    apiKey: '',  // encrypted
    executionMode: 'claude-code',
    capabilities: {},
    // ...
  },
});
```

**Local Component State**:
- `activeSession` - current chat
- `activeProject` - selected project
- `draft` - composer input
- `isStreaming` - streaming indicator
- Modal open/closed states
- UI toggles (sidebar, panels)

**No Redux/MobX**: Intentionally avoiding external state libraries for simplicity. May add if state grows complex.

---

## Build Process

### Development Build

```bash
npm run dev
```

**What happens**:
1. Vite starts dev server on `http://127.0.0.1:5173`
2. Hot Module Replacement (HMR) enabled
3. Source maps generated
4. React Fast Refresh active
5. No Electron - runs in browser for rapid iteration

**Desktop API Warning**: Browser preview shows warning banner since `window.claudexDesktop` doesn't exist. This is expected. Full features require packaged desktop app.

### Production Build

```bash
npm run build
```

**What happens**:
1. Vite bundles React app for production
2. Code splitting (separate chunks for fonts, etc.)
3. Minification
4. Tree shaking
5. Output to `dist/` directory
6. ~255KB JS (gzipped: 78KB), ~60KB CSS (gzipped: 22KB)

**Build artifacts**:
- `dist/index.html` - Entry point
- `dist/assets/index-[hash].js` - Main bundle
- `dist/assets/index-[hash].css` - Styles
- `dist/assets/*.woff2` - Fonts

### Packaging

```bash
npm run dist:win
```

**What happens**:
1. Runs `npm run build` first
2. electron-builder packages app
3. Downloads Electron binaries (if not cached)
4. Creates app structure in `release/`
5. Generates NSIS installer and ZIP archive

**Output**:
- `release/win-unpacked/` - Unpacked application folder
- `release/Claudex-0.1.0-Setup.exe` - NSIS installer
- `release/Claudex-0.1.0-win.zip` - Portable archive

**Troubleshooting**:
- **"ENOENT: no such file or directory, rename electron.exe"**: Claudex is running. Close all instances.
- **"description is missed"**: Warning only, doesn't block packaging.
- **"author is missed"**: Warning only, doesn't block packaging.

---

## Packaging

### Configuration

Packaging config in `package.json`:

```json
{
  "build": {
    "appId": "local.claudex.desktop",
    "productName": "Claudex",
    "directories": {
      "output": "release"
    },
    "files": [
      "dist/**/*",
      "electron/**/*",
      "build/**/*",
      "package.json"
    ],
    "win": {
      "target": ["nsis", "zip"],
      "icon": "build/icon.ico",
      "artifactName": "Claudex-${version}.${ext}"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true,
      "shortcutName": "Claudex"
    }
  }
}
```

### Custom Output Directory

To avoid conflicts with running instances:

```bash
npx electron-builder --win dir --config.directories.output=release-v2
```

### Packaging for Distribution

Full distributable with installer:

```bash
npm run dist:win
```

Creates:
- NSIS installer (one-click or custom install)
- Portable ZIP (extract and run)

### Icon Requirements

- **Format**: ICO (Windows icon format)
- **Location**: `build/icon.ico`
- **Sizes**: 256x256, 128x128, 64x64, 48x48, 32x32, 16x16 (embedded in ICO)
- **Tool**: Use https://icoconvert.com or similar

---

## Debugging

### Browser DevTools (Development)

```bash
npm run dev
# Open http://127.0.0.1:5173 in Chrome
# Press F12 for DevTools
```

**Available**:
- React DevTools extension
- Console logging
- Network tab
- Source debugging with source maps

**Not Available**:
- Desktop APIs (`window.claudexDesktop` undefined)
- File system operations
- Child process execution

### Electron DevTools (Production)

```bash
npm run desktop
# App opens
# Press Ctrl+Shift+I (Windows) or Cmd+Opt+I (Mac) for DevTools
```

**Available**:
- Full desktop API access
- Console in renderer process
- Network requests
- React DevTools (if extension installed in Electron)

### Main Process Debugging

Add logging to `electron/main.cjs`:

```javascript
console.log('[MAIN]', 'Something happened:', data);
```

Logs appear in terminal where `npm run desktop` was executed.

### IPC Debugging

Log IPC messages:

**In main.cjs**:
```javascript
ipcMain.handle('some-channel', (event, args) => {
  console.log('[IPC IN]', 'some-channel', args);
  const result = doSomething(args);
  console.log('[IPC OUT]', 'some-channel', result);
  return result;
});
```

**In App.jsx**:
```javascript
const result = await window.claudexDesktop?.someMethod(args);
console.log('[IPC RESULT]', result);
```

### Common Issues

**Desktop API undefined**:
- Check if running in Electron (not browser)
- Verify preload script loaded correctly
- Check `webPreferences.preload` in main.cjs

**IPC handler not found**:
- Ensure `ipcMain.handle` registered in main.cjs
- Check channel name matches exactly
- Verify main process has started

**Settings not persisting**:
- Check write permissions to `%APPDATA%\Claudex\` (single store file: `desktop-data.json`)
- Verify `saveSettings` IPC handler called
- Check for errors in main process console

---

## Code Patterns

### React Component Pattern

```javascript
function MyComponent({ prop1, prop2, onAction }) {
  const [localState, setLocalState] = useState(initialValue);

  function handleEvent() {
    // Logic here
    onAction(result);
  }

  return (
    <div className="my-component">
      {/* JSX here */}
    </div>
  );
}
```

### IPC Call Pattern

```javascript
// In renderer (App.jsx)
async function callDesktopApi() {
  if (!desktopApi) {
    console.warn('Desktop API not available');
    return;
  }

  try {
    const result = await desktopApi.someMethod(args);
    // Handle result
  } catch (error) {
    console.error('API call failed:', error);
    // Show error to user
  }
}

// In main (main.cjs)
ipcMain.handle('some-method', async (event, args) => {
  try {
    const result = await doSomething(args);
    return result;
  } catch (error) {
    console.error('[MAIN] Error:', error);
    throw error;  // Propagates to renderer
  }
});
```

### Streaming Pattern

```javascript
// Main process spawns child, streams to renderer
const child = spawn('command', args);
child.stdout.on('data', (chunk) => {
  mainWindow.webContents.send('stream-data', chunk.toString());
});

// Renderer accumulates stream
useEffect(() => {
  const handler = (data) => {
    setOutput((prev) => prev + data);
  };
  window.addEventListener('stream-data', handler);
  return () => window.removeEventListener('stream-data', handler);
}, []);
```

### State Update Pattern

```javascript
// Prefer functional updates when new state depends on old
setMessages((prev) => [...prev, newMessage]);

// Avoid direct mutation
// ❌ messages.push(newMessage);
// ✅ setMessages([...messages, newMessage]);

// Nested state updates
setState((prev) => ({
  ...prev,
  settings: {
    ...prev.settings,
    model: newModel,
  },
}));
```

---

## Contributing

### Code Style

- **JavaScript**: Modern ES6+, no TypeScript currently
- **Components**: Functional components with hooks
- **Naming**: camelCase for functions/variables, PascalCase for components
- **Formatting**: 2-space indentation, no semicolons (enforced by Prettier if added)
- **Comments**: Minimal, code should be self-documenting

### Before Submitting

1. **Build succeeds**:
   ```bash
   npm run build
   ```

2. **Package succeeds**:
   ```bash
   npm run desktop  # Should launch without errors
   ```

3. **Manual testing**:
   - All keyboard shortcuts work
   - Modals open/close smoothly
   - Settings persist after restart
   - Both execution modes function
   - No console errors

4. **Code review**:
   - No sensitive data (API keys, tokens) hardcoded
   - Error handling present
   - User feedback for actions
   - Responsive at tested breakpoints

### Adding Features

1. **Read spec first**: Check `CODEX_APP_UIUX_REBUILD_SPEC.md`
2. **Check existing patterns**: Match current code style
3. **Test both modes**: Claude Code and Direct API
4. **Document**: Update README, USER_GUIDE if user-facing

---

## Release Process

### Version Bump

1. Update `package.json`:
   ```json
   {
     "version": "0.2.0"
   }
   ```

2. Update changelog in `README.md`

### Build Release

```bash
# Ensure clean build
npm run build

# Package for distribution
npm run dist:win
```

### Test Release

1. Install from `release/Claudex-*-Setup.exe`
2. Run smoke tests (see RUNTIME_SMOKE.md)
3. Verify settings persist after restart
4. Test on clean Windows install if possible

### Distribute

1. Upload artifacts:
   - `Claudex-X.Y.Z-Setup.exe` (installer)
   - `Claudex-X.Y.Z-win.zip` (portable)

2. Create release notes:
   - New features
   - Bug fixes
   - Breaking changes
   - Known issues

### Versioning

Follow semantic versioning (semver):
- **0.1.0** → **0.2.0**: New features, backwards-compatible
- **0.1.0** → **1.0.0**: Stable release, API locked
- **0.1.0** → **0.1.1**: Bug fixes only

---

## Additional Resources

- **Electron Docs**: https://www.electronjs.org/docs
- **React Docs**: https://react.dev
- **Vite Docs**: https://vite.dev
- **electron-builder Docs**: https://www.electron.build

---

## License

[License information to be added]

## Contact

For development questions or contributions, see repository issues or contact maintainers.
