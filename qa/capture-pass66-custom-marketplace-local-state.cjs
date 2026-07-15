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
const customUrl = ${JSON.stringify(CUSTOM_URL)};
fs.appendFileSync(commandLog, args.join(' ') + '\\n', 'utf8');
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
function marketplaceAdded() {
  try { return fs.readFileSync(commandLog, 'utf8').includes('plugin marketplace add ' + customUrl); }
  catch (_error) { return false; }
}
if (args[0] === '--version') out('2.9.0 (Claude Code QA)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out(marketplaceAdded() ? [{ name: 'pass66-market', source: 'url', repo: customUrl, status: 'ready' }] : []);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out(marketplaceAdded() ? 'Configured marketplaces:\\n\\n  > pass66-market\\n    Source: URL (' + customUrl + ')' : 'Configured marketplaces: none');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'add' && args[3] === customUrl && args.length === 4) out('Added marketplace pass66-market');
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
  assertStep("PASS66_CUSTOM_EMPTY_CLI_WORKFLOW", await waitFor(win, `
    (function() {
      const cards = [...document.querySelectorAll('.marketplace-card')];
      const card = cards.find((item) => /自定义市场/.test(item.textContent || ''));
      const text = card?.textContent || '';
      return Boolean(card && /Claudex 记录/.test(text) && /命令成功后/.test(text) && /用户级 Marketplace/.test(text));
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
  assertStep("PASS66_SET_CUSTOM_MARKETPLACE", await win.webContents.executeJavaScript(`
    (function() {
      const cards = [...document.querySelectorAll('.marketplace-card')];
      const card = cards.find((item) => /自定义市场/.test(item.textContent || ''));
      const input = card?.querySelector('input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, ${JSON.stringify(CUSTOM_URL)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })();
  `));
  assertStep("PASS66_ADD_ACTION_READY", await waitFor(win, `
    (function() {
      const card = [...document.querySelectorAll('.marketplace-card')].find((item) => /自定义市场/.test(item.textContent || ''));
      const button = card?.querySelector('button[type="submit"]');
      return Boolean(button && !button.disabled);
    })();
  `, 15000));
  assertStep("PASS66_ADD_CUSTOM_MARKETPLACE", await win.webContents.executeJavaScript(`
    (function() {
      const card = [...document.querySelectorAll('.marketplace-card')].find((item) => /自定义市场/.test(item.textContent || ''));
      const button = card?.querySelector('button[type="submit"]');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS66_CUSTOM_CONFIRM_VISIBLE", await waitFor(win, `
    (function() {
      const confirm = document.querySelector('.plugin-cli-confirm');
      const text = confirm?.textContent || '';
      return Boolean(confirm && /plugin marketplace add/.test(text) && /pass66-marketplace/.test(text) && /用户级/.test(text));
    })();
  `, 5000));
  assertStep("PASS66_CUSTOM_DID_NOT_RUN_BEFORE_CONFIRM", !/plugin marketplace add/.test(readCommandLog().slice(beforeAdd.length)));
  assertStep("PASS66_CUSTOM_DID_NOT_PERSIST_BEFORE_CONFIRM", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      return !(state.settings?.customMarketplaces || []).includes(${JSON.stringify(CUSTOM_URL)}) && !(state.commandRuns || []).length;
    })();
  `));
  assertStep("PASS66_CONFIRM_CUSTOM_MARKETPLACE", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.plugin-cli-confirm .danger-action');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS66_CUSTOM_CLI_RAN_AFTER_CONFIRM", await waitForLog(/plugin marketplace add https:\/\/example\.invalid\/pass66-marketplace\.json/));
  assertStep("PASS66_CUSTOM_ROW_CLI_CONFIRMED", await waitFor(win, `
    (function() {
      const row = [...document.querySelectorAll('[data-custom-marketplace-row]')]
        .find((item) => /pass66-marketplace/.test(item.textContent || ''));
      return Boolean(row && /Claudex 记录/.test(row.textContent || '') && /CLI 已确认/.test(row.textContent || ''));
    })();
  `, 10000));
  assertStep("PASS66_MARKETPLACE_TAB_COUNT_CUSTOM_REAL", await win.webContents.executeJavaScript(`
    (function() {
      const tab = [...document.querySelectorAll('.plugin-manager-tabs button')]
        .find((candidate) => /市场/.test(candidate.textContent || ''));
      return tab?.querySelector('em')?.textContent?.trim() === '2';
    })();
  `));
  assertStep("PASS66_CUSTOM_STATE_AND_COMMAND_PERSISTED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      return Boolean(
        state.settings?.customMarketplaces?.includes(${JSON.stringify(CUSTOM_URL)}) &&
        state.commandRuns?.some((run) =>
          run.kind === 'capability' &&
          run.code === 0 &&
          run.command === 'claude plugin marketplace add ${CUSTOM_URL}' &&
          run.capabilityContext?.kind === 'custom-marketplace' &&
          run.capabilityContext?.action === 'add'
        )
      );
    })();
  `, 10000));

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
