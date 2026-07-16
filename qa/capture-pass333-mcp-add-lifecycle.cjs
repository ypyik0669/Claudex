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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass333-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass333-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass333-project-"));
const COMMAND_LOG = path.join(USER_DATA_DIR, "claude-command-log.txt");
const INVOCATION_LOG = path.join(USER_DATA_DIR, "claude-invocation-log.txt");
const ATTEMPT_FILE = path.join(USER_DATA_DIR, "mcp-add-attempt.txt");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const SERVER_NAME = "pass333-server";
const SERVER_SCOPE = "project";
const SERVER_TRANSPORT = "stdio";
const ADD_ARGS = [
  "mcp",
  "add",
  "--scope",
  SERVER_SCOPE,
  "--transport",
  SERVER_TRANSPORT,
  SERVER_NAME,
  "--",
  "node",
  "pass333-server.cjs",
  "--label",
  "value with spaces",
];
const ADD_COMMAND = JSON.stringify(ADD_ARGS);
const HTTP_ARGS = ["mcp", "add", "--scope", SERVER_SCOPE, "--transport", "http", "pass333-http", "https://mcp.example.test/api"];
const HTTP_COMMAND = JSON.stringify(HTTP_ARGS);
const LONG_STDIO_ARGS = Array.from({ length: 64 }, (_item, index) => `arg-${String(index).padStart(2, "0")}`);
const LONG_ADD_ARGS = [
  "mcp",
  "add",
  "--scope",
  SERVER_SCOPE,
  "--transport",
  SERVER_TRANSPORT,
  "pass333-long-argv",
  "--",
  "node",
  ...LONG_STDIO_ARGS,
];
const LONG_ADD_COMMAND = JSON.stringify(LONG_ADD_ARGS);
const DELIMITER_SCOPE_BYPASS_ARGS = [
  "mcp",
  "add",
  "pass333-delimiter-scope",
  "--",
  "node",
  "pass333-server.cjs",
  "--scope",
  "user",
];

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
const serverName = ${JSON.stringify(SERVER_NAME)};
function attempts() {
  try { return Number(fs.readFileSync(attemptFile, 'utf8')) || 0; }
  catch (_error) { return 0; }
}
function installed() { return attempts() >= 2; }
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
fs.appendFileSync(commandLog, JSON.stringify(args) + '\\n', 'utf8');
fs.appendFileSync(invocationLog, JSON.stringify({ args, cwd: process.cwd() }) + '\\n', 'utf8');
if (args[0] === '--version') out('2.1.210 (Claude Code PASS333)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out({ plugins: [] });
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out({
  servers: installed() ? [{
    name: serverName,
    status: 'connected',
    transport: 'stdio',
    command: 'node pass333-server.cjs --label "value with spaces"',
    tools: [{ name: 'pass333-read', description: 'PASS333 read tool' }]
  }] : []
});
else if (args[0] === 'mcp' && args[1] === 'list') out(installed()
  ? serverName + ': connected | 1 tools | stdio | node pass333-server.cjs'
  : 'No MCP servers configured.');
else if (args[0] === 'mcp' && args[1] === 'get' && args[2] === serverName && installed()) out(
  serverName + ':\\n  Scope: Project config (shared via .mcp.json)\\n  Status: connected\\n  Type: stdio\\n  Command: node pass333-server.cjs\\n\\nTo remove this server, run: claude mcp remove ' + serverName + ' -s project'
);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else if (JSON.stringify(args) === ${JSON.stringify(ADD_COMMAND)}) {
  const nextAttempt = attempts() + 1;
  fs.writeFileSync(attemptFile, String(nextAttempt), 'utf8');
  if (nextAttempt === 1) {
    process.stderr.write('PASS333 scoped MCP add rejected by Claude CLI\\n');
    process.exitCode = 41;
  } else {
    out('Added stdio MCP server ' + serverName + ' to project scope');
  }
}
else if (JSON.stringify(args) === ${JSON.stringify(LONG_ADD_COMMAND)}) {
  process.stderr.write('PASS333 long argv rejected for recovery proof\\n');
  process.exitCode = 43;
}
else {
  process.stderr.write('PASS333 unexpected command: ' + JSON.stringify(args) + '\\n');
  process.exitCode = 99;
}
`;

fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), '@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n', "utf8");
const FAKE_CLAUDE_COMMAND = path.join(FAKE_BIN_DIR, "claude.cmd");

fs.mkdirSync(PROJECT_DIR, { recursive: true });
fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass333-project" }), "utf8");
writeJson(DATA_FILE, {
  version: 1,
  activeProject: { name: "pass333-project", path: PROJECT_DIR },
  projects: [{ name: "pass333-project", path: PROJECT_DIR }],
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
    id: "pass333-session",
    title: "PASS333 scoped MCP add lifecycle",
    project: "pass333-project",
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
      const prototype = field instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : field instanceof HTMLSelectElement
          ? window.HTMLSelectElement.prototype
          : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      setter?.call(field, ${JSON.stringify(value)});
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
      return field.value === ${JSON.stringify(value)};
    })();
  `);
}

async function clickPaletteCommand(win, query, commandIdPrefix) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 240));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 360));
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '').startsWith(${JSON.stringify(commandIdPrefix)}));
      if (!button) return false;
      button.click();
      return true;
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

async function runTest() {
  await wait(1700);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS333_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS333_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS333_OPEN_CAPABILITIES", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.nav-stack button')]
        .find((candidate) => /\\u63d2\\u4ef6/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS333_OPEN_MCP_TAB", await waitFor(win, "Boolean(document.querySelector('.plugin-manager-tabs'))", 10000) && await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.plugin-manager-tabs button')]
        .find((candidate) => /MCP/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS333_EMPTY_ADD_ENTRY_READY", await waitFor(win, `
    Boolean(
      document.querySelector('[data-mcp-registry-action="add"]') &&
      document.querySelector('[data-mcp-empty-action="add"]') &&
      !document.querySelector('[data-mcp-server-id]')
    )
  `, 15000));

  const beforePalette = readCommandLog();
  assertStep("PASS333_PALETTE_ADD_CLICKED", await clickPaletteCommand(win, "mcp add", "capability-mcp-add"));
  assertStep("PASS333_PALETTE_OPENS_FOCUSED_FORM", await waitFor(win, `
    Boolean(
      document.querySelector('[data-mcp-add-form]') &&
      document.querySelector('[data-mcp-registry-action="add"][data-capability-action-focused="true"]')
    )
  `, 10000));
  assertStep("PASS333_PALETTE_DID_NOT_RUN", !readCommandLog().slice(beforePalette.length).includes('["mcp","add"'));

  assertStep("PASS333_SET_INVALID_NAME", await setField(win, '[data-mcp-add-field="name"]', 'bad name'));
  assertStep("PASS333_SET_PROJECT_SCOPE", await setField(win, '[data-mcp-add-field="scope"]', SERVER_SCOPE));
  assertStep("PASS333_SELECT_HTTP", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('[data-mcp-add-transport="http"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS333_SET_INVALID_URL", await setField(win, '[data-mcp-add-field="target"]', 'ftp://invalid.example/mcp'));
  assertStep("PASS333_INVALID_SUBMIT_CLICKED", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('[data-mcp-add-action="submit"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS333_INVALID_INPUT_BLOCKED", await waitFor(win, `
    Boolean(document.querySelector('.plugin-cli-error')) &&
    !document.querySelector('.plugin-cli-confirm')
  `, 5000));
  assertStep("PASS333_INVALID_INPUT_DID_NOT_RUN", commandLogEntryCount(ADD_COMMAND) === 0);

  assertStep("PASS333_SET_VALID_HTTP_NAME", await setField(win, '[data-mcp-add-field="name"]', 'pass333-http'));
  assertStep("PASS333_SET_VALID_HTTP_URL", await setField(win, '[data-mcp-add-field="target"]', 'https://mcp.example.test/api'));
  assertStep("PASS333_HTTP_REVIEW_CLICKED", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('[data-mcp-add-action="submit"]');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS333_HTTP_EXACT_REVIEW_VISIBLE", await waitFor(win, `
    (function() {
      const confirm = document.querySelector('.plugin-cli-confirm');
      const text = confirm?.textContent || '';
      return Boolean(confirm && text.includes(${JSON.stringify(HTTP_ARGS.map((item) => item.includes(" ") ? JSON.stringify(item) : item).join(" "))}));
    })();
  `, 5000));
  assertStep("PASS333_DISMISS_HTTP_REVIEW", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.plugin-cli-confirm .dirty-confirm-actions .plain-action');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS333_HTTP_REVIEW_DID_NOT_RUN", commandLogEntryCount(HTTP_COMMAND) === 0);

  assertStep("PASS333_SET_VALID_NAME", await setField(win, '[data-mcp-add-field="name"]', SERVER_NAME));
  assertStep("PASS333_SELECT_STDIO", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('[data-mcp-add-transport="stdio"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS333_SET_COMMAND", await setField(win, '[data-mcp-add-field="target"]', 'node'));
  assertStep("PASS333_SET_ARGUMENTS", await setField(win, '[data-mcp-add-field="arguments"]', 'pass333-server.cjs\n--label\nvalue with spaces'));

  const beforeAdd = readCommandLog();
  assertStep("PASS333_VALID_SUBMIT_CLICKED", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('[data-mcp-add-action="submit"]');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS333_CONFIRM_REVIEW_VISIBLE", await waitFor(win, `
    (function() {
      const confirm = document.querySelector('.plugin-cli-confirm');
      const text = confirm?.textContent || '';
      return Boolean(
        confirm &&
        text.includes(${JSON.stringify(SERVER_NAME)}) &&
        text.includes(${JSON.stringify(PROJECT_DIR)}) &&
        /mcp add --scope project --transport stdio/.test(text) &&
        /value with spaces/.test(text) &&
        /\\u8303\\u56f4/.test(text) &&
        /\\u4f20\\u8f93/.test(text)
      );
    })();
  `, 5000));
  assertStep("PASS333_NOT_RUN_BEFORE_CONFIRM", !readCommandLog().slice(beforeAdd.length).includes('["mcp","add"'));
  assertStep("PASS333_CONFIRM_FIRST_ADD", await confirmCliAction(win));
  assertStep("PASS333_FIRST_EXACT_ARGS", await waitForLogCount(ADD_COMMAND, 1, 10000));
  assertStep("PASS333_FAILURE_RETAINS_FORM_AND_EVIDENCE", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const run = (state.commandRuns || []).find((item) =>
        item.kind === 'capability' && item.code === 41 && JSON.stringify(item.args || []) === ${JSON.stringify(ADD_COMMAND)}
      );
      const event = (state.runEvents || []).find((item) => item.id === run?.requestId && item.status === 'error' && item.code === 41);
      const notice = (state.notices || []).find((item) =>
        item.runEventId === run?.requestId &&
        item.capabilityContext?.kind === 'mcp' &&
        item.capabilityContext?.id === ${JSON.stringify(SERVER_NAME)} &&
        item.capabilityContext?.action === 'add' &&
        item.capabilityContext?.target === ${JSON.stringify(SERVER_SCOPE)} &&
        /^capability-recovery:/.test(item.action || '')
      );
      const form = document.querySelector('[data-mcp-add-form]');
      return Boolean(
        form &&
        form.querySelector('[data-mcp-add-field="name"]')?.value === ${JSON.stringify(SERVER_NAME)} &&
        form.querySelector('[data-mcp-add-field="scope"]')?.value === ${JSON.stringify(SERVER_SCOPE)} &&
        form.querySelector('[data-mcp-add-field="target"]')?.value === 'node' &&
        /value with spaces/.test(form.querySelector('[data-mcp-add-field="arguments"]')?.value || '') &&
        document.querySelector('.plugin-cli-action-evidence.error') &&
        run?.capabilityContext?.action === 'add' &&
        run?.capabilityContext?.target === ${JSON.stringify(SERVER_SCOPE)} &&
        event?.capabilityContext?.action === 'add' &&
        notice
      );
    })();
  `, 12000));

  assertStep("PASS333_LEAVE_CAPABILITY_SURFACE", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.surface-back');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS333_CAPABILITY_SURFACE_CLOSED", await waitFor(win, "Boolean(!document.querySelector('.plugin-manager-modal'))", 5000));
  assertStep("PASS333_PALETTE_RETRY_CLICKED", await clickPaletteCommand(win, "mcp add pass333", "capability-recovery:retry:"));
  assertStep("PASS333_RETRY_CONFIRM_AND_FORM_RESTORED", await waitFor(win, `
    (function() {
      const confirm = document.querySelector('.plugin-cli-confirm');
      const form = document.querySelector('[data-mcp-add-form]');
      const action = confirm?.querySelector('.danger-action');
      return Boolean(
        confirm &&
        action && !action.disabled &&
        form &&
        form.querySelector('[data-mcp-add-field="name"]')?.value === ${JSON.stringify(SERVER_NAME)} &&
        form.querySelector('[data-mcp-add-field="scope"]')?.value === ${JSON.stringify(SERVER_SCOPE)} &&
        form.querySelector('[data-mcp-add-field="target"]')?.value === 'node' &&
        /mcp add --scope project --transport stdio/.test(confirm.textContent || '')
      );
    })();
  `, 10000));
  assertStep("PASS333_RETRY_NOT_RUN_BEFORE_CONFIRM", commandLogEntryCount(ADD_COMMAND) === 1);
  assertStep("PASS333_CONFIRM_RETRY", await confirmCliAction(win));
  assertStep("PASS333_RETRY_EXACT_ARGS", await waitForLogCount(ADD_COMMAND, 2, 10000));
  assertStep("PASS333_SUCCESS_VERIFIED_AND_FOCUSED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const row = document.querySelector('.structured-plugin-row[data-mcp-server-id="${SERVER_NAME}"]');
      const runs = (state.commandRuns || []).filter((item) =>
        item.kind === 'capability' && JSON.stringify(item.args || []) === ${JSON.stringify(ADD_COMMAND)}
      );
      const runIds = new Set(runs.map((item) => item.requestId));
      const events = (state.runEvents || []).filter((item) => runIds.has(item.id));
      const notice = (state.notices || []).find((item) => runIds.has(item.runEventId) && item.capabilityContext?.action === 'add');
      return Boolean(
        row &&
        row.getAttribute('data-capability-focused') === 'true' &&
        /project/.test(row.textContent || '') &&
        /stdio/.test(row.textContent || '') &&
        !document.querySelector('[data-mcp-add-form]') &&
        runs.some((item) => item.code === 41 && /PASS333 scoped MCP add rejected/.test(item.stderr || '')) &&
        runs.some((item) => item.code === 0 && /Added stdio MCP server/.test(item.stdout || '')) &&
        runs.every((item) => item.capabilityContext?.kind === 'mcp' && item.capabilityContext?.action === 'add' && item.capabilityContext?.target === ${JSON.stringify(SERVER_SCOPE)}) &&
        events.some((item) => item.status === 'error' && item.code === 41) &&
        events.some((item) => item.status === 'ok' && item.code === 0) &&
        notice
      );
    })();
  `, 15000));
  assertStep("PASS333_ONLY_EXACT_ADD_COMMANDS", readCommandLog().split(/\r?\n/).filter((line) => /\["mcp","add"/.test(line)).every((line) => line === ADD_COMMAND));
  assertStep("PASS333_VALID_ADD_USED_PROJECT_CWD", readInvocationLog().some((invocation) => (
    JSON.stringify(invocation.args) === ADD_COMMAND &&
    path.resolve(invocation.cwd).toLowerCase() === path.resolve(PROJECT_DIR).toLowerCase()
  )));

  assertStep("PASS333_LONG_ARGV_FAILURE_RAN", await win.webContents.executeJavaScript(`
    (async function() {
      const result = await window.claudexDesktop.runClaudeCommand({
        projectPath: ${JSON.stringify(PROJECT_DIR)},
        args: ${JSON.stringify(LONG_ADD_ARGS)},
        requestId: "pass333_long_argv",
        persistCommandRun: true,
        commandRunKind: "capability",
        capabilityContext: { tab: "mcp", kind: "mcp", id: "pass333-long-argv", action: "add", target: "project" },
      });
      return result?.code === 43;
    })();
  `));
  assertStep("PASS333_LONG_ARGV_PERSISTED_EXACTLY", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const run = (state.commandRuns || []).find((item) => item.requestId === "pass333_long_argv");
      return JSON.stringify(run?.args || []) === ${JSON.stringify(LONG_ADD_COMMAND)};
    })();
  `, 10000));
  assertStep("PASS333_LEAVE_FOR_LONG_ARGV_RETRY", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.surface-back');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS333_LONG_ARGV_RETRY_CLICKED", await clickPaletteCommand(win, "mcp add pass333 long argv", "capability-recovery:retry:pass333_long_argv"));
  assertStep("PASS333_LONG_ARGV_RETRY_REMAINS_CANONICAL", await waitFor(win, `
    (function() {
      const confirm = document.querySelector('.plugin-cli-confirm');
      const text = confirm?.textContent || '';
      return Boolean(
        confirm &&
        text.includes("pass333-long-argv") &&
        text.includes(${JSON.stringify(LONG_STDIO_ARGS[LONG_STDIO_ARGS.length - 1])})
      );
    })();
  `, 10000));
  assertStep("PASS333_LONG_ARGV_RETRY_NOT_RUN_BEFORE_CONFIRM", commandLogEntryCount(LONG_ADD_COMMAND) === 1);
  assertStep("PASS333_DISMISS_LONG_ARGV_RETRY", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.plugin-cli-confirm .dirty-confirm-actions .plain-action');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));

  const beforeDelimiterScopeProbe = readCommandLog();
  assertStep("PASS333_DELIMITER_SCOPE_CANNOT_BYPASS_LOCAL_CWD_GUARD", await win.webContents.executeJavaScript(`
    (async function() {
      try {
        await window.claudexDesktop.runClaudeCommand({
          projectPath: ${JSON.stringify(path.join(PROJECT_DIR, "missing-delimiter-scope"))},
          args: ${JSON.stringify(DELIMITER_SCOPE_BYPASS_ARGS)},
          requestId: "pass333_delimiter_scope_bypass",
          persistCommandRun: true,
          commandRunKind: "capability",
          capabilityContext: { tab: "mcp", kind: "mcp", id: "pass333-delimiter-scope", action: "add", target: "local" },
        });
        return false;
      } catch (error) {
        return /local|workspace|\\u9879\\u76ee|\\u5de5\\u4f5c\\u533a/i.test(error?.message || String(error));
      }
    })();
  `));
  assertStep("PASS333_DELIMITER_SCOPE_BYPASS_DID_NOT_START_CLI", !readCommandLog().slice(beforeDelimiterScopeProbe.length).includes("pass333-delimiter-scope"));

  const beforeMissingProjectProbe = readCommandLog();
  assertStep("PASS333_PROJECT_SCOPE_REQUIRES_REAL_CWD", await win.webContents.executeJavaScript(`
    (async function() {
      try {
        await window.claudexDesktop.runClaudeCommand({
          projectPath: ${JSON.stringify(path.join(PROJECT_DIR, "missing"))},
          args: ["mcp", "add", "--scope", "project", "--transport", "stdio", "pass333-blocked", "--", "node", "blocked.cjs"],
          requestId: "pass333_missing_project",
          persistCommandRun: true,
          commandRunKind: "capability",
          capabilityContext: { tab: "mcp", kind: "mcp", id: "pass333-blocked", action: "add", target: "project" },
        });
        return false;
      } catch (error) {
        return /project|workspace|\\u9879\\u76ee|\\u5de5\\u4f5c\\u533a/i.test(error?.message || String(error));
      }
    })();
  `));
  assertStep("PASS333_MISSING_PROJECT_DID_NOT_START_CLI", !readCommandLog().slice(beforeMissingProjectProbe.length).includes("pass333-blocked"));

  console.log("PASS333_MCP_ADD_LIFECYCLE_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS333_FAILED", error?.stack || error);
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    try {
      const debug = await win.webContents.executeJavaScript(`
        (async function() {
          const state = await window.claudexDesktop?.getState?.();
          return {
            body: document.body?.innerText?.slice(0, 14000),
            commandRuns: state?.commandRuns,
            runEvents: state?.runEvents,
            notices: state?.notices,
            addForm: document.querySelector('[data-mcp-add-form]')?.textContent,
            mcpRows: [...document.querySelectorAll('[data-mcp-server-id]')].map((row) => ({
              id: row.getAttribute('data-mcp-server-id'),
              text: row.textContent,
              focused: row.getAttribute('data-capability-focused'),
            })),
          };
        })();
      `);
      console.error("PASS333_DEBUG", JSON.stringify(debug, null, 2).slice(0, 28000));
    } catch (debugError) {
      console.error("PASS333_DEBUG_FAILED", debugError?.stack || debugError);
    }
  }
  console.error("PASS333_COMMAND_LOG", readCommandLog());
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS333_TIMEOUT");
  console.error("PASS333_COMMAND_LOG", readCommandLog());
  cleanup();
  app.exit(1);
}, 120000);
