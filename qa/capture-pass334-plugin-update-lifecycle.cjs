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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass334-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass334-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass334-project-"));
const COMMAND_LOG = path.join(USER_DATA_DIR, "claude-command-log.txt");
const INVOCATION_LOG = path.join(USER_DATA_DIR, "claude-invocation-log.txt");
const ATTEMPT_FILE = path.join(USER_DATA_DIR, "plugin-update-attempt.txt");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const PLUGIN_ID = "pass334-update-plugin@pass334-market";
const INVALID_SCOPE_PLUGIN_ID = "pass334-invalid-scope-plugin@pass334-market";
const PLUGIN_SCOPE = "project";
const UPDATE_ARGS = ["plugin", "update", "--scope", PLUGIN_SCOPE, PLUGIN_ID];
const UPDATE_COMMAND = JSON.stringify(UPDATE_ARGS);

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

function readInvocationLog() {
  try {
    return fs.readFileSync(INVOCATION_LOG, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (_error) {
    return [];
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
const invocationLog = ${JSON.stringify(INVOCATION_LOG)};
const attemptFile = ${JSON.stringify(ATTEMPT_FILE)};
const pluginId = ${JSON.stringify(PLUGIN_ID)};
function attempts() {
  try { return Number(fs.readFileSync(attemptFile, 'utf8')) || 0; }
  catch (_error) { return 0; }
}
function version() { return attempts() >= 2 ? '33.4.1' : '33.4.0'; }
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
fs.appendFileSync(commandLog, JSON.stringify(args) + '\\n', 'utf8');
fs.appendFileSync(invocationLog, JSON.stringify({ args, cwd: process.cwd() }) + '\\n', 'utf8');
if (args[0] === '--version') out('2.1.210 (Claude Code PASS334)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out({
  plugins: [
    {
      id: pluginId,
      name: 'pass334-update-plugin',
      marketplace: 'pass334-market',
      version: version(),
      scope: 'project',
      enabled: true,
      status: 'enabled',
      source: { source: 'git', url: 'https://example.invalid/pass334.git', ref: 'v' + version() },
      installPath: 'C:/pass334/plugins/update',
      tools: ['pass334-read-tool'],
      permissions: { filesystem: 'read' }
    },
    {
      id: ${JSON.stringify(INVALID_SCOPE_PLUGIN_ID)},
      name: 'pass334-invalid-scope-plugin',
      marketplace: 'pass334-market',
      version: '33.4.0',
      scope: 'workspace',
      enabled: false,
      status: 'disabled',
      source: 'PASS334 invalid scope fixture'
    }
  ]
});
else if (args[0] === 'plugin' && args[1] === 'list') out(
  'Installed plugins:\\n\\n  > ' + pluginId + '\\n    Version: ' + version() + '\\n    Scope: project\\n    Status: enabled'
);
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out({ servers: [] });
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else if (JSON.stringify(args) === ${JSON.stringify(UPDATE_COMMAND)}) {
  const nextAttempt = attempts() + 1;
  fs.writeFileSync(attemptFile, String(nextAttempt), 'utf8');
  if (nextAttempt === 1) {
    process.stderr.write('PASS334 scoped plugin update rejected by Claude CLI\\n');
    process.exitCode = 34;
  } else {
    out('Updated ' + pluginId + ' in project scope to 33.4.1; restart required');
  }
}
else {
  process.stderr.write('PASS334 unexpected command: ' + JSON.stringify(args) + '\\n');
  process.exitCode = 99;
}
`;

fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), '@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n', "utf8");
const FAKE_CLAUDE_COMMAND = path.join(FAKE_BIN_DIR, "claude.cmd");

fs.mkdirSync(PROJECT_DIR, { recursive: true });
fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass334-project" }), "utf8");
writeJson(DATA_FILE, {
  version: 1,
  activeProject: { name: "pass334-project", path: PROJECT_DIR },
  projects: [{ name: "pass334-project", path: PROJECT_DIR }],
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
    id: "pass334-session",
    title: "PASS334 scoped plugin update lifecycle",
    project: "pass334-project",
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

async function setField(win, selector, value) {
  return win.webContents.executeJavaScript(`
    (function() {
      const field = document.querySelector(${JSON.stringify(selector)});
      if (!field) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(field, ${JSON.stringify(value)});
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
      return field.value === ${JSON.stringify(value)};
    })();
  `);
}

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

async function dismissCliAction(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.plugin-cli-confirm .dirty-confirm-actions .plain-action');
      if (!button) return false;
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

async function runPaletteCommand(win, commandId, query = "") {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 240));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      if (${JSON.stringify(query)}) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        setter?.call(input, ${JSON.stringify(query)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 360));
      }
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === ${JSON.stringify(commandId)});
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
      setter?.call(input, 'plugin update pass334');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 360));
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) =>
          (candidate.getAttribute('data-command-id') || '').startsWith('capability-recovery:retry:') &&
          /plugin update/i.test(candidate.textContent || '')
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
  if (!win) throw new Error("PASS334_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS334_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS334_OPEN_CAPABILITIES", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.nav-stack button')]
        .find((candidate) => /\\u63d2\\u4ef6/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS334_PLUGIN_ROW_READY", await waitFor(win, `
    (function() {
      const row = document.querySelector('.structured-plugin-row[data-plugin-id="${PLUGIN_ID}"]');
      const action = row?.querySelector('[data-plugin-action="update"]');
      return Boolean(row && action && !action.disabled && /33\\.4\\.0/.test(row.textContent || ''));
    })()
  `, 15000));
  assertStep("PASS334_INVALID_SCOPE_UPDATE_BLOCKED", await waitFor(win, `
    (function() {
      const row = document.querySelector('.structured-plugin-row[data-plugin-id="${INVALID_SCOPE_PLUGIN_ID}"]');
      const action = row?.querySelector('[data-plugin-action="update"]');
      return Boolean(row && action?.disabled);
    })()
  `, 5000));

  const beforeUpdate = readCommandLog();
  assertStep("PASS334_CLICK_UPDATE", await win.webContents.executeJavaScript(`
    (function() {
      const row = document.querySelector('.structured-plugin-row[data-plugin-id="${PLUGIN_ID}"]');
      const button = row?.querySelector('[data-plugin-action="update"]');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS334_CONFIRM_EXACT_SCOPED_COMMAND", await waitFor(win, `
    (function() {
      const confirm = document.querySelector('.plugin-cli-confirm');
      const text = confirm?.textContent || '';
      return Boolean(
        confirm &&
        text.includes(${JSON.stringify(PLUGIN_ID)}) &&
        text.includes(${JSON.stringify(PROJECT_DIR)}) &&
        /plugin update --scope project/.test(text) &&
        /33\\.4\\.0/.test(text) &&
        /\\u91cd\\u542f/.test(text)
      );
    })();
  `, 5000));
  assertStep("PASS334_NOT_RUN_BEFORE_CONFIRM", !readCommandLog().slice(beforeUpdate.length).includes('"update"'));
  assertStep("PASS334_CONFIRM_FIRST_UPDATE", await confirmCliAction(win));
  assertStep("PASS334_FIRST_EXACT_ARGS", await waitForLogCount(UPDATE_COMMAND, 1, 10000));
  assertStep("PASS334_FAILURE_RETAINS_PLUGIN_AND_EVIDENCE", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const row = document.querySelector('.structured-plugin-row[data-plugin-id="${PLUGIN_ID}"]');
      const update = row?.querySelector('[data-plugin-action="update"]');
      const run = (state.commandRuns || []).find((item) =>
        item.kind === 'capability' && item.code === 34 && JSON.stringify(item.args || []) === ${JSON.stringify(UPDATE_COMMAND)}
      );
      const event = (state.runEvents || []).find((item) => item.id === run?.requestId && item.status === 'error' && item.code === 34);
      const notice = (state.notices || []).find((item) =>
        item.runEventId === run?.requestId &&
        item.capabilityContext?.kind === 'plugin' &&
        item.capabilityContext?.id === ${JSON.stringify(PLUGIN_ID)} &&
        item.capabilityContext?.action === 'update' &&
        item.capabilityContext?.target === ${JSON.stringify(PLUGIN_SCOPE)} &&
        /^capability-recovery:/.test(item.action || '')
      );
      return Boolean(
        row &&
        row.classList.contains('focused-capability-row') &&
        update?.getAttribute('data-capability-action-focused') === 'true' &&
        /PASS334 scoped plugin update rejected/.test(row.textContent || '') &&
        row.querySelector('.row-cli-action-evidence.error') &&
        run?.capabilityContext?.action === 'update' &&
        run?.capabilityContext?.target === ${JSON.stringify(PLUGIN_SCOPE)} &&
        event?.capabilityContext?.target === ${JSON.stringify(PLUGIN_SCOPE)} &&
        notice
      );
    })();
  `, 12000));

  assertStep("PASS334_LEAVE_CAPABILITY_SURFACE", await leaveSurface(win));
  assertStep("PASS334_CAPABILITY_SURFACE_CLOSED", await waitFor(win, "Boolean(!document.querySelector('.plugin-manager-modal'))", 5000));
  assertStep("PASS334_PALETTE_RETRY_CLICKED", await clickRecoveryRetryCommand(win));
  assertStep("PASS334_RETRY_CONFIRM_VISIBLE", await waitFor(win, `
    (function() {
      const confirm = document.querySelector('.plugin-cli-confirm');
      const text = confirm?.textContent || '';
      return Boolean(
        confirm &&
        !confirm.querySelector('.danger-action')?.disabled &&
        text.includes(${JSON.stringify(PLUGIN_ID)}) &&
        /plugin update --scope project/.test(text) &&
        /\\u91cd\\u542f/.test(text)
      );
    })();
  `, 10000));
  assertStep("PASS334_RETRY_NOT_RUN_BEFORE_CONFIRM", commandLogEntryCount(UPDATE_COMMAND) === 1);
  assertStep("PASS334_CONFIRM_RETRY", await confirmCliAction(win));
  assertStep("PASS334_RETRY_EXACT_ARGS", await waitForLogCount(UPDATE_COMMAND, 2, 10000));
  assertStep("PASS334_SUCCESS_REFRESHES_VERSION_AND_PRESERVES_HISTORY", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const row = document.querySelector('.structured-plugin-row[data-plugin-id="${PLUGIN_ID}"]');
      const runs = (state.commandRuns || []).filter((item) =>
        item.kind === 'capability' && JSON.stringify(item.args || []) === ${JSON.stringify(UPDATE_COMMAND)}
      );
      const runIds = new Set(runs.map((item) => item.requestId));
      const events = (state.runEvents || []).filter((item) => runIds.has(item.id));
      return Boolean(
        row &&
        row.classList.contains('focused-capability-row') &&
        /33\\.4\\.1/.test(row.textContent || '') &&
        runs.some((item) => item.code === 34 && /PASS334 scoped plugin update rejected/.test(item.stderr || '')) &&
        runs.some((item) => item.code === 0 && /restart required/.test(item.stdout || '')) &&
        runs.every((item) => item.capabilityContext?.action === 'update' && item.capabilityContext?.target === ${JSON.stringify(PLUGIN_SCOPE)}) &&
        events.some((item) => item.status === 'error' && item.code === 34) &&
        events.some((item) => item.status === 'ok' && item.code === 0)
      );
    })();
  `, 15000));
  assertStep("PASS334_VALID_PROJECT_CWD", readInvocationLog().filter((invocation) => JSON.stringify(invocation.args) === UPDATE_COMMAND).every((invocation) => (
    path.resolve(invocation.cwd).toLowerCase() === path.resolve(PROJECT_DIR).toLowerCase()
  )));

  assertStep("PASS334_LEAVE_FOR_CLAUDE_PANEL", await leaveSurface(win));
  assertStep("PASS334_OPEN_CLAUDE_TOOL", await runPaletteCommand(win, "tool-claude"));
  assertStep("PASS334_CLAUDE_PANEL_PLUGIN_READY", await waitFor(win, "Boolean(document.querySelector('#claude-tool-detail .plugin-installer input'))", 15000));
  assertStep("PASS334_SET_CLAUDE_PANEL_PLUGIN", await setField(win, '#claude-tool-detail .plugin-installer input', PLUGIN_ID));
  assertStep("PASS334_CLAUDE_PANEL_UPDATE_REVIEW_CLICKED", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('#claude-tool-detail .plugin-installer .tool-actions button')]
        .find((candidate) => /\\u66f4\\u65b0|update/i.test(candidate.textContent || ''));
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS334_CLAUDE_PANEL_ROUTES_TO_SCOPED_CONFIRM", await waitFor(win, `
    (function() {
      const confirm = document.querySelector('.plugin-cli-confirm');
      const text = confirm?.textContent || '';
      return Boolean(confirm && text.includes(${JSON.stringify(PLUGIN_ID)}) && /plugin update --scope project/.test(text));
    })();
  `, 10000));
  assertStep("PASS334_CLAUDE_PANEL_DID_NOT_RUN_UNSCOPED_UPDATE", commandLogEntryCount(UPDATE_COMMAND) === 2);
  assertStep("PASS334_DISMISS_CLAUDE_PANEL_REVIEW", await dismissCliAction(win));

  const beforeMissingProjectProbe = readCommandLog();
  assertStep("PASS334_PROJECT_SCOPE_REQUIRES_REAL_CWD", await win.webContents.executeJavaScript(`
    (async function() {
      try {
        await window.claudexDesktop.runClaudeCommand({
          projectPath: ${JSON.stringify(path.join(PROJECT_DIR, "missing"))},
          args: ${JSON.stringify(UPDATE_ARGS)},
          requestId: "pass334_missing_project",
          persistCommandRun: true,
          commandRunKind: "capability",
          capabilityContext: { tab: "plugins", kind: "plugin", id: ${JSON.stringify(PLUGIN_ID)}, action: "update", target: "project" },
        });
        return false;
      } catch (error) {
        return /project|workspace|\\u9879\\u76ee|\\u5de5\\u4f5c\\u533a/i.test(error?.message || String(error));
      }
    })();
  `));
  assertStep("PASS334_MISSING_PROJECT_DID_NOT_START_CLI", !readCommandLog().slice(beforeMissingProjectProbe.length).includes(PLUGIN_ID));
  assertStep("PASS334_NO_UNSCOPED_OR_WRONG_SCOPE_UPDATE", readCommandLog().split(/\r?\n/).filter(Boolean).every((line) => {
    try {
      const args = JSON.parse(line);
      return args[0] !== "plugin" || args[1] !== "update" || line === UPDATE_COMMAND;
    } catch (_error) {
      return false;
    }
  }));

  console.log("PASS334_PLUGIN_UPDATE_LIFECYCLE_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS334_FAILED", error?.stack || error);
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    try {
      const debug = await win.webContents.executeJavaScript(`
        (async function() {
          const state = await window.claudexDesktop?.getState?.();
          return {
            body: document.body?.innerText?.slice(0, 16000),
            commandRuns: state?.commandRuns,
            runEvents: state?.runEvents,
            notices: state?.notices,
            confirm: document.querySelector('.plugin-cli-confirm')?.textContent,
            pluginRows: [...document.querySelectorAll('[data-plugin-id]')].map((row) => ({
              id: row.getAttribute('data-plugin-id'),
              text: row.textContent,
              focused: row.getAttribute('data-capability-focused'),
            })),
          };
        })();
      `);
      console.error("PASS334_DEBUG", JSON.stringify(debug, null, 2).slice(0, 30000));
    } catch (debugError) {
      console.error("PASS334_DEBUG_FAILED", debugError?.stack || debugError);
    }
  }
  console.error("PASS334_COMMAND_LOG", readCommandLog());
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS334_TIMEOUT");
  console.error("PASS334_COMMAND_LOG", readCommandLog());
  cleanup();
  app.exit(1);
}, 120000);
