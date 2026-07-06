const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass76-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass76-project-"));
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

app.setPath("userData", USER_DATA_DIR);
fs.mkdirSync(PROJECT_DIR, { recursive: true });
fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass76-project" }), "utf8");

const historyRun = {
  id: "pass76-history-run",
  status: "succeeded",
  trigger: "manual",
  startedAt: "2026-07-06T01:00:00.000Z",
  endedAt: "2026-07-06T01:00:02.000Z",
  sessionId: "default",
  code: 0,
  durationMs: 2120,
  detail: "pass76 history detail",
  stdout: "pass76 fallback stdout evidence",
  stderr: "pass76 fallback stderr evidence",
};

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
    claudeCode: { executionMode: "claude-code", permissionMode: "default" },
    capabilities: {
      "project-context": true,
      "terminal-helper": true,
      "mcp-runtime": true,
      "plugin-router": true,
      "marketplace-router": true,
    },
    customMarketplaces: [],
  },
  activeProject: { name: "pass76-project", path: PROJECT_DIR },
  projects: [{ name: "pass76-project", path: PROJECT_DIR }],
  sessions: [
    {
      id: "default",
      title: "新聊天",
      project: "pass76-project",
      projectPath: PROJECT_DIR,
      createdAt: "2026-07-06T00:00:00.000Z",
      updatedAt: "2026-07-06T00:00:00.000Z",
      messages: [],
    },
  ],
  automations: [
    {
      id: "pass76-automation",
      prompt: "pass76 fallback automation prompt",
      enabled: false,
      status: "succeeded",
      project: { name: "pass76-project", path: PROJECT_DIR },
      threadId: "default",
      schedule: { runAt: "", repeat: "once" },
      lastRun: historyRun,
      history: [historyRun],
    },
  ],
  runEvents: [],
});

require(path.join(REPO_DIR, "electron", "main.cjs"));

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

async function openAutomation(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = Array.from(document.querySelectorAll('button'))
        .find((item) => item.getAttribute('aria-label') === '自动化' || /自动化/.test(item.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

app.whenReady().then(async () => {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.error("PASS76_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  try {
    assertStep("PASS76_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
    assertStep("PASS76_OPEN_AUTOMATION", await openAutomation(win));
    assertStep("PASS76_HISTORY_READY_WITHOUT_RUN_EVENTS", await waitFor(win, `
      (async function() {
        const state = await window.claudexDesktop.getState();
        return Boolean(
          document.querySelector('.scheduled-modal') &&
          state.runEvents?.length === 0 &&
          state.automations?.[0]?.history?.[0]?.id === 'pass76-history-run' &&
          /pass76 fallback automation prompt/.test(document.body.textContent || '') &&
          /pass76 fallback stdout evidence/.test(document.body.textContent || '')
        );
      })();
    `, 10000));

    assertStep("PASS76_HISTORY_ENTRY_ACTIONS", await waitFor(win, `
      (function() {
        const summary = document.querySelector('.schedule-history summary');
        if (!summary) return false;
        if (!document.querySelector('.schedule-history[open]')) summary.click();
        const actions = Array.from(document.querySelectorAll('.schedule-history [data-automation-history-action]'));
        return actions.some((button) => button.dataset.automationHistoryAction === 'copy') &&
          actions.some((button) => button.dataset.automationHistoryAction === 'timeline');
      })();
    `, 5000));

    assertStep("PASS76_COPY_HISTORY_ENTRY_EVIDENCE", await waitFor(win, `
      (async function() {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText: async (text) => { window.__pass76Clipboard = String(text || ''); } },
        });
        if (!window.__pass76CopiedHistory) {
          const copy = document.querySelector('.schedule-history [data-automation-history-action="copy"]');
          if (!copy) return false;
          window.__pass76CopiedHistory = true;
          copy.click();
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
        const text = window.__pass76Clipboard || '';
        return /pass76 fallback automation prompt/.test(text) &&
          /pass76 fallback stdout evidence/.test(text) &&
          /pass76 fallback stderr evidence/.test(text) &&
          /default/.test(text) &&
          /已复制/.test(document.body.textContent || '');
      })();
    `, 5000));

    assertStep("PASS76_HISTORY_TIMELINE_FALLBACK", await waitFor(win, `
      (async function() {
        if (!window.__pass76OpenedHistoryTimeline) {
          const timeline = document.querySelector('.schedule-history [data-automation-history-action="timeline"]');
          if (!timeline) return false;
          window.__pass76OpenedHistoryTimeline = true;
          timeline.click();
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
        const state = await window.claudexDesktop.getState();
        const panel = document.querySelector('.selected-run-evidence-panel');
        const text = panel?.textContent || '';
        return Boolean(
          state.runEvents?.length === 0 &&
          !document.querySelector('.scheduled-modal') &&
          panel &&
          /automation/.test(text) &&
          /pass76 fallback automation prompt/.test(text) &&
          /pass76 fallback stdout evidence/.test(text) &&
          /pass76 fallback stderr evidence/.test(text) &&
          /default/.test(text) &&
          /0/.test(text)
        );
      })();
    `, 5000));

    console.log("PASS76_AUTOMATION_HISTORY_TIMELINE_FALLBACK_DONE");
    cleanup();
    app.exit(0);
  } catch (error) {
    console.error(error);
    cleanup();
    app.exit(1);
  }
});

setTimeout(() => {
  console.error("PASS76_TIMEOUT");
  cleanup();
  app.exit(1);
}, 45000);
