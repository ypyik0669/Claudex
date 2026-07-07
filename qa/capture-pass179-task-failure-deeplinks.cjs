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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass179-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass179-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass179-project-"));
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass179-project" }), "utf8");
  fs.writeFileSync(
    path.join(FAKE_BIN_DIR, "claude.cmd"),
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass179& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass179 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  const fakeClaude = path.join(FAKE_BIN_DIR, "claude.cmd");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;

  const createdAt = "2026-07-07T14:00:00.000Z";
  const project = { name: "pass179-project", path: PROJECT_DIR };
  const failedAutomationRun = {
    id: "pass179-automation-failed-run",
    trigger: "manual",
    status: "failed",
    startedAt: createdAt,
    endedAt: "2026-07-07T14:00:02.000Z",
    durationMs: 2000,
    sessionId: "pass179-session",
    error: "pass179 automation failed evidence",
    stdout: "pass179 automation stdout",
    stderr: "pass179 automation stderr",
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
        id: "pass179-session",
        title: "Pass179 task failure deeplinks",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt,
        updatedAt: createdAt,
        messages: [],
      },
    ],
    automations: [
      {
        id: "pass179-automation-failed",
        prompt: "pass179 failed automation",
        schedule: { type: "manual", runAt: "" },
        project,
        threadId: "pass179-session",
        enabled: false,
        status: "failed",
        createdAt,
        updatedAt: createdAt,
        lastRun: failedAutomationRun,
        history: [failedAutomationRun],
      },
      {
        id: "pass179-automation-scheduled",
        prompt: "pass179 scheduled automation",
        schedule: { type: "once", runAt: "2026-07-08T14:00:00.000Z" },
        project,
        threadId: "pass179-session",
        enabled: true,
        status: "scheduled",
        createdAt,
        updatedAt: createdAt,
        history: [],
      },
    ],
    subagentRuns: [
      {
        id: "pass179-subagent-error",
        requestId: "pass179-subagent-error-request",
        nickname: "Pass179 Failed Subagent",
        task: "pass179 failed subagent task",
        status: "error",
        sessionId: "pass179-session",
        project,
        cwd: PROJECT_DIR,
        command: fakeClaude,
        args: ["-p", "pass179 failed subagent task", "--model", "claude-haiku-4-5-20251001"],
        stderr: "pass179 subagent stderr",
        summary: "pass179 subagent summary",
        code: 2,
        durationMs: 1800,
        artifacts: [{ type: "summary", label: "Summary", content: "pass179 subagent summary artifact" }],
        startedAt: createdAt,
        endedAt: "2026-07-07T14:00:02.000Z",
      },
      {
        id: "pass179-subagent-running",
        requestId: "pass179-subagent-running-request",
        nickname: "Pass179 Running Subagent",
        task: "pass179 running subagent task",
        status: "running",
        sessionId: "pass179-session",
        project,
        cwd: PROJECT_DIR,
        command: fakeClaude,
        args: ["-p", "pass179 running subagent task"],
        stdout: "pass179 running stdout",
        artifacts: [],
        startedAt: createdAt,
      },
      {
        id: "pass179-subagent-done",
        requestId: "pass179-subagent-done-request",
        nickname: "Pass179 Done Subagent",
        task: "pass179 done subagent task",
        status: "done",
        sessionId: "pass179-session",
        project,
        cwd: PROJECT_DIR,
        command: fakeClaude,
        args: ["-p", "pass179 done subagent task"],
        stdout: "pass179 done stdout",
        summary: "pass179 done summary",
        code: 0,
        durationMs: 900,
        artifacts: [{ type: "summary", label: "Summary", content: "pass179 done summary" }],
        startedAt: createdAt,
        endedAt: "2026-07-07T14:00:01.000Z",
      },
    ],
    commandRuns: [],
    runEvents: [
      {
        id: "pass179-automation-failed-run",
        type: "automation",
        status: "error",
        title: "pass179 failed automation",
        detail: "pass179 automation failed evidence",
        commandLine: "automation run pass179 failed automation",
        cwd: PROJECT_DIR,
        project,
        sessionId: "pass179-session",
        stdout: "pass179 automation stdout",
        stderr: "pass179 automation stderr",
        code: 2,
        createdAt,
      },
      {
        id: "pass179-subagent-error-request",
        type: "subagent",
        status: "error",
        title: "Pass179 Failed Subagent",
        detail: "pass179 subagent summary",
        commandLine: [fakeClaude, "-p", "pass179 failed subagent task"].join(" "),
        cwd: PROJECT_DIR,
        project,
        sessionId: "pass179-session",
        stderr: "pass179 subagent stderr",
        code: 2,
        createdAt,
      },
    ],
    sourceRefs: [],
    browserVisits: [],
    notices: [
      {
        id: "pass179-notice-aggregate",
        key: "pass179:aggregate-failure",
        level: "error",
        source: "task-center",
        title: "Pass179 aggregate failure notice",
        detail: "pass179 aggregate notice opens task-center:failed",
        action: "task-center:failed",
        project,
        sessionId: "pass179-session",
        createdAt,
        lastSeenAt: createdAt,
      },
      {
        id: "pass179-notice-subagent",
        key: "pass179:subagent-failure",
        level: "error",
        source: "subagent",
        title: "Pass179 subagent failure notice",
        detail: "pass179 subagent notice opens failed subagent recovery",
        action: "subagent:pass179-subagent-error-request",
        project,
        sessionId: "pass179-session",
        createdAt,
        lastSeenAt: createdAt,
      },
    ],
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

async function clickNoticeAction(win, titleText) {
  return win.webContents.executeJavaScript(`
    (function() {
      const card = Array.from(document.querySelectorAll('.notice-card'))
        .find((item) => (item.textContent || '').includes(${JSON.stringify(titleText)}));
      const button = card?.querySelector('[data-notice-action="open"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS179_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS179_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS179_STORE_HAS_FAILURES_AND_NOTICES", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      return Boolean(
        state.settings?.model === 'claude-haiku-4-5-20251001' &&
        state.automations?.some((item) => item.id === 'pass179-automation-failed' && item.status === 'failed') &&
        state.subagentRuns?.some((item) => item.requestId === 'pass179-subagent-error-request' && item.status === 'error') &&
        state.notices?.some((item) => item.action === 'task-center:failed') &&
        state.notices?.some((item) => item.action === 'subagent:pass179-subagent-error-request')
      );
    })();
  `, 8000));

  assertStep("PASS179_FAILURE_SUMMARY_COMMAND_SEARCHABLE", await win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'pass179 recovery failed task center');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      const button = document.querySelector('.command-modal .command-list button[data-command-id="task-recovery:failed-summary"]');
      const text = button?.textContent || '';
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return Boolean(button && /2/.test(text) && /\\u5931\\u8d25/.test(text) && /\\u6062\\u590d/.test(text));
    })();
  `));

  assertStep("PASS179_OPEN_FAILURE_SUMMARY_FROM_PALETTE", await runPaletteCommand(win, "task-recovery:failed-summary", "pass179 recovery failed"));
  assertStep("PASS179_PALETTE_FOCUSES_FIRST_FAILURE", await waitFor(win, `
    (function() {
      const text = document.querySelector('.subagent-workbench')?.textContent || '';
      return Boolean(
        document.querySelector('.task-center-filters [data-task-filter="failed"].active') &&
        document.querySelector('.automation-task-card.focused-task-card[data-automation-id="pass179-automation-failed"]') &&
        document.querySelector('[data-automation-recovery-surface="task-center"][data-automation-id="pass179-automation-failed"]') &&
        document.querySelector('.automation-task-card.focused-task-card[data-automation-id="pass179-automation-failed"] [data-automation-recovery-action="run-now"][data-task-action-focused="true"]') &&
        document.querySelector('[data-subagent-recovery-surface="task-center"][data-subagent-run-id="pass179-subagent-error"]') &&
        /pass179 automation failed evidence/.test(text) &&
        /pass179 subagent summary/.test(text) &&
        !/pass179 scheduled automation/.test(text) &&
        !/Pass179 Running Subagent/.test(text) &&
        !/Pass179 Done Subagent/.test(text)
      );
    })();
  `, 8000));

  assertStep("PASS179_SWITCH_TO_ACTIVE_BEFORE_NOTICE", await runPaletteCommand(win, "task-filter:active", "task filter active"));
  assertStep("PASS179_ACTIVE_FILTER_VISIBLE", await waitFor(win, `
    Boolean(
      document.querySelector('.task-center-filters [data-task-filter="active"].active') &&
      /pass179 scheduled automation/.test(document.querySelector('.subagent-workbench')?.textContent || '')
    )
  `, 5000));

  assertStep("PASS179_OPEN_NOTICE_CENTER", await runPaletteCommand(win, "panel-notices", "notices errors"));
  assertStep("PASS179_CLICK_AGGREGATE_NOTICE_ACTION", await waitFor(win, `
    /Pass179 aggregate failure notice/.test(document.querySelector('.notice-center')?.textContent || '')
  `, 5000) && await clickNoticeAction(win, "Pass179 aggregate failure notice"));
  assertStep("PASS179_NOTICE_TASK_CENTER_FAILED_ACTION", await waitFor(win, `
    Boolean(
      document.querySelector('.task-center-filters [data-task-filter="failed"].active') &&
      document.querySelector('.automation-task-card.focused-task-card[data-automation-id="pass179-automation-failed"]') &&
      document.querySelector('[data-automation-recovery-surface="task-center"][data-automation-id="pass179-automation-failed"]') &&
      document.querySelector('.automation-task-card.focused-task-card[data-automation-id="pass179-automation-failed"] [data-automation-recovery-action="run-now"][data-task-action-focused="true"]')
    )
  `, 8000));

  assertStep("PASS179_REOPEN_NOTICE_CENTER_FOR_SUBAGENT", await runPaletteCommand(win, "panel-notices", "notices errors"));
  assertStep("PASS179_CLICK_SUBAGENT_NOTICE_ACTION", await waitFor(win, `
    /Pass179 subagent failure notice/.test(document.querySelector('.notice-center')?.textContent || '')
  `, 5000) && await clickNoticeAction(win, "Pass179 subagent failure notice"));
  assertStep("PASS179_SUBAGENT_NOTICE_FOCUSES_RECOVERY", await waitFor(win, `
    Boolean(
      document.querySelector('.task-center-filters [data-task-filter="failed"].active') &&
      document.querySelector('.subagent-run-card.focused-task-card[data-subagent-request-id="pass179-subagent-error-request"]') &&
      document.querySelector('[data-subagent-recovery-surface="task-center"][data-subagent-run-id="pass179-subagent-error"]') &&
      document.querySelector('.subagent-run-card.focused-task-card[data-subagent-request-id="pass179-subagent-error-request"] [data-subagent-recovery-action="retry"][data-task-action-focused="true"]')
    )
  `, 8000));

  console.log("PASS179_TASK_FAILURE_DEEPLINKS_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS179_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (async function() {
          const state = await window.claudexDesktop?.getState?.().catch(() => null);
          return {
            activeFilter: document.querySelector('.task-center-filters .active')?.getAttribute('data-task-filter') || '',
            focusedAutomation: document.querySelector('.automation-task-card.focused-task-card')?.getAttribute('data-automation-id') || '',
            focusedSubagent: document.querySelector('.subagent-run-card.focused-task-card')?.getAttribute('data-subagent-request-id') || '',
            bottomText: document.querySelector('.bottom-panel')?.textContent || document.body.textContent || '',
            notices: state?.notices?.map((notice) => ({ id: notice.id, title: notice.title, action: notice.action })),
            automations: state?.automations?.map((item) => ({ id: item.id, status: item.status, lastRun: item.lastRun?.status })),
            subagents: state?.subagentRuns?.map((item) => ({ id: item.id, requestId: item.requestId, status: item.status, archivedAt: item.archivedAt })),
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS179_DEBUG", JSON.stringify(debug, null, 2).slice(0, 8000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS179_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
