const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass107-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass107-bin-"));
const MARKETPLACE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass107-market-"));
const MARKETPLACE_MANIFEST_DIR = path.join(MARKETPLACE_DIR, ".claude-plugin");
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass107-project-"));
const COMMAND_LOG = path.join(USER_DATA_DIR, "claude-command-log.txt");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const UPDATE_COUNT_FILE = path.join(USER_DATA_DIR, "pass107-update-count.txt");

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, MARKETPLACE_DIR, PROJECT_DIR]) {
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

function writeMarketplaceFixture() {
  fs.mkdirSync(MARKETPLACE_MANIFEST_DIR, { recursive: true });
  writeJson(path.join(MARKETPLACE_MANIFEST_DIR, "marketplace.json"), {
    name: "pass107-market",
    description: "PASS107 marketplace fixture",
    owner: { name: "PASS107 Owner" },
    plugins: [
      {
        name: "pass107-updated-plugin",
        description: "A deterministic plugin used to prove marketplace update retry recovery.",
        category: "testing",
        author: { name: "PASS107 QA" },
        source: { source: "git-subdir", url: "https://example.invalid/pass107.git", path: "plugins/qa", ref: "v1" },
      },
    ],
  });
}

function writeFakeClaude() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  const fakeClaudeScript = `
const fs = require('fs');
const args = process.argv.slice(2);
const marketplaceDir = ${JSON.stringify(MARKETPLACE_DIR)};
const commandLog = ${JSON.stringify(COMMAND_LOG)};
const updateCountFile = ${JSON.stringify(UPDATE_COUNT_FILE)};
function updateCount() { try { return Number(fs.readFileSync(updateCountFile, 'utf8')) || 0; } catch (_error) { return 0; } }
fs.appendFileSync(commandLog, args.join(' ') + '\\n', 'utf8');
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
if (args[0] === '--version') out('2.10.7 (Claude Code QA)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'mcp' && args[1] === 'list') out('? pass107-mcp: connected');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) {
  const updated = updateCount() >= 2;
  out([{ name: 'pass107-market', source: 'path', repo: marketplaceDir, installLocation: marketplaceDir, version: updated ? '2026.7.8' : '2026.7.6', status: updated ? 'refreshed' : 'ready', permissions: ['Read', 'Bash'] }]);
}
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces:\\n\\n  > pass107-market\\n    Source: Path (' + marketplaceDir + ')');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'update') {
  const nextUpdateCount = updateCount() + 1;
  fs.writeFileSync(updateCountFile, String(nextUpdateCount), 'utf8');
  if (nextUpdateCount === 1) { process.stderr.write('pass107 marketplace update failed\\n'); process.exitCode = 37; }
  else { out('updated pass107-market to 2026.7.8'); }
}
else out('pass107 fake claude command: ' + args.join(' '));
`;
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  const command = path.join(FAKE_BIN_DIR, "claude.cmd");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
  return command;
}

function writeInitialStore() {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass107-project" }), "utf8");
  const fakeClaude = writeFakeClaude();
  const project = { name: "pass107-project", path: PROJECT_DIR };
  writeJson(DATA_FILE, {
    version: 1,
    activeProject: project,
    projects: [project],
    settings: {
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      baseUrl: "https://api.example.invalid",
      temperature: 0.2,
      timeoutMs: 600000,
      language: "zh",
      appearance: { fontSize: "compact", density: "compact" },
      claudeCode: { executionMode: "claude-code", claudeCommand: fakeClaude, permissionMode: "default" },
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
    sessions: [
      {
        id: "pass107-session",
        title: "Marketplace update retry recovery",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-06T00:00:00.000Z",
        updatedAt: "2026-07-06T00:00:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    automations: [],
    subagentRuns: [],
    browserVisits: [],
    notices: [],
  });
}

async function openMarketplace(win) {
  assertStep("PASS107_OPEN_CAPABILITIES", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.nav-stack button')].find((candidate) => /\\u63d2\\u4ef6/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS107_OPEN_MARKETPLACE", await waitFor(win, "Boolean(document.querySelector('.plugin-manager-tabs'))", 10000) && await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.plugin-manager-tabs button')].find((candidate) => /\\u5e02\\u573a/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
}

async function clickMarketplaceUpdate(win, stepName) {
  assertStep(stepName, await win.webContents.executeJavaScript(`
    (async function() {
      let button = null;
      const startedAt = Date.now();
      while (Date.now() - startedAt < 5000) {
        button = [...document.querySelectorAll('.marketplace-actions button')]
          .find((candidate) => /\\u66f4\\u65b0/.test(candidate.textContent || ''));
        if (button && !button.disabled) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `));
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS107_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS107_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  await openMarketplace(win);
  assertStep("PASS107_MARKETPLACE_SOURCE_READY", await waitFor(win, `
    Boolean(document.querySelector('[data-marketplace-source-id="pass107-market"]') &&
      /2026\\.7\\.6/.test(document.querySelector('[data-marketplace-source-id="pass107-market"]')?.textContent || ''))
  `, 15000));

  const beforeUpdate = readCommandLog();
  await clickMarketplaceUpdate(win, "PASS107_CLICK_UPDATE");
  assertStep("PASS107_UPDATE_CONFIRM_VISIBLE", await waitFor(win, "Boolean(document.querySelector('.plugin-cli-confirm'))", 5000));
  assertStep("PASS107_UPDATE_NOT_RUN_BEFORE_CONFIRM", !/plugin marketplace update/.test(readCommandLog().slice(beforeUpdate.length)));
  assertStep("PASS107_CONFIRM_UPDATE", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.plugin-cli-confirm .danger-action');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS107_UPDATE_RAN_AFTER_CONFIRM", await waitForLog(/plugin marketplace update/));
  assertStep("PASS107_MARKETPLACE_UPDATE_FAILURE_FOCUS", await waitFor(win, `
    (function() {
      const input = document.querySelector('.capability-search input');
      const row = document.querySelector('[data-marketplace-source-id="pass107-market"]');
      const text = row?.textContent || '';
      return Boolean(
        input?.value === 'pass107-market' &&
        row?.classList.contains('focused-capability-row') &&
        row?.querySelector('.row-cli-action-evidence.error') &&
        /pass107 marketplace update failed/.test(text) &&
        /37/.test(text) &&
        /\\u91cd\\u8bd5/.test(text) &&
        /\\u6253\\u5f00\\u8f93\\u51fa/.test(text) &&
        /pass107 marketplace update failed/.test(document.querySelector('.plugin-cli-error')?.textContent || '')
      );
    })();
  `, 15000));
  assertStep("PASS107_FAILURE_PERSISTED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      return Boolean(
        state.commandRuns?.some((run) => run.kind === 'capability' &&
          /plugin marketplace update/.test(run.command || '') &&
          run.code === 37 &&
          /pass107 marketplace update failed/.test(run.stderr || '')) &&
        state.notices?.some((notice) => notice.level === 'error' &&
          /pass107 marketplace update failed/.test((notice.title || '') + (notice.detail || '')))
      );
    })();
  `, 10000));

  const beforeRetry = readCommandLog();
  assertStep("PASS107_CLICK_RETRY", await win.webContents.executeJavaScript(`
    (async function() {
      const row = document.querySelector('[data-marketplace-source-id="pass107-market"]');
      let retry = null;
      let readinessButton = null;
      const startedAt = Date.now();
      while (Date.now() - startedAt < 5000) {
        retry = [...(row?.querySelectorAll('.row-cli-action-evidence.error button') || [])]
          .find((button) => /\\u91cd\\u8bd5/.test(button.textContent || ''));
        readinessButton = row?.querySelector('[data-marketplace-source-action="update"]');
        if (retry && (!readinessButton || !readinessButton.disabled)) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (!retry || readinessButton?.disabled) return false;
      retry.click();
      return true;
    })();
  `));
  assertStep("PASS107_RETRY_CONFIRM_VISIBLE", await waitFor(win, "Boolean(document.querySelector('.plugin-cli-confirm'))", 5000));
  assertStep("PASS107_RETRY_NOT_RUN_BEFORE_CONFIRM", !/plugin marketplace update/.test(readCommandLog().slice(beforeRetry.length)));
  assertStep("PASS107_CONFIRM_RETRY", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.plugin-cli-confirm .danger-action');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS107_RETRY_UPDATE_RAN", await waitForLog(/plugin marketplace update(?:.|\n)*plugin marketplace update/, 12000));
  assertStep("PASS107_RETRY_RECOVERED_INLINE", await waitFor(win, `
    (function() {
      const input = document.querySelector('.capability-search input');
      const row = document.querySelector('[data-marketplace-source-id="pass107-market"]');
      const text = row?.textContent || '';
      return Boolean(
        input?.value === 'pass107-market' &&
        row?.classList.contains('focused-capability-row') &&
        row?.querySelector('.row-cli-action-evidence.ok') &&
        /2026\\.7\\.8/.test(text) &&
        /refreshed/.test(text) &&
        /updated pass107-market to 2026\\.7\\.8/.test(text) &&
        !/pass107 marketplace update failed/.test(document.querySelector('.plugin-cli-error')?.textContent || '')
      );
    })();
  `, 15000));
  assertStep("PASS107_RETRY_PERSISTED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const runs = state.commandRuns?.filter((run) => run.kind === 'capability' && /plugin marketplace update/.test(run.command || '')) || [];
      return Boolean(
        runs.length >= 2 &&
        runs.some((run) => run.code === 37 && /pass107 marketplace update failed/.test(run.stderr || '')) &&
        runs.some((run) => run.code === 0 && /updated pass107-market to 2026\\.7\\.8/.test(run.stdout || ''))
      );
    })();
  `, 10000));

  console.log("PASS107_MARKETPLACE_UPDATE_RETRY_RECOVERY_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeMarketplaceFixture();
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS107_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS107_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
