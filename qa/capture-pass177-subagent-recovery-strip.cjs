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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass177-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass177-bin-"));
const PROJECT_A_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass177-project-a-"));
const PROJECT_B_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass177-project-b-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_A_DIR, PROJECT_B_DIR]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_error) {
      // best-effort cleanup
    }
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

function assertStep(name, ok) {
  console.log(name, ok);
  if (!ok) throw new Error(`${name} failed`);
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

const fakeClaudeScript = `
const args = process.argv.slice(2);
function out(value) {
  process.stdout.write(typeof value === "string" ? value + "\\n" : JSON.stringify(value) + "\\n");
}
if (args[0] === "-p") {
  process.stderr.write("pass177 retry stderr cwd=" + process.cwd() + "\\n");
  out({ result: "pass177 retry recovered: " + args[1] + " cwd=" + process.cwd(), session_id: "pass177-claude-session" });
} else if (args[0] === "--version") {
  out("2.9.0 (pass177 fake)");
} else if (args[0] === "plugin" && args[1] === "list" && args[2] === "--json") {
  out([]);
} else if (args[0] === "plugin" && args[1] === "marketplace" && args[2] === "list" && args[3] === "--json") {
  out([]);
} else if (args[0] === "mcp") {
  out("No MCP servers configured");
} else {
  out({ result: "pass177 generic ok", session_id: "pass177-generic-session" });
}
`;

function failedRun({ id, requestId, nickname, task, fakeClaude, projectA, createdAt }) {
  return {
    id,
    requestId,
    nickname,
    task,
    status: "error",
    sessionId: "session-a",
    project: projectA,
    cwd: PROJECT_A_DIR,
    command: fakeClaude,
    args: ["-p", task, "--model", "claude-haiku-4-5-20251001"],
    stdout: "",
    stderr: `${task} stderr`,
    summary: `${task} summary`,
    code: 1,
    durationMs: 1200,
    startedAt: createdAt,
    endedAt: "2026-07-07T10:00:01.200Z",
    artifacts: [{ type: "summary", label: "Summary", content: `${task} summary artifact` }],
  };
}

function writeInitialStore() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_A_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_B_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_A_DIR, "package.json"), JSON.stringify({ name: "pass177-project-a" }), "utf8");
  fs.writeFileSync(path.join(PROJECT_B_DIR, "package.json"), JSON.stringify({ name: "pass177-project-b" }), "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), "@echo off\r\nnode \"%~dp0fake-claude.cjs\" %*\r\n", "utf8");
  const fakeClaude = path.join(FAKE_BIN_DIR, "claude.cmd");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;

  const createdAt = "2026-07-07T10:00:00.000Z";
  const projectA = { name: "pass177-project-a", path: PROJECT_A_DIR };
  const projectB = { name: "pass177-project-b", path: PROJECT_B_DIR };
  const retryRun = failedRun({
    id: "pass177-retry-run",
    requestId: "pass177-retry-request",
    nickname: "Pass177 Retry Failed Subagent",
    task: "pass177 retry strip failed task",
    fakeClaude,
    projectA,
    createdAt,
  });
  const continueRun = failedRun({
    id: "pass177-continue-run",
    requestId: "pass177-continue-request",
    nickname: "Pass177 Continue Failed Subagent",
    task: "pass177 continue strip failed task",
    fakeClaude,
    projectA,
    createdAt,
  });

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
      claudeCode: { executionMode: "claude-code", claudeCommand: fakeClaude, permissionMode: "default" },
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
    activeProject: projectB,
    projects: [projectB, projectA],
    sessions: [
      {
        id: "session-b",
        title: "Project B active session",
        project: projectB.name,
        projectPath: PROJECT_B_DIR,
        createdAt,
        updatedAt: createdAt,
        messages: [],
      },
      {
        id: "session-a",
        title: "Project A subagent session",
        project: projectA.name,
        projectPath: PROJECT_A_DIR,
        createdAt,
        updatedAt: createdAt,
        messages: [],
      },
    ],
    automations: [],
    subagentRuns: [retryRun, continueRun],
    commandRuns: [],
    runEvents: [retryRun, continueRun].map((run) => ({
      id: run.requestId,
      type: "subagent",
      status: "error",
      title: run.nickname,
      detail: run.summary,
      commandLine: [run.command, ...run.args].join(" "),
      cwd: PROJECT_A_DIR,
      project: projectA,
      sessionId: "session-a",
      stderr: run.stderr,
      code: 1,
      createdAt,
    })),
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

async function openTaskCenter(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const label = '\\u5b50\\u4ee3\\u7406';
      const button = Array.from(document.querySelectorAll('.workspace-context-button, .bottom-panel-tabs button, button'))
        .find((item) => item.getAttribute('aria-label') === label || (item.textContent || '').includes(label));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function installClipboardSpy(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text) => {
            window.__pass177ClipboardText = String(text || '');
          },
        },
      });
      return true;
    })();
  `);
}

async function clickRecoveryAction(win, runId, action) {
  return win.webContents.executeJavaScript(`
    (function() {
      const strip = document.querySelector('[data-subagent-recovery-surface="task-center"][data-subagent-run-id=${JSON.stringify(runId)}]');
      const button = strip?.querySelector('[data-subagent-recovery-action=${JSON.stringify(action)}]');
      window.__pass177ClickDebug = {
        requestedRunId: ${JSON.stringify(runId)},
        requestedAction: ${JSON.stringify(action)},
        strips: Array.from(document.querySelectorAll('[data-subagent-recovery-surface="task-center"]')).map((item) => ({
          runId: item.getAttribute('data-subagent-run-id'),
          requestId: item.getAttribute('data-subagent-request-id'),
          text: item.textContent,
        })),
        cards: Array.from(document.querySelectorAll('.subagent-run-card')).map((item) => ({
          runId: item.getAttribute('data-subagent-run-id'),
          requestId: item.getAttribute('data-subagent-request-id'),
          text: item.textContent,
        })),
      };
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runPaletteCommand(win, commandId, query) {
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
      const button = document.querySelector(${JSON.stringify(`.command-modal .command-list button[data-command-id="${commandId}"]`)});
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS177_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS177_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS177_INITIAL_FAILED_SUBAGENTS", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      return Boolean(
        state.activeProject?.path === ${JSON.stringify(PROJECT_B_DIR)} &&
        state.subagentRuns?.some((item) => item.id === 'pass177-retry-run' && item.status === 'error') &&
        state.subagentRuns?.some((item) => item.id === 'pass177-continue-run' && item.status === 'error')
      );
    })();
  `, 8000));

  assertStep("PASS177_OPEN_TASK_CENTER", await openTaskCenter(win));
  assertStep("PASS177_RECOVERY_STRIPS_VISIBLE", await waitFor(win, `
    (function() {
      const retryStrip = document.querySelector('[data-subagent-recovery-surface="task-center"][data-subagent-run-id="pass177-retry-run"]');
      const continueStrip = document.querySelector('[data-subagent-recovery-surface="task-center"][data-subagent-run-id="pass177-continue-run"]');
      const retryText = retryStrip?.textContent || '';
      const continueText = continueStrip?.textContent || '';
      return Boolean(
        retryStrip &&
        continueStrip &&
        /pass177 retry strip failed task summary/.test(retryText) &&
        /pass177 continue strip failed task summary/.test(continueText) &&
        /pass177-project-a/.test(retryText) &&
        retryStrip.querySelector('[data-subagent-recovery-action="retry"]') &&
        retryStrip.querySelector('[data-subagent-recovery-action="continue"]') &&
        retryStrip.querySelector('[data-subagent-recovery-action="copy-evidence"]') &&
        retryStrip.querySelector('[data-subagent-recovery-action="timeline"]')
      );
    })();
  `, 8000));

  assertStep("PASS177_INSTALL_CLIPBOARD_SPY", await installClipboardSpy(win));
  assertStep("PASS177_COPY_RECOVERY_EVIDENCE", await clickRecoveryAction(win, "pass177-retry-run", "copy-evidence"));
  assertStep("PASS177_COPY_BACKED_BY_SUBAGENT_RUN", await waitFor(win, `
    (function() {
      const copied = window.__pass177ClipboardText || "";
      return /pass177 retry strip failed task/.test(copied) &&
        /pass177 retry strip failed task stderr/.test(copied) &&
        /pass177-retry-run/.test(copied) &&
        /pass177-project-a/.test(copied);
    })();
  `, 5000));

  assertStep("PASS177_OPEN_TIMELINE_FROM_RECOVERY_STRIP", await clickRecoveryAction(win, "pass177-retry-run", "timeline"));
  assertStep("PASS177_TIMELINE_FOCUSED", await waitFor(win, `
    (function() {
      const active = document.querySelector('.workspace-context-button.active')?.textContent || '';
      const row = document.querySelector('.run-timeline-row.selected')?.textContent || '';
      const evidencePanel = document.querySelector('.selected-run-evidence-panel');
      const retry = evidencePanel?.querySelector('[data-run-recovery-action="retry-subagent"]');
      const panel = evidencePanel?.textContent || '';
      return /\\u8f93\\u51fa/.test(active) &&
        /Pass177 Retry Failed Subagent/.test(row) &&
        /pass177 retry strip failed task summary/.test(panel) &&
        /pass177-project-a/.test(panel) &&
        /session-a/.test(panel) &&
        retry &&
        retry.getAttribute('data-run-recovery-action-focused') === 'true' &&
        document.activeElement === retry;
    })();
  `, 8000));

  assertStep("PASS177_REOPEN_TASK_CENTER_FOR_RETRY", await openTaskCenter(win));
  assertStep("PASS177_CLICK_RETRY_RECOVERY", await clickRecoveryAction(win, "pass177-retry-run", "retry"));
  assertStep("PASS177_RETRY_USES_ORIGINAL_PROJECT", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const retried = (state.subagentRuns || []).find((item) =>
        item.id !== 'pass177-retry-run' &&
        item.task === 'pass177 retry strip failed task' &&
        item.project?.path === ${JSON.stringify(PROJECT_A_DIR)}
      );
      const event = state.runEvents?.find((item) => item.id === retried?.requestId);
      return Boolean(
        state.activeProject?.path === ${JSON.stringify(PROJECT_B_DIR)} &&
        retried?.status === 'done' &&
        retried.sessionId === 'session-a' &&
        [retried.summary, retried.stdout, retried.stderr].join(' ').includes(${JSON.stringify(`cwd=${PROJECT_A_DIR}`)}) &&
        event?.type === 'subagent' &&
        event.status === 'ok' &&
        event.project?.path === ${JSON.stringify(PROJECT_A_DIR)} &&
        event.cwd === ${JSON.stringify(PROJECT_A_DIR)} &&
        event.sessionId === 'session-a'
      );
    })();
  `, 15000));

  assertStep("PASS177_REOPEN_TASK_CENTER_FOR_CONTINUE", await runPaletteCommand(win, "task-filter:failed", "task filter failed"));
  assertStep("PASS177_CLICK_CONTINUE_RECOVERY", await clickRecoveryAction(win, "pass177-continue-run", "continue"));
  assertStep("PASS177_CONTINUE_PERSISTS_CONTEXT", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const run = state.subagentRuns?.find((item) => item.id === 'pass177-continue-run');
      const sessionA = state.sessions?.find((item) => item.id === 'session-a');
      const event = state.runEvents?.find((item) => item.id === 'pass177-continue-request:continue');
      return Boolean(
        state.activeProject?.path === ${JSON.stringify(PROJECT_A_DIR)} &&
        run?.continuedAt &&
        run.continuedSessionId === 'session-a' &&
        sessionA?.messages?.some((message) => message.source?.type === 'subagent' && message.source?.runId === 'pass177-continue-run') &&
        event?.type === 'subagent-action' &&
        event.status === 'ok' &&
        event.project?.path === ${JSON.stringify(PROJECT_A_DIR)} &&
        event.cwd === ${JSON.stringify(PROJECT_A_DIR)} &&
        event.sessionId === 'session-a' &&
        /pass177 continue strip failed task summary/.test((event.detail || '') + (event.stdout || '') + (event.stderr || ''))
      );
    })();
  `, 10000));

  console.log("PASS177_SUBAGENT_RECOVERY_STRIP_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS177_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript("window.__pass177ClickDebug || null").catch(() => null);
      if (debug) console.error("PASS177_CLICK_DEBUG", JSON.stringify(debug, null, 2));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS177_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
