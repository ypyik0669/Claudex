const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass40-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass40-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass40-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");

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

const fakeClaudeScript = `
const args = process.argv.slice(2);
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value) + '\\n'); }
if (args[0] === '-p') {
  out({ result: 'pass40-automation-ok: ' + args[1], session_id: 'pass40-claude-session' });
} else if (args[0] === '--version') {
  out('2.9.0 (pass40 fake)');
} else {
  out({ result: 'pass40 generic ok', session_id: 'pass40-claude-session' });
}
`;

fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
const FAKE_CLAUDE_COMMAND = path.join(FAKE_BIN_DIR, "claude.cmd");
process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;

app.setPath("userData", USER_DATA_DIR);
fs.mkdirSync(PROJECT_DIR, { recursive: true });
fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass40-project" }), "utf8");

writeJson(DATA_FILE, {
  version: 1,
  settings: {
    provider: "anthropic",
    model: "claude-sonnet-4-5-20250929",
    baseUrl: "https://api.example.invalid",
    temperature: 0.2,
    timeoutMs: 600000,
    language: "zh",
    appearance: { fontSize: "compact", density: "compact" },
    claudeCode: { executionMode: "claude-code", claudeCommand: FAKE_CLAUDE_COMMAND, permissionMode: "default" },
    capabilities: {
      "project-context": true,
      "code-review": true,
      "implementation-plan": true,
      "terminal-helper": true,
      "mcp-runtime": true,
      "plugin-router": true,
      "marketplace-router": true,
    },
    customMarketplaces: [],
  },
  activeProject: { name: "pass40-project", path: PROJECT_DIR },
  projects: [{ name: "pass40-project", path: PROJECT_DIR }],
  sessions: [
    {
      id: "default",
      title: "新聊天",
      project: "pass40-project",
      projectPath: PROJECT_DIR,
      createdAt: "2026-07-05T00:00:00.000Z",
      updatedAt: "2026-07-05T00:00:00.000Z",
      messages: [],
    },
  ],
  automations: [],
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
    console.error("PASS40_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  try {
    assertStep("PASS40_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));

    assertStep("PASS40_AUTOMATION_IPC", await win.webContents.executeJavaScript(`
      typeof window.claudexDesktop.createAutomation === 'function' &&
      typeof window.claudexDesktop.runAutomationNow === 'function' &&
      typeof window.claudexDesktop.setAutomationEnabled === 'function' &&
      typeof window.claudexDesktop.deleteAutomation === 'function'
    `));

    assertStep("PASS40_OPEN_AUTOMATION", await openAutomation(win));
    assertStep("PASS40_MODAL_READY", await waitFor(win, `
      Boolean(document.querySelector('.scheduled-modal') && /主进程本地状态/.test(document.body.textContent || ''))
    `));

    assertStep("PASS40_CREATE_AUTOMATION", await waitFor(win, `
      (async function() {
        if (!window.__pass40Created) {
          window.__pass40Created = true;
          const textarea = document.querySelector('.schedule-form textarea');
          const timeInput = document.querySelector('.schedule-form input[type="datetime-local"]');
          const submit = document.querySelector('.schedule-form .primary-action');
          if (!textarea || !timeInput || !submit) return false;
          const textSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
          textSetter.call(textarea, 'pass40 automation prompt');
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          const future = new Date(Date.now() + 60 * 60 * 1000);
          const pad = (value) => String(value).padStart(2, '0');
          const localValue = future.getFullYear() + '-' + pad(future.getMonth() + 1) + '-' + pad(future.getDate()) + 'T' + pad(future.getHours()) + ':' + pad(future.getMinutes());
          const inputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          inputSetter.call(timeInput, localValue);
          timeInput.dispatchEvent(new Event('input', { bubbles: true }));
          submit.click();
        }
        await new Promise((resolve) => setTimeout(resolve, 600));
        const state = await window.claudexDesktop.getState();
        const automation = state.automations?.[0];
        return Boolean(
          automation &&
          automation.prompt === 'pass40 automation prompt' &&
          automation.project?.path === ${JSON.stringify(PROJECT_DIR)} &&
          automation.threadId === 'default' &&
          automation.nextRun &&
          /pass40 automation prompt/.test(document.body.textContent || '')
        );
      })();
    `, 10000));

    assertStep("PASS40_STORE_PERSISTED", (() => {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      return parsed.automations?.length === 1 &&
        parsed.automations[0].prompt === "pass40 automation prompt" &&
        parsed.automations[0].project?.path === PROJECT_DIR;
    })());

    win.webContents.reload();
    await wait(1200);
    assertStep("PASS40_RELOAD_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
    assertStep("PASS40_REOPEN_AUTOMATION", await openAutomation(win));
    assertStep("PASS40_RELOAD_PERSISTED_UI", await waitFor(win, `
      Boolean(document.querySelector('.scheduled-modal') && /pass40 automation prompt/.test(document.body.textContent || ''))
    `, 10000));

    assertStep("PASS40_RUN_NOW_HISTORY", await waitFor(win, `
      (async function() {
        if (!window.__pass40RunClicked) {
          window.__pass40RunClicked = true;
          const run = Array.from(document.querySelectorAll('.schedule-item-actions button'))
            .find((button) => button.title === '立即运行' || /立即运行/.test(button.textContent || ''));
          if (!run) return false;
          run.click();
        }
        await new Promise((resolve) => setTimeout(resolve, 900));
        const state = await window.claudexDesktop.getState();
        const automation = state.automations?.[0];
        const session = state.sessions.find((item) => item.id === 'default');
        return Boolean(
          automation?.lastRun?.status === 'succeeded' &&
          automation.history?.[0]?.status === 'succeeded' &&
          session?.messages?.some((message) => /pass40 automation prompt/.test(message.content || '')) &&
          session?.messages?.some((message) => /pass40-automation-ok/.test(message.content || '')) &&
          /pass40-automation-ok/.test(document.body.textContent || '')
        );
      })();
    `, 12000));

    assertStep("PASS40_RUN_TIMELINE", await waitFor(win, `
      Boolean(document.querySelector('.bottom-work-panel .run-timeline-row.ok') && /pass40-automation-ok/.test(document.body.textContent || ''))
    `, 5000));

    assertStep("PASS40_DELETE_AUTOMATION", await waitFor(win, `
      (async function() {
        if (!window.__pass40Deleted) {
          window.__pass40Deleted = true;
          const del = Array.from(document.querySelectorAll('.schedule-item-actions button'))
            .find((button) => button.title === '删除' || /删除/.test(button.textContent || ''));
          if (!del) return false;
          del.click();
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
        const state = await window.claudexDesktop.getState();
        return (state.automations || []).length === 0 && /还没有计划任务/.test(document.body.textContent || '');
      })();
    `, 10000));

    assertStep("PASS40_NO_LOCALSTORAGE_SOURCE", await win.webContents.executeJavaScript(`
      localStorage.setItem('claudex.schedules', JSON.stringify([{ id: 'legacy', prompt: 'legacy localStorage prompt' }]));
      !/legacy localStorage prompt/.test(document.body.textContent || '')
    `));

    console.log("PASS40_AUTOMATION_WORKBENCH_DONE");
    cleanup();
    app.exit(0);
  } catch (error) {
    console.error(error);
    cleanup();
    app.exit(1);
  }
});
