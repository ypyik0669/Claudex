const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass46-notices-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass46-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");

function cleanup() {
  for (const dir of [USER_DATA_DIR, PROJECT_DIR]) {
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

function assertStep(name, ok) {
  console.log(name, ok);
  if (!ok) throw new Error(`${name} failed`);
}

function writeInitialStore() {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass46-project" }), "utf8");
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
      claudeCode: { executionMode: "claude-code", claudeCommand: "claude", permissionMode: "default" },
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
    activeProject: { name: "pass46-project", path: PROJECT_DIR },
    projects: [{ name: "pass46-project", path: PROJECT_DIR }],
    sessions: [
      {
        id: "default",
        title: "新聊天",
        project: "pass46-project",
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-05T00:00:00.000Z",
        updatedAt: "2026-07-05T00:00:00.000Z",
        messages: [],
      },
    ],
    automations: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

async function openNoticesPanel(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = Array.from(document.querySelectorAll('.workspace-context-tabs .workspace-context-button'))[2];
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runWorkspaceFailure(win) {
  assertStep("PASS46_OPEN_WORKSPACE_TOOL", await win.webContents.executeJavaScript(`
    (function() {
      const rail = document.querySelector('.rail-button[data-tool="workspace"]') || document.querySelector('.rail-toggle');
      if (!rail) return false;
      rail.click();
      return true;
    })();
  `));
  assertStep("PASS46_WORKSPACE_READY", await waitFor(win, "Boolean(document.querySelector('.tools-panel .workspace-detail .command-runner input:not([disabled])'))", 10000));
  assertStep("PASS46_SET_FAILING_COMMAND", await win.webContents.executeJavaScript(`
    (function() {
      const input = document.querySelector('.command-runner input');
      if (!input) return false;
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, 'definitely_missing_pass46_command');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })();
  `));
  assertStep("PASS46_RUN_FAILING_COMMAND", await waitFor(win, `
    (function() {
      const button = document.querySelector('.command-runner button:not([disabled])');
      if (!button) return false;
      button.click();
      return true;
    })();
  `, 5000));
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS46_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS46_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS46_NOTICE_IPC", await win.webContents.executeJavaScript("typeof window.claudexDesktop.recordNotice === 'function' && typeof window.claudexDesktop.dismissNotice === 'function' && typeof window.claudexDesktop.clearNotices === 'function'"));

  await runWorkspaceFailure(win);
  assertStep("PASS46_COMMAND_HISTORY_ERROR", await waitFor(win, "Boolean(document.querySelector('.command-output-card.error, .command-history-item.error') && /definitely_missing_pass46_command/.test(document.body.textContent || ''))", 15000));
  assertStep("PASS46_COMMAND_NOTICE_RECORDED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      return Boolean(state.notices?.some((notice) => !notice.dismissedAt && notice.level === 'error' && /definitely_missing_pass46_command/.test((notice.title || '') + (notice.detail || ''))));
    })();
  `, 15000));

  win.webContents.reload();
  await wait(1000);
  assertStep("PASS46_RELOAD_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS46_OPEN_NOTICE_PANEL", await openNoticesPanel(win));
  assertStep("PASS46_NOTICE_PANEL_VISIBLE", await waitFor(win, `
    Boolean(document.querySelector('.bottom-work-panel .notice-card.error') && /definitely_missing_pass46_command/.test(document.body.textContent || ''))
  `, 8000));

  assertStep("PASS46_DISMISS_NOTICE", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.notice-card.error button[data-notice-action="dismiss"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS46_NOTICE_DISMISSED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      return Boolean(state.notices?.some((notice) => notice.dismissedAt && /definitely_missing_pass46_command/.test((notice.title || '') + (notice.detail || ''))));
    })();
  `, 8000));

  assertStep("PASS46_RECORD_DIRECT_NOTICE", await win.webContents.executeJavaScript(`
    (async function() {
      const next = await window.claudexDesktop.recordNotice({
        level: 'warning',
        source: 'pass46',
        title: 'pass46 direct notice',
        detail: 'pass46 direct detail',
        projectPath: ${JSON.stringify(PROJECT_DIR)}
      });
      return Boolean(next.notices?.[0]?.title === 'pass46 direct notice');
    })();
  `));
  win.webContents.reload();
  await wait(1000);
  assertStep("PASS46_RELOAD_DIRECT_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS46_REOPEN_NOTICE_PANEL", await openNoticesPanel(win));
  assertStep("PASS46_DIRECT_NOTICE_VISIBLE", await waitFor(win, "Boolean(document.querySelector('.notice-card.warning') && /pass46 direct detail/.test(document.body.textContent || ''))", 8000));
  assertStep("PASS46_CLEAR_NOTICES", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.notice-center .bottom-panel-actions button');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS46_ALL_DISMISSED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      return Boolean(state.notices?.length >= 2 && state.notices.every((notice) => notice.dismissedAt));
    })();
  `, 8000));

  console.log("PASS46_NOTICE_CENTER_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS46_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS46_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
