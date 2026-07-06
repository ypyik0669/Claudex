const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const PROJECT_PATH = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass67-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass67-bin-"));
const PROJECT_FIXTURE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass67-project-"));
const COMMAND_LOG = path.join(USER_DATA_DIR, "claude-command-log.txt");
const CUSTOM_URL = "https://example.invalid/pass67-marketplace.json";

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
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === '--help') out('Usage: claude plugin marketplace <command>\\nCommands: list, update\\nUse the interactive Claude panel for version-specific marketplace commands.');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else if (args[0] === 'mcp' && args[1] === 'list') out('✓ pass67-mcp: connected');
else out('fake claude command: ' + args.join(' '));
`;

fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
const FAKE_CLAUDE_COMMAND = path.join(FAKE_BIN_DIR, "claude.cmd");
process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;

app.setPath("userData", USER_DATA_DIR);
fs.mkdirSync(USER_DATA_DIR, { recursive: true });
fs.writeFileSync(path.join(PROJECT_FIXTURE_DIR, "package.json"), JSON.stringify({ name: "pass67" }), "utf8");
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
    customMarketplaces: [CUSTOM_URL],
  },
  activeProject: { name: "pass67-project", path: PROJECT_FIXTURE_DIR },
  projects: [{ name: "pass67-project", path: PROJECT_FIXTURE_DIR }],
  sessions: [
    {
      id: "default",
      title: "新聊天",
      project: "pass67-project",
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
  if (!win) throw new Error("PASS67_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS67_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS67_OPEN_CAPABILITIES", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.nav-stack button')].find((candidate) => /插件/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS67_OPEN_MARKETPLACE", await waitFor(win, "Boolean(document.querySelector('.plugin-manager-tabs'))", 10000) && await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.plugin-manager-tabs button')].find((candidate) => /市场/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS67_CUSTOM_HANDOFF_ACTIONS_VISIBLE", await waitFor(win, `
    (function() {
      const row = [...document.querySelectorAll('.marketplace-source-row')].find((item) => /pass67-marketplace/.test(item.textContent || ''));
      const text = row?.textContent || '';
      const cardText = row?.closest('.marketplace-card')?.textContent || '';
      return Boolean(row && /复制 URL/.test(text) && /查看 CLI 支持/.test(text) && /打开 Claude 面板/.test(text) && /当前 Claude Code 支持/.test(cardText));
    })();
  `, 10000));

  assertStep("PASS67_COPY_URL_ACTION", await win.webContents.executeJavaScript(`
    (function() {
      const row = [...document.querySelectorAll('.marketplace-source-row')].find((item) => /pass67-marketplace/.test(item.textContent || ''));
      const button = [...(row?.querySelectorAll('button') || [])].find((candidate) => /复制 URL/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS67_COPY_URL_FEEDBACK", await waitFor(win, `
    (function() {
      const row = [...document.querySelectorAll('.marketplace-source-row')].find((item) => /pass67-marketplace/.test(item.textContent || ''));
      return /已复制 URL/.test(row?.textContent || '');
    })();
  `, 5000));

  assertStep("PASS67_CLI_HELP_ACTION_READY", await waitFor(win, `
    (function() {
      const row = [...document.querySelectorAll('.marketplace-source-row')].find((item) => /pass67-marketplace/.test(item.textContent || ''));
      const button = [...(row?.querySelectorAll('button') || [])].find((candidate) => /查看 CLI 支持/.test(candidate.textContent || ''));
      return Boolean(button && !button.disabled);
    })();
  `, 15000));
  const beforeHelp = readCommandLog();
  assertStep("PASS67_CLICK_CLI_HELP", await win.webContents.executeJavaScript(`
    (function() {
      const row = [...document.querySelectorAll('.marketplace-source-row')].find((item) => /pass67-marketplace/.test(item.textContent || ''));
      const button = [...(row?.querySelectorAll('button') || [])].find((candidate) => /查看 CLI 支持/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS67_CLI_HELP_RAN", await waitForLog(/plugin marketplace --help/));
  assertStep("PASS67_CLI_HELP_WAS_NEW_ACTION", /plugin marketplace --help/.test(readCommandLog().slice(beforeHelp.length)));
  assertStep("PASS67_CLI_HELP_EVIDENCE_VISIBLE", await waitFor(win, `
    (function() {
      const text = document.querySelector('.plugin-cli-action-evidence')?.textContent || '';
      return /plugin marketplace --help/.test(text) && /Commands: list, update/.test(text);
    })();
  `, 10000));
  assertStep("PASS67_CLI_HELP_COMMAND_PERSISTED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      return state.commandRuns?.some((run) => run.kind === 'capability' && /plugin marketplace --help/.test(run.command || '') && run.code === 0 && /Commands: list, update/.test(run.stdout || ''));
    })();
  `, 10000));

  assertStep("PASS67_OPEN_CLAUDE_PANEL", await win.webContents.executeJavaScript(`
    (function() {
      const row = [...document.querySelectorAll('.marketplace-source-row')].find((item) => /pass67-marketplace/.test(item.textContent || ''));
      const button = [...(row?.querySelectorAll('button') || [])].find((candidate) => /打开 Claude 面板/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS67_CLAUDE_PANEL_VISIBLE", await waitFor(win, "Boolean(document.querySelector('#claude-tool-detail') && !document.querySelector('.capability-modal'))", 10000));

  console.log("PASS67_CUSTOM_MARKETPLACE_CLI_HANDOFF_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch((error) => {
  console.error("PASS67_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS67_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
