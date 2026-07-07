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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass178-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass178-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass178-project-"));
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

function writeInitialStore() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass178-project" }), "utf8");
  fs.writeFileSync(
    path.join(FAKE_BIN_DIR, "claude.cmd"),
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass178& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass178 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  const fakeClaude = path.join(FAKE_BIN_DIR, "claude.cmd");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;

  const createdAt = "2026-07-07T13:00:00.000Z";
  const project = { name: "pass178-project", path: PROJECT_DIR };
  const failedAutomationRun = {
    id: "pass178-automation-failed-run",
    trigger: "manual",
    status: "failed",
    startedAt: createdAt,
    endedAt: "2026-07-07T13:00:02.000Z",
    durationMs: 2000,
    sessionId: "pass178-session",
    detail: "",
    error: "pass178 automation failed evidence",
    summary: "",
    stdout: "pass178 automation stdout",
    stderr: "pass178 automation stderr",
    code: 2,
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
    activeProject: project,
    projects: [project],
    sessions: [
      {
        id: "pass178-session",
        title: "Pass178 task center failure summary",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt,
        updatedAt: createdAt,
        messages: [],
      },
    ],
    automations: [
      {
        id: "pass178-automation-failed",
        prompt: "pass178 failed automation",
        schedule: { type: "manual", runAt: "" },
        project,
        threadId: "pass178-session",
        enabled: false,
        status: "failed",
        createdAt,
        updatedAt: createdAt,
        lastRun: failedAutomationRun,
        history: [failedAutomationRun],
      },
      {
        id: "pass178-automation-scheduled",
        prompt: "pass178 scheduled automation",
        schedule: { type: "once", runAt: "2026-07-08T13:00:00.000Z" },
        project,
        threadId: "pass178-session",
        enabled: true,
        status: "scheduled",
        createdAt,
        updatedAt: createdAt,
        history: [],
      },
    ],
    subagentRuns: [
      {
        id: "pass178-subagent-error",
        requestId: "pass178-subagent-error-request",
        nickname: "Pass178 Failed Subagent",
        task: "pass178 failed subagent task",
        status: "error",
        sessionId: "pass178-session",
        project,
        cwd: PROJECT_DIR,
        command: fakeClaude,
        args: ["-p", "pass178 failed subagent task", "--model", "claude-haiku-4-5-20251001"],
        stdout: "",
        stderr: "pass178 subagent stderr",
        summary: "pass178 subagent summary",
        code: 2,
        durationMs: 1800,
        artifacts: [{ type: "summary", label: "Summary", content: "pass178 subagent summary artifact" }],
        startedAt: createdAt,
        endedAt: "2026-07-07T13:00:02.000Z",
      },
      {
        id: "pass178-subagent-running",
        requestId: "pass178-subagent-running-request",
        nickname: "Pass178 Running Subagent",
        task: "pass178 running subagent task",
        status: "running",
        sessionId: "pass178-session",
        project,
        cwd: PROJECT_DIR,
        command: fakeClaude,
        args: ["-p", "pass178 running subagent task"],
        stdout: "pass178 running stdout",
        stderr: "",
        summary: "",
        artifacts: [],
        startedAt: createdAt,
      },
      {
        id: "pass178-subagent-done",
        requestId: "pass178-subagent-done-request",
        nickname: "Pass178 Done Subagent",
        task: "pass178 done subagent task",
        status: "done",
        sessionId: "pass178-session",
        project,
        cwd: PROJECT_DIR,
        command: fakeClaude,
        args: ["-p", "pass178 done subagent task"],
        stdout: "pass178 done stdout",
        stderr: "",
        summary: "pass178 done summary",
        code: 0,
        durationMs: 900,
        artifacts: [{ type: "summary", label: "Summary", content: "pass178 done summary" }],
        startedAt: createdAt,
        endedAt: "2026-07-07T13:00:01.000Z",
      },
      {
        id: "pass178-subagent-archived-error",
        requestId: "pass178-subagent-archived-error-request",
        nickname: "Pass178 Archived Failed Subagent",
        task: "pass178 archived failed subagent task",
        status: "error",
        sessionId: "pass178-session",
        project,
        cwd: PROJECT_DIR,
        command: fakeClaude,
        args: ["-p", "pass178 archived failed subagent task"],
        stdout: "",
        stderr: "pass178 archived stderr",
        summary: "pass178 archived summary",
        code: 2,
        durationMs: 700,
        archivedAt: "2026-07-07T13:00:04.000Z",
        artifacts: [{ type: "summary", label: "Summary", content: "pass178 archived summary" }],
        startedAt: createdAt,
        endedAt: "2026-07-07T13:00:03.000Z",
      },
    ],
    commandRuns: [],
    runEvents: [
      {
        id: failedAutomationRun.id,
        type: "automation",
        status: "error",
        title: "pass178 failed automation",
        detail: failedAutomationRun.error,
        commandLine: "automation run pass178 failed automation",
        cwd: PROJECT_DIR,
        project,
        sessionId: "pass178-session",
        stdout: failedAutomationRun.stdout,
        stderr: failedAutomationRun.stderr,
        code: 2,
        createdAt,
      },
      {
        id: "pass178-subagent-error-request",
        type: "subagent",
        status: "error",
        title: "Pass178 Failed Subagent",
        detail: "pass178 subagent summary",
        commandLine: [fakeClaude, "-p", "pass178 failed subagent task"].join(" "),
        cwd: PROJECT_DIR,
        project,
        sessionId: "pass178-session",
        stderr: "pass178 subagent stderr",
        code: 2,
        createdAt,
      },
    ],
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
            window.__pass178ClipboardText = String(text || '');
          },
        },
      });
      return true;
    })();
  `);
}

async function clickFailureSummary(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('[data-task-center-failure-action="focus-failed"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function clickAutomationRecovery(win, action) {
  return win.webContents.executeJavaScript(`
    (function() {
      const strip = document.querySelector('[data-automation-recovery-surface="task-center"][data-automation-id="pass178-automation-failed"]');
      const button = strip?.querySelector('[data-automation-recovery-action=${JSON.stringify(action)}]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS178_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS178_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS178_OPEN_TASK_CENTER", await openTaskCenter(win));
  assertStep("PASS178_SUMMARY_BACKED_BY_STORE", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const automationFailures = (state.automations || []).filter((item) =>
        item?.status === 'failed' ||
        item?.lastRun?.status === 'failed' ||
        (item?.history || []).some((entry) => entry?.status === 'failed' || Number(entry?.code) !== 0)
      );
      const subagentFailures = (state.subagentRuns || []).filter((run) =>
        !run?.archivedAt &&
        run?.status !== 'running' &&
        ['error', 'failed', 'cancelled'].includes(run?.status)
      );
      const summary = document.querySelector('[data-task-center-failure-summary]');
      const text = summary?.textContent || '';
      return Boolean(
        state.settings?.model === 'claude-haiku-4-5-20251001' &&
        automationFailures.length === 1 &&
        subagentFailures.length === 1 &&
        summary &&
        /2/.test(text) &&
        /1/.test(text) &&
        /pass178 failed automation/.test(document.body.textContent || '') &&
        /Pass178 Failed Subagent/.test(document.body.textContent || '')
      );
    })();
  `, 10000));

  assertStep("PASS178_CLICK_FAILURE_SUMMARY", await clickFailureSummary(win));
  assertStep("PASS178_FAILED_FILTER_FOCUSES_FIRST_RECOVERY", await waitFor(win, `
    (function() {
      const workbenchText = document.querySelector('.subagent-workbench')?.textContent || '';
      const automationCard = document.querySelector('.automation-task-card.focused-task-card[data-automation-id="pass178-automation-failed"]');
      const automationStrip = document.querySelector('[data-automation-recovery-surface="task-center"][data-automation-id="pass178-automation-failed"]');
      const subagentStrip = document.querySelector('[data-subagent-recovery-surface="task-center"][data-subagent-run-id="pass178-subagent-error"]');
      return Boolean(
        document.querySelector('.task-center-filters [data-task-filter="failed"].active') &&
        automationCard &&
        automationStrip &&
        subagentStrip &&
        document.querySelectorAll('.automation-task-card').length === 1 &&
        document.querySelectorAll('.subagent-run-card').length === 1 &&
        /pass178 failed automation/.test(workbenchText) &&
        /Pass178 Failed Subagent/.test(workbenchText) &&
        /pass178 automation failed evidence/.test(workbenchText) &&
        /pass178 subagent summary/.test(workbenchText) &&
        !/pass178 scheduled automation/.test(workbenchText) &&
        !/Pass178 Running Subagent/.test(workbenchText) &&
        !/Pass178 Done Subagent/.test(workbenchText) &&
        !/Pass178 Archived Failed Subagent/.test(workbenchText)
      );
    })();
  `, 8000));

  assertStep("PASS178_INSTALL_CLIPBOARD_SPY", await installClipboardSpy(win));
  assertStep("PASS178_COPY_FROM_FOCUSED_RECOVERY", await clickAutomationRecovery(win, "copy-evidence"));
  assertStep("PASS178_COPY_HAS_REAL_AUTOMATION_EVIDENCE", await waitFor(win, `
    (function() {
      const copied = window.__pass178ClipboardText || "";
      return /pass178 failed automation/.test(copied) &&
        /pass178-automation-failed-run/.test(copied) &&
        /pass178 automation stderr/.test(copied) &&
        /${PROJECT_DIR.replace(/\\/g, "\\\\")}/.test(copied);
    })();
  `, 5000));

  assertStep("PASS178_TIMELINE_FROM_FOCUSED_RECOVERY", await clickAutomationRecovery(win, "timeline"));
  assertStep("PASS178_TIMELINE_SELECTED_REAL_RUN", await waitFor(win, `
    (function() {
      const active = document.querySelector('.workspace-context-button.active')?.textContent || '';
      const row = document.querySelector('.run-timeline-row.selected')?.textContent || '';
      const panel = document.querySelector('.selected-run-evidence-panel')?.textContent || '';
      return /\\u8f93\\u51fa/.test(active) &&
        /pass178 failed automation/.test(row) &&
        /pass178 automation failed evidence/.test(panel) &&
        /pass178 automation stderr/.test(panel);
    })();
  `, 8000));

  console.log("PASS178_TASK_CENTER_FAILURE_SUMMARY_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS178_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS178_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
