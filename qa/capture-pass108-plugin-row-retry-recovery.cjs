const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass108-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass108-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass108-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const COMMAND_LOG = path.join(USER_DATA_DIR, "claude-command-log.txt");
const DISABLE_COUNT_FILE = path.join(USER_DATA_DIR, "pass108-disable-count.txt");

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
const disableCountFile = ${JSON.stringify(DISABLE_COUNT_FILE)};
function disableCount() { try { return Number(fs.readFileSync(disableCountFile, 'utf8')) || 0; } catch (_error) { return 0; } }
fs.appendFileSync(commandLog, args.join(' ') + '\\n', 'utf8');
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
if (args[0] === '--version') out('2.10.8 (Claude Code QA)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([
  { id: 'qa-retry-plugin@qa-market', version: '10.8.0', scope: 'user', enabled: disableCount() < 2, installPath: 'C:/qa/retry' }
]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins:\\n\\n  > qa-retry-plugin@qa-market\\n    Version: 10.8.0\\n    Scope: user\\n    Status: ' + (disableCount() < 2 ? '? enabled' : '? disabled'));
else if (args[0] === 'mcp' && args[1] === 'list') out('? qa-mcp: connected');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else if (args[0] === 'plugin' && args[1] === 'disable' && args[2] === 'qa-retry-plugin@qa-market') {
  const nextDisableCount = disableCount() + 1;
  fs.writeFileSync(disableCountFile, String(nextDisableCount), 'utf8');
  if (nextDisableCount === 1) { process.stderr.write('pass108 disable failed\\n'); process.exit(18); }
  else out('ok plugin disable qa-retry-plugin@qa-market');
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass108-project" }), "utf8");
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
    activeProject: { name: "pass108-project", path: PROJECT_DIR },
    projects: [{ name: "pass108-project", path: PROJECT_DIR }],
    sessions: [
      {
        id: "default",
        title: "Plugin retry recovery",
        project: "pass108-project",
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-06T00:00:00.000Z",
        updatedAt: "2026-07-06T00:00:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    automations: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS108_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS108_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS108_OPEN_CAPABILITIES", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.nav-stack button')].find((candidate) => /\\u63d2\\u4ef6/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS108_PLUGIN_ROW_READY", await waitFor(win, `
    Boolean(document.querySelector('.plugin-manager-modal') && /qa-retry-plugin@qa-market/.test(document.querySelector('.plugin-manager-list')?.textContent || ''))
  `, 15000));

  const beforeDisable = readCommandLog();
  assertStep("PASS108_CLICK_DISABLE", await win.webContents.executeJavaScript(`
    (function() {
      const row = [...document.querySelectorAll('.structured-plugin-row')]
        .find((item) => /qa-retry-plugin@qa-market/.test(item.textContent || ''));
      const button = row?.querySelector('.structured-row-actions button');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS108_DISABLE_CONFIRM_VISIBLE", await waitFor(win, "Boolean(document.querySelector('.plugin-cli-confirm'))", 5000));
  assertStep("PASS108_DISABLE_NOT_RUN_BEFORE_CONFIRM", !/plugin disable qa-retry-plugin@qa-market/.test(readCommandLog().slice(beforeDisable.length)));
  assertStep("PASS108_CONFIRM_DISABLE", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.plugin-cli-confirm .danger-action');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS108_DISABLE_RAN", await waitForLog(/plugin disable qa-retry-plugin@qa-market/));
  assertStep("PASS108_PLUGIN_ROW_FAILURE_RETRY_VISIBLE", await waitFor(win, `
    (function() {
      const row = [...document.querySelectorAll('.structured-plugin-row')]
        .find((item) => /qa-retry-plugin@qa-market/.test(item.textContent || ''));
      const text = row?.textContent || '';
      const retry = [...(row?.querySelectorAll('.row-cli-action-evidence.error button') || [])]
        .find((button) => /\\u91cd\\u8bd5/.test(button.textContent || ''));
      return Boolean(
        row?.classList.contains('focused-capability-row') &&
        /pass108 disable failed/.test(text) &&
        /18/.test(text) &&
        retry
      );
    })();
  `, 10000));

  const beforeRetry = readCommandLog();
  assertStep("PASS108_CLICK_RETRY", await win.webContents.executeJavaScript(`
    (function() {
      const row = [...document.querySelectorAll('.structured-plugin-row')]
        .find((item) => /qa-retry-plugin@qa-market/.test(item.textContent || ''));
      const retry = [...(row?.querySelectorAll('.row-cli-action-evidence.error button') || [])]
        .find((button) => /\\u91cd\\u8bd5/.test(button.textContent || ''));
      if (!retry) return false;
      retry.click();
      return true;
    })();
  `));
  assertStep("PASS108_RETRY_CONFIRM_VISIBLE", await waitFor(win, "Boolean(document.querySelector('.plugin-cli-confirm'))", 5000));
  assertStep("PASS108_RETRY_NOT_RUN_BEFORE_CONFIRM", !/plugin disable qa-retry-plugin@qa-market/.test(readCommandLog().slice(beforeRetry.length)));
  assertStep("PASS108_CONFIRM_RETRY", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.plugin-cli-confirm .danger-action');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS108_RETRY_DISABLE_RAN", await waitForLog(/plugin disable qa-retry-plugin@qa-market(?:.|\n)*plugin disable qa-retry-plugin@qa-market/, 12000));
  assertStep("PASS108_PLUGIN_ROW_RETRY_RECOVERED", await waitFor(win, `
    (function() {
      const row = [...document.querySelectorAll('.structured-plugin-row')]
        .find((item) => /qa-retry-plugin@qa-market/.test(item.textContent || ''));
      const text = row?.textContent || '';
      return Boolean(
        row?.classList.contains('focused-capability-row') &&
        row?.querySelector('.plugin-status-badge.disabled') &&
        row?.querySelector('.row-cli-action-evidence.ok') &&
        /ok plugin disable qa-retry-plugin@qa-market/.test(text) &&
        !/pass108 disable failed/.test(document.querySelector('.plugin-cli-error')?.textContent || '')
      );
    })();
  `, 15000));
  assertStep("PASS108_RETRY_PERSISTED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const runs = state.commandRuns?.filter((run) => run.kind === 'capability' && /plugin disable qa-retry-plugin@qa-market/.test(run.command || '')) || [];
      return Boolean(
        runs.length >= 2 &&
        runs.some((run) => run.code === 18 && /pass108 disable failed/.test(run.stderr || '')) &&
        runs.some((run) => run.code === 0 && /ok plugin disable qa-retry-plugin@qa-market/.test(run.stdout || ''))
      );
    })();
  `, 10000));

  console.log("PASS108_PLUGIN_ROW_RETRY_RECOVERY_DONE");
  cleanup();
  app.exit(0);
}

const fakeClaudeCommand = writeFakeClaude();
app.setPath("userData", USER_DATA_DIR);
writeInitialStore(fakeClaudeCommand);
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS108_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS108_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
