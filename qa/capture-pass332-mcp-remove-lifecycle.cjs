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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass332-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass332-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass332-project-"));
const COMMAND_LOG = path.join(USER_DATA_DIR, "claude-command-log.txt");
const ATTEMPT_FILE = path.join(USER_DATA_DIR, "mcp-remove-attempt.txt");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const SERVER_NAME = "pass332-server";
const INVALID_SCOPE_SERVER_NAME = "pass332-invalid-scope";
const SERVER_SCOPE = "project";
const REMOVE_ARGS = ["mcp", "remove", "--scope", SERVER_SCOPE, SERVER_NAME];
const REMOVE_COMMAND = JSON.stringify(REMOVE_ARGS);

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
const serverName = ${JSON.stringify(SERVER_NAME)};
const invalidScopeServerName = ${JSON.stringify(INVALID_SCOPE_SERVER_NAME)};
function attempts() {
  try { return Number(fs.readFileSync(attemptFile, 'utf8')) || 0; }
  catch (_error) { return 0; }
}
function installed() { return attempts() < 2; }
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
fs.appendFileSync(commandLog, JSON.stringify(args) + '\\n', 'utf8');
if (args[0] === '--version') out('2.1.210 (Claude Code PASS332)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out({ plugins: [] });
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out({
  servers: [
    ...(installed() ? [{
      name: serverName,
      status: 'connected',
      transport: 'stdio',
      command: 'node pass332-server.cjs',
      tools: [{ name: 'pass332-read', description: 'PASS332 read tool' }]
    }] : []),
    {
      name: invalidScopeServerName,
      status: 'disconnected',
      scope: 'workspace',
      transport: 'stdio',
      command: 'node pass332-invalid.cjs',
      tools: []
    }
  ]
});
else if (args[0] === 'mcp' && args[1] === 'list') out(installed()
  ? serverName + ': connected | 1 tools | stdio\\n' + invalidScopeServerName + ': disconnected | stdio'
  : invalidScopeServerName + ': disconnected | stdio');
else if (args[0] === 'mcp' && args[1] === 'get' && args[2] === serverName) out(
  serverName + ':\\n  Scope: Project config (shared via .mcp.json)\\n  Status: connected\\n  Type: stdio\\n  Command: node pass332-server.cjs\\n\\nTo remove this server, run: claude mcp remove ' + serverName + ' -s project'
);
else if (args[0] === 'mcp' && args[1] === 'get' && args[2] === invalidScopeServerName) {
  process.stderr.write(
    'Lookup failed. To remove this server, run: claude mcp remove ' + invalidScopeServerName + ' -s user\\n'
  );
  process.exitCode = 17;
}
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else if (JSON.stringify(args) === ${JSON.stringify(REMOVE_COMMAND)}) {
  const nextAttempt = attempts() + 1;
  fs.writeFileSync(attemptFile, String(nextAttempt), 'utf8');
  if (nextAttempt === 1) {
    process.stderr.write('PASS332 scoped MCP remove rejected by Claude CLI\\n');
    process.exitCode = 32;
  } else {
    out('Removed MCP server ' + serverName + ' from project scope');
  }
}
else {
  process.stderr.write('PASS332 unexpected command: ' + JSON.stringify(args) + '\\n');
  process.exitCode = 99;
}
`;

fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), '@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n', "utf8");
const FAKE_CLAUDE_COMMAND = path.join(FAKE_BIN_DIR, "claude.cmd");

fs.mkdirSync(PROJECT_DIR, { recursive: true });
fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass332-project" }), "utf8");
writeJson(DATA_FILE, {
  version: 1,
  activeProject: { name: "pass332-project", path: PROJECT_DIR },
  projects: [{ name: "pass332-project", path: PROJECT_DIR }],
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
    id: "pass332-session",
    title: "PASS332 scoped MCP remove lifecycle",
    project: "pass332-project",
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
      setter?.call(input, 'mcp remove pass332');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 360));
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) =>
          (candidate.getAttribute('data-command-id') || '').startsWith('capability-recovery:retry:') &&
          /mcp remove/i.test(candidate.textContent || '')
        );
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function clickMcpRemoveCommand(win) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 240));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, 'mcp remove pass332 project');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 360));
      const button = document.querySelector('.command-modal .command-list button[data-command-id="capability-mcp-action:remove:pass332-server"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1700);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS332_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS332_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS332_OPEN_CAPABILITIES", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.nav-stack button')]
        .find((candidate) => /\\u63d2\\u4ef6/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS332_OPEN_MCP_TAB", await waitFor(win, "Boolean(document.querySelector('.plugin-manager-tabs'))", 10000) && await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.plugin-manager-tabs button')]
        .find((candidate) => /MCP/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS332_MCP_ROW_READY", await waitFor(win, `
    (function() {
      const row = document.querySelector('.structured-plugin-row[data-mcp-server-id="${SERVER_NAME}"]');
      const action = row?.querySelector('[data-mcp-server-action="remove"]');
      return Boolean(row && action && !action.disabled && /${SERVER_SCOPE}/.test(row.textContent || ''));
    })()
  `, 15000));
  assertStep("PASS332_INVALID_SCOPE_REMOVE_BLOCKED", await waitFor(win, `
    (function() {
      const row = document.querySelector('.structured-plugin-row[data-mcp-server-id="${INVALID_SCOPE_SERVER_NAME}"]');
      const action = row?.querySelector('[data-mcp-server-action="remove"]');
      const refresh = row?.querySelector('[data-mcp-server-action="refresh"]');
      return Boolean(
        row && action?.disabled &&
        !refresh?.querySelector('.spin') &&
        /\\u672a\\u8fd4\\u56de\\u6709\\u6548.*\\u8303\\u56f4/.test(action.title || '')
      );
    })()
  `, 5000));

  const beforePaletteFocus = readCommandLog();
  assertStep("PASS332_PALETTE_REMOVE_COMMAND_CLICKED", await clickMcpRemoveCommand(win));
  assertStep("PASS332_PALETTE_REMOVE_FOCUSES_WITHOUT_EXECUTION", await waitFor(win, `
    (function() {
      const target = document.querySelector('.structured-plugin-row[data-mcp-server-id="${SERVER_NAME}"] [data-mcp-server-action="remove"]');
      const invalidCommand = document.querySelector('.command-modal .command-list button[data-command-id="capability-mcp-action:remove:pass332-invalid-scope"]');
      return Boolean(
        target?.getAttribute('data-capability-action-focused') === 'true' &&
        !document.querySelector('.plugin-cli-confirm') &&
        !invalidCommand
      );
    })()
  `, 10000));
  assertStep("PASS332_PALETTE_REMOVE_DID_NOT_RUN", !readCommandLog().slice(beforePaletteFocus.length).includes('"remove"'));

  const beforeRemove = readCommandLog();
  assertStep("PASS332_CLICK_REMOVE", await win.webContents.executeJavaScript(`
    (function() {
      const row = document.querySelector('.structured-plugin-row[data-mcp-server-id="${SERVER_NAME}"]');
      const button = row?.querySelector('[data-mcp-server-action="remove"]');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS332_CONFIRM_REVIEW_VISIBLE", await waitFor(win, `
    (function() {
      const confirm = document.querySelector('.plugin-cli-confirm');
      const text = confirm?.textContent || '';
      return Boolean(
        confirm &&
        text.includes(${JSON.stringify(SERVER_NAME)}) &&
        text.includes(${JSON.stringify(PROJECT_DIR)}) &&
        /mcp remove --scope project pass332-server/.test(text) &&
        /\\u8303\\u56f4/.test(text) &&
        /MCP.*\\u670d\\u52a1\\u5668.*\\u914d\\u7f6e/.test(text)
      );
    })();
  `, 5000));
  assertStep("PASS332_NOT_RUN_BEFORE_CONFIRM", !readCommandLog().slice(beforeRemove.length).includes('"remove"'));
  assertStep("PASS332_CONFIRM_FIRST_REMOVE", await confirmCliAction(win));
  assertStep("PASS332_FIRST_EXACT_ARGS", await waitForLogCount(REMOVE_COMMAND, 1, 10000));
  assertStep("PASS332_FAILURE_RETAINS_SERVER_AND_EVIDENCE", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const row = document.querySelector('.structured-plugin-row[data-mcp-server-id="${SERVER_NAME}"]');
      const run = (state.commandRuns || []).find((item) =>
        item.kind === 'capability' &&
        item.code === 32 &&
        JSON.stringify(item.args || []) === ${JSON.stringify(REMOVE_COMMAND)}
      );
      const event = (state.runEvents || []).find((item) =>
        item.id === run?.requestId && item.status === 'error' && item.code === 32
      );
      const notice = (state.notices || []).find((item) =>
        item.runEventId === run?.requestId &&
        item.capabilityContext?.kind === 'mcp' &&
        item.capabilityContext?.id === ${JSON.stringify(SERVER_NAME)} &&
        item.capabilityContext?.action === 'remove' &&
        /^capability-recovery:/.test(item.action || '')
      );
      return Boolean(
        row &&
        /PASS332 scoped MCP remove rejected/.test(row.textContent || '') &&
        /32/.test(row.textContent || '') &&
        row.querySelector('.row-cli-action-evidence.error') &&
        run?.capabilityContext?.action === 'remove' &&
        run?.capabilityContext?.target === ${JSON.stringify(SERVER_SCOPE)} &&
        event?.capabilityContext?.action === 'remove' &&
        event?.capabilityContext?.target === ${JSON.stringify(SERVER_SCOPE)} &&
        notice?.capabilityContext?.target === ${JSON.stringify(SERVER_SCOPE)}
      );
    })();
  `, 12000));

  assertStep("PASS332_LEAVE_CAPABILITY_SURFACE", await leaveSurface(win));
  assertStep("PASS332_CAPABILITY_SURFACE_CLOSED", await waitFor(win, "Boolean(!document.querySelector('.plugin-manager-modal'))", 5000));
  assertStep("PASS332_PALETTE_RETRY_CLICKED", await clickRecoveryRetryCommand(win));
  assertStep("PASS332_PALETTE_RETRY_CONFIRM_VISIBLE", await waitFor(win, `
    (function() {
      const confirm = document.querySelector('.plugin-cli-confirm');
      const text = confirm?.textContent || '';
      return Boolean(
        confirm &&
        !confirm.querySelector('.danger-action')?.disabled &&
        text.includes(${JSON.stringify(SERVER_NAME)}) &&
        /mcp remove --scope project pass332-server/.test(text) &&
        /MCP.*\\u670d\\u52a1\\u5668.*\\u914d\\u7f6e/.test(text)
      );
    })();
  `, 10000));
  assertStep("PASS332_RETRY_NOT_RUN_BEFORE_CONFIRM", commandLogEntryCount(REMOVE_COMMAND) === 1);
  assertStep("PASS332_CONFIRM_RETRY", await confirmCliAction(win));
  assertStep("PASS332_RETRY_EXACT_ARGS", await waitForLogCount(REMOVE_COMMAND, 2, 10000));
  assertStep("PASS332_SUCCESS_REMOVES_SERVER_AND_PRESERVES_HISTORY", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const runs = (state.commandRuns || []).filter((item) =>
        item.kind === 'capability' && JSON.stringify(item.args || []) === ${JSON.stringify(REMOVE_COMMAND)}
      );
      const runIds = new Set(runs.map((item) => item.requestId));
      const events = (state.runEvents || []).filter((item) => runIds.has(item.id));
      const notice = (state.notices || []).find((item) =>
        runIds.has(item.runEventId) && item.capabilityContext?.action === 'remove'
      );
      return Boolean(
        !document.querySelector('.structured-plugin-row[data-mcp-server-id="${SERVER_NAME}"]') &&
        runs.some((item) => item.code === 32 && /PASS332 scoped MCP remove rejected/.test(item.stderr || '')) &&
        runs.some((item) => item.code === 0 && /Removed MCP server/.test(item.stdout || '')) &&
        runs.every((item) => item.capabilityContext?.kind === 'mcp' && item.capabilityContext?.action === 'remove' && item.capabilityContext?.target === ${JSON.stringify(SERVER_SCOPE)}) &&
        events.some((item) => item.status === 'error' && item.code === 32) &&
        events.some((item) => item.status === 'ok' && item.code === 0) &&
        events.every((item) => item.capabilityContext?.kind === 'mcp' && item.capabilityContext?.action === 'remove' && item.capabilityContext?.target === ${JSON.stringify(SERVER_SCOPE)}) &&
        notice
      );
    })();
  `, 15000));
  assertStep("PASS332_NO_UNSCOPED_OR_EXTRA_REMOVE", readCommandLog().split(/\r?\n/).filter((line) => /\["mcp","remove"/.test(line)).every((line) => line === REMOVE_COMMAND));
  assertStep("PASS332_INVALID_SCOPE_NEVER_RAN", !readCommandLog().includes(INVALID_SCOPE_SERVER_NAME + '\",\"remove'));

  console.log("PASS332_MCP_REMOVE_LIFECYCLE_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS332_FAILED", error?.stack || error);
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    try {
      const debug = await win.webContents.executeJavaScript(`
        (async function() {
          const state = await window.claudexDesktop?.getState?.();
          return {
            body: document.body?.innerText?.slice(0, 12000),
            commandRuns: state?.commandRuns,
            runEvents: state?.runEvents,
            notices: state?.notices,
            mcpRows: [...document.querySelectorAll('[data-mcp-server-id]')].map((row) => ({
              id: row.getAttribute('data-mcp-server-id'),
              text: row.textContent,
              actions: [...row.querySelectorAll('[data-mcp-server-action]')].map((button) => ({
                action: button.getAttribute('data-mcp-server-action'),
                disabled: button.disabled,
                title: button.title,
              })),
            })),
          };
        })();
      `);
      console.error("PASS332_DEBUG", JSON.stringify(debug, null, 2).slice(0, 24000));
    } catch (debugError) {
      console.error("PASS332_DEBUG_FAILED", debugError?.stack || debugError);
    }
  }
  console.error("PASS332_COMMAND_LOG", readCommandLog());
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS332_TIMEOUT");
  console.error("PASS332_COMMAND_LOG", readCommandLog());
  cleanup();
  app.exit(1);
}, 120000);
