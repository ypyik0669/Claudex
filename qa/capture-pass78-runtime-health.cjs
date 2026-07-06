const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass78-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass78-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass78-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");

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
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
if (args[0] === '--version') out('2.9.0 (Claude Code QA pass78)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) {
  process.stderr.write('pass78 plugin json failed\\n');
  process.exit(21);
}
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins:\\n\\n  > pass78-installed@qa\\n    Version: 1.0.0\\n    Scope: user\\n    Status: enabled');
else if (args[0] === 'mcp' && args[1] === 'list') {
  process.stderr.write('pass78 mcp failed\\n');
  process.exit(22);
}
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) {
  process.stderr.write('pass78 marketplace json failed\\n');
  process.exit(23);
}
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') {
  process.stderr.write('pass78 marketplace failed\\n');
  process.exit(24);
}
else out('fake claude command: ' + args.join(' '));
`;
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
  return path.join(FAKE_BIN_DIR, "claude.cmd");
}

function writeInitialStore(claudeCommand) {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass78-project" }), "utf8");
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
      claudeCode: { executionMode: "claude-code", claudeCommand, permissionMode: "plan" },
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
    activeProject: { name: "pass78-project", path: PROJECT_DIR },
    projects: [{ name: "pass78-project", path: PROJECT_DIR }],
    sessions: [
      {
        id: "default",
        title: "新聊天",
        project: "pass78-project",
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-06T00:00:00.000Z",
        updatedAt: "2026-07-06T00:00:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    runEvents: [],
    notices: [],
  });
}

async function openCapabilities(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const pluginPattern = new RegExp("\\\\u63d2\\\\u4ef6");
      const button = [...document.querySelectorAll('.nav-stack button')].find((candidate) => pluginPattern.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function closeSurface(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.surface-back') || document.querySelector('.settings-surface header .icon-only') || document.querySelector('.plugin-manager-modal header .icon-only');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function openClaudeTool(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.tool-rail-button[data-tool="claude"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function openSettings(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', ctrlKey: true, bubbles: true }));
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS78_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS78_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS78_OPEN_CAPABILITIES", await openCapabilities(win));
  assertStep("PASS78_CAPABILITY_RUNTIME_HEALTH", await waitFor(win, `
    (function() {
      const card = document.querySelector('.capability-modal .runtime-health-card.error');
      const text = card?.textContent || '';
      return Boolean(card &&
        /pass78 plugin json failed/.test(text) &&
        /pass78 mcp failed/.test(text) &&
        /pass78 marketplace json failed/.test(text) &&
        /plugin list --json/.test(text) &&
        /mcp list/.test(text) &&
        /plugin marketplace list --json/.test(text) &&
        /claude-haiku-4-5-20251001/.test(text));
    })();
  `, 15000));
  assertStep("PASS78_CAPABILITY_ACTIONS", await win.webContents.executeJavaScript(`
    (function() {
      const card = document.querySelector('.capability-modal .runtime-health-card');
      const buttons = [...(card?.querySelectorAll('button') || [])].map((button) => button.textContent || '').join(' ');
      return /\\u91cd\\u8bd5\\u72b6\\u6001/.test(buttons) && /Claude/.test(buttons);
    })();
  `));

  assertStep("PASS78_CLOSE_CAPABILITIES", await closeSurface(win));
  await wait(350);
  assertStep("PASS78_OPEN_CLAUDE_TOOL", await openClaudeTool(win));
  assertStep("PASS78_CLAUDE_TOOL_RUNTIME_HEALTH", await waitFor(win, `
    (function() {
      const card = document.querySelector('.claude-command-detail .runtime-health-card.compact.error');
      const text = card?.textContent || '';
      return Boolean(card &&
        /claude-haiku-4-5-20251001/.test(text) &&
        /pass78 plugin json failed/.test(text) &&
        /pass78 mcp failed/.test(text));
    })();
  `, 15000));

  assertStep("PASS78_OPEN_SETTINGS", await openSettings(win));
  assertStep("PASS78_SETTINGS_RUNTIME_HEALTH", await waitFor(win, `
    (function() {
      const card = document.querySelector('.settings-runtime-section .runtime-health-card.error');
      const text = card?.textContent || '';
      return Boolean(card &&
        /2\\.9\\.0 \\(Claude Code QA pass78\\)/.test(text) &&
        /claude-haiku-4-5-20251001/.test(text) &&
        /pass78 marketplace json failed/.test(text));
    })();
  `, 15000));
  assertStep("PASS78_STATUS_DID_NOT_PERSIST_COMMAND_RUNS", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      return !state.commandRuns || state.commandRuns.length === 0;
    })();
  `));
  assertStep("PASS78_STORE_HAS_NO_COMMAND_RUNS", (() => {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return !parsed.commandRuns || parsed.commandRuns.length === 0;
  })());

  console.log("PASS78_RUNTIME_HEALTH_DONE");
  cleanup();
  app.exit(0);
}

const fakeClaudeCommand = writeFakeClaude();
app.setPath("userData", USER_DATA_DIR);
writeInitialStore(fakeClaudeCommand);
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS78_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS78_TIMEOUT");
  cleanup();
  app.exit(1);
}, 80000);
