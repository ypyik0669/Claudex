const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass330-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass330-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass330-project-"));
const COMMAND_LOG = path.join(USER_DATA_DIR, "claude-command-log.txt");
const ADDED_SOURCE_FILE = path.join(USER_DATA_DIR, "added-marketplace-source.txt");
const FAIL_ONCE_FILE = path.join(USER_DATA_DIR, "failed-marketplace-once.txt");
const REMOVE_FAIL_ONCE_FILE = path.join(USER_DATA_DIR, "failed-marketplace-remove-once.txt");
const VALID_URL = "https://github.com/example/pass330-marketplace.git?ref=v1%2Fstable";
const FAIL_URL = "https://example.invalid/pass330-failing-marketplace-" + "x".repeat(260) + ".git";
const INVALID_URL = "https://user@example.invalid/pass330-private-marketplace.git";

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
    if (await win.webContents.executeJavaScript(script)) return true;
    await wait(150);
  }
  return false;
}

async function waitForLog(text, offset = 0, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (readCommandLog().slice(offset).includes(text)) return true;
    await wait(150);
  }
  return false;
}

function commandLogEntryCount(entry) {
  return readCommandLog().split(/\r?\n/).filter((line) => line === entry).length;
}

async function waitForLogCount(entry, expected, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (commandLogEntryCount(entry) >= expected) return true;
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
const addedSourceFile = ${JSON.stringify(ADDED_SOURCE_FILE)};
const failOnceFile = ${JSON.stringify(FAIL_ONCE_FILE)};
const removeFailOnceFile = ${JSON.stringify(REMOVE_FAIL_ONCE_FILE)};
const validUrl = ${JSON.stringify(VALID_URL)};
const failUrl = ${JSON.stringify(FAIL_URL)};
fs.appendFileSync(commandLog, JSON.stringify(args) + '\\n', 'utf8');
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
function addedSource() {
  try { return fs.readFileSync(addedSourceFile, 'utf8').trim(); }
  catch (_error) { return ''; }
}
if (args[0] === '--version') out('2.1.210 (Claude Code PASS330)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out({ servers: [] });
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') {
  const source = addedSource();
  const displaySource = source === validUrl ? 'GitHub (example/pass330-marketplace)' : 'URL (' + source + ')';
  out(source ? 'Configured marketplaces:\\n\\n  > pass330-market\\n    Source: ' + displaySource : 'Configured marketplaces: none');
}
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'add') {
  const source = args[3] || '';
  if (args.length !== 4) {
    process.stderr.write('PASS330 expected one exact marketplace source argument\\n');
    process.exitCode = 9;
  } else if (source === failUrl && !fs.existsSync(failOnceFile)) {
    fs.writeFileSync(failOnceFile, '1', 'utf8');
    process.stderr.write('PASS330 marketplace add rejected by Claude CLI\\n');
    process.exitCode = 7;
  } else {
    fs.writeFileSync(addedSourceFile, source, 'utf8');
    out('Added marketplace pass330-market from ' + source);
  }
}
else if (
  args.length === 6 &&
  args[0] === 'plugin' &&
  args[1] === 'marketplace' &&
  args[2] === 'remove' &&
  args[3] === '--scope' &&
  args[4] === 'user' &&
  args[5] === 'pass330-market'
) {
  if (!fs.existsSync(removeFailOnceFile)) {
    fs.writeFileSync(removeFailOnceFile, '1', 'utf8');
    process.stderr.write('PASS330 marketplace remove rejected by Claude CLI\\n');
    process.exitCode = 8;
  } else {
    try { fs.unlinkSync(addedSourceFile); } catch (_error) {}
    out('Removed marketplace pass330-market from user settings');
  }
}
else out('pass330 fake claude command: ' + args.join(' '));
`;

fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), '@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n', "utf8");
const FAKE_CLAUDE_COMMAND = path.join(FAKE_BIN_DIR, "claude.cmd");
process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;

fs.mkdirSync(PROJECT_DIR, { recursive: true });
fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass330-project" }), "utf8");
writeJson(path.join(USER_DATA_DIR, "desktop-data.json"), {
  version: 1,
  activeProject: { name: "pass330-project", path: PROJECT_DIR },
  projects: [{ name: "pass330-project", path: PROJECT_DIR }],
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
    apiKeys: {},
  },
  sessions: [{
    id: "pass330-session",
    title: "PASS330 custom marketplace add",
    project: "pass330-project",
    projectPath: PROJECT_DIR,
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
    messages: [],
  }],
  commandRuns: [],
  runEvents: [],
  notices: [],
  automations: [],
  subagentRuns: [],
  sourceRefs: [],
  browserVisits: [],
});

app.setPath("userData", USER_DATA_DIR);
require(path.join(REPO_DIR, "electron", "main.cjs"));

async function setMarketplaceInput(win, value) {
  return win.webContents.executeJavaScript(`
    (function() {
      const card = [...document.querySelectorAll('.marketplace-card')]
        .find((item) => /自定义市场/.test(item.textContent || ''));
      const input = card?.querySelector('input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })();
  `);
}

async function submitMarketplace(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const card = [...document.querySelectorAll('.marketplace-card')]
        .find((item) => /自定义市场/.test(item.textContent || ''));
      const form = card?.querySelector('form');
      if (!form) return false;
      form.requestSubmit();
      return true;
    })();
  `);
}

async function confirmMarketplace(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.plugin-cli-confirm .danger-action');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `);
}

async function clickRecoveryRetryCommand(win) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 240));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, 'pass330-failing-marketplace');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 360));
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '').startsWith('capability-recovery:retry:'));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function clickRemoveRecoveryRetryCommand(win) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 240));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, 'plugin marketplace remove pass330-market');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 360));
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) =>
          (candidate.getAttribute('data-command-id') || '').startsWith('capability-recovery:retry:') &&
          /marketplace remove/i.test(candidate.textContent || '')
        );
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function clickCustomMarketplaceAction(win, source, action) {
  return win.webContents.executeJavaScript(`
    (function() {
      const row = [...document.querySelectorAll('[data-custom-marketplace-row]')]
        .find((item) => item.getAttribute('data-custom-marketplace-id') === ${JSON.stringify(source)});
      const button = row?.querySelector('[data-custom-marketplace-action="${action}"]');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1700);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS330_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS330_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS330_OPEN_CAPABILITIES", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.nav-stack button')].find((candidate) => /插件/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS330_OPEN_MARKETPLACE", await waitFor(win, "Boolean(document.querySelector('.plugin-manager-tabs'))", 10000) && await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.plugin-manager-tabs button')].find((candidate) => /市场/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));

  const beforeInvalid = readCommandLog().length;
  assertStep("PASS330_INVALID_INPUT_SET", await setMarketplaceInput(win, INVALID_URL));
  assertStep("PASS330_INVALID_INPUT_SUBMITTED", await submitMarketplace(win));
  assertStep("PASS330_INVALID_REJECTED_WITHOUT_CONFIRM", await waitFor(win, `
    Boolean(/http/.test(document.querySelector('.plugin-cli-error')?.textContent || '') && !document.querySelector('.plugin-cli-confirm'))
  `, 5000));
  assertStep("PASS330_INVALID_DID_NOT_RUN", !readCommandLog().slice(beforeInvalid).includes('marketplace","add'));

  const beforeSuccess = readCommandLog().length;
  assertStep("PASS330_VALID_INPUT_SET", await setMarketplaceInput(win, VALID_URL));
  assertStep("PASS330_ADD_ACTION_READY", await waitFor(win, `
    (function() {
      const card = [...document.querySelectorAll('.marketplace-card')].find((item) => /自定义市场/.test(item.textContent || ''));
      const button = card?.querySelector('button[type="submit"]');
      return Boolean(button && !button.disabled);
    })();
  `, 15000));
  assertStep("PASS330_VALID_INPUT_SUBMITTED", await submitMarketplace(win));
  assertStep("PASS330_CONFIRM_REVIEW_VISIBLE", await waitFor(win, `
    (function() {
      const confirm = document.querySelector('.plugin-cli-confirm');
      const text = confirm?.textContent || '';
      return Boolean(confirm && text.includes(${JSON.stringify(VALID_URL)}) && /plugin marketplace add/.test(text) && /用户级/.test(text) && /风险/.test(text));
    })();
  `, 5000));
  assertStep("PASS330_NOT_RUN_BEFORE_CONFIRM", !readCommandLog().slice(beforeSuccess).includes('marketplace","add'));
  assertStep("PASS330_NOT_SAVED_BEFORE_CONFIRM", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      return !(state.settings?.customMarketplaces || []).includes(${JSON.stringify(VALID_URL)});
    })();
  `));
  assertStep("PASS330_CONFIRM_SUCCESS_ADD", await confirmMarketplace(win));
  assertStep("PASS330_SUCCESS_CLI_EXACT_ARG", await waitForLog(JSON.stringify(["plugin", "marketplace", "add", VALID_URL]), beforeSuccess, 10000));
  assertStep("PASS330_SUCCESS_STATE_AND_EVIDENCE", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const run = (state.commandRuns || []).find((item) =>
        item.kind === 'capability' &&
        item.code === 0 &&
        Array.isArray(item.args) &&
        item.args.length === 4 &&
        item.args[3] === ${JSON.stringify(VALID_URL)}
      );
      return Boolean(
        (state.settings?.customMarketplaces || []).includes(${JSON.stringify(VALID_URL)}) &&
        run?.capabilityContext?.kind === 'custom-marketplace' &&
        run.capabilityContext.id === ${JSON.stringify(VALID_URL)} &&
        run.capabilityContext.action === 'add'
      );
    })();
  `, 12000));
  assertStep("PASS330_SUCCESS_INPUT_CLEARED", await waitFor(win, `
    (function() {
      const card = [...document.querySelectorAll('.marketplace-card')].find((item) => /自定义市场/.test(item.textContent || ''));
      return card?.querySelector('input')?.value === '';
    })();
  `, 12000));
  assertStep("PASS330_SUCCESS_ROW_CLI_CONFIRMED", await waitFor(win, `
    (function() {
      const row = [...document.querySelectorAll('[data-custom-marketplace-row]')]
        .find((item) => (item.getAttribute('data-custom-marketplace-id') || '') === ${JSON.stringify(VALID_URL)});
      const text = row?.textContent || '';
      return Boolean(row && /CLI 已确认/.test(text) && !/未注入/.test(text));
    })();
  `, 10000));

  const beforeFailure = readCommandLog().length;
  assertStep("PASS330_FAILURE_INPUT_SET", await setMarketplaceInput(win, FAIL_URL));
  assertStep("PASS330_FAILURE_INPUT_SUBMITTED", await submitMarketplace(win));
  assertStep("PASS330_FAILURE_CONFIRM_VISIBLE", await waitFor(win, `
    Boolean(document.querySelector('.plugin-cli-confirm')?.textContent?.includes(${JSON.stringify(FAIL_URL)}))
  `, 5000));
  assertStep("PASS330_FAILURE_NOT_RUN_BEFORE_CONFIRM", !readCommandLog().slice(beforeFailure).includes('marketplace","add'));
  assertStep("PASS330_CONFIRM_FAILURE_ADD", await confirmMarketplace(win));
  assertStep("PASS330_FAILURE_CLI_EXACT_ARG", await waitForLog(JSON.stringify(["plugin", "marketplace", "add", FAIL_URL]), beforeFailure, 10000));
  assertStep("PASS330_FAILURE_RETAINS_INPUT_AND_RECOVERY", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const input = [...document.querySelectorAll('.marketplace-card')]
        .find((item) => /自定义市场/.test(item.textContent || ''))
        ?.querySelector('input');
      const run = (state.commandRuns || []).find((item) =>
        item.kind === 'capability' && item.code === 7 && Array.isArray(item.args) && item.args[3] === ${JSON.stringify(FAIL_URL)}
      );
      const event = (state.runEvents || []).find((item) => item.id === run?.requestId && item.status === 'error');
      const notice = (state.notices || []).find((item) =>
        item.runEventId === run?.requestId &&
        item.capabilityContext?.kind === 'custom-marketplace' &&
        item.capabilityContext?.id === ${JSON.stringify(FAIL_URL)} &&
        /^capability-recovery:/.test(item.action || '')
      );
      return Boolean(
        input?.value === ${JSON.stringify(FAIL_URL)} &&
        !(state.settings?.customMarketplaces || []).includes(${JSON.stringify(FAIL_URL)}) &&
        run?.capabilityContext?.action === 'add' &&
        event &&
        notice
      );
    })();
  `, 12000));
  const failureCommand = JSON.stringify(["plugin", "marketplace", "add", FAIL_URL]);
  assertStep("PASS330_RECOVERY_RETRY_COMMAND_CLICKED", await clickRecoveryRetryCommand(win));
  assertStep("PASS330_RECOVERY_RETRY_CONFIRM_VISIBLE", await waitFor(win, `
    (function() {
      const confirm = document.querySelector('.plugin-cli-confirm');
      const text = confirm?.textContent || '';
      return Boolean(confirm && text.includes(${JSON.stringify(FAIL_URL)}) && /plugin marketplace add/.test(text) && /用户级/.test(text));
    })();
  `, 10000));
  assertStep("PASS330_RECOVERY_RETRY_NOT_RUN_BEFORE_CONFIRM", commandLogEntryCount(failureCommand) === 1);
  assertStep("PASS330_RECOVERY_RETRY_CONFIRMED", await confirmMarketplace(win));
  assertStep("PASS330_RECOVERY_RETRY_CLI_RAN", await waitForLogCount(failureCommand, 2, 10000));
  assertStep("PASS330_RECOVERY_RETRY_SUCCEEDED_AND_SAVED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const runs = (state.commandRuns || []).filter((item) =>
        item.kind === 'capability' && Array.isArray(item.args) && item.args[3] === ${JSON.stringify(FAIL_URL)}
      );
      const row = [...document.querySelectorAll('[data-custom-marketplace-row]')]
        .find((item) => item.getAttribute('data-custom-marketplace-id') === ${JSON.stringify(FAIL_URL)});
      return Boolean(
        (state.settings?.customMarketplaces || []).includes(${JSON.stringify(FAIL_URL)}) &&
        runs.some((item) => item.code === 7) &&
        runs.some((item) => item.code === 0) &&
        row?.getAttribute('data-custom-marketplace-cli-status') === 'confirmed'
      );
    })();
  `, 15000));

  const removeCommand = JSON.stringify(["plugin", "marketplace", "remove", "--scope", "user", "pass330-market"]);
  assertStep("PASS330_REMOVE_ACTION_READY", await waitFor(win, `
    (function() {
      const row = [...document.querySelectorAll('[data-custom-marketplace-row]')]
        .find((item) => item.getAttribute('data-custom-marketplace-id') === ${JSON.stringify(FAIL_URL)});
      const button = row?.querySelector('[data-custom-marketplace-action="remove"]');
      return Boolean(button && !button.disabled && /Claude CLI/.test(button.textContent || ''));
    })();
  `, 10000));
  assertStep("PASS330_REMOVE_ACTION_CLICKED", await clickCustomMarketplaceAction(win, FAIL_URL, "remove"));
  assertStep("PASS330_REMOVE_CONFIRM_REVIEW_VISIBLE", await waitFor(win, `
    (function() {
      const confirm = document.querySelector('.plugin-cli-confirm');
      const text = confirm?.textContent || '';
      return Boolean(
        confirm &&
        text.includes(${JSON.stringify(FAIL_URL)}) &&
        /pass330-market/.test(text) &&
        /plugin marketplace remove --scope user pass330-market/.test(text) &&
        /\u7528\u6237\u7ea7/.test(text) &&
        /\u98ce\u9669/.test(text)
      );
    })();
  `, 5000));
  assertStep("PASS330_REMOVE_NOT_RUN_BEFORE_CONFIRM", commandLogEntryCount(removeCommand) === 0);
  assertStep("PASS330_REMOVE_NOT_SAVED_BEFORE_CONFIRM", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      return (state.settings?.customMarketplaces || []).includes(${JSON.stringify(FAIL_URL)});
    })();
  `));
  assertStep("PASS330_REMOVE_CONFIRM_FAILURE", await confirmMarketplace(win));
  assertStep("PASS330_REMOVE_FAILURE_CLI_EXACT_ARGS", await waitForLogCount(removeCommand, 1, 10000));
  assertStep("PASS330_REMOVE_FAILURE_RETAINS_SOURCE_AND_EVIDENCE", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const run = (state.commandRuns || []).find((item) =>
        item.kind === 'capability' &&
        item.code === 8 &&
        Array.isArray(item.args) &&
        JSON.stringify(item.args) === ${JSON.stringify(removeCommand)}
      );
      const event = (state.runEvents || []).find((item) => item.id === run?.requestId && item.status === 'error');
      const notice = (state.notices || []).find((item) =>
        item.runEventId === run?.requestId &&
        item.capabilityContext?.kind === 'custom-marketplace' &&
        item.capabilityContext?.id === ${JSON.stringify(FAIL_URL)} &&
        item.capabilityContext?.action === 'remove' &&
        item.capabilityContext?.target === 'pass330-market' &&
        /^capability-recovery:/.test(item.action || '')
      );
      const row = [...document.querySelectorAll('[data-custom-marketplace-row]')]
        .find((item) => item.getAttribute('data-custom-marketplace-id') === ${JSON.stringify(FAIL_URL)});
      return Boolean(
        (state.settings?.customMarketplaces || []).includes(${JSON.stringify(FAIL_URL)}) &&
        run?.capabilityContext?.target === 'pass330-market' &&
        event &&
        notice &&
        row?.querySelector('[data-custom-marketplace-action="retry"]')
      );
    })();
  `, 12000));
  assertStep("PASS330_REMOVE_PALETTE_RETRY_CLICKED", await clickRemoveRecoveryRetryCommand(win));
  assertStep("PASS330_REMOVE_RETRY_CONFIRM_VISIBLE", await waitFor(win, `
    (function() {
      const text = document.querySelector('.plugin-cli-confirm')?.textContent || '';
      return /plugin marketplace remove --scope user pass330-market/.test(text) && text.includes(${JSON.stringify(FAIL_URL)});
    })();
  `, 10000));
  assertStep("PASS330_REMOVE_RETRY_NOT_RUN_BEFORE_CONFIRM", commandLogEntryCount(removeCommand) === 1);
  assertStep("PASS330_REMOVE_RETRY_CONFIRMED", await confirmMarketplace(win));
  assertStep("PASS330_REMOVE_RETRY_CLI_RAN", await waitForLogCount(removeCommand, 2, 10000));
  assertStep("PASS330_REMOVE_RETRY_SUCCEEDED_ATOMICALLY", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const runs = (state.commandRuns || []).filter((item) =>
        item.kind === 'capability' &&
        Array.isArray(item.args) &&
        JSON.stringify(item.args) === ${JSON.stringify(removeCommand)}
      );
      const removedRow = [...document.querySelectorAll('[data-custom-marketplace-row]')]
        .find((item) => item.getAttribute('data-custom-marketplace-id') === ${JSON.stringify(FAIL_URL)});
      const retainedRow = [...document.querySelectorAll('[data-custom-marketplace-row]')]
        .find((item) => item.getAttribute('data-custom-marketplace-id') === ${JSON.stringify(VALID_URL)});
      return Boolean(
        !(state.settings?.customMarketplaces || []).includes(${JSON.stringify(FAIL_URL)}) &&
        (state.settings?.customMarketplaces || []).includes(${JSON.stringify(VALID_URL)}) &&
        runs.some((item) => item.code === 8 && item.capabilityContext?.target === 'pass330-market') &&
        runs.some((item) => item.code === 0 && item.capabilityContext?.target === 'pass330-market') &&
        !removedRow &&
        retainedRow?.querySelector('[data-custom-marketplace-action="remove-record"]')
      );
    })();
  `, 15000));

  console.log("PASS330_CUSTOM_MARKETPLACE_LIFECYCLE_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS330_FAILED", error?.stack || error);
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    const debug = await win.webContents.executeJavaScript(`
      (function() {
        return {
          confirm: document.querySelector('.plugin-cli-confirm')?.textContent || '',
          error: document.querySelector('.plugin-cli-error')?.textContent || '',
          customRows: [...document.querySelectorAll('[data-custom-marketplace-row]')].map((item) => item.textContent || ''),
          body: document.body.textContent?.slice(0, 8000) || '',
        };
      })();
    `).catch((debugError) => ({ error: String(debugError?.stack || debugError) }));
    console.error("PASS330_DEBUG", JSON.stringify(debug, null, 2).slice(0, 16000));
  }
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS330_TIMEOUT");
  cleanup();
  app.exit(1);
}, 120000);
