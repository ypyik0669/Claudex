const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const PROJECT_PATH = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass66-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass66-bin-"));
const PROJECT_FIXTURE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass66-project-"));
const COMMAND_LOG = path.join(USER_DATA_DIR, "claude-command-log.txt");
const CUSTOM_URL = "https://example.invalid/pass66-marketplace.json";

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_FIXTURE_DIR]) {
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

function readCommandLog() {
  try {
    return fs.readFileSync(COMMAND_LOG, "utf8");
  } catch (_error) {
    return "";
  }
}

async function wait(ms) {
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

const fakeClaudeScript = `
const fs = require('fs');
const args = process.argv.slice(2);
const commandLog = ${JSON.stringify(COMMAND_LOG)};
fs.appendFileSync(commandLog, args.join(' ') + '\\n', 'utf8');
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
if (args[0] === '--version') out('2.9.0 (Claude Code QA)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else if (args[0] === 'mcp' && args[1] === 'list') out('✓ pass66-mcp: connected');
else out('fake claude command: ' + args.join(' '));
`;

fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
const FAKE_CLAUDE_COMMAND = path.join(FAKE_BIN_DIR, "claude.cmd");
process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;

app.setPath("userData", USER_DATA_DIR);
fs.mkdirSync(USER_DATA_DIR, { recursive: true });
fs.writeFileSync(path.join(PROJECT_FIXTURE_DIR, "package.json"), JSON.stringify({ name: "pass66" }), "utf8");
writeJson(path.join(USER_DATA_DIR, "desktop-data.json"), {
  version: 1,
  settings: {
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    baseUrl: "https://api.example.invalid",
    temperature: 0.2,
    timeoutMs: 600000,
    language: "zh",
    appearance: { fontSize: "compact", density: "compact" },
    claudeCode: { executionMode: "claude-code", claudeCommand: FAKE_CLAUDE_COMMAND, permissionMode: "default" },
    capabilities: {
      "project-context": true,
      "terminal-helper": true,
      "mcp-runtime": true,
      "plugin-router": true,
      "marketplace-router": true,
      "custom-marketplaces": true,
    },
    customMarketplaces: [],
  },
  activeProject: { name: "pass66-project", path: PROJECT_FIXTURE_DIR },
  projects: [{ name: "pass66-project", path: PROJECT_FIXTURE_DIR }],
  sessions: [
    {
      id: "default",
      title: "新聊天",
      project: "pass66-project",
      projectPath: PROJECT_FIXTURE_DIR,
      createdAt: "2026-07-06T00:00:00.000Z",
      updatedAt: "2026-07-06T00:00:00.000Z",
      messages: [],
    },
  ],
  commandRuns: [],
});

require(path.join(PROJECT_PATH, "electron", "main.cjs"));

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS66_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS66_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS66_OPEN_CAPABILITIES", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.nav-stack button')].find((candidate) => /插件/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS66_OPEN_MARKETPLACE", await waitFor(win, "Boolean(document.querySelector('.plugin-manager-tabs'))", 10000) && await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.plugin-manager-tabs button')].find((candidate) => /市场/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS66_CUSTOM_EMPTY_LOCAL_SCOPE", await waitFor(win, `
    (function() {
      const cards = [...document.querySelectorAll('.marketplace-card')];
      const card = cards.find((item) => /自定义市场/.test(item.textContent || ''));
      const text = card?.textContent || '';
      return Boolean(card && /本地记录/.test(text) && /未注入 Claude CLI/.test(text));
    })();
  `, 10000));
  assertStep("PASS66_MARKETPLACE_TAB_COUNT_EMPTY_REAL", await win.webContents.executeJavaScript(`
    (function() {
      const tab = [...document.querySelectorAll('.plugin-manager-tabs button')]
        .find((candidate) => /市场/.test(candidate.textContent || ''));
      return tab?.querySelector('em')?.textContent?.trim() === '0';
    })();
  `));

  const beforeAdd = readCommandLog();
  assertStep("PASS66_ADD_CUSTOM_MARKETPLACE", await win.webContents.executeJavaScript(`
    (function() {
      const cards = [...document.querySelectorAll('.marketplace-card')];
      const card = cards.find((item) => /自定义市场/.test(item.textContent || ''));
      const input = card?.querySelector('input');
      const button = card?.querySelector('button[type="submit"]');
      if (!input || !button) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, ${JSON.stringify(CUSTOM_URL)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      button.click();
      return true;
    })();
  `));
  assertStep("PASS66_CUSTOM_ROW_LOCAL_ONLY", await waitFor(win, `
    (function() {
      const rows = [...document.querySelectorAll('.marketplace-source-row')];
      const row = rows.find((item) => /pass66-marketplace/.test(item.textContent || ''));
      const text = row?.textContent || '';
      return Boolean(row && /本地记录/.test(text) && /未注入 Claude CLI/.test(text) && /设置/.test(text));
    })();
  `, 10000));
  assertStep("PASS66_MARKETPLACE_TAB_COUNT_CUSTOM_REAL", await win.webContents.executeJavaScript(`
    (function() {
      const tab = [...document.querySelectorAll('.plugin-manager-tabs button')]
        .find((candidate) => /市场/.test(candidate.textContent || ''));
      return tab?.querySelector('em')?.textContent?.trim() === '1';
    })();
  `));
  assertStep("PASS66_CUSTOM_STATE_PERSISTED", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      return state.settings?.customMarketplaces?.includes(${JSON.stringify(CUSTOM_URL)});
    })();
  `));
  assertStep("PASS66_CUSTOM_DID_NOT_RUN_CLI", !/pass66-marketplace|marketplace add|marketplace install|marketplace update/.test(readCommandLog().slice(beforeAdd.length)));
  assertStep("PASS66_CUSTOM_DID_NOT_PERSIST_COMMAND_RUNS", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      return !state.commandRuns || state.commandRuns.length === 0;
    })();
  `));

  console.log("PASS66_CUSTOM_MARKETPLACE_LOCAL_STATE_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch((error) => {
  console.error("PASS66_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS66_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
