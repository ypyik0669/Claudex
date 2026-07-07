const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

function findRepoDir() {
  const candidates = [
    process.env.CLAUDEX_REPO_DIR,
    process.cwd(),
    __dirname,
    path.join(__dirname, ".."),
  ].filter(Boolean);
  for (const candidate of candidates) {
    let current = path.resolve(candidate);
    while (current && current !== path.dirname(current)) {
      if (
        fs.existsSync(path.join(current, "package.json")) &&
        fs.existsSync(path.join(current, "electron", "main.cjs"))
      ) {
        return current;
      }
      current = path.dirname(current);
    }
  }
  throw new Error("Unable to locate Claudex repo root");
}

const REPO_DIR = findRepoDir();
process.chdir(REPO_DIR);

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass246-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass246-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass246-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const PASS246_DRAFT = "PASS246 restore focus to this composer draft";

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_DIR]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_error) {
      // best-effort cleanup
    }
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(win, script, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const ok = await win.webContents.executeJavaScript(script);
    if (ok) return true;
    await wait(150);
  }
  return false;
}

function assertStep(name, ok) {
  console.log(name, ok);
  if (!ok) throw new Error(`${name} failed`);
}

function writeFakeClaude() {
  const fakeClaudeScript = `
const args = process.argv.slice(2);
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value) + '\\n'); }
if (args[0] === '--version') out('2.46.0 (Claude Code PASS246)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out({ plugins: [] });
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out({ servers: [] });
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else out('pass246 fake claude command: ' + args.join(' '));
`;
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(FAKE_CLAUDE, `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function writeInitialStore() {
  writeFakeClaude();
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass246-project" }), "utf8");
  fs.writeFileSync(path.join(PROJECT_DIR, "pass246.txt"), "PASS246 workspace file", "utf8");
  const createdAt = "2026-07-08T05:50:00.000Z";
  const project = { name: "pass246-project", path: PROJECT_DIR };
  writeJson(DATA_FILE, {
    version: 1,
    settings: {
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      baseUrl: "https://api.example.invalid",
      temperature: 0.2,
      timeoutMs: 600000,
      language: "zh",
      appearance: { fontSize: "compact", density: "compact" },
      systemPrompt: "QA",
      claudeCode: { executionMode: "claude-code", claudeCommand: FAKE_CLAUDE, permissionMode: "default" },
      capabilities: {
        "project-context": true,
        "terminal-helper": true,
        "mcp-runtime": true,
        "plugin-router": true,
        "marketplace-router": true,
      },
      customMarketplaces: [],
      apiKeys: {},
    },
    activeProject: project,
    projects: [project],
    sessions: [
      {
        id: "pass246-thread",
        title: "PASS246 close tool panel thread",
        project: project.name,
        projectPath: project.path,
        createdAt,
        updatedAt: "2026-07-08T05:50:01.000Z",
        archived: false,
        messages: [{ role: "user", content: "PASS246 right panel close should restore focus", createdAt }],
      },
    ],
    commandRuns: [],
    runEvents: [],
    automations: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

async function debugState(win) {
  return win.webContents.executeJavaScript(`
    (async function() {
      return {
        rightPanelHidden: Boolean(document.querySelector('.app-grid.right-panel-hidden')),
        toolsPanelVisible: Boolean(document.querySelector('.tools-panel')),
        workspaceDetail: Boolean(document.querySelector('#workspace-tool-detail')),
        composerValue: document.querySelector('.prompt-box textarea')?.value || '',
        activeElement: {
          tag: document.activeElement?.tagName || '',
          className: document.activeElement?.className || '',
          matchesComposer: Boolean(document.activeElement?.matches?.('.prompt-box textarea')),
          value: document.activeElement?.value || '',
        },
        body: document.body.textContent,
      };
    })();
  `).catch((error) => ({ error: String(error?.message || error) }));
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS246_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS246_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));

  assertStep("PASS246_OPEN_TOOL_PANEL_FROM_COMPOSER", await waitFor(win, `
    (async function() {
      const textarea = document.querySelector('.prompt-box textarea');
      if (!textarea) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(textarea, ${JSON.stringify(PASS246_DRAFT)});
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.focus();
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: '\\\\', ctrlKey: true, bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 500));
      return Boolean(
        !document.querySelector('.app-grid.right-panel-hidden') &&
        document.querySelector('.tools-panel') &&
        document.querySelector('#workspace-tool-detail') &&
        textarea.value === ${JSON.stringify(PASS246_DRAFT)}
      );
    })();
  `, 12000));

  assertStep("PASS246_CLOSE_BUTTON_RESTORES_COMPOSER_FOCUS", await waitFor(win, `
    (async function() {
      const buttons = Array.from(document.querySelectorAll('.tools-panel .panel-toggle button'));
      const close = buttons.find((button) => button.getAttribute('aria-label') === '关闭') || buttons[buttons.length - 1];
      if (!close) return false;
      close.focus();
      await new Promise((resolve) => setTimeout(resolve, 80));
      close.click();
      await new Promise((resolve) => setTimeout(resolve, 450));
      const textarea = document.querySelector('.prompt-box textarea');
      return Boolean(
        document.querySelector('.app-grid.right-panel-hidden') &&
        document.querySelector('.tool-rail') &&
        textarea &&
        document.activeElement === textarea &&
        textarea.value === ${JSON.stringify(PASS246_DRAFT)}
      );
    })();
  `, 12000));

  console.log("PASS246_TOOL_PANEL_CLOSE_RESTORES_FOCUS_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS246_FAILED", error?.stack || error);
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    const debug = await debugState(win);
    console.error("PASS246_DEBUG", JSON.stringify(debug, null, 2).slice(0, 12000));
  }
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS246_TIMEOUT");
  cleanup();
  app.exit(1);
}, 120000);
