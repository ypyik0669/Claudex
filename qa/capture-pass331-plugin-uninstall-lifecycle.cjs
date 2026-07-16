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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass331-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass331-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass331-project-"));
const COMMAND_LOG = path.join(USER_DATA_DIR, "claude-command-log.txt");
const ATTEMPT_FILE = path.join(USER_DATA_DIR, "plugin-uninstall-attempt.txt");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const PLUGIN_ID = "pass331-uninstall-plugin@pass331-market";
const INVALID_SCOPE_PLUGIN_ID = "pass331-invalid-scope-plugin@pass331-market";
const PLUGIN_SCOPE = "project";
const UNINSTALL_ARGS = ["plugin", "uninstall", "--scope", PLUGIN_SCOPE, PLUGIN_ID];
const UNINSTALL_COMMAND = JSON.stringify(UNINSTALL_ARGS);

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

function commandLogEntryCount(entry) {
  return readCommandLog().split(/\r?\n/).filter((line) => line === entry).length;
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
const attemptFile = ${JSON.stringify(ATTEMPT_FILE)};
const pluginId = ${JSON.stringify(PLUGIN_ID)};
function attempts() {
  try { return Number(fs.readFileSync(attemptFile, 'utf8')) || 0; }
  catch (_error) { return 0; }
}
function installed() { return attempts() < 2; }
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
fs.appendFileSync(commandLog, JSON.stringify(args) + '\\n', 'utf8');
if (args[0] === '--version') out('2.1.210 (Claude Code PASS331)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out({
  plugins: [
    ...(installed() ? [{
    id: pluginId,
    name: 'pass331-uninstall-plugin',
    marketplace: 'pass331-market',
    version: '33.1.0',
    scope: 'project',
    enabled: true,
    status: 'enabled',
    source: { source: 'git', url: 'https://example.invalid/pass331.git', ref: 'v33.1.0' },
    installPath: 'C:/pass331/plugins/uninstall',
    tools: ['pass331-read-tool'],
    permissions: { filesystem: 'read' }
    }] : []),
    {
      id: ${JSON.stringify(INVALID_SCOPE_PLUGIN_ID)},
      name: 'pass331-invalid-scope-plugin',
      marketplace: 'pass331-market',
      version: '33.1.0',
      scope: 'workspace',
      enabled: false,
      status: 'disabled',
      source: 'PASS331 invalid scope fixture'
    }
  ]
});
else if (args[0] === 'plugin' && args[1] === 'list') out(installed()
  ? 'Installed plugins:\\n\\n  > ' + pluginId + '\\n    Version: 33.1.0\\n    Scope: project\\n    Status: enabled'
  : 'Installed plugins: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out({ servers: [] });
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else if (JSON.stringify(args) === ${JSON.stringify(UNINSTALL_COMMAND)}) {
  const nextAttempt = attempts() + 1;
  fs.writeFileSync(attemptFile, String(nextAttempt), 'utf8');
  if (nextAttempt === 1) {
    process.stderr.write('PASS331 scoped plugin uninstall rejected by Claude CLI\\n');
    process.exitCode = 31;
  } else {
    out('Uninstalled ' + pluginId + ' from project scope');
  }
}
else {
  process.stderr.write('PASS331 unexpected command: ' + JSON.stringify(args) + '\\n');
  process.exitCode = 99;
}
`;

fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), '@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n', "utf8");
const FAKE_CLAUDE_COMMAND = path.join(FAKE_BIN_DIR, "claude.cmd");

fs.mkdirSync(PROJECT_DIR, { recursive: true });
fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass331-project" }), "utf8");
writeJson(DATA_FILE, {
  version: 1,
  activeProject: { name: "pass331-project", path: PROJECT_DIR },
  projects: [{ name: "pass331-project", path: PROJECT_DIR }],
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
    },
    customMarketplaces: [],
    apiKeys: {},
  },
  sessions: [{
    id: "pass331-session",
    title: "PASS331 scoped plugin uninstall lifecycle",
    project: "pass331-project",
    projectPath: PROJECT_DIR,
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
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

async function confirmCliAction(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.plugin-cli-confirm .danger-action');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `);
}

async function leaveSurface(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.surface-back');
      if (!button) return false;
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
      setter?.call(input, 'plugin uninstall pass331');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 360));
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) =>
          (candidate.getAttribute('data-command-id') || '').startsWith('capability-recovery:retry:') &&
          /plugin uninstall/i.test(candidate.textContent || '')
        );
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1700);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS331_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS331_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS331_OPEN_CAPABILITIES", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.nav-stack button')]
        .find((candidate) => /\\u63d2\\u4ef6/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS331_PLUGIN_ROW_READY", await waitFor(win, `
    (function() {
      const row = document.querySelector('.structured-plugin-row[data-plugin-id="${PLUGIN_ID}"]');
      const action = row?.querySelector('[data-plugin-action="uninstall"]');
      return Boolean(row && action && !action.disabled);
    })()
  `, 15000));
  assertStep("PASS331_INVALID_SCOPE_UNINSTALL_BLOCKED", await waitFor(win, `
    (function() {
      const row = document.querySelector('.structured-plugin-row[data-plugin-id="${INVALID_SCOPE_PLUGIN_ID}"]');
      const action = row?.querySelector('[data-plugin-action="uninstall"]');
      return Boolean(
        row && action?.disabled &&
        /\\u672a\\u8fd4\\u56de\\u6709\\u6548\\u7684\\u5b89\\u88c5\\u8303\\u56f4/.test(action.title || '')
      );
    })()
  `, 5000));

  const beforeUninstall = readCommandLog();
  assertStep("PASS331_CLICK_UNINSTALL", await win.webContents.executeJavaScript(`
    (function() {
      const row = document.querySelector('.structured-plugin-row[data-plugin-id="${PLUGIN_ID}"]');
      const button = row?.querySelector('[data-plugin-action="uninstall"]');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS331_CONFIRM_REVIEW_VISIBLE", await waitFor(win, `
    (function() {
      const confirm = document.querySelector('.plugin-cli-confirm');
      const text = confirm?.textContent || '';
      return Boolean(
        confirm &&
        text.includes(${JSON.stringify(PLUGIN_ID)}) &&
        text.includes(${JSON.stringify(PROJECT_DIR)}) &&
        /plugin uninstall --scope project/.test(text) &&
        /\\u8303\\u56f4/.test(text) &&
        /--keep-data/.test(text) &&
        /--prune/.test(text) &&
        /\\u6301\\u4e45\\u5316\\u6570\\u636e/.test(text)
      );
    })();
  `, 5000));
  assertStep("PASS331_NOT_RUN_BEFORE_CONFIRM", !readCommandLog().slice(beforeUninstall.length).includes('"uninstall"'));
  assertStep("PASS331_CONFIRM_FIRST_UNINSTALL", await confirmCliAction(win));
  assertStep("PASS331_FIRST_EXACT_ARGS", await waitForLogCount(UNINSTALL_COMMAND, 1, 10000));
  assertStep("PASS331_FAILURE_RETAINS_PLUGIN_AND_EVIDENCE", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const row = document.querySelector('.structured-plugin-row[data-plugin-id="${PLUGIN_ID}"]');
      const uninstall = row?.querySelector('[data-plugin-action="uninstall"]');
      const run = (state.commandRuns || []).find((item) =>
        item.kind === 'capability' &&
        item.code === 31 &&
        JSON.stringify(item.args || []) === ${JSON.stringify(UNINSTALL_COMMAND)}
      );
      const event = (state.runEvents || []).find((item) =>
        item.id === run?.requestId && item.status === 'error' && item.code === 31
      );
      const notice = (state.notices || []).find((item) =>
        item.runEventId === run?.requestId &&
        item.capabilityContext?.kind === 'plugin' &&
        item.capabilityContext?.id === ${JSON.stringify(PLUGIN_ID)} &&
        item.capabilityContext?.action === 'uninstall' &&
        /^capability-recovery:/.test(item.action || '')
      );
      return Boolean(
        row &&
        row.classList.contains('focused-capability-row') &&
        uninstall?.getAttribute('data-capability-action-focused') === 'true' &&
        /PASS331 scoped plugin uninstall rejected/.test(row.textContent || '') &&
        /31/.test(row.textContent || '') &&
        row.querySelector('.row-cli-action-evidence.error') &&
        run?.capabilityContext?.action === 'uninstall' &&
        run?.capabilityContext?.target === ${JSON.stringify(PLUGIN_SCOPE)} &&
        event?.capabilityContext?.action === 'uninstall' &&
        event?.capabilityContext?.target === ${JSON.stringify(PLUGIN_SCOPE)} &&
        notice?.capabilityContext?.target === ${JSON.stringify(PLUGIN_SCOPE)} &&
        notice
      );
    })();
  `, 12000));

  assertStep("PASS331_LEAVE_CAPABILITY_SURFACE", await leaveSurface(win));
  assertStep("PASS331_CAPABILITY_SURFACE_CLOSED", await waitFor(win, "Boolean(!document.querySelector('.plugin-manager-modal'))", 5000));
  assertStep("PASS331_PALETTE_RETRY_CLICKED", await clickRecoveryRetryCommand(win));
  assertStep("PASS331_PALETTE_RETRY_CONFIRM_VISIBLE", await waitFor(win, `
    (function() {
      const confirm = document.querySelector('.plugin-cli-confirm');
      const text = confirm?.textContent || '';
      return Boolean(
        confirm &&
        !confirm.querySelector('.danger-action')?.disabled &&
        text.includes(${JSON.stringify(PLUGIN_ID)}) &&
        /plugin uninstall --scope project/.test(text) &&
        /--keep-data/.test(text) &&
        /--prune/.test(text)
      );
    })();
  `, 10000));
  assertStep("PASS331_RETRY_NOT_RUN_BEFORE_CONFIRM", commandLogEntryCount(UNINSTALL_COMMAND) === 1);
  assertStep("PASS331_CONFIRM_RETRY", await confirmCliAction(win));
  assertStep("PASS331_RETRY_EXACT_ARGS", await waitForLogCount(UNINSTALL_COMMAND, 2, 10000));
  assertStep("PASS331_SUCCESS_REMOVES_PLUGIN_AND_PRESERVES_HISTORY", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const runs = (state.commandRuns || []).filter((item) =>
        item.kind === 'capability' && JSON.stringify(item.args || []) === ${JSON.stringify(UNINSTALL_COMMAND)}
      );
      const runIds = new Set(runs.map((item) => item.requestId));
      const events = (state.runEvents || []).filter((item) => runIds.has(item.id));
      const notice = (state.notices || []).find((item) =>
        runIds.has(item.runEventId) && item.capabilityContext?.action === 'uninstall'
      );
      return Boolean(
        !document.querySelector('.structured-plugin-row[data-plugin-id="${PLUGIN_ID}"]') &&
        runs.some((item) => item.code === 31 && /PASS331 scoped plugin uninstall rejected/.test(item.stderr || '')) &&
        runs.some((item) => item.code === 0 && /Uninstalled/.test(item.stdout || '')) &&
        runs.every((item) => item.capabilityContext?.action === 'uninstall' && item.capabilityContext?.target === ${JSON.stringify(PLUGIN_SCOPE)}) &&
        events.some((item) => item.status === 'error' && item.code === 31) &&
        events.some((item) => item.status === 'ok' && item.code === 0) &&
        events.every((item) => item.capabilityContext?.action === 'uninstall' && item.capabilityContext?.target === ${JSON.stringify(PLUGIN_SCOPE)}) &&
        notice
      );
    })();
  `, 15000));
  assertStep("PASS331_NO_PRUNE_OR_KEEP_DATA_ARGS", !/--prune|--keep-data/.test(readCommandLog()));
  assertStep("PASS331_INVALID_SCOPE_NEVER_RAN", !readCommandLog().includes(INVALID_SCOPE_PLUGIN_ID));

  console.log("PASS331_PLUGIN_UNINSTALL_LIFECYCLE_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS331_FAILED", error?.stack || error);
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    const debug = await win.webContents.executeJavaScript(`
      (function() {
        return {
          confirm: document.querySelector('.plugin-cli-confirm')?.textContent || '',
          error: document.querySelector('.plugin-cli-error')?.textContent || '',
          pluginRows: [...document.querySelectorAll('.structured-plugin-row')].map((item) => item.textContent || ''),
          commandButtons: [...document.querySelectorAll('.command-modal [data-command-id]')].map((item) => ({
            id: item.getAttribute('data-command-id') || '',
            text: item.textContent || '',
          })),
          body: document.body.textContent?.slice(0, 10000) || '',
        };
      })();
    `).catch((debugError) => ({ error: String(debugError?.stack || debugError) }));
    console.error("PASS331_DEBUG", JSON.stringify(debug, null, 2).slice(0, 20000));
  }
  console.error("PASS331_COMMAND_LOG", readCommandLog());
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS331_TIMEOUT");
  console.error("PASS331_COMMAND_LOG", readCommandLog());
  cleanup();
  app.exit(1);
}, 120000);
