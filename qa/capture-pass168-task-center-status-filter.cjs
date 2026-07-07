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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass168-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass168-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass168-project-"));
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass168-project" }), "utf8");
  fs.writeFileSync(
    path.join(FAKE_BIN_DIR, "claude.cmd"),
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass168& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass168 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  const fakeClaude = path.join(FAKE_BIN_DIR, "claude.cmd");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;

  const createdAt = "2026-07-07T12:00:00.000Z";
  const project = { name: "pass168-project", path: PROJECT_DIR };
  const automationRun = {
    id: "pass168-automation-failed-run",
    trigger: "manual",
    status: "failed",
    startedAt: createdAt,
    endedAt: "2026-07-07T12:00:03.000Z",
    durationMs: 3000,
    sessionId: "pass168-session",
    detail: "",
    error: "pass168 automation failed evidence",
    summary: "",
    stdout: "",
    stderr: "pass168 automation stderr",
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
        id: "pass168-session",
        title: "Pass168 task center filters",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt,
        updatedAt: createdAt,
        messages: [],
      },
    ],
    automations: [
      {
        id: "pass168-automation-scheduled",
        prompt: "pass168 scheduled automation",
        schedule: { type: "once", runAt: "2026-07-08T12:00:00.000Z" },
        project,
        threadId: "pass168-session",
        enabled: true,
        status: "scheduled",
        createdAt,
        updatedAt: createdAt,
        history: [],
      },
      {
        id: "pass168-automation-failed",
        prompt: "pass168 failed automation",
        schedule: { type: "manual", runAt: "" },
        project,
        threadId: "pass168-session",
        enabled: false,
        status: "failed",
        createdAt,
        updatedAt: createdAt,
        lastRun: automationRun,
        history: [automationRun],
      },
    ],
    subagentRuns: [
      {
        id: "pass168-subagent-running",
        requestId: "pass168-subagent-running-request",
        nickname: "Pass168 Running QA",
        task: "pass168 running task",
        status: "running",
        sessionId: "pass168-session",
        project,
        cwd: PROJECT_DIR,
        command: fakeClaude,
        args: ["-p", "pass168 running task"],
        stdout: "pass168 running stdout",
        stderr: "",
        summary: "",
        artifacts: [],
        startedAt: createdAt,
      },
      {
        id: "pass168-subagent-done",
        requestId: "pass168-subagent-done-request",
        nickname: "Pass168 Done QA",
        task: "pass168 done task",
        status: "done",
        sessionId: "pass168-session",
        project,
        cwd: PROJECT_DIR,
        command: fakeClaude,
        args: ["-p", "pass168 done task"],
        stdout: "pass168 done stdout",
        stderr: "",
        summary: "pass168 done summary",
        code: 0,
        durationMs: 1000,
        artifacts: [{ type: "summary", label: "Summary", content: "pass168 done summary" }],
        startedAt: createdAt,
        endedAt: "2026-07-07T12:00:01.000Z",
      },
      {
        id: "pass168-subagent-error",
        requestId: "pass168-subagent-error-request",
        nickname: "Pass168 Error QA",
        task: "pass168 error task",
        status: "error",
        sessionId: "pass168-session",
        project,
        cwd: PROJECT_DIR,
        command: fakeClaude,
        args: ["-p", "pass168 error task"],
        stdout: "",
        stderr: "pass168 error stderr",
        summary: "pass168 error summary",
        code: 2,
        durationMs: 2000,
        artifacts: [{ type: "stderr", label: "stderr", content: "pass168 error stderr" }],
        startedAt: createdAt,
        endedAt: "2026-07-07T12:00:02.000Z",
      },
      {
        id: "pass168-subagent-archived",
        requestId: "pass168-subagent-archived-request",
        nickname: "Pass168 Archived QA",
        task: "pass168 archived task",
        status: "done",
        sessionId: "pass168-session",
        project,
        cwd: PROJECT_DIR,
        command: fakeClaude,
        args: ["-p", "pass168 archived task"],
        stdout: "pass168 archived stdout",
        stderr: "",
        summary: "pass168 archived summary",
        code: 0,
        durationMs: 1200,
        archivedAt: "2026-07-07T12:00:04.000Z",
        artifacts: [{ type: "summary", label: "Summary", content: "pass168 archived summary" }],
        startedAt: createdAt,
        endedAt: "2026-07-07T12:00:04.000Z",
      },
    ],
    commandRuns: [],
    runEvents: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

async function openSubagents(win) {
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

async function clickFilter(win, filterId) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector(${JSON.stringify(`.task-center-filters [data-task-filter="${filterId}"]`)});
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));

app.whenReady().then(async () => {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.error("PASS168_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  try {
    assertStep("PASS168_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
    assertStep("PASS168_OPEN_SUBAGENTS", await openSubagents(win));
    assertStep("PASS168_FILTERS_READY", await waitFor(win, `
      Boolean(
        document.querySelector('.subagent-workbench') &&
        document.querySelector('.task-center-filters [data-task-filter="all"]') &&
        document.querySelector('.task-center-filters [data-task-filter="active"]') &&
        document.querySelector('.task-center-filters [data-task-filter="failed"]') &&
        document.querySelector('.task-center-filters [data-task-filter="archived"]') &&
        /pass168 scheduled automation/.test(document.body.textContent || '') &&
        /Pass168 Running QA/.test(document.body.textContent || '') &&
        /Pass168 Done QA/.test(document.body.textContent || '') &&
        /Pass168 Error QA/.test(document.body.textContent || '') &&
        !/Pass168 Archived QA/.test(document.body.textContent || '')
      )
    `, 10000));

    assertStep("PASS168_ACTIVE_FILTER", await clickFilter(win, "active"));
    assertStep("PASS168_ACTIVE_FILTER_VISIBLE", await waitFor(win, `
      (function() {
        const text = document.querySelector('.subagent-workbench')?.textContent || '';
        return Boolean(
          document.querySelector('.task-center-filters [data-task-filter="active"].active') &&
          document.querySelectorAll('.automation-task-card').length === 1 &&
          document.querySelectorAll('.subagent-run-card').length === 1 &&
          /pass168 scheduled automation/.test(text) &&
          /Pass168 Running QA/.test(text) &&
          !/pass168 failed automation/.test(text) &&
          !/Pass168 Done QA/.test(text) &&
          !/Pass168 Error QA/.test(text) &&
          !/Pass168 Archived QA/.test(text)
        );
      })();
    `, 5000));

    assertStep("PASS168_FAILED_FILTER", await clickFilter(win, "failed"));
    assertStep("PASS168_FAILED_FILTER_VISIBLE", await waitFor(win, `
      (function() {
        const text = document.querySelector('.subagent-workbench')?.textContent || '';
        return Boolean(
          document.querySelector('.task-center-filters [data-task-filter="failed"].active') &&
          document.querySelectorAll('.automation-task-card.failed').length === 1 &&
          document.querySelectorAll('.subagent-run-card.error').length === 1 &&
          /pass168 failed automation/.test(text) &&
          /pass168 automation failed evidence/.test(text) &&
          /Pass168 Error QA/.test(text) &&
          /pass168 error summary/.test(text) &&
          !/pass168 scheduled automation/.test(text) &&
          !/Pass168 Running QA/.test(text) &&
          !/Pass168 Done QA/.test(text) &&
          !/Pass168 Archived QA/.test(text)
        );
      })();
    `, 5000));

    assertStep("PASS168_ARCHIVED_FILTER", await clickFilter(win, "archived"));
    assertStep("PASS168_ARCHIVED_FILTER_VISIBLE", await waitFor(win, `
      (function() {
        const text = document.querySelector('.subagent-workbench')?.textContent || '';
        return Boolean(
          document.querySelector('.task-center-filters [data-task-filter="archived"].active') &&
          document.querySelectorAll('.automation-task-card').length === 0 &&
          document.querySelectorAll('.subagent-run-card.archived').length === 1 &&
          /Pass168 Archived QA/.test(text) &&
          /pass168 archived summary/.test(text) &&
          /\\u5f53\\u524d\\u8fc7\\u6ee4\\u6ca1\\u6709\\u5339\\u914d\\u4efb\\u52a1/.test(text) &&
          !/pass168 scheduled automation/.test(text) &&
          !/pass168 failed automation/.test(text) &&
          !/Pass168 Running QA/.test(text) &&
          !/Pass168 Error QA/.test(text)
        );
      })();
    `, 5000));

    assertStep("PASS168_ALL_FILTER_RESTORES_ACTIVE_WORK", await clickFilter(win, "all"));
    assertStep("PASS168_ALL_FILTER_VISIBLE", await waitFor(win, `
      (function() {
        const text = document.querySelector('.subagent-workbench')?.textContent || '';
        return Boolean(
          document.querySelector('.task-center-filters [data-task-filter="all"].active') &&
          document.querySelectorAll('.automation-task-card').length === 2 &&
          document.querySelectorAll('.subagent-run-card').length === 3 &&
          /pass168 scheduled automation/.test(text) &&
          /pass168 failed automation/.test(text) &&
          /Pass168 Running QA/.test(text) &&
          /Pass168 Done QA/.test(text) &&
          /Pass168 Error QA/.test(text) &&
          !/Pass168 Archived QA/.test(text)
        );
      })();
    `, 5000));

    console.log("PASS168_TASK_CENTER_STATUS_FILTER_DONE");
    cleanup();
    app.exit(0);
  } catch (error) {
    console.error(error);
    cleanup();
    app.exit(1);
  }
});

setTimeout(() => {
  console.error("PASS168_TIMEOUT");
  cleanup();
  app.exit(1);
}, 80000);
