const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass57-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass57-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass57-project-"));
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
if (args[0] === '--version') out('2.9.0 (Claude Code QA)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) {
  process.stderr.write('pass57 plugin json failed\\n');
  process.exit(21);
}
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins:\\n\\n  > pass57-installed@qa\\n    Version: 1.0.0\\n    Scope: user\\n    Status: ✓ enabled');
else if (args[0] === 'mcp' && args[1] === 'list') {
  process.stderr.write('pass57 mcp failed\\n');
  process.exit(22);
}
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) {
  process.stderr.write('pass57 marketplace json failed\\n');
  process.exit(23);
}
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') {
  process.stderr.write('pass57 marketplace failed\\n');
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass57-project" }), "utf8");
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
      claudeCode: { executionMode: "claude-code", claudeCommand, permissionMode: "default" },
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
    activeProject: { name: "pass57-project", path: PROJECT_DIR },
    projects: [{ name: "pass57-project", path: PROJECT_DIR }],
    sessions: [
      {
        id: "default",
        title: "新聊天",
        project: "pass57-project",
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-05T00:00:00.000Z",
        updatedAt: "2026-07-05T00:00:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    runEvents: [],
    notices: [],
  });
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS57_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS57_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS57_OPEN_CAPABILITIES", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.nav-stack button')].find((candidate) => /插件/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS57_STATUS_ISSUES_VISIBLE", await waitFor(win, `
    (function() {
      const card = document.querySelector('.plugin-status-issues');
      const text = card?.textContent || '';
      return Boolean(card &&
        /CLI 状态告警/.test(text) &&
        /pass57 plugin json failed/.test(text) &&
        /pass57 mcp failed/.test(text) &&
        /pass57 marketplace json failed/.test(text) &&
        /plugin list --json/.test(text) &&
        /mcp list/.test(text) &&
        /plugin marketplace list --json/.test(text));
    })();
  `, 15000));
  assertStep("PASS57_STATUS_ISSUES_ACTIONABLE", await win.webContents.executeJavaScript(`
    (function() {
      const card = document.querySelector('.plugin-status-issues');
      const buttons = [...(card?.querySelectorAll('button') || [])].map((button) => button.textContent || '').join(' ');
      return /重试状态/.test(buttons) && /打开 Claude 面板/.test(buttons);
    })();
  `));
  assertStep("PASS57_NO_FATAL_CLI_ERROR", await win.webContents.executeJavaScript("!document.querySelector('.plugin-cli-error')"));
  assertStep("PASS57_STATUS_DID_NOT_PERSIST_COMMAND_RUNS", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      return !state.commandRuns || state.commandRuns.length === 0;
    })();
  `));
  assertStep("PASS57_STORE_HAS_NO_COMMAND_RUNS", (() => {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return !parsed.commandRuns || parsed.commandRuns.length === 0;
  })());

  console.log("PASS57_CLI_STATUS_PARTIAL_FAILURES_DONE");
  cleanup();
  app.exit(0);
}

const fakeClaudeCommand = writeFakeClaude();
app.setPath("userData", USER_DATA_DIR);
writeInitialStore(fakeClaudeCommand);
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS57_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS57_TIMEOUT");
  cleanup();
  app.exit(1);
}, 80000);
