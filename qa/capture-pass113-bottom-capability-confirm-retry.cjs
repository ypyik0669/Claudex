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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass113-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass113-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass113-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const COMMAND_LOG = path.join(USER_DATA_DIR, "claude-command-log.txt");
const DISABLE_COUNT_FILE = path.join(USER_DATA_DIR, "pass113-disable-count.txt");

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
if (args[0] === '--version') out('2.11.3 (Claude Code QA)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([
  { id: 'qa-mutating-retry-plugin@qa-market', version: '11.3.0', scope: 'user', enabled: disableCount() < 2, installPath: 'C:/qa/mutating-retry' }
]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins:\\n\\n  > qa-mutating-retry-plugin@qa-market\\n    Version: 11.3.0\\n    Scope: user\\n    Status: ' + (disableCount() < 2 ? '? enabled' : '? disabled'));
else if (args[0] === 'mcp' && args[1] === 'list') out('? qa-mcp: connected');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else if (args[0] === 'plugin' && args[1] === 'disable' && args[2] === 'qa-mutating-retry-plugin@qa-market') {
  const nextDisableCount = disableCount() + 1;
  fs.writeFileSync(disableCountFile, String(nextDisableCount), 'utf8');
  if (nextDisableCount === 1) { process.stderr.write('pass113 disable failed\\n'); process.exit(33); }
  else out('ok plugin disable qa-mutating-retry-plugin@qa-market');
}
else out('pass113 fake claude command: ' + args.join(' '));
`;
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
  return path.join(FAKE_BIN_DIR, "claude.cmd");
}

function writeInitialStore(claudeCommand) {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass113-project" }), "utf8");
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
    activeProject: { name: "pass113-project", path: PROJECT_DIR },
    projects: [{ name: "pass113-project", path: PROJECT_DIR }],
    sessions: [
      {
        id: "default",
        title: "Bottom capability confirm retry",
        project: "pass113-project",
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

async function openCapabilities(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.nav-stack button')].find((candidate) => /\\u63d2\\u4ef6/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function closeSurface(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.surface-back');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function openOutputsPanel(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      if (document.querySelector('.bottom-work-panel .capability-command-evidence-stack')) return true;
      const button = [...document.querySelectorAll('.workspace-context-tabs .workspace-context-button')]
        .find((candidate) => /\\u8f93\\u51fa/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS113_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS113_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS113_OPEN_CAPABILITIES", await openCapabilities(win));
  assertStep("PASS113_PLUGIN_ROW_READY", await waitFor(win, `
    Boolean(document.querySelector('.plugin-manager-modal') &&
      /qa-mutating-retry-plugin@qa-market/.test(document.querySelector('.plugin-manager-list')?.textContent || ''))
  `, 15000));
  assertStep("PASS113_DISABLE_ACTION_READY", await waitFor(win, `
    (function() {
      const row = [...document.querySelectorAll('.structured-plugin-row')]
        .find((item) => /qa-mutating-retry-plugin@qa-market/.test(item.textContent || ''));
      const button = row?.querySelector('.structured-row-actions button');
      return Boolean(button && !button.disabled);
    })();
  `, 15000));

  const beforeDisable = readCommandLog();
  assertStep("PASS113_CLICK_DISABLE", await win.webContents.executeJavaScript(`
    (function() {
      const row = [...document.querySelectorAll('.structured-plugin-row')]
        .find((item) => /qa-mutating-retry-plugin@qa-market/.test(item.textContent || ''));
      const button = row?.querySelector('.structured-row-actions button');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS113_DISABLE_CONFIRM_VISIBLE", await waitFor(win, "Boolean(document.querySelector('.plugin-cli-confirm'))", 5000));
  assertStep("PASS113_DISABLE_NOT_RUN_BEFORE_CONFIRM", !/plugin disable qa-mutating-retry-plugin@qa-market/.test(readCommandLog().slice(beforeDisable.length)));
  assertStep("PASS113_CONFIRM_DISABLE", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.plugin-cli-confirm .danger-action');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS113_DISABLE_RAN", await waitForLog(/plugin disable qa-mutating-retry-plugin@qa-market/));
  assertStep("PASS113_DISABLE_FAILURE_VISIBLE", await waitFor(win, `
    (function() {
      const row = [...document.querySelectorAll('.structured-plugin-row')]
        .find((item) => /qa-mutating-retry-plugin@qa-market/.test(item.textContent || ''));
      const text = row?.textContent || '';
      return Boolean(row?.querySelector('.row-cli-action-evidence.error') &&
        /pass113 disable failed/.test(text) &&
        /33/.test(text));
    })();
  `, 10000));

  assertStep("PASS113_CLOSE_CAPABILITY_SURFACE", await closeSurface(win));
  assertStep("PASS113_OPEN_OUTPUTS_PANEL_AFTER_FAILURE", await waitFor(win, "Boolean(document.querySelector('.workspace-context-tabs'))", 5000) && await openOutputsPanel(win));
  assertStep("PASS113_BOTTOM_MUTATING_RETRY_VISIBLE", await waitFor(win, `
    (function() {
      const stack = document.querySelector('.capability-command-evidence-stack');
      const card = stack?.querySelector('.command-output-card.error');
      const text = card?.textContent || '';
      const retry = [...(card?.querySelectorAll('button') || [])]
        .find((button) => /\\u91cd\\u8bd5/.test(button.textContent || ''));
      return Boolean(
        stack &&
        /Plugin\\/MCP CLI/.test(stack.textContent || '') &&
        card &&
        /plugin disable qa-mutating-retry-plugin@qa-market/.test(text) &&
        /pass113 disable failed/.test(text) &&
        retry
      );
    })();
  `, 10000));

  const beforeRetryClick = readCommandLog();
  assertStep("PASS113_CLICK_BOTTOM_RETRY", await win.webContents.executeJavaScript(`
    (function() {
      const card = document.querySelector('.capability-command-evidence-stack .command-output-card.error');
      const retry = [...(card?.querySelectorAll('button') || [])]
        .find((button) => /\\u91cd\\u8bd5/.test(button.textContent || ''));
      if (!retry || retry.disabled) return false;
      retry.click();
      return true;
    })();
  `));
  assertStep("PASS113_RETRY_CONFIRM_VISIBLE", await waitFor(win, `
    Boolean(document.querySelector('.plugin-manager-modal') &&
      document.querySelector('.plugin-cli-confirm') &&
      !document.querySelector('.plugin-cli-confirm .danger-action')?.disabled &&
      /plugin disable qa-mutating-retry-plugin@qa-market/.test(document.querySelector('.plugin-cli-confirm')?.textContent || ''))
  `, 10000));
  assertStep("PASS113_RETRY_DID_NOT_RUN_BEFORE_CONFIRM", !/plugin disable qa-mutating-retry-plugin@qa-market/.test(readCommandLog().slice(beforeRetryClick.length)));
  assertStep("PASS113_CONFIRM_RETRY", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.plugin-cli-confirm .danger-action');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS113_RETRY_DISABLE_RAN", await waitForLog(/plugin disable qa-mutating-retry-plugin@qa-market(?:.|\n)*plugin disable qa-mutating-retry-plugin@qa-market/, 12000));
  assertStep("PASS113_PLUGIN_ROW_RETRY_RECOVERED", await waitFor(win, `
    (function() {
      const row = [...document.querySelectorAll('.structured-plugin-row')]
        .find((item) => /qa-mutating-retry-plugin@qa-market/.test(item.textContent || ''));
      const text = row?.textContent || '';
      return Boolean(
        row?.querySelector('.plugin-status-badge.disabled') &&
        row?.querySelector('.row-cli-action-evidence.ok') &&
        /ok plugin disable qa-mutating-retry-plugin@qa-market/.test(text)
      );
    })();
  `, 15000));
  assertStep("PASS113_RETRY_PERSISTED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const runs = state.commandRuns?.filter((run) => run.kind === 'capability' && /plugin disable qa-mutating-retry-plugin@qa-market/.test(run.command || '')) || [];
      return Boolean(
        runs.length >= 2 &&
        runs.some((run) => run.code === 33 && /pass113 disable failed/.test(run.stderr || '')) &&
        runs.some((run) => run.code === 0 && /ok plugin disable qa-mutating-retry-plugin@qa-market/.test(run.stdout || ''))
      );
    })();
  `, 10000));

  console.log("PASS113_BOTTOM_CAPABILITY_CONFIRM_RETRY_DONE");
  cleanup();
  app.exit(0);
}

const fakeClaudeCommand = writeFakeClaude();
app.setPath("userData", USER_DATA_DIR);
writeInitialStore(fakeClaudeCommand);
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS113_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS113_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
