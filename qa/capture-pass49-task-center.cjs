const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass49-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass49-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass49-project-"));
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
if (args[0] === '--version') {
  out('2.9.0 (pass49 fake)');
} else {
  out({ result: 'pass49 generic ok', session_id: 'pass49-claude-session' });
}
`;

fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
const FAKE_CLAUDE_COMMAND = path.join(FAKE_BIN_DIR, "claude.cmd");
process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;

app.setPath("userData", USER_DATA_DIR);
fs.mkdirSync(PROJECT_DIR, { recursive: true });
fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass49-project" }), "utf8");

const now = new Date("2026-07-05T08:00:00.000Z").toISOString();
const failedRun = {
  id: "pass49-failed-run",
  trigger: "manual",
  status: "failed",
  startedAt: now,
  endedAt: new Date("2026-07-05T08:01:00.000Z").toISOString(),
  durationMs: 60000,
  sessionId: "default",
  detail: "",
  error: "pass49 automation failed",
};

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
  activeProject: { name: "pass49-project", path: PROJECT_DIR },
  projects: [{ name: "pass49-project", path: PROJECT_DIR }],
  sessions: [
    {
      id: "default",
      title: "\u65b0\u804a\u5929",
      project: "pass49-project",
      projectPath: PROJECT_DIR,
      createdAt: now,
      updatedAt: now,
      messages: [],
    },
  ],
  automations: [
    {
      id: "pass49-failed-automation",
      prompt: "pass49 failed automation prompt",
      schedule: { type: "once", runAt: "" },
      project: { name: "pass49-project", path: PROJECT_DIR },
      threadId: "default",
      enabled: false,
      status: "failed",
      createdAt: now,
      updatedAt: now,
      lastRun: failedRun,
      history: [failedRun],
    },
    {
      id: "pass49-scheduled-automation",
      prompt: "pass49 scheduled automation prompt",
      schedule: { type: "once", runAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
      project: { name: "pass49-project", path: PROJECT_DIR },
      threadId: "default",
      enabled: true,
      status: "scheduled",
      createdAt: now,
      updatedAt: now,
      history: [],
    },
  ],
  subagentRuns: [
    {
      id: "pass49-subagent-run",
      requestId: "pass49-subagent-request",
      nickname: "QA Subagent",
      task: "pass49 subagent task",
      status: "done",
      sessionId: "default",
      project: { name: "pass49-project", path: PROJECT_DIR },
      cwd: PROJECT_DIR,
      summary: "pass49 subagent evidence",
      durationMs: 42,
      startedAt: now,
      endedAt: now,
      artifacts: [{ type: "summary", label: "pass49 artifact" }],
    },
  ],
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

async function openTaskCenter(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const label = '\\u5b50\\u4ee3\\u7406';
      const button = Array.from(document.querySelectorAll('.workspace-context-button, .bottom-panel-tabs button'))
        .find((item) => item.getAttribute('aria-label') === label || (item.textContent || '').includes(label));
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
    console.error("PASS49_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  try {
    assertStep("PASS49_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));

    assertStep("PASS49_OPEN_TASK_CENTER", await openTaskCenter(win));
    assertStep("PASS49_TASK_CENTER_READY", await waitFor(win, `
      Boolean(
        document.querySelector('.subagent-workbench') &&
        document.querySelector('.task-center-summary') &&
        (document.body.textContent || '').includes('\\u4efb\\u52a1\\u4e2d\\u5fc3')
      )
    `, 10000));

    assertStep("PASS49_AUTOMATION_STATE_VISIBLE", await win.webContents.executeJavaScript(`
      Boolean(
        document.querySelectorAll('.automation-task-card').length === 2 &&
        document.querySelector('.automation-task-card.failed') &&
        document.querySelector('.automation-task-card.scheduled') &&
        /pass49 automation failed/.test(document.body.textContent || '') &&
        /pass49 scheduled automation prompt/.test(document.body.textContent || '') &&
        /\\u81ea\\u52a8\\u5316 2 \\u4e2a/.test(document.body.textContent || '')
      )
    `));

    assertStep("PASS49_SUBAGENT_STILL_VISIBLE", await win.webContents.executeJavaScript(`
      Boolean(
        document.querySelector('.subagent-run-card.done') &&
        /pass49 subagent evidence/.test(document.body.textContent || '') &&
        /pass49 subagent task/.test(document.body.textContent || '')
      )
    `));

    assertStep("PASS49_STORE_BACKED", (() => {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      return parsed.automations?.length === 2 &&
        parsed.subagentRuns?.length === 1 &&
        parsed.automations.some((item) => item.lastRun?.error === "pass49 automation failed");
    })());

    assertStep("PASS49_NO_LOCALSTORAGE_SOURCE", await win.webContents.executeJavaScript(`
      localStorage.setItem('claudex.schedules', JSON.stringify([{ id: 'legacy', prompt: 'legacy localStorage task center' }]));
      !/legacy localStorage task center/.test(document.body.textContent || '')
    `));

    console.log("PASS49_TASK_CENTER_DONE");
    cleanup();
    app.exit(0);
  } catch (error) {
    console.error(error);
    cleanup();
    app.exit(1);
  }
});
