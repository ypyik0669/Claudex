const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass68-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass68-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass68-project-"));
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
  process.stderr.write('pass68-stderr-evidence\\n');
  out({ result: 'pass68-automation-result: ' + args[1], session_id: 'pass68-claude-session' });
} else if (args[0] === '--version') {
  out('2.9.0 (pass68 fake)');
} else {
  out({ result: 'pass68 generic ok', session_id: 'pass68-claude-session' });
}
`;

fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
const FAKE_CLAUDE_COMMAND = path.join(FAKE_BIN_DIR, "claude.cmd");
process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;

app.setPath("userData", USER_DATA_DIR);
fs.mkdirSync(PROJECT_DIR, { recursive: true });
fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass68-project" }), "utf8");

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
  activeProject: { name: "pass68-project", path: PROJECT_DIR },
  projects: [{ name: "pass68-project", path: PROJECT_DIR }],
  sessions: [
    {
      id: "default",
      title: "新聊天",
      project: "pass68-project",
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
    console.error("PASS68_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  try {
    assertStep("PASS68_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
    assertStep("PASS68_OPEN_AUTOMATION", await openAutomation(win));
    assertStep("PASS68_MODAL_READY", await waitFor(win, "Boolean(document.querySelector('.scheduled-modal'))", 10000));

    assertStep("PASS68_CREATE_AND_RUN", await waitFor(win, `
      (async function() {
        if (!window.__pass68Created) {
          window.__pass68Created = true;
          const textarea = document.querySelector('.schedule-form textarea');
          const submit = document.querySelector('.schedule-form .primary-action');
          if (!textarea || !submit) return false;
          const textSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
          textSetter.call(textarea, 'pass68 evidence prompt');
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          submit.click();
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        if (!window.__pass68RunClicked) {
          const run = Array.from(document.querySelectorAll('.schedule-item-actions button'))
            .find((button) => button.title === '立即运行' || /立即运行/.test(button.textContent || ''));
          if (!run) return false;
          window.__pass68RunClicked = true;
          run.click();
        }
        await new Promise((resolve) => setTimeout(resolve, 900));
        const state = await window.claudexDesktop.getState();
        const automation = state.automations?.[0];
        return Boolean(
          automation?.lastRun?.status === 'succeeded' &&
          automation.lastRun.code === 0 &&
          automation.lastRun.sessionId === 'default' &&
          /pass68-automation-result/.test(automation.lastRun.stdout || '') &&
          /pass68-stderr-evidence/.test(automation.lastRun.stderr || '') &&
          /pass68-automation-result/.test(document.body.textContent || '') &&
          /pass68-stderr-evidence/.test(document.body.textContent || '') &&
          /原始证据/.test(document.body.textContent || '') &&
          /复制证据/.test(document.body.textContent || '')
        );
      })();
    `, 12000));

    assertStep("PASS68_HISTORY_PERSISTED", (() => {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      const automation = parsed.automations?.[0];
      const entry = automation?.history?.[0];
      const event = parsed.runEvents?.find((item) => item.id === entry?.id);
      return entry?.status === "succeeded" &&
        entry.code === 0 &&
        /pass68-automation-result/.test(entry.stdout || "") &&
        /pass68-stderr-evidence/.test(entry.stderr || "") &&
        event?.type === "automation" &&
        event.code === 0;
    })());

    assertStep("PASS68_COPY_EVIDENCE_UI", await waitFor(win, `
      (async function() {
        if (!window.__pass68Copied) {
          const copy = Array.from(document.querySelectorAll('.schedule-item-actions button'))
            .find((button) => button.title === '复制证据' || /复制证据/.test(button.textContent || ''));
          if (!copy) return false;
          window.__pass68Copied = true;
          copy.click();
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
        return /已复制/.test(document.body.textContent || '');
      })();
    `, 5000));

    console.log("PASS68_AUTOMATION_HISTORY_EVIDENCE_DONE");
    cleanup();
    app.exit(0);
  } catch (error) {
    console.error(error);
    cleanup();
    app.exit(1);
  }
});
