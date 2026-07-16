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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass336-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass336-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass336-project-"));
const RETRY_PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass336-retry-project-"));
const MARKETPLACE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass336-market-"));
const COMMAND_LOG = path.join(USER_DATA_DIR, "claude-command-log.txt");
const INVOCATION_LOG = path.join(USER_DATA_DIR, "claude-invocation-log.txt");
const ATTEMPT_FILE = path.join(USER_DATA_DIR, "plugin-install-attempt.txt");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const PLUGIN_ID = "pass336-install-plugin@pass336-market";
const PANEL_PLUGIN_ID = "pass336-panel-plugin@pass336-market";
const PALETTE_PLUGIN_ID = "pass336-palette-plugin@pass336-market";
const PLUGIN_SCOPE = "project";
const INSTALL_ARGS = ["plugin", "install", "--scope", PLUGIN_SCOPE, PLUGIN_ID];
const INSTALL_COMMAND = JSON.stringify(INSTALL_ARGS);

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_DIR, RETRY_PROJECT_DIR, MARKETPLACE_DIR]) {
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

function pluginInstallInvocationCount() {
  return readInvocationLog().filter((invocation) => (
    Array.isArray(invocation?.args) &&
    invocation.args[0] === "plugin" &&
    invocation.args[1] === "install"
  )).length;
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

async function waitForInvocationIdle(stableMs = 1200, timeoutMs = 15000) {
  const startedAt = Date.now();
  let lastLog = readCommandLog();
  let stableSince = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await wait(150);
    const nextLog = readCommandLog();
    if (nextLog !== lastLog) {
      lastLog = nextLog;
      stableSince = Date.now();
      continue;
    }
    if (Date.now() - stableSince >= stableMs) {
      await wait(300);
      return readCommandLog() === lastLog;
    }
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
const marketplaceDir = ${JSON.stringify(MARKETPLACE_DIR)};
const pluginId = ${JSON.stringify(PLUGIN_ID)};
function attempts() {
  try { return Number(fs.readFileSync(attemptFile, 'utf8')) || 0; }
  catch (_error) { return 0; }
}
function installed() { return attempts() >= 2; }
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
fs.appendFileSync(commandLog, JSON.stringify(args) + '\\n', 'utf8');
fs.appendFileSync(invocationLog, JSON.stringify({ args, cwd: process.cwd() }) + '\\n', 'utf8');
if (args[0] === '--version') out('2.1.210 (Claude Code PASS336)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out({ plugins: [{
      id: pluginId,
      name: 'pass336-install-plugin',
      marketplace: 'pass336-market',
      version: '33.6.0',
      scope: 'user',
      enabled: true,
      status: 'enabled',
      source: { source: 'git', url: 'https://example.invalid/pass336.git', ref: 'v33.6.0' },
      installPath: 'C:/pass336/plugins/install-user',
      tools: ['pass336-read-tool'],
      permissions: { filesystem: 'read' }
    }, ...(installed() ? [{
      id: pluginId,
      name: 'pass336-install-plugin',
      marketplace: 'pass336-market',
      version: '33.6.0',
      scope: 'project',
      enabled: true,
      status: 'enabled',
      source: { source: 'git', url: 'https://example.invalid/pass336.git', ref: 'v33.6.0' },
      installPath: 'C:/pass336/plugins/install-project',
      tools: ['pass336-read-tool'],
      permissions: { filesystem: 'read' }
    }] : [])] });
else if (args[0] === 'plugin' && args[1] === 'list') out(
  'Installed plugins:\\n\\n  > ' + pluginId + '\\n    Version: 33.6.0\\n    Scope: user\\n    Status: enabled' +
  (installed() ? '\\n\\n  > ' + pluginId + '\\n    Version: 33.6.0\\n    Scope: project\\n    Status: enabled' : '')
);
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out({ servers: [] });
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([{ name: 'pass336-market', source: 'path', repo: marketplaceDir, installLocation: marketplaceDir, version: '2026.7.16', status: 'ready', permissions: ['Read', 'Bash'] }]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces:\\n\\n  > pass336-market\\n    Source: Path (' + marketplaceDir + ')');
else if (JSON.stringify(args) === ${JSON.stringify(INSTALL_COMMAND)}) {
  const nextAttempt = attempts() + 1;
  fs.writeFileSync(attemptFile, String(nextAttempt), 'utf8');
  if (nextAttempt === 1) {
    process.stderr.write('PASS336 scoped plugin install rejected by Claude CLI\\n');
    process.exitCode = 36;
  } else {
    out('Installed ' + pluginId + ' in project scope');
  }
}
else {
  process.stderr.write('PASS336 unexpected command: ' + JSON.stringify(args) + '\\n');
  process.exitCode = 99;
}
`;

fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), '@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n', "utf8");
const FAKE_CLAUDE_COMMAND = path.join(FAKE_BIN_DIR, "claude.cmd");

fs.mkdirSync(PROJECT_DIR, { recursive: true });
fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass336-project" }), "utf8");
fs.mkdirSync(RETRY_PROJECT_DIR, { recursive: true });
fs.writeFileSync(path.join(RETRY_PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass336-retry-project" }), "utf8");
fs.mkdirSync(path.join(MARKETPLACE_DIR, ".claude-plugin"), { recursive: true });
writeJson(path.join(MARKETPLACE_DIR, ".claude-plugin", "marketplace.json"), {
  name: "pass336-market",
  description: "PASS336 scoped plugin install marketplace",
  owner: { name: "PASS336 QA" },
  plugins: [
    {
      name: "pass336-install-plugin",
      version: "33.6.0",
      description: "Scoped install lifecycle fixture.",
      category: "agent-tools",
      author: { name: "PASS336 QA" },
      permissions: ["Read", "Bash"],
      risk: ["runs local plugin code", "filesystem read"],
    },
    {
      name: "pass336-panel-plugin",
      version: "33.6.0",
      description: "Claude panel scoped install fixture.",
      category: "workflow",
      permissions: ["Read"],
    },
    {
      name: "pass336-palette-plugin",
      version: "33.6.0",
      description: "Command Palette explicit user scope fixture.",
      category: "workflow",
      permissions: ["Read"],
    },
  ],
});
writeJson(DATA_FILE, {
  version: 1,
  activeProject: { name: "pass336-project", path: PROJECT_DIR },
  projects: [
    { name: "pass336-project", path: PROJECT_DIR },
    { name: "pass336-retry-project", path: RETRY_PROJECT_DIR },
  ],
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
    id: "pass336-session",
    title: "PASS336 scoped plugin install lifecycle",
    project: "pass336-project",
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
      setter?.call(input, 'pass336 install plugin');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 360));
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) =>
          (candidate.getAttribute('data-command-id') || '').startsWith('capability-recovery:retry:') &&
          /pass336-install-plugin/i.test(candidate.textContent || '')
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
  if (!win) throw new Error("PASS336_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS336_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS336_OPEN_CAPABILITIES", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.nav-stack button')]
        .find((candidate) => /\\u63d2\\u4ef6/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS336_OPEN_MARKETPLACE", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.plugin-manager-tabs button')]
        .find((candidate) => /\\u5e02\\u573a|marketplace/i.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })()
  `));
  assertStep("PASS336_USER_SCOPE_INSTALL_RECOGNIZED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const card = document.querySelector('.marketplace-plugin-card[data-marketplace-plugin-id="${PLUGIN_ID}"]');
      const install = card?.querySelector('[data-marketplace-plugin-action="install"]');
      const userScope = document.querySelector('.plugin-manager-modal [data-plugin-install-surface="marketplace"] [data-plugin-install-scope="user"]');
      const scopeFieldset = userScope?.closest('fieldset');
      const plugin = (state.capabilityStatus?.marketplacePlugins || []).find((item) => item.id === ${JSON.stringify(PLUGIN_ID)});
      return Boolean(
        card && install?.disabled && userScope?.classList.contains('active') && !scopeFieldset?.disabled &&
        plugin?.installed && plugin?.installedScopes?.includes('user') && !plugin?.installedScopes?.includes('project')
      );
    })()
  `, 15000));
  assertStep("PASS336_SELECT_PROJECT_SCOPE", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.plugin-manager-modal [data-plugin-install-surface="marketplace"] [data-plugin-install-scope="project"]');
      if (!button || button.disabled || button.closest('fieldset')?.disabled) return false;
      button.click();
      return true;
    })()
  `));
  assertStep("PASS336_PROJECT_SCOPE_ACTIVE", await waitFor(win, `
    (function() {
      const scope = document.querySelector('.plugin-manager-modal [data-plugin-install-surface="marketplace"] [data-plugin-install-scope="project"]');
      const install = document.querySelector('.marketplace-plugin-card[data-marketplace-plugin-id="${PLUGIN_ID}"] [data-marketplace-plugin-action="install"]');
      return Boolean(scope?.getAttribute('aria-pressed') === 'true' && install && !install.disabled);
    })()
  `, 5000));

  const beforeInstall = readCommandLog();
  assertStep("PASS336_CLICK_INSTALL", await win.webContents.executeJavaScript(`
    (function() {
      const card = document.querySelector('.marketplace-plugin-card[data-marketplace-plugin-id="${PLUGIN_ID}"]');
      const button = card?.querySelector('[data-marketplace-plugin-action="install"]');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS336_CONFIRM_EXACT_SCOPED_COMMAND", await waitFor(win, `
    (function() {
      const confirm = document.querySelector('.plugin-cli-confirm');
      const text = confirm?.textContent || '';
      return Boolean(
        confirm &&
        text.includes(${JSON.stringify(PLUGIN_ID)}) &&
        text.includes(${JSON.stringify(PROJECT_DIR)}) &&
        /plugin install --scope project/.test(text) &&
        /runs local plugin code/.test(text) &&
        /Read/.test(text) &&
        /Bash/.test(text)
      );
    })();
  `, 5000));
  assertStep("PASS336_NOT_RUN_BEFORE_CONFIRM", !readCommandLog().slice(beforeInstall.length).includes('"install"'));
  assertStep("PASS336_CONFIRM_FIRST_INSTALL", await confirmCliAction(win));
  assertStep("PASS336_FIRST_EXACT_ARGS", await waitForLogCount(INSTALL_COMMAND, 1, 10000));
  assertStep("PASS336_FAILURE_RETAINS_SCOPE_AND_EVIDENCE", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const row = document.querySelector('.marketplace-plugin-card[data-marketplace-plugin-id="${PLUGIN_ID}"]');
      const retry = row?.querySelector('[data-marketplace-plugin-action="retry"]');
      const run = (state.commandRuns || []).find((item) =>
        item.kind === 'capability' && item.code === 36 && JSON.stringify(item.args || []) === ${JSON.stringify(INSTALL_COMMAND)}
      );
      const event = (state.runEvents || []).find((item) => item.id === run?.requestId && item.status === 'error' && item.code === 36);
      const notice = (state.notices || []).find((item) =>
        item.runEventId === run?.requestId &&
        item.capabilityContext?.kind === 'marketplace-plugin' &&
        item.capabilityContext?.id === ${JSON.stringify(PLUGIN_ID)} &&
        item.capabilityContext?.action === 'install' &&
        item.capabilityContext?.target === ${JSON.stringify(PLUGIN_SCOPE)} &&
        /^capability-recovery:/.test(item.action || '')
      );
      return Boolean(
        row &&
        row.classList.contains('focused-capability-row') &&
        retry &&
        /PASS336 scoped plugin install rejected/.test(row.textContent || '') &&
        row.querySelector('.row-cli-action-evidence.error') &&
        run?.capabilityContext?.action === 'install' &&
        run?.capabilityContext?.target === ${JSON.stringify(PLUGIN_SCOPE)} &&
        event?.capabilityContext?.target === ${JSON.stringify(PLUGIN_SCOPE)} &&
        notice
      );
    })();
  `, 12000));

  assertStep("PASS336_LEAVE_CAPABILITY_SURFACE", await leaveSurface(win));
  assertStep("PASS336_CAPABILITY_SURFACE_CLOSED", await waitFor(win, "Boolean(!document.querySelector('.plugin-manager-modal'))", 5000));
  assertStep("PASS336_SWITCH_PROJECT_BEFORE_RETRY", await win.webContents.executeJavaScript(`
    (async function() {
      const next = await window.claudexDesktop.setActiveProject(${JSON.stringify({ name: "pass336-retry-project", path: RETRY_PROJECT_DIR })});
      return next?.activeProject?.path === ${JSON.stringify(RETRY_PROJECT_DIR)};
    })()
  `));
  assertStep("PASS336_RETRY_PROJECT_ACTIVE", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      return state.activeProject?.path === ${JSON.stringify(RETRY_PROJECT_DIR)};
    })()
  `, 5000));
  assertStep("PASS336_PALETTE_RETRY_CLICKED", await clickRecoveryRetryCommand(win));
  assertStep("PASS336_RETRY_CONFIRM_VISIBLE", await waitFor(win, `
    (function() {
      const confirm = document.querySelector('.plugin-cli-confirm');
      const text = confirm?.textContent || '';
      return Boolean(
        confirm &&
        !confirm.querySelector('.danger-action')?.disabled &&
        text.includes(${JSON.stringify(PLUGIN_ID)}) &&
        text.includes(${JSON.stringify(PROJECT_DIR)}) &&
        !text.includes(${JSON.stringify(RETRY_PROJECT_DIR)}) &&
        /plugin install --scope project/.test(text)
      );
    })();
  `, 10000));
  assertStep("PASS336_RETRY_NOT_RUN_BEFORE_CONFIRM", commandLogEntryCount(INSTALL_COMMAND) === 1);
  assertStep("PASS336_CONFIRM_RETRY", await confirmCliAction(win));
  assertStep("PASS336_RETRY_EXACT_ARGS", await waitForLogCount(INSTALL_COMMAND, 2, 10000));
  const installInvocations = readInvocationLog().filter((invocation) => JSON.stringify(invocation.args) === INSTALL_COMMAND);
  assertStep("PASS336_RETRY_PRESERVES_ORIGINAL_CWD", installInvocations.length === 2 && installInvocations.every((invocation) => (
    path.resolve(invocation.cwd).toLowerCase() === path.resolve(PROJECT_DIR).toLowerCase()
  )));
  assertStep("PASS336_RETURN_TO_ORIGINAL_PROJECT", await win.webContents.executeJavaScript(`
    (async function() {
      const next = await window.claudexDesktop.setActiveProject(${JSON.stringify({ name: "pass336-project", path: PROJECT_DIR })});
      return next?.activeProject?.path === ${JSON.stringify(PROJECT_DIR)};
    })()
  `));
  assertStep("PASS336_SUCCESS_REFRESHES_INSTALLED_STATE_AND_PRESERVES_HISTORY", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const row = document.querySelector('.marketplace-plugin-card[data-marketplace-plugin-id="${PLUGIN_ID}"]');
      const installed = (state.capabilityStatus?.pluginItems || []).find((item) => item.id === ${JSON.stringify(PLUGIN_ID)} && item.scope === ${JSON.stringify(PLUGIN_SCOPE)});
      const catalog = (state.capabilityStatus?.marketplacePlugins || []).find((item) => item.id === ${JSON.stringify(PLUGIN_ID)});
      const runs = (state.commandRuns || []).filter((item) =>
        item.kind === 'capability' && JSON.stringify(item.args || []) === ${JSON.stringify(INSTALL_COMMAND)}
      );
      const runIds = new Set(runs.map((item) => item.requestId));
      const events = (state.runEvents || []).filter((item) => runIds.has(item.id));
      return Boolean(
        row &&
        row.classList.contains('installed') &&
        row.classList.contains('focused-capability-row') &&
        installed?.scope === ${JSON.stringify(PLUGIN_SCOPE)} &&
        catalog?.installedScopes?.includes('user') &&
        catalog?.installedScopes?.includes(${JSON.stringify(PLUGIN_SCOPE)}) &&
        runs.some((item) => item.code === 36 && /PASS336 scoped plugin install rejected/.test(item.stderr || '')) &&
        runs.some((item) => item.code === 0 && /Installed/.test(item.stdout || '')) &&
        runs.every((item) => item.capabilityContext?.action === 'install' && item.capabilityContext?.target === ${JSON.stringify(PLUGIN_SCOPE)}) &&
        events.some((item) => item.status === 'error' && item.code === 36) &&
        events.some((item) => item.status === 'ok' && item.code === 0)
      );
    })();
  `, 15000));
  assertStep("PASS336_VALID_PROJECT_CWD", installInvocations.length === 2);

  assertStep("PASS336_LEAVE_FOR_CLAUDE_PANEL", await leaveSurface(win));
  assertStep("PASS336_OPEN_CLAUDE_TOOL", await runPaletteCommand(win, "tool-claude"));
  assertStep("PASS336_CLAUDE_PANEL_PLUGIN_READY", await waitFor(win, "Boolean(document.querySelector('#claude-tool-detail .plugin-installer input'))", 15000));
  assertStep("PASS336_CLAUDE_PANEL_DEFAULT_USER_SCOPE", await waitFor(win, `
    Boolean(document.querySelector('#claude-tool-detail [data-plugin-install-scope="user"]')?.classList.contains('active'))
  `, 5000));
  assertStep("PASS336_SET_CLAUDE_PANEL_PLUGIN", await setField(win, '#claude-tool-detail .plugin-installer input', PANEL_PLUGIN_ID));
  assertStep("PASS336_CLAUDE_PANEL_SELECT_LOCAL_SCOPE", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('#claude-tool-detail [data-plugin-install-scope="local"]');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })()
  `));
  assertStep("PASS336_CLAUDE_PANEL_INSTALL_REVIEW_CLICKED", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('#claude-tool-detail [data-plugin-install-action="review"]');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS336_CLAUDE_PANEL_ROUTES_TO_SCOPED_CONFIRM", await waitFor(win, `
    (function() {
      const confirm = document.querySelector('.plugin-cli-confirm');
      const text = confirm?.textContent || '';
      return Boolean(
        confirm &&
        text.includes(${JSON.stringify(PANEL_PLUGIN_ID)}) &&
        text.includes(${JSON.stringify(PROJECT_DIR)}) &&
        /plugin install --scope local/.test(text)
      );
    })();
  `, 10000));
  assertStep("PASS336_CLAUDE_PANEL_DID_NOT_RUN_DIRECTLY", !readCommandLog().includes(PANEL_PLUGIN_ID));
  assertStep("PASS336_DISMISS_CLAUDE_PANEL_REVIEW", await dismissCliAction(win));
  assertStep("PASS336_CLOSE_PANEL_REVIEW_SURFACE", await leaveSurface(win));
  assertStep("PASS336_INVALID_ID_SET", await setField(win, '#claude-tool-detail .plugin-installer input', '--bad plugin'));
  assertStep("PASS336_INVALID_ID_BLOCKED", await waitFor(win, `
    Boolean(document.querySelector('#claude-tool-detail [data-plugin-install-action="review"]')?.disabled)
  `, 5000));

  const paletteCommandId = `marketplace-install:${encodeURIComponent(PALETTE_PLUGIN_ID).slice(0, 120)}`;
  assertStep("PASS336_PALETTE_INSTALL_OPENED", await runPaletteCommand(win, paletteCommandId, "install pass336 palette"));
  assertStep("PASS336_PALETTE_INSTALL_EXPLICIT_USER_SCOPE", await waitFor(win, `
    (function() {
      const confirm = document.querySelector('.plugin-cli-confirm');
      const text = confirm?.textContent || '';
      return Boolean(
        confirm &&
        text.includes(${JSON.stringify(PALETTE_PLUGIN_ID)}) &&
        /plugin install --scope user/.test(text)
      );
    })()
  `, 10000));
  assertStep("PASS336_PALETTE_DID_NOT_RUN_BEFORE_CONFIRM", !readCommandLog().includes(PALETTE_PLUGIN_ID));
  assertStep("PASS336_DISMISS_PALETTE_REVIEW", await dismissCliAction(win));

  const beforeMissingProjectProbe = readCommandLog();
  assertStep("PASS336_PROJECT_SCOPE_REQUIRES_REAL_CWD", await win.webContents.executeJavaScript(`
    (async function() {
      try {
        await window.claudexDesktop.runClaudeCommand({
          projectPath: ${JSON.stringify(path.join(PROJECT_DIR, "missing"))},
          args: ${JSON.stringify(INSTALL_ARGS)},
          requestId: "pass336_missing_project",
          persistCommandRun: true,
          commandRunKind: "capability",
          capabilityContext: { tab: "marketplace", kind: "marketplace-plugin", id: ${JSON.stringify(PLUGIN_ID)}, action: "install", target: "project" },
        });
        return false;
      } catch (error) {
        return /project|workspace|\\u9879\\u76ee|\\u5de5\\u4f5c\\u533a/i.test(error?.message || String(error));
      }
    })();
  `));
  assertStep("PASS336_MISSING_PROJECT_DID_NOT_START_CLI", !readCommandLog().slice(beforeMissingProjectProbe.length).includes(PLUGIN_ID));

  const installInvocationsBeforeInvalidShapeProbe = pluginInstallInvocationCount();
  for (const [name, args] of [
    ["UNSCOPED", ["plugin", "install", PLUGIN_ID]],
    ["CONFIG_UNSUPPORTED", ["plugin", "install", "--scope", "user", "--config", "mode=fast", PLUGIN_ID]],
    ["STRING_INPUT", `plugin install --scope user ${PLUGIN_ID}`],
  ]) {
    assertStep(`PASS336_${name}_INSTALL_REJECTED_AT_IPC`, await win.webContents.executeJavaScript(`
      (async function() {
        try {
          await window.claudexDesktop.runClaudeCommand({
            projectPath: ${JSON.stringify(PROJECT_DIR)},
            args: ${JSON.stringify(args)},
            requestId: ${JSON.stringify(`pass336_${name.toLowerCase()}`)},
            persistCommandRun: true,
            commandRunKind: "capability",
            capabilityContext: { tab: "marketplace", kind: "marketplace-plugin", id: ${JSON.stringify(PLUGIN_ID)}, action: "install" },
          });
          return false;
        } catch (error) {
          return /scope|install|plugin|\\u5b89\\u88c5|\\u8303\\u56f4/i.test(error?.message || String(error));
        }
      })()
    `));
  }
  assertStep(
    "PASS336_INVALID_SHAPES_DID_NOT_START_CLI",
    pluginInstallInvocationCount() === installInvocationsBeforeInvalidShapeProbe,
  );
  assertStep("PASS336_NO_UNSCOPED_OR_WRONG_SCOPE_INSTALL", readCommandLog().split(/\r?\n/).filter(Boolean).every((line) => {
    try {
      const args = JSON.parse(line);
      return args[0] !== "plugin" || args[1] !== "install" || line === INSTALL_COMMAND;
    } catch (_error) {
      return false;
    }
  }));

  console.log("PASS336_PLUGIN_INSTALL_LIFECYCLE_DONE");
  assertStep("PASS336_CLI_INVOCATIONS_IDLE_BEFORE_EXIT", await waitForInvocationIdle());
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS336_FAILED", error?.stack || error);
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
      console.error("PASS336_DEBUG", JSON.stringify(debug, null, 2).slice(0, 30000));
    } catch (debugError) {
      console.error("PASS336_DEBUG_FAILED", debugError?.stack || debugError);
    }
  }
  console.error("PASS336_COMMAND_LOG", readCommandLog());
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS336_TIMEOUT");
  console.error("PASS336_COMMAND_LOG", readCommandLog());
  cleanup();
  app.exit(1);
}, 120000);
