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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass335-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass335-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass335-project-"));
const COMMAND_LOG = path.join(USER_DATA_DIR, "claude-command-log.txt");
const INVOCATION_LOG = path.join(USER_DATA_DIR, "claude-invocation-log.txt");
const DISABLE_ATTEMPT_FILE = path.join(USER_DATA_DIR, "plugin-disable-attempt.txt");
const ENABLED_STATE_FILE = path.join(USER_DATA_DIR, "plugin-enabled-state.txt");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const PLUGIN_ID = "pass335-toggle-plugin@pass335-market";
const INVALID_SCOPE_PLUGIN_ID = "pass335-invalid-scope-plugin@pass335-market";
const PLUGIN_SCOPE = "project";
const DISABLE_ARGS = ["plugin", "disable", "--scope", PLUGIN_SCOPE, PLUGIN_ID];
const ENABLE_ARGS = ["plugin", "enable", "--scope", PLUGIN_SCOPE, PLUGIN_ID];
const DISABLE_COMMAND = JSON.stringify(DISABLE_ARGS);
const ENABLE_COMMAND = JSON.stringify(ENABLE_ARGS);

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
const disableAttemptFile = ${JSON.stringify(DISABLE_ATTEMPT_FILE)};
const enabledStateFile = ${JSON.stringify(ENABLED_STATE_FILE)};
const pluginId = ${JSON.stringify(PLUGIN_ID)};
function readNumber(file) {
  try { return Number(fs.readFileSync(file, 'utf8')) || 0; }
  catch (_error) { return 0; }
}
function isEnabled() {
  try { return fs.readFileSync(enabledStateFile, 'utf8').trim() !== 'disabled'; }
  catch (_error) { return true; }
}
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
fs.appendFileSync(commandLog, JSON.stringify(args) + '\\n', 'utf8');
fs.appendFileSync(invocationLog, JSON.stringify({ args, cwd: process.cwd() }) + '\\n', 'utf8');
if (args[0] === '--version') out('2.1.210 (Claude Code PASS335)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out({
  plugins: [
    {
      id: pluginId,
      name: 'pass335-toggle-plugin',
      marketplace: 'pass335-market',
      version: '33.5.0',
      scope: 'project',
      enabled: isEnabled(),
      status: isEnabled() ? 'enabled' : 'disabled',
      source: { source: 'git', url: 'https://example.invalid/pass335.git', ref: 'v33.5.0' },
      installPath: 'C:/pass335/plugins/toggle',
      tools: ['pass335-read-tool'],
      permissions: { filesystem: 'read' }
    },
    {
      id: ${JSON.stringify(INVALID_SCOPE_PLUGIN_ID)},
      name: 'pass335-invalid-scope-plugin',
      marketplace: 'pass335-market',
      version: '33.5.0',
      scope: 'managed',
      enabled: true,
      status: 'enabled',
      source: 'PASS335 invalid toggle scope fixture'
    }
  ]
});
else if (args[0] === 'plugin' && args[1] === 'list') out(
  'Installed plugins:\\n\\n  > ' + pluginId + '\\n    Version: 33.5.0\\n    Scope: project\\n    Status: ' + (isEnabled() ? 'enabled' : 'disabled')
);
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out({ servers: [] });
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else if (JSON.stringify(args) === ${JSON.stringify(DISABLE_COMMAND)}) {
  const nextAttempt = readNumber(disableAttemptFile) + 1;
  fs.writeFileSync(disableAttemptFile, String(nextAttempt), 'utf8');
  if (nextAttempt === 1) {
    process.stderr.write('PASS335 scoped plugin disable rejected by Claude CLI\\n');
    process.exitCode = 35;
  } else {
    fs.writeFileSync(enabledStateFile, 'disabled', 'utf8');
    out('Disabled ' + pluginId + ' in project scope');
  }
}
else if (JSON.stringify(args) === ${JSON.stringify(ENABLE_COMMAND)}) {
  fs.writeFileSync(enabledStateFile, 'enabled', 'utf8');
  out('Enabled ' + pluginId + ' in project scope');
}
else {
  process.stderr.write('PASS335 unexpected command: ' + JSON.stringify(args) + '\\n');
  process.exitCode = 99;
}
`;

fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), '@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n', "utf8");
const FAKE_CLAUDE_COMMAND = path.join(FAKE_BIN_DIR, "claude.cmd");

fs.mkdirSync(PROJECT_DIR, { recursive: true });
fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass335-project" }), "utf8");
writeJson(DATA_FILE, {
  version: 1,
  activeProject: { name: "pass335-project", path: PROJECT_DIR },
  projects: [{ name: "pass335-project", path: PROJECT_DIR }],
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
    id: "pass335-session",
    title: "PASS335 scoped plugin toggle lifecycle",
    project: "pass335-project",
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

async function clickPaletteRecovery(win, action) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 240));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, 'plugin ${action} pass335');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 360));
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) =>
          (candidate.getAttribute('data-command-id') || '').startsWith('capability-recovery:retry:') &&
          /plugin ${action}/i.test(candidate.textContent || '')
        );
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runPaletteCommand(win, commandId) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 240));
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === ${JSON.stringify(commandId)});
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1700);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS335_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS335_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS335_OPEN_CAPABILITIES", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.nav-stack button')]
        .find((candidate) => /\\u63d2\\u4ef6/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS335_PLUGIN_ROW_READY", await waitFor(win, `
    (function() {
      const row = document.querySelector('.structured-plugin-row[data-plugin-id="${PLUGIN_ID}"]');
      const action = row?.querySelector('[data-plugin-action="disable"]');
      return Boolean(row && action && !action.disabled && /33\\.5\\.0/.test(row.textContent || ''));
    })()
  `, 15000));
  assertStep("PASS335_INVALID_SCOPE_TOGGLE_BLOCKED", await waitFor(win, `
    (function() {
      const row = document.querySelector('.structured-plugin-row[data-plugin-id="${INVALID_SCOPE_PLUGIN_ID}"]');
      const action = row?.querySelector('[data-plugin-action="disable"]');
      return Boolean(row && action?.disabled);
    })()
  `, 5000));

  const beforeDisable = readCommandLog();
  assertStep("PASS335_CLICK_DISABLE", await win.webContents.executeJavaScript(`
    (function() {
      const row = document.querySelector('.structured-plugin-row[data-plugin-id="${PLUGIN_ID}"]');
      const button = row?.querySelector('[data-plugin-action="disable"]');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS335_DISABLE_CONFIRM_EXACT_SCOPE", await waitFor(win, `
    (function() {
      const confirm = document.querySelector('.plugin-cli-confirm');
      const text = confirm?.textContent || '';
      return Boolean(
        confirm &&
        text.includes(${JSON.stringify(PLUGIN_ID)}) &&
        text.includes(${JSON.stringify(PROJECT_DIR)}) &&
        /plugin disable --scope project/.test(text)
      );
    })()
  `, 5000));
  assertStep("PASS335_DISABLE_NOT_RUN_BEFORE_CONFIRM", !readCommandLog().slice(beforeDisable.length).includes('"disable"'));
  assertStep("PASS335_CONFIRM_FIRST_DISABLE", await confirmCliAction(win));
  assertStep("PASS335_FIRST_DISABLE_EXACT_ARGS", await waitForLogCount(DISABLE_COMMAND, 1, 10000));
  assertStep("PASS335_DISABLE_FAILURE_EVIDENCE", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const row = document.querySelector('.structured-plugin-row[data-plugin-id="${PLUGIN_ID}"]');
      const run = (state.commandRuns || []).find((item) =>
        item.kind === 'capability' && item.code === 35 && JSON.stringify(item.args || []) === ${JSON.stringify(DISABLE_COMMAND)}
      );
      return Boolean(
        row?.classList.contains('focused-capability-row') &&
        row.querySelector('[data-plugin-action="disable"]')?.getAttribute('data-capability-action-focused') === 'true' &&
        /PASS335 scoped plugin disable rejected/.test(row.textContent || '') &&
        run?.capabilityContext?.action === 'disable' &&
        run?.capabilityContext?.target === ${JSON.stringify(PLUGIN_SCOPE)}
      );
    })()
  `, 12000));

  assertStep("PASS335_LEAVE_CAPABILITIES", await leaveSurface(win));
  assertStep("PASS335_PALETTE_DISABLE_RETRY", await clickPaletteRecovery(win, "disable"));
  assertStep("PASS335_DISABLE_RETRY_CONFIRM", await waitFor(win, `
    (function() {
      const confirm = document.querySelector('.plugin-cli-confirm');
      const text = confirm?.textContent || '';
      return Boolean(confirm && !confirm.querySelector('.danger-action')?.disabled && /plugin disable --scope project/.test(text));
    })()
  `, 10000));
  assertStep("PASS335_DISABLE_RETRY_NOT_RUN_BEFORE_CONFIRM", commandLogEntryCount(DISABLE_COMMAND) === 1);
  assertStep("PASS335_CONFIRM_DISABLE_RETRY", await confirmCliAction(win));
  assertStep("PASS335_DISABLE_RETRY_EXACT_ARGS", await waitForLogCount(DISABLE_COMMAND, 2, 10000));
  assertStep("PASS335_DISABLE_SUCCESS_REFRESHES_STATE", await waitFor(win, `
    (function() {
      const row = document.querySelector('.structured-plugin-row[data-plugin-id="${PLUGIN_ID}"]');
      const enable = row?.querySelector('[data-plugin-action="enable"]');
      return Boolean(row && enable && !enable.disabled && /\\u5df2\\u7981\\u7528|disabled/i.test(row.textContent || ''));
    })()
  `, 15000));

  assertStep("PASS335_CLICK_ENABLE", await win.webContents.executeJavaScript(`
    (function() {
      const row = document.querySelector('.structured-plugin-row[data-plugin-id="${PLUGIN_ID}"]');
      const button = row?.querySelector('[data-plugin-action="enable"]');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS335_ENABLE_CONFIRM_EXACT_SCOPE", await waitFor(win, `
    (function() {
      const confirm = document.querySelector('.plugin-cli-confirm');
      const text = confirm?.textContent || '';
      return Boolean(confirm && text.includes(${JSON.stringify(PROJECT_DIR)}) && /plugin enable --scope project/.test(text));
    })()
  `, 5000));
  assertStep("PASS335_ENABLE_NOT_RUN_BEFORE_CONFIRM", commandLogEntryCount(ENABLE_COMMAND) === 0);
  assertStep("PASS335_CONFIRM_ENABLE", await confirmCliAction(win));
  assertStep("PASS335_ENABLE_EXACT_ARGS", await waitForLogCount(ENABLE_COMMAND, 1, 10000));
  assertStep("PASS335_ENABLE_SUCCESS_REFRESHES_STATE", await waitFor(win, `
    (function() {
      const row = document.querySelector('.structured-plugin-row[data-plugin-id="${PLUGIN_ID}"]');
      const disable = row?.querySelector('[data-plugin-action="disable"]');
      return Boolean(row && disable && !disable.disabled && /\\u5df2\\u542f\\u7528|enabled/i.test(row.textContent || ''));
    })()
  `, 15000));

  assertStep("PASS335_LEAVE_FOR_CLAUDE_PANEL", await leaveSurface(win));
  assertStep("PASS335_OPEN_CLAUDE_PANEL", await runPaletteCommand(win, "tool-claude"));
  assertStep("PASS335_CLAUDE_PANEL_ROW_READY", await waitFor(win, `
    Boolean([...document.querySelectorAll('#claude-tool-detail .plugin-status-item')]
      .some((row) => row.textContent.includes(${JSON.stringify(PLUGIN_ID)})))
  `, 15000));
  assertStep("PASS335_CLAUDE_PANEL_DISABLE_ROUTES_TO_REVIEW", await win.webContents.executeJavaScript(`
    (function() {
      const row = [...document.querySelectorAll('#claude-tool-detail .plugin-status-item')]
        .find((candidate) => candidate.textContent.includes(${JSON.stringify(PLUGIN_ID)}));
      const button = [...(row?.querySelectorAll('.plugin-status-row-actions button') || [])]
        .find((candidate) => /\\u7981\\u7528|disable/i.test(candidate.textContent || ''));
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })()
  `));
  assertStep("PASS335_CLAUDE_PANEL_SCOPED_CONFIRM", await waitFor(win, `
    Boolean(document.querySelector('.plugin-cli-confirm') && /plugin disable --scope project/.test(document.querySelector('.plugin-cli-confirm')?.textContent || ''))
  `, 10000));
  assertStep("PASS335_CLAUDE_PANEL_DID_NOT_RUN_DIRECTLY", commandLogEntryCount(DISABLE_COMMAND) === 2);

  const beforeMissingProject = readCommandLog();
  for (const [name, args] of [["DISABLE", DISABLE_ARGS], ["ENABLE", ENABLE_ARGS]]) {
    assertStep(`PASS335_${name}_PROJECT_SCOPE_REQUIRES_REAL_CWD`, await win.webContents.executeJavaScript(`
      (async function() {
        try {
          await window.claudexDesktop.runClaudeCommand({
            projectPath: ${JSON.stringify(path.join(PROJECT_DIR, "missing"))},
            args: ${JSON.stringify(args)},
            requestId: ${JSON.stringify(`pass335_missing_${name.toLowerCase()}`)},
            persistCommandRun: true,
            commandRunKind: 'capability',
            capabilityContext: { tab: 'plugins', kind: 'plugin', id: ${JSON.stringify(PLUGIN_ID)}, action: ${JSON.stringify(name.toLowerCase())}, target: 'project' },
          });
          return false;
        } catch (error) {
          return /project|workspace|\\u9879\\u76ee|\\u5de5\\u4f5c\\u533a/i.test(error?.message || String(error));
        }
      })()
    `));
  }
  assertStep("PASS335_MISSING_PROJECT_DID_NOT_START_CLI", !readCommandLog().slice(beforeMissingProject.length).includes(PLUGIN_ID));
  assertStep("PASS335_VALID_PROJECT_CWD", readInvocationLog().filter((invocation) => (
    [DISABLE_COMMAND, ENABLE_COMMAND].includes(JSON.stringify(invocation.args))
  )).every((invocation) => path.resolve(invocation.cwd).toLowerCase() === path.resolve(PROJECT_DIR).toLowerCase()));
  assertStep("PASS335_NO_UNSCOPED_OR_WRONG_SCOPE_TOGGLE", readCommandLog().split(/\r?\n/).filter(Boolean).every((line) => {
    try {
      const args = JSON.parse(line);
      if (args[0] !== "plugin" || !["enable", "disable"].includes(args[1])) return true;
      return line === DISABLE_COMMAND || line === ENABLE_COMMAND;
    } catch (_error) {
      return false;
    }
  }));

  console.log("PASS335_PLUGIN_TOGGLE_LIFECYCLE_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS335_FAILED", error?.stack || error);
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
          };
        })()
      `);
      console.error("PASS335_DEBUG", JSON.stringify(debug, null, 2).slice(0, 30000));
    } catch (debugError) {
      console.error("PASS335_DEBUG_FAILED", debugError?.stack || debugError);
    }
  }
  console.error("PASS335_COMMAND_LOG", readCommandLog());
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS335_TIMEOUT");
  console.error("PASS335_COMMAND_LOG", readCommandLog());
  cleanup();
  app.exit(1);
}, 120000);
