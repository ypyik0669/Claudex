const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass76-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass76-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass76-project-"));
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
  out('2.9.0 (pass76 fake)');
} else {
  out({ result: 'pass76 generic ok', session_id: 'pass76-session' });
}
`;

fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
const FAKE_CLAUDE_COMMAND = path.join(FAKE_BIN_DIR, "claude.cmd");
process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;

app.setPath("userData", USER_DATA_DIR);
fs.mkdirSync(PROJECT_DIR, { recursive: true });
fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass76-project" }), "utf8");

const createdAt = "2026-07-06T00:00:00.000Z";
const pass76Project = { name: "pass76-project", path: PROJECT_DIR };
const doneRun = {
  id: "pass76-done-run",
  requestId: "pass76-done-request",
  nickname: "Lifecycle QA",
  task: "pass76 continue this result",
  status: "done",
  sessionId: "default",
  project: pass76Project,
  cwd: PROJECT_DIR,
  command: FAKE_CLAUDE_COMMAND,
  args: ["-p", "pass76 continue this result", "--output-format", "json"],
  stdout: JSON.stringify({ result: "pass76 lifecycle summary", session_id: "pass76-claude-session" }),
  stderr: "pass76 lifecycle stderr",
  summary: "pass76 lifecycle summary",
  code: 0,
  durationMs: 1234,
  startedAt: createdAt,
  endedAt: "2026-07-06T00:00:01.234Z",
  artifacts: [
    { type: "summary", label: "Summary", content: "pass76 lifecycle summary" },
    { type: "stdout", label: "stdout", content: "pass76 lifecycle stdout" },
    { type: "stderr", label: "stderr", content: "pass76 lifecycle stderr" },
  ],
};
const errorRun = {
  id: "pass76-error-run",
  requestId: "pass76-error-request",
  nickname: "Lifecycle Error QA",
  task: "pass76 archive this failed result",
  status: "error",
  sessionId: "default",
  project: pass76Project,
  cwd: PROJECT_DIR,
  command: FAKE_CLAUDE_COMMAND,
  args: ["-p", "pass76 archive this failed result", "--output-format", "json"],
  stdout: JSON.stringify({ is_error: true, result: "pass76 lifecycle failure", session_id: "pass76-error-session" }),
  stderr: "pass76 lifecycle failure stderr",
  summary: "pass76 lifecycle failure",
  code: 2,
  durationMs: 2222,
  startedAt: createdAt,
  endedAt: "2026-07-06T00:00:02.222Z",
  artifacts: [
    { type: "summary", label: "Summary", content: "pass76 lifecycle failure" },
    { type: "stderr", label: "stderr", content: "pass76 lifecycle failure stderr" },
  ],
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
  activeProject: pass76Project,
  projects: [pass76Project],
  sessions: [
    {
      id: "default",
      title: "\u65b0\u804a\u5929",
      project: "pass76-project",
      projectPath: PROJECT_DIR,
      createdAt,
      updatedAt: createdAt,
      messages: [],
    },
  ],
  automations: [],
  subagentRuns: [doneRun, errorRun],
  runEvents: [
    {
      id: "pass76-done-request",
      type: "subagent",
      status: "ok",
      title: "\u5b50\u4ee3\u7406\uff1aLifecycle QA",
      detail: "pass76-project \u00b7 pass76 lifecycle summary",
      commandLine: [doneRun.command, ...doneRun.args].join(" "),
      cwd: PROJECT_DIR,
      code: 0,
      durationMs: 1234,
      project: pass76Project,
      sessionId: "default",
      createdAt,
    },
    {
      id: "pass76-error-request",
      type: "subagent",
      status: "error",
      title: "\u5b50\u4ee3\u7406\uff1aLifecycle Error QA",
      detail: "pass76-project \u00b7 pass76 lifecycle failure",
      commandLine: [errorRun.command, ...errorRun.args].join(" "),
      cwd: PROJECT_DIR,
      code: 2,
      durationMs: 2222,
      project: pass76Project,
      sessionId: "default",
      createdAt,
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

async function openSubagents(win) {
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

function persistedState() {
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
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
    assertStep("PASS76_SUBAGENT_LIFECYCLE_IPC", await win.webContents.executeJavaScript(`
      typeof window.claudexDesktop.archiveSubagent === 'function' &&
      typeof window.claudexDesktop.continueSubagent === 'function'
    `));

    assertStep("PASS76_OPEN_SUBAGENTS", await openSubagents(win));
    assertStep("PASS76_FIXTURES_VISIBLE", await waitFor(win, `
      Boolean(
        document.querySelector('.subagent-workbench') &&
        Array.from(document.querySelectorAll('.subagent-run-card.done')).some((card) => /Lifecycle QA/.test(card.textContent || '')) &&
        Array.from(document.querySelectorAll('.subagent-run-card.error')).some((card) => /Lifecycle Error QA/.test(card.textContent || '')) &&
        Array.from(document.querySelectorAll('.subagent-run-foot button')).some((button) => /\\u7eed\\u5199\\u5230\\u804a\\u5929/.test(button.textContent || '')) &&
        Array.from(document.querySelectorAll('.subagent-run-foot button')).some((button) => /\\u5173\\u95ed\\u8bb0\\u5f55/.test(button.textContent || ''))
      )
    `, 10000));

    assertStep("PASS76_CONTINUE_TO_THREAD", await waitFor(win, `
      (async function() {
        if (!window.__pass76ContinueClicked) {
          window.__pass76ContinueClicked = true;
          const card = Array.from(document.querySelectorAll('.subagent-run-card.done'))
            .find((item) => /Lifecycle QA/.test(item.textContent || ''));
          const button = Array.from(card?.querySelectorAll('button') || [])
            .find((item) => /\\u7eed\\u5199\\u5230\\u804a\\u5929/.test(item.textContent || ''));
          if (!button) return false;
          button.click();
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
        const state = await window.claudexDesktop.getState();
        const run = state.subagentRuns?.find((item) => item.id === 'pass76-done-run');
        const session = state.sessions?.find((item) => item.id === 'default');
        const message = session?.messages?.find((item) => item.source?.type === 'subagent' && item.source?.runId === 'pass76-done-run');
        const body = document.body.textContent || '';
        return Boolean(
          run?.continuedAt &&
          run.continuedSessionId === 'default' &&
          message?.role === 'assistant' &&
          /pass76 lifecycle summary/.test(message.content || '') &&
          /pass76 lifecycle stderr/.test(message.content || '') &&
          /\\u5b50\\u4ee3\\u7406\\u7ed3\\u679c/.test(message.content || '') &&
          /pass76 lifecycle summary/.test(body) &&
          /\\u5df2\\u7eed\\u5199/.test(body)
        );
      })();
    `, 10000));

    assertStep("PASS76_ARCHIVE_ERROR_RUN", await waitFor(win, `
      (async function() {
        if (!window.__pass76ArchiveClicked) {
          window.__pass76ArchiveClicked = true;
          const card = Array.from(document.querySelectorAll('.subagent-run-card.error'))
            .find((item) => /Lifecycle Error QA/.test(item.textContent || ''));
          const button = Array.from(card?.querySelectorAll('button') || [])
            .find((item) => /\\u5173\\u95ed\\u8bb0\\u5f55/.test(item.textContent || ''));
          if (!button) return false;
          button.click();
        }
        await new Promise((resolve) => setTimeout(resolve, 450));
        const state = await window.claudexDesktop.getState();
        const run = state.subagentRuns?.find((item) => item.id === 'pass76-error-run');
        const body = document.body.textContent || '';
        return Boolean(
          run?.archivedAt &&
          !Array.from(document.querySelectorAll('.subagent-run-card.error')).some((card) => /Lifecycle Error QA/.test(card.textContent || '')) &&
          /\\u67e5\\u770b\\u5df2\\u5173\\u95ed\\s*1/.test(body)
        );
      })();
    `, 10000));

    assertStep("PASS76_ARCHIVE_PERSISTED", (() => {
      const parsed = persistedState();
      const run = parsed.subagentRuns?.find((item) => item.id === "pass76-error-run");
      return Boolean(run?.archivedAt);
    })());

    assertStep("PASS76_SHOW_ARCHIVED_AND_RESTORE", await waitFor(win, `
      (async function() {
        if (!window.__pass76ShowArchivedClicked) {
          window.__pass76ShowArchivedClicked = true;
          const show = Array.from(document.querySelectorAll('.task-section-head button'))
            .find((item) => /\\u67e5\\u770b\\u5df2\\u5173\\u95ed/.test(item.textContent || ''));
          if (!show) return false;
          show.click();
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        const archivedCard = Array.from(document.querySelectorAll('.subagent-run-card.error.archived'))
          .find((item) => /Lifecycle Error QA/.test(item.textContent || ''));
        if (!archivedCard) return false;
        if (!window.__pass76RestoreClicked) {
          window.__pass76RestoreClicked = true;
          const restore = Array.from(archivedCard.querySelectorAll('button'))
            .find((item) => /\\u6062\\u590d\\u8bb0\\u5f55/.test(item.textContent || ''));
          if (!restore) return false;
          restore.click();
        }
        await new Promise((resolve) => setTimeout(resolve, 450));
        const state = await window.claudexDesktop.getState();
        const run = state.subagentRuns?.find((item) => item.id === 'pass76-error-run');
        return Boolean(
          run &&
          !run.archivedAt &&
          Array.from(document.querySelectorAll('.subagent-run-card.error')).some((card) => /Lifecycle Error QA/.test(card.textContent || ''))
        );
      })();
    `, 10000));

    assertStep("PASS76_RESTORE_PERSISTED", (() => {
      const parsed = persistedState();
      const done = parsed.subagentRuns?.find((item) => item.id === "pass76-done-run");
      const restored = parsed.subagentRuns?.find((item) => item.id === "pass76-error-run");
      const session = parsed.sessions?.find((item) => item.id === "default");
      const message = session?.messages?.find((item) => item.source?.type === "subagent" && item.source?.runId === "pass76-done-run");
      return Boolean(
        done?.continuedAt &&
        done.continuedSessionId === "default" &&
        !restored?.archivedAt &&
        message &&
        /pass76 lifecycle summary/.test(message.content || "") &&
        /pass76 lifecycle stderr/.test(message.content || "")
      );
    })());

    win.webContents.reload();
    await wait(1200);
    assertStep("PASS76_RELOAD_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
    assertStep("PASS76_REOPEN_SUBAGENTS", await openSubagents(win));
    assertStep("PASS76_RELOAD_PERSISTED_UI", await waitFor(win, `
      Boolean(
        Array.from(document.querySelectorAll('.subagent-run-card.done')).some((card) => /Lifecycle QA/.test(card.textContent || '') && /\\u5df2\\u7eed\\u5199/.test(card.textContent || '')) &&
        Array.from(document.querySelectorAll('.subagent-run-card.error')).some((card) => /Lifecycle Error QA/.test(card.textContent || '')) &&
        /pass76 lifecycle summary/.test(document.body.textContent || '')
      )
    `, 10000));

    console.log("PASS76_SUBAGENT_LIFECYCLE_DONE");
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
}, 90000);
