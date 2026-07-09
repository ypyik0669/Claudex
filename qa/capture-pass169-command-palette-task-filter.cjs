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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass169-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass169-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass169-project-"));
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass169-project" }), "utf8");
  fs.writeFileSync(
    path.join(FAKE_BIN_DIR, "claude.cmd"),
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass169& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass169 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  const fakeClaude = path.join(FAKE_BIN_DIR, "claude.cmd");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;

  const createdAt = "2026-07-07T12:00:00.000Z";
  const project = { name: "pass169-project", path: PROJECT_DIR };
  const automationRun = {
    id: "pass169-automation-failed-run",
    trigger: "manual",
    status: "failed",
    startedAt: createdAt,
    endedAt: "2026-07-07T12:00:03.000Z",
    durationMs: 3000,
    sessionId: "pass169-session",
    detail: "",
    error: "pass169 automation failed evidence",
    summary: "",
    stdout: "",
    stderr: "pass169 automation stderr",
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
        id: "pass169-session",
        title: "pass169 task center filters",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt,
        updatedAt: createdAt,
        messages: [],
      },
    ],
    automations: [
      {
        id: "pass169-automation-scheduled",
        prompt: "pass169 scheduled automation",
        schedule: { type: "once", runAt: "2099-07-08T12:00:00.000Z" },
        project,
        threadId: "pass169-session",
        enabled: true,
        status: "scheduled",
        createdAt,
        updatedAt: createdAt,
        history: [],
      },
      {
        id: "pass169-automation-failed",
        prompt: "pass169 failed automation",
        schedule: { type: "manual", runAt: "" },
        project,
        threadId: "pass169-session",
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
        id: "pass169-subagent-running",
        requestId: "pass169-subagent-running-request",
        nickname: "pass169 Running QA",
        task: "pass169 running task",
        status: "running",
        sessionId: "pass169-session",
        project,
        cwd: PROJECT_DIR,
        command: fakeClaude,
        args: ["-p", "pass169 running task"],
        stdout: "pass169 running stdout",
        stderr: "",
        summary: "",
        artifacts: [],
        startedAt: createdAt,
      },
      {
        id: "pass169-subagent-done",
        requestId: "pass169-subagent-done-request",
        nickname: "pass169 Done QA",
        task: "pass169 done task",
        status: "done",
        sessionId: "pass169-session",
        project,
        cwd: PROJECT_DIR,
        command: fakeClaude,
        args: ["-p", "pass169 done task"],
        stdout: "pass169 done stdout",
        stderr: "",
        summary: "pass169 done summary",
        code: 0,
        durationMs: 1000,
        artifacts: [{ type: "summary", label: "Summary", content: "pass169 done summary" }],
        startedAt: createdAt,
        endedAt: "2026-07-07T12:00:01.000Z",
      },
      {
        id: "pass169-subagent-error",
        requestId: "pass169-subagent-error-request",
        nickname: "pass169 Error QA",
        task: "pass169 error task",
        status: "error",
        sessionId: "pass169-session",
        project,
        cwd: PROJECT_DIR,
        command: fakeClaude,
        args: ["-p", "pass169 error task"],
        stdout: "",
        stderr: "pass169 error stderr",
        summary: "pass169 error summary",
        code: 2,
        durationMs: 2000,
        artifacts: [{ type: "stderr", label: "stderr", content: "pass169 error stderr" }],
        startedAt: createdAt,
        endedAt: "2026-07-07T12:00:02.000Z",
      },
      {
        id: "pass169-subagent-archived",
        requestId: "pass169-subagent-archived-request",
        nickname: "pass169 Archived QA",
        task: "pass169 archived task",
        status: "done",
        sessionId: "pass169-session",
        project,
        cwd: PROJECT_DIR,
        command: fakeClaude,
        args: ["-p", "pass169 archived task"],
        stdout: "pass169 archived stdout",
        stderr: "",
        summary: "pass169 archived summary",
        code: 0,
        durationMs: 1200,
        archivedAt: "2026-07-07T12:00:04.000Z",
        artifacts: [{ type: "summary", label: "Summary", content: "pass169 archived summary" }],
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

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));

app.whenReady().then(async () => {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.error("PASS169_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  try {
    assertStep("PASS169_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
    assertStep("PASS169_FILTER_COMMAND_SEARCHABLE", await win.webContents.executeJavaScript(`
      (async function() {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 200));
        const input = document.querySelector('.command-modal .command-search input');
        if (!input) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, 'task filter failed');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 200));
        const button = document.querySelector('.command-modal .command-list button[data-command-id="task-filter:failed"]');
        const text = button?.textContent || '';
        const target = button?.getAttribute('data-command-target') || '';
        const kind = button?.getAttribute('data-command-task-kind') || '';
        const action = button?.getAttribute('data-command-task-action') || '';
        const filter = button?.getAttribute('data-command-task-filter') || '';
        const surface = button?.getAttribute('data-command-task-surface') || '';
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return Boolean(button &&
          target === 'task-filter' &&
          kind === 'task-center' &&
          action === 'filter' &&
          filter === 'failed' &&
          surface === 'command-palette' &&
          /\\u4efb\\u52a1\\u4e2d\\u5fc3/.test(text) &&
          /\\u5931\\u8d25/.test(text)
        );
      })();
    `));

    assertStep("PASS169_OPEN_ACTIVE_FILTER_FROM_PALETTE", await runPaletteCommand(win, "task-filter:active", "task filter active"));
    assertStep("PASS169_FILTERS_READY", await waitFor(win, `
      Boolean(
        document.querySelector('.subagent-workbench') &&
        document.querySelector('.task-center-filters [data-task-filter="all"]') &&
        document.querySelector('.task-center-filters [data-task-filter="active"]') &&
        document.querySelector('.task-center-filters [data-task-filter="failed"]') &&
        document.querySelector('.task-center-filters [data-task-filter="archived"]') &&
        /pass169 scheduled automation/.test(document.body.textContent || '') &&
        /pass169 Running QA/.test(document.body.textContent || '') &&
        /pass169 Done QA/.test(document.body.textContent || '') &&
        /pass169 Error QA/.test(document.body.textContent || '') &&
        !/pass169 Archived QA/.test(document.body.textContent || '')
      )
    `, 10000));

    assertStep("PASS169_ACTIVE_FILTER_VISIBLE", await waitFor(win, `
      (function() {
        const text = document.querySelector('.subagent-workbench')?.textContent || '';
        return Boolean(
          document.querySelector('.task-center-filters [data-task-filter="active"].active') &&
          document.querySelectorAll('.automation-task-card').length === 1 &&
          document.querySelectorAll('.subagent-run-card').length === 1 &&
          /pass169 scheduled automation/.test(text) &&
          /pass169 Running QA/.test(text) &&
          !/pass169 failed automation/.test(text) &&
          !/pass169 Done QA/.test(text) &&
          !/pass169 Error QA/.test(text) &&
          !/pass169 Archived QA/.test(text)
        );
      })();
    `, 5000));
    assertStep("PASS169_GENERIC_FILTER_ACTIVATES_SUBAGENT_RAIL", await waitFor(win, `
      (function() {
        return document.querySelector('.rail-button[data-tool="subagents"]')?.getAttribute('data-tool-active') === 'true' &&
          document.querySelector('.rail-button[data-tool="automations"]')?.getAttribute('data-tool-active') === 'false';
      })();
    `, 4000));

    assertStep("PASS169_OPEN_FAILED_FILTER_FROM_PALETTE", await runPaletteCommand(win, "task-filter:failed", "task filter failed"));
    assertStep("PASS169_FAILED_FILTER_VISIBLE", await waitFor(win, `
      (function() {
        const text = document.querySelector('.subagent-workbench')?.textContent || '';
        return Boolean(
          document.querySelector('.task-center-filters [data-task-filter="failed"].active') &&
          document.querySelectorAll('.automation-task-card.failed').length === 1 &&
          document.querySelectorAll('.subagent-run-card.error').length === 1 &&
          /pass169 failed automation/.test(text) &&
          /pass169 automation failed evidence/.test(text) &&
          /pass169 Error QA/.test(text) &&
          /pass169 error summary/.test(text) &&
          !/pass169 scheduled automation/.test(text) &&
          !/pass169 Running QA/.test(text) &&
          !/pass169 Done QA/.test(text) &&
          !/pass169 Archived QA/.test(text)
        );
      })();
    `, 5000));

    assertStep("PASS169_OPEN_ARCHIVED_FILTER_FROM_PALETTE", await runPaletteCommand(win, "task-filter:archived", "task filter archived"));
    assertStep("PASS169_ARCHIVED_FILTER_VISIBLE", await waitFor(win, `
      (function() {
        const text = document.querySelector('.subagent-workbench')?.textContent || '';
        return Boolean(
          document.querySelector('.task-center-filters [data-task-filter="archived"].active') &&
          document.querySelectorAll('.automation-task-card').length === 0 &&
          document.querySelectorAll('.subagent-run-card.archived').length === 1 &&
          /pass169 Archived QA/.test(text) &&
          /pass169 archived summary/.test(text) &&
          /\\u5f53\\u524d\\u8fc7\\u6ee4\\u6ca1\\u6709\\u5339\\u914d\\u4efb\\u52a1/.test(text) &&
          !/pass169 scheduled automation/.test(text) &&
          !/pass169 failed automation/.test(text) &&
          !/pass169 Running QA/.test(text) &&
          !/pass169 Error QA/.test(text)
        );
      })();
    `, 5000));

    assertStep("PASS169_OPEN_ALL_FILTER_FROM_PALETTE", await runPaletteCommand(win, "task-filter:all", "task filter all"));
    assertStep("PASS169_ALL_FILTER_VISIBLE", await waitFor(win, `
      (function() {
        const text = document.querySelector('.subagent-workbench')?.textContent || '';
        return Boolean(
          document.querySelector('.task-center-filters [data-task-filter="all"].active') &&
          document.querySelectorAll('.automation-task-card').length === 2 &&
          document.querySelectorAll('.subagent-run-card').length === 3 &&
          /pass169 scheduled automation/.test(text) &&
          /pass169 failed automation/.test(text) &&
          /pass169 Running QA/.test(text) &&
          /pass169 Done QA/.test(text) &&
          /pass169 Error QA/.test(text) &&
          !/pass169 Archived QA/.test(text)
        );
      })();
    `, 5000));

    console.log("PASS169_COMMAND_PALETTE_TASK_FILTER_DONE");
    cleanup();
    app.exit(0);
  } catch (error) {
    console.error(error);
    cleanup();
    app.exit(1);
  }
});

setTimeout(() => {
  console.error("PASS169_TIMEOUT");
  cleanup();
  app.exit(1);
}, 80000);
