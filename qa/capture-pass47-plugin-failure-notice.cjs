const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass47-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass47-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass47-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const COMMAND_LOG = path.join(USER_DATA_DIR, "claude-command-log.txt");

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

function readCommandLog() {
  try {
    return fs.readFileSync(COMMAND_LOG, "utf8");
  } catch (_error) {
    return "";
  }
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

async function waitForLog(pattern, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (pattern.test(readCommandLog())) return true;
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
const fs = require('fs');
const args = process.argv.slice(2);
const commandLog = ${JSON.stringify(COMMAND_LOG)};
fs.appendFileSync(commandLog, args.join(' ') + '\\n', 'utf8');
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
if (args[0] === '--version') out('2.9.0 (Claude Code QA)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([
  { id: 'qa-failing-plugin@qa-market', version: '9.9.9', scope: 'user', enabled: true, installPath: 'C:/qa/failing' }
]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins:\\n\\n  > qa-failing-plugin@qa-market\\n    Version: 9.9.9\\n    Scope: user\\n    Status: ✓ enabled');
else if (args[0] === 'mcp' && args[1] === 'list') out('✓ qa-mcp: connected');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else if (args[0] === 'plugin' && args[1] === 'disable' && args[2] === 'qa-failing-plugin@qa-market') {
  process.stderr.write('pass47 disable failed\\n');
  process.exit(17);
}
else out('fake claude command: ' + args.join(' '));
`;
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
  return path.join(FAKE_BIN_DIR, "claude.cmd");
}

function writeInitialStore(claudeCommand) {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass47-project" }), "utf8");
  writeJson(DATA_FILE, {
    version: 1,
    settings: {
      provider: "anthropic",
      model: "claude-sonnet-4-5-20250929",
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
    activeProject: { name: "pass47-project", path: PROJECT_DIR },
    projects: [{ name: "pass47-project", path: PROJECT_DIR }],
    sessions: [
      {
        id: "default",
        title: "新聊天",
        project: "pass47-project",
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-05T00:00:00.000Z",
        updatedAt: "2026-07-05T00:00:00.000Z",
        messages: [],
      },
    ],
    automations: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

async function openNoticesPanel(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = Array.from(document.querySelectorAll('.workspace-context-tabs .workspace-context-button'))[2];
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS47_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS47_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS47_OPEN_CAPABILITIES", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.nav-stack button')].find((candidate) => /插件/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS47_PLUGIN_ROW_READY", await waitFor(win, `
    Boolean(document.querySelector('.plugin-manager-modal') && /qa-failing-plugin@qa-market/.test(document.querySelector('.plugin-manager-list')?.textContent || ''))
  `, 15000));
  assertStep("PASS47_CLICK_DISABLE", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.structured-row-actions button');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS47_CONFIRM_VISIBLE", await waitFor(win, "Boolean(document.querySelector('.plugin-cli-confirm'))", 5000));
  assertStep("PASS47_CONFIRM_DISABLE", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.plugin-cli-confirm .danger-action');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS47_DISABLE_COMMAND_RAN", await waitForLog(/plugin disable qa-failing-plugin@qa-market/));
  assertStep("PASS47_PLUGIN_ERROR_VISIBLE", await waitFor(win, "Boolean(document.querySelector('.plugin-cli-error') && /pass47 disable failed/.test(document.body.textContent || ''))", 10000));
  assertStep("PASS47_NOTICE_RECORDED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      return Boolean(state.notices?.some((notice) => !notice.dismissedAt && notice.level === 'error' && /pass47 disable failed/.test((notice.title || '') + (notice.detail || ''))));
    })();
  `, 10000));
  assertStep("PASS47_STORE_PERSISTED", (() => {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return parsed.notices?.some((notice) => notice.level === "error" && /pass47 disable failed/.test(`${notice.title || ""} ${notice.detail || ""}`));
  })());
  assertStep("PASS47_BACK_TO_APP", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.surface-back');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS47_APP_RETURNED", await waitFor(win, "Boolean(document.querySelector('.workspace-context-tabs'))", 5000));
  assertStep("PASS47_OPEN_NOTICE_PANEL", await openNoticesPanel(win));
  assertStep("PASS47_NOTICE_VISIBLE", await waitFor(win, "Boolean(document.querySelector('.bottom-work-panel .notice-card.error') && /pass47 disable failed/.test(document.body.textContent || ''))", 8000));

  console.log("PASS47_PLUGIN_FAILURE_NOTICE_DONE");
  cleanup();
  app.exit(0);
}

const fakeClaudeCommand = writeFakeClaude();
app.setPath("userData", USER_DATA_DIR);
writeInitialStore(fakeClaudeCommand);
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS47_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS47_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
