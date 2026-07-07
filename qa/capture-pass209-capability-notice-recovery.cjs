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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass209-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass209-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass209-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const COMMAND_LOG = path.join(USER_DATA_DIR, "claude-command-log.txt");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const PLUGIN_ID = "pass209-notice-plugin@qa-market";

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

async function waitForLogGrowth(pattern, previous, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const next = readCommandLog().slice(String(previous || "").length);
    if (pattern.test(next)) return true;
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
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
if (args[0] === '--version') out('2.12.1 (Claude Code PASS209)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([{ id: '${PLUGIN_ID}', name: 'pass209-notice-plugin', marketplace: 'qa-market', version: '12.9.0', scope: 'user', enabled: true, source: 'pass209 fixture', permissions: ['Read'] }]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins:\\n\\n  > ${PLUGIN_ID}\\n    Version: 12.9.0\\n    Scope: user\\n    Status: ✓ enabled');
else if (args[0] === 'mcp' && args[1] === 'list') out('pass209 mcp ok');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else if (args[0] === 'plugin' && args[1] === 'disable' && args[2] === '${PLUGIN_ID}') { process.stderr.write('pass209 disable failed for notice recovery\\n'); process.exit(33); }
else out('pass209 fake claude command: ' + args.join(' '));
`;
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(FAKE_CLAUDE, `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function writeInitialStore() {
  writeFakeClaude();
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass209-project" }), "utf8");
  const project = { name: "pass209-project", path: PROJECT_DIR };
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
      claudeCode: { executionMode: "claude-code", claudeCommand: FAKE_CLAUDE, permissionMode: "default" },
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
        id: "pass209-session",
        title: "PASS209 capability notice recovery",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-08T02:09:00.000Z",
        updatedAt: "2026-07-08T02:09:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    runEvents: [],
    notices: [],
    automations: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
  });
}

async function openCapabilities(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.nav-stack button')].find((candidate) => /\\u63d2\\u4ef6/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runDisableFailure(win) {
  const beforeDisable = readCommandLog();
  assertStep("PASS209_CLICK_DISABLE", await win.webContents.executeJavaScript(`
    (function() {
      const row = [...document.querySelectorAll('.structured-plugin-row')]
        .find((item) => /pass209-notice-plugin@qa-market/.test(item.textContent || ''));
      const button = row?.querySelector('.structured-row-actions button');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS209_DISABLE_CONFIRM_VISIBLE", await waitFor(win, `
    Boolean(document.querySelector('.plugin-cli-confirm') &&
      !document.querySelector('.plugin-cli-confirm .danger-action')?.disabled &&
      /plugin disable ${PLUGIN_ID}/.test(document.querySelector('.plugin-cli-confirm')?.textContent || ''))
  `, 10000));
  assertStep("PASS209_CONFIRM_DISABLE", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.plugin-cli-confirm .danger-action');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS209_DISABLE_RAN", await waitForLogGrowth(/plugin disable pass209-notice-plugin@qa-market/, beforeDisable, 12000));
}

async function openPaletteAndQuery(win, query) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));
      return true;
    })();
  `);
}

async function clickNoticeCommand(win, noticeId) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === 'notice:' + ${JSON.stringify(noticeId)});
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS209_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS209_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS209_OPEN_CAPABILITIES", await openCapabilities(win));
  assertStep("PASS209_PLUGIN_ROW_READY", await waitFor(win, `
    Boolean(document.querySelector('.plugin-manager-modal') &&
      /pass209-notice-plugin@qa-market/.test(document.querySelector('.plugin-manager-list')?.textContent || ''))
  `, 15000));

  await runDisableFailure(win);

  assertStep("PASS209_FAILURE_NOTICE_STATE", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const notice = (state.notices || []).find((item) => /pass209 disable failed for notice recovery/.test(item.detail || ''));
      const event = notice?.runEventId ? (state.runEvents || []).find((item) => item.id === notice.runEventId) : null;
      const run = notice?.runEventId ? (state.commandRuns || []).find((item) => item.requestId === notice.runEventId || item.id === notice.runEventId) : null;
      window.__PASS209_NOTICE_ID__ = notice?.id || '';
      window.__PASS209_RUN_ID__ = notice?.runEventId || '';
      return Boolean(notice &&
        notice.action === 'capability-recovery:' + encodeURIComponent(notice.runEventId) &&
        notice.runEventId &&
        event?.type === 'capability-cli' &&
        event?.status === 'error' &&
        /plugin disable ${PLUGIN_ID}/.test(event.commandLine || '') &&
        run?.kind === 'capability' &&
        run?.code === 33);
    })();
  `, 12000));

  assertStep("PASS209_OPEN_PALETTE_NOTICE", await openPaletteAndQuery(win, "pass209 disable failed notice recovery"));
  assertStep("PASS209_NOTICE_COMMAND_TARGET_TIMELINE", await waitFor(win, `
    (function() {
      const noticeId = window.__PASS209_NOTICE_ID__ || '';
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === 'notice:' + noticeId);
      const text = button?.textContent || '';
      return Boolean(button &&
        button.getAttribute('data-command-target') === 'timeline' &&
        /pass209 disable failed for notice recovery/.test(text) &&
        /\\u67e5\\u770b\\u8bc1\\u636e/.test(text) &&
        !/\\u6253\\u5f00\\u5bf9\\u5e94\\u5de5\\u4f5c\\u53f0/.test(text));
    })();
  `, 10000));

  const noticeId = await win.webContents.executeJavaScript("window.__PASS209_NOTICE_ID__ || ''");
  assertStep("PASS209_CLICK_NOTICE_COMMAND", await clickNoticeCommand(win, noticeId));
  assertStep("PASS209_NOTICE_OPENS_CAPABILITY_EVIDENCE", await waitFor(win, `
    (function() {
      const runId = window.__PASS209_RUN_ID__ || '';
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
        /pass209 disable failed for notice recovery/.test(text) &&
        (!runId || /plugin disable/.test(text)));
    })();
  `, 12000));

  console.log("PASS209_CAPABILITY_NOTICE_RECOVERY_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS209_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (function() {
          return {
            noticeId: window.__PASS209_NOTICE_ID__ || '',
            runId: window.__PASS209_RUN_ID__ || '',
            commands: [...document.querySelectorAll('.command-modal .command-list button')].map((button) => ({
              id: button.getAttribute('data-command-id'),
              target: button.getAttribute('data-command-target'),
              text: button.textContent,
            })),
            selectedRun: document.querySelector('.selected-run-evidence-panel')?.textContent || '',
            notices: [...document.querySelectorAll('.notice-card')].map((card) => card.textContent),
            body: document.body?.textContent?.slice(0, 6000) || '',
            state: await window.claudexDesktop.getState().catch((stateError) => ({ error: String(stateError?.message || stateError) })),
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS209_DEBUG", JSON.stringify(debug, null, 2).slice(0, 12000));
      console.error("PASS209_COMMAND_LOG", readCommandLog());
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS209_TIMEOUT");
  console.error("PASS209_COMMAND_LOG", readCommandLog());
  cleanup();
  app.exit(1);
}, 90000);
