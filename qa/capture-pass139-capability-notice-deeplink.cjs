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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass139-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass139-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass139-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const COMMAND_LOG = path.join(USER_DATA_DIR, "claude-command-log.txt");
const PLUGIN_ID = "pass139-failing-plugin@qa-market";

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

function writeFakeClaude() {
  const fakeClaudeScript = `
const fs = require('fs');
const args = process.argv.slice(2);
const commandLog = ${JSON.stringify(COMMAND_LOG)};
fs.appendFileSync(commandLog, args.join(' ') + '\\n', 'utf8');
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value) + '\\n'); }
if (args[0] === '--version') out('2.9.0 (pass139 fake)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([
  { id: '${PLUGIN_ID}', name: 'pass139-failing-plugin', marketplace: 'qa-market', version: '13.9.0', scope: 'user', enabled: true, source: 'pass139 local fixture', tools: ['pass139-tool'], permissions: ['Read'] }
]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins:\\n\\n  > ${PLUGIN_ID}\\n    Version: 13.9.0\\n    Scope: user\\n    Status: ✓ enabled');
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else if (args[0] === 'plugin' && args[1] === 'disable' && args[2] === '${PLUGIN_ID}') {
  process.stderr.write('pass139 disable failed\\n');
  process.exit(19);
}
else out('pass139 fake command: ' + args.join(' '));
`;
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
  return path.join(FAKE_BIN_DIR, "claude.cmd");
}

function writeInitialStore(claudeCommand) {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass139-project" }), "utf8");
  const project = { name: "pass139-project", path: PROJECT_DIR };
  writeJson(DATA_FILE, {
    version: 1,
    settings: {
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      baseUrl: "https://api.example.invalid",
      temperature: 0.2,
      timeoutMs: 600000,
      language: "zh",
      appearance: { fontSize: "compact", density: "compact" },
      claudeCode: { executionMode: "claude-code", claudeCommand, permissionMode: "default" },
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
    activeProject: project,
    projects: [project],
    sessions: [
      {
        id: "pass139-session",
        title: "Pass139 capability notice deeplink",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    runEvents: [],
    automations: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

async function openCapabilities(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.nav-stack button')]
        .find((candidate) => /插件/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function openNoticesPanel(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.workspace-context-button, .bottom-panel-tabs button')]
        .find((candidate) => /通知/.test(candidate.textContent || '') || /通知/.test(candidate.getAttribute('aria-label') || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function openPaletteAndQuery(win, query) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      return true;
    })();
  `);
}

async function clickNoticeCommand(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) =>
          (candidate.getAttribute('data-command-id') || '').startsWith('notice:') &&
          /pass139 disable failed/.test(candidate.textContent || '')
        );
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function backToApp(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.surface-back');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function assertCapabilityEvidenceFocused(win, stepName) {
  assertStep(stepName, await waitFor(win, `
    (function() {
      const active = document.querySelector('.bottom-panel-tabs button[data-bottom-tab="outputs"].active') ||
        document.querySelector('.workspace-context-button.active');
      const panel = document.querySelector('.selected-run-evidence-panel.error');
      const retry = panel?.querySelector('[data-run-recovery-action="retry-capability"]');
      const text = panel?.textContent || '';
      return Boolean(active &&
        /\\u8f93\\u51fa|Outputs/i.test(active.textContent || '') &&
        panel &&
        retry &&
        retry.getAttribute('data-run-recovery-action-focused') === 'true' &&
        document.activeElement === retry &&
        panel.querySelector('[data-run-event-type="capability-cli"]') &&
        /plugin disable ${PLUGIN_ID}/.test(text) &&
        /pass139 disable failed/.test(text));
    })()
  `, 12000));
}

async function clickFocusedCapabilityRetry(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.selected-run-evidence-panel [data-run-recovery-action="retry-capability"][data-run-recovery-action-focused="true"]');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `);
}

async function assertCapabilityRetryConfirmation(win, stepName) {
  assertStep(stepName, await waitFor(win, `
    (function() {
      const row = document.querySelector('.structured-plugin-row.focused-capability-row[data-plugin-id="${PLUGIN_ID}"]');
      const disable = row?.querySelector('[data-plugin-action="disable"]');
      const confirm = document.querySelector('.plugin-cli-confirm');
      return Boolean(
        document.querySelector('.plugin-manager-modal') &&
        /插件/.test(document.querySelector('.plugin-manager-tabs button.active')?.textContent || '') &&
        row &&
        disable &&
        disable.getAttribute('data-capability-action-focused') === 'true' &&
        /pass139-tool/.test(row.textContent || '') &&
        /13\\.9\\.0/.test(row.textContent || '') &&
        confirm &&
        /plugin disable ${PLUGIN_ID}/.test(confirm.textContent || '') &&
        !confirm.querySelector('.danger-action')?.disabled
      );
    })()
  `, 12000));
}

async function dismissCapabilityConfirmation(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.plugin-cli-confirm .plain-action');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS139_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS139_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS139_OPEN_CAPABILITIES", await openCapabilities(win));
  assertStep("PASS139_PLUGIN_ROW_READY", await waitFor(win, `
    Boolean(document.querySelector('.plugin-manager-modal') && /${PLUGIN_ID}/.test(document.querySelector('.plugin-manager-list')?.textContent || ''))
  `, 15000));
  assertStep("PASS139_DISABLE_READY", await waitFor(win, `
    (function() {
      const row = document.querySelector('.structured-plugin-row[data-plugin-id="${PLUGIN_ID}"]');
      const button = row?.querySelector('[data-plugin-action="disable"]');
      return Boolean(button && !button.disabled);
    })();
  `, 15000));
  assertStep("PASS139_CLICK_DISABLE", await win.webContents.executeJavaScript(`
    (function() {
      const row = document.querySelector('.structured-plugin-row[data-plugin-id="${PLUGIN_ID}"]');
      const button = row?.querySelector('[data-plugin-action="disable"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS139_CONFIRM_VISIBLE", await waitFor(win, "Boolean(document.querySelector('.plugin-cli-confirm'))", 5000));
  assertStep("PASS139_CONFIRM_DISABLE", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.plugin-cli-confirm .danger-action');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS139_DISABLE_COMMAND_RAN", await waitForLog(/plugin disable pass139-failing-plugin@qa-market/, 10000));
  assertStep("PASS139_FAILURE_NOTICE_ACTION_PERSISTED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const notice = (state.notices || []).find((item) => /pass139 disable failed/.test((item.title || '') + (item.detail || '')));
      const run = (state.commandRuns || []).find((item) => /plugin disable ${PLUGIN_ID}/.test(item.command || '') && item.code === 19);
      const event = notice?.runEventId ? (state.runEvents || []).find((item) => item.id === notice.runEventId) : null;
      window.__PASS139_NOTICE_ID__ = notice?.id || '';
      window.__PASS139_RUN_ID__ = notice?.runEventId || '';
      return Boolean(
        notice &&
        notice.source === 'plugin/mcp' &&
        notice.action === 'capability-recovery:' + encodeURIComponent(notice.runEventId) &&
        notice.runEventId &&
        event?.type === 'capability-cli' &&
        event?.status === 'error' &&
        /plugin disable ${PLUGIN_ID}/.test(event.commandLine || '') &&
        run && /pass139 disable failed/.test(run.stderr || '')
      );
    })();
  `, 12000));

  assertStep("PASS139_BACK_TO_APP_FOR_PALETTE", await backToApp(win));
  assertStep("PASS139_OPEN_PALETTE_QUERY_NOTICE", await openPaletteAndQuery(win, "pass139 disable failed"));
  assertStep("PASS139_NOTICE_COMMAND_VISIBLE", await waitFor(win, `
    Boolean([...document.querySelectorAll('.command-modal .command-list button')].some((button) =>
      (button.getAttribute('data-command-id') || '') === 'notice:' + (window.__PASS139_NOTICE_ID__ || '') &&
      button.getAttribute('data-command-target') === 'timeline' &&
      /pass139 disable failed/.test(button.textContent || '') &&
      (button.textContent || '').includes('plugin/mcp')
    ))
  `, 5000));
  assertStep("PASS139_CLICK_NOTICE_COMMAND", await clickNoticeCommand(win));
  await assertCapabilityEvidenceFocused(win, "PASS139_NOTICE_COMMAND_FOCUSES_CAPABILITY_EVIDENCE");
  assertStep("PASS139_CLICK_PALETTE_RETRY_CAPABILITY", await clickFocusedCapabilityRetry(win));
  await assertCapabilityRetryConfirmation(win, "PASS139_PALETTE_RETRY_OPENS_PLUGIN_CONFIRMATION");
  assertStep("PASS139_DISMISS_PALETTE_RETRY_CONFIRMATION", await dismissCapabilityConfirmation(win));

  assertStep("PASS139_BACK_TO_APP_FOR_NOTICE_PANEL", await backToApp(win));
  assertStep("PASS139_OPEN_NOTICES", await openNoticesPanel(win));
  assertStep("PASS139_NOTICE_CARD_ACTION_VISIBLE", await waitFor(win, `
    Boolean([...document.querySelectorAll('.notice-card')].some((card) =>
      /pass139 disable failed/.test(card.textContent || '') && card.querySelector('button[data-notice-action="open"]')
    ))
  `, 5000));
  assertStep("PASS139_CLICK_NOTICE_ACTION", await win.webContents.executeJavaScript(`
    (function() {
      const card = [...document.querySelectorAll('.notice-card')]
        .find((candidate) => /pass139 disable failed/.test(candidate.textContent || ''));
      const button = card?.querySelector('button[data-notice-action="open"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  await assertCapabilityEvidenceFocused(win, "PASS139_NOTICE_CENTER_FOCUSES_CAPABILITY_EVIDENCE");
  assertStep("PASS139_CLICK_NOTICE_CENTER_RETRY_CAPABILITY", await clickFocusedCapabilityRetry(win));
  await assertCapabilityRetryConfirmation(win, "PASS139_NOTICE_CENTER_RETRY_OPENS_PLUGIN_CONFIRMATION");

  console.log("PASS139_CAPABILITY_NOTICE_DEEPLINK_DONE");
  cleanup();
  app.exit(0);
}

const fakeClaudeCommand = writeFakeClaude();
app.setPath("userData", USER_DATA_DIR);
writeInitialStore(fakeClaudeCommand);
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS139_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS139_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
