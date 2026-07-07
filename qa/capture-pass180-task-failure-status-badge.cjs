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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass180-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass180-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass180-project-"));
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass180-project" }), "utf8");
  fs.writeFileSync(
    path.join(FAKE_BIN_DIR, "claude.cmd"),
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass180& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass180 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  const fakeClaude = path.join(FAKE_BIN_DIR, "claude.cmd");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;

  const createdAt = "2026-07-07T15:00:00.000Z";
  const project = { name: "pass180-project", path: PROJECT_DIR };
  const failedAutomationRun = {
    id: "pass180-automation-failed-run",
    trigger: "manual",
    status: "failed",
    startedAt: createdAt,
    endedAt: "2026-07-07T15:00:02.000Z",
    durationMs: 2000,
    sessionId: "pass180-session",
    error: "pass180 automation failed evidence",
    stdout: "pass180 automation stdout",
    stderr: "pass180 automation stderr",
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
        id: "pass180-session",
        title: "Pass180 task failure status badge",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt,
        updatedAt: createdAt,
        messages: [],
      },
    ],
    automations: [
      {
        id: "pass180-automation-failed",
        prompt: "pass180 failed automation",
        schedule: { type: "manual", runAt: "" },
        project,
        threadId: "pass180-session",
        enabled: false,
        status: "failed",
        createdAt,
        updatedAt: createdAt,
        lastRun: failedAutomationRun,
        history: [failedAutomationRun],
      },
      {
        id: "pass180-automation-scheduled",
        prompt: "pass180 scheduled automation",
        schedule: { type: "once", runAt: "2026-07-08T15:00:00.000Z" },
        project,
        threadId: "pass180-session",
        enabled: true,
        status: "scheduled",
        createdAt,
        updatedAt: createdAt,
        history: [],
      },
    ],
    subagentRuns: [
      {
        id: "pass180-subagent-error",
        requestId: "pass180-subagent-error-request",
        nickname: "Pass180 Failed Subagent",
        task: "pass180 failed subagent task",
        status: "error",
        sessionId: "pass180-session",
        project,
        cwd: PROJECT_DIR,
        command: fakeClaude,
        args: ["-p", "pass180 failed subagent task", "--model", "claude-haiku-4-5-20251001"],
        stderr: "pass180 subagent stderr",
        summary: "pass180 subagent summary",
        code: 2,
        durationMs: 1800,
        artifacts: [{ type: "summary", label: "Summary", content: "pass180 subagent summary artifact" }],
        startedAt: createdAt,
        endedAt: "2026-07-07T15:00:02.000Z",
      },
      {
        id: "pass180-subagent-running",
        requestId: "pass180-subagent-running-request",
        nickname: "Pass180 Running Subagent",
        task: "pass180 running subagent task",
        status: "running",
        sessionId: "pass180-session",
        project,
        cwd: PROJECT_DIR,
        command: fakeClaude,
        args: ["-p", "pass180 running subagent task"],
        stdout: "pass180 running stdout",
        artifacts: [],
        startedAt: createdAt,
      },
      {
        id: "pass180-subagent-done",
        requestId: "pass180-subagent-done-request",
        nickname: "Pass180 Done Subagent",
        task: "pass180 done subagent task",
        status: "done",
        sessionId: "pass180-session",
        project,
        cwd: PROJECT_DIR,
        command: fakeClaude,
        args: ["-p", "pass180 done subagent task"],
        stdout: "pass180 done stdout",
        summary: "pass180 done summary",
        code: 0,
        durationMs: 900,
        artifacts: [{ type: "summary", label: "Summary", content: "pass180 done summary" }],
        startedAt: createdAt,
        endedAt: "2026-07-07T15:00:01.000Z",
      },
    ],
    commandRuns: [],
    runEvents: [
      {
        id: "pass180-automation-failed-run",
        type: "automation",
        status: "error",
        title: "pass180 failed automation",
        detail: "pass180 automation failed evidence",
        commandLine: "automation run pass180 failed automation",
        cwd: PROJECT_DIR,
        project,
        sessionId: "pass180-session",
        stdout: "pass180 automation stdout",
        stderr: "pass180 automation stderr",
        code: 2,
        createdAt,
      },
      {
        id: "pass180-subagent-error-request",
        type: "subagent",
        status: "error",
        title: "Pass180 Failed Subagent",
        detail: "pass180 subagent summary",
        commandLine: [fakeClaude, "-p", "pass180 failed subagent task"].join(" "),
        cwd: PROJECT_DIR,
        project,
        sessionId: "pass180-session",
        stderr: "pass180 subagent stderr",
        code: 2,
        createdAt,
      },
    ],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

async function clickTopSubagentsBadge(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const badge = document.querySelector('.workspace-context-button[data-context-tab="subagents"][data-status="error"] .context-tab-badge');
      if (!badge) return false;
      badge.click();
      return true;
    })();
  `);
}

async function clickTaskFilter(win, filterId) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector(${JSON.stringify(`.task-center-filters [data-task-filter="${filterId}"]`)});
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function clickBottomSubagentsBadge(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const badge = document.querySelector('.bottom-panel-tabs button[data-bottom-tab="subagents"][data-status="error"] .context-tab-badge');
      if (!badge) return false;
      badge.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS180_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS180_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS180_BADGE_BACKED_BY_STORE", await waitFor(win, `
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
      const button = document.querySelector('.workspace-context-button[data-context-tab="subagents"][data-status="error"]');
      const badge = button?.querySelector('.context-tab-badge');
      return Boolean(
        state.settings?.model === 'claude-haiku-4-5-20251001' &&
        automationFailures.length === 1 &&
        subagentFailures.length === 1 &&
        button &&
        badge &&
        badge.textContent.trim() === '2' &&
        /\\u5931\\u8d25\\u53ef\\u6062\\u590d 2/.test(button.getAttribute('aria-label') || '') &&
        button.getBoundingClientRect().width <= 40
      );
    })();
  `, 10000));

  assertStep("PASS180_CLICK_TOP_FAILURE_BADGE", await clickTopSubagentsBadge(win));
  assertStep("PASS180_TOP_BADGE_OPENS_FAILED_RECOVERY", await waitFor(win, `
    (function() {
      const text = document.querySelector('.subagent-workbench')?.textContent || '';
      const bottomBadge = document.querySelector('.bottom-panel-tabs button[data-bottom-tab="subagents"][data-status="error"] .context-tab-badge');
      return Boolean(
        document.querySelector('.bottom-work-panel') &&
        document.querySelector('.workspace-context-button[data-context-tab="subagents"].active.status-error') &&
        bottomBadge &&
        bottomBadge.textContent.trim() === '2' &&
        document.querySelector('.task-center-filters [data-task-filter="failed"].active') &&
        document.querySelector('.automation-task-card.focused-task-card[data-automation-id="pass180-automation-failed"]') &&
        document.querySelector('[data-automation-recovery-surface="task-center"][data-automation-id="pass180-automation-failed"]') &&
        document.querySelector('[data-subagent-recovery-surface="task-center"][data-subagent-run-id="pass180-subagent-error"]') &&
        /pass180 automation failed evidence/.test(text) &&
        /pass180 subagent summary/.test(text) &&
        !/pass180 scheduled automation/.test(text) &&
        !/Pass180 Running Subagent/.test(text) &&
        !/Pass180 Done Subagent/.test(text)
      );
    })();
  `, 8000));

  assertStep("PASS180_SWITCH_AWAY_TO_ACTIVE_FILTER", await clickTaskFilter(win, "active"));
  assertStep("PASS180_ACTIVE_FILTER_VISIBLE", await waitFor(win, `
    (function() {
      const text = document.querySelector('.subagent-workbench')?.textContent || '';
      return Boolean(
        document.querySelector('.task-center-filters [data-task-filter="active"].active') &&
        /pass180 scheduled automation/.test(text) &&
        /Pass180 Running Subagent/.test(text) &&
        !/pass180 failed automation/.test(text)
      );
    })();
  `, 5000));

  assertStep("PASS180_CLICK_BOTTOM_FAILURE_BADGE", await clickBottomSubagentsBadge(win));
  assertStep("PASS180_BOTTOM_BADGE_REFOCUSES_FAILED_RECOVERY", await waitFor(win, `
    Boolean(
      document.querySelector('.task-center-filters [data-task-filter="failed"].active') &&
      document.querySelector('.automation-task-card.focused-task-card[data-automation-id="pass180-automation-failed"]') &&
      document.querySelector('.bottom-panel-tabs button[data-bottom-tab="subagents"].active.status-error .context-tab-badge')
    )
  `, 8000));

  console.log("PASS180_TASK_FAILURE_STATUS_BADGE_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS180_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS180_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
