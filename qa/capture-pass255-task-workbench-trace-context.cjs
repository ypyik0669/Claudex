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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass255-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass255-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const AUTOMATION_ID = "pass255-automation";
const AUTOMATION_RUN_ID = "pass255-automation-run";
const AUTOMATION_ACTIVE_ID = "pass255-automation-active";
const SUBAGENT_ID = "pass255-subagent";
const SUBAGENT_REQUEST_ID = "pass255-subagent-request";
const SUBAGENT_RUNNING_ID = "pass255-subagent-running";
const SUBAGENT_ARCHIVED_ID = "pass255-subagent-archived";

function cleanup() {
  for (const dir of [USER_DATA_DIR, PROJECT_DIR]) {
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

function writeInitialStore() {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass255-project" }), "utf8");
  const project = { name: "pass255-project", path: PROJECT_DIR };
  writeJson(DATA_FILE, {
    version: 1,
    activeProject: project,
    projects: [project],
    settings: {
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      baseUrl: "https://api.example.invalid",
      temperature: 0.2,
      timeoutMs: 600000,
      language: "zh",
      appearance: { fontSize: "compact", density: "compact" },
      claudeCode: { executionMode: "claude-code", claudeCommand: "claude", permissionMode: "default" },
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
    sessions: [
      {
        id: "pass255-session",
        title: "PASS255 task workbench trace context",
        project: project.name,
        projectPath: project.path,
        createdAt: "2026-07-08T02:55:00.000Z",
        updatedAt: "2026-07-08T02:55:00.000Z",
        messages: [],
      },
    ],
    automations: [
      {
        id: AUTOMATION_ID,
        prompt: "PASS255 failed automation workbench trace prompt",
        schedule: { type: "once", runAt: "2026-07-08T02:55:00.000Z" },
        project,
        threadId: "pass255-session",
        enabled: false,
        status: "failed",
        createdAt: "2026-07-08T02:55:00.000Z",
        updatedAt: "2026-07-08T02:55:09.000Z",
        lastRun: {
          id: AUTOMATION_RUN_ID,
          trigger: "manual",
          status: "failed",
          startedAt: "2026-07-08T02:55:01.000Z",
          endedAt: "2026-07-08T02:55:04.000Z",
          durationMs: 2550,
          sessionId: "pass255-session",
          code: 9,
          detail: "PASS255 automation failure detail",
          summary: "PASS255 automation failure summary",
          stdout: "PASS255 automation stdout",
          stderr: "PASS255 automation stderr",
        },
        history: [
          {
            id: "pass255-automation-history-ok",
            trigger: "schedule",
            status: "succeeded",
            startedAt: "2026-07-08T02:54:01.000Z",
            endedAt: "2026-07-08T02:54:02.000Z",
            durationMs: 1000,
            sessionId: "pass255-session",
            code: 0,
            summary: "PASS255 automation previous success",
          },
        ],
      },
      {
        id: AUTOMATION_ACTIVE_ID,
        prompt: "PASS255 scheduled automation active trace prompt",
        schedule: { type: "once", runAt: "2026-07-08T03:55:00.000Z" },
        project,
        threadId: "pass255-session",
        enabled: true,
        status: "scheduled",
        nextRun: "2026-07-08T03:55:00.000Z",
        createdAt: "2026-07-08T02:55:00.000Z",
        updatedAt: "2026-07-08T02:55:00.000Z",
        history: [],
      },
    ],
    subagentRuns: [
      {
        id: SUBAGENT_ID,
        requestId: SUBAGENT_REQUEST_ID,
        nickname: "PASS255 Failed Agent",
        task: "PASS255 failed subagent workbench trace task",
        status: "error",
        sessionId: "pass255-session",
        project,
        cwd: PROJECT_DIR,
        command: "claude",
        args: ["-p", "PASS255 failed subagent workbench trace task"],
        stdout: "PASS255 subagent stdout",
        stderr: "PASS255 subagent stderr",
        summary: "PASS255 subagent summary",
        code: 3,
        durationMs: 3333,
        artifacts: [
          { type: "stdout", label: "PASS255 stdout artifact", content: "PASS255 artifact stdout content" },
          { type: "stderr", label: "PASS255 stderr artifact", content: "PASS255 artifact stderr content" },
        ],
        startedAt: "2026-07-08T02:53:00.000Z",
        endedAt: "2026-07-08T02:53:05.000Z",
      },
      {
        id: SUBAGENT_RUNNING_ID,
        requestId: "pass255-subagent-running-request",
        nickname: "PASS255 Running Agent",
        task: "PASS255 running subagent trace task",
        status: "running",
        sessionId: "pass255-session",
        project,
        cwd: PROJECT_DIR,
        command: "claude",
        args: ["-p", "PASS255 running subagent trace task"],
        startedAt: "2026-07-08T02:56:00.000Z",
        artifacts: [],
      },
      {
        id: SUBAGENT_ARCHIVED_ID,
        requestId: "pass255-subagent-archived-request",
        nickname: "PASS255 Archived Agent",
        task: "PASS255 archived subagent trace task",
        status: "done",
        sessionId: "pass255-session",
        project,
        cwd: PROJECT_DIR,
        summary: "PASS255 archived summary",
        code: 0,
        durationMs: 1111,
        startedAt: "2026-07-08T02:50:00.000Z",
        endedAt: "2026-07-08T02:50:05.000Z",
        archivedAt: "2026-07-08T02:51:00.000Z",
        artifacts: [],
      },
    ],
    commandRuns: [],
    runEvents: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

async function openTaskWorkbench(win) {
  await win.webContents.executeJavaScript(`
    (function() {
      document.querySelector('[data-tool="subagents"]')?.click();
      return true;
    })();
  `);
  return waitFor(win, "Boolean(document.querySelector('.bottom-work-panel .subagent-workbench'))", 10000);
}

async function clickTaskFilter(win, filterId) {
  await win.webContents.executeJavaScript(`
    (function() {
      document.querySelector(${JSON.stringify(`.task-center-filters [data-task-filter="${filterId}"]`)})?.click();
      return true;
    })();
  `);
  await wait(300);
}

async function cardTrace(win, selector) {
  return win.webContents.executeJavaScript(`
    (function() {
      const card = document.querySelector(${JSON.stringify(selector)});
      if (!card) return null;
      return {
        id: card.getAttribute('data-task-id') || '',
        surface: card.getAttribute('data-task-surface') || '',
        kind: card.getAttribute('data-task-kind') || '',
        action: card.getAttribute('data-task-action') || '',
        runId: card.getAttribute('data-task-run-id') || '',
        requestId: card.getAttribute('data-task-request-id') || '',
        status: card.getAttribute('data-task-status') || '',
        filter: card.getAttribute('data-task-filter') || '',
        projectName: card.getAttribute('data-task-project-name') || '',
        projectPath: card.getAttribute('data-task-project-path') || '',
        threadId: card.getAttribute('data-task-thread-id') || '',
        sessionId: card.getAttribute('data-task-session-id') || '',
        archived: card.getAttribute('data-task-archived') || '',
        historyCount: card.getAttribute('data-task-history-count') || '',
        artifactCount: card.getAttribute('data-task-artifact-count') || '',
        hasEvidence: card.getAttribute('data-task-has-evidence') || '',
        trigger: card.getAttribute('data-task-trigger') || '',
        code: card.getAttribute('data-task-code') || '',
        durationMs: card.getAttribute('data-task-duration-ms') || '',
        startedAt: card.getAttribute('data-task-started-at') || '',
        endedAt: card.getAttribute('data-task-ended-at') || '',
        updatedAt: card.getAttribute('data-task-updated-at') || '',
        text: card.textContent || '',
      };
    })();
  `);
}

writeInitialStore();
app.setPath("userData", USER_DATA_DIR);
require(path.join(REPO_DIR, "electron", "main.cjs"));

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS255_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS255_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS255_STORE_READY", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      return Boolean(
        state.automations?.some((item) => item.id === ${JSON.stringify(AUTOMATION_ID)}) &&
        state.subagentRuns?.some((item) => item.id === ${JSON.stringify(SUBAGENT_ID)})
      );
    })();
  `));

  assertStep("PASS255_WORKBENCH_OPENED", await openTaskWorkbench(win));
  assertStep("PASS255_FAILED_FILTER_READY", await waitFor(win, `
    Boolean(
      document.querySelector('.task-center-filters [data-task-filter="failed"].active') &&
      document.querySelector('.automation-task-card[data-automation-id="${AUTOMATION_ID}"]') &&
      document.querySelector('.subagent-run-card[data-subagent-run-id="${SUBAGENT_ID}"]')
    )
  `));

  const automation = await cardTrace(win, `.automation-task-card[data-automation-id="${AUTOMATION_ID}"]`);
  assertStep("PASS255_AUTOMATION_CARD_TRACE", Boolean(automation &&
    automation.surface === "task-center" &&
    automation.kind === "automation" &&
    automation.action === "open" &&
    automation.id === AUTOMATION_ID &&
    automation.runId === AUTOMATION_RUN_ID &&
    automation.requestId === "" &&
    automation.status === "failed" &&
    automation.filter === "failed" &&
    /pass255-project/.test(automation.projectName) &&
    automation.projectPath === PROJECT_DIR &&
    automation.threadId === "pass255-session" &&
    automation.sessionId === "pass255-session" &&
    automation.archived === "false" &&
    automation.historyCount === "2" &&
    automation.artifactCount === "" &&
    automation.hasEvidence === "true" &&
    automation.trigger === "manual" &&
    automation.code === "9" &&
    automation.durationMs === "2550" &&
    automation.startedAt === "2026-07-08T02:55:01.000Z" &&
    automation.endedAt === "2026-07-08T02:55:04.000Z" &&
    automation.updatedAt === "2026-07-08T02:55:09.000Z"));

  const subagent = await cardTrace(win, `.subagent-run-card[data-subagent-run-id="${SUBAGENT_ID}"]`);
  assertStep("PASS255_SUBAGENT_CARD_TRACE", Boolean(subagent &&
    subagent.surface === "task-center" &&
    subagent.kind === "subagent" &&
    subagent.action === "open" &&
    subagent.id === SUBAGENT_ID &&
    subagent.runId === SUBAGENT_REQUEST_ID &&
    subagent.requestId === SUBAGENT_REQUEST_ID &&
    subagent.status === "error" &&
    subagent.filter === "failed" &&
    /pass255-project/.test(subagent.projectName) &&
    subagent.projectPath === PROJECT_DIR &&
    subagent.sessionId === "pass255-session" &&
    subagent.archived === "false" &&
    subagent.historyCount === "" &&
    subagent.artifactCount === "2" &&
    subagent.hasEvidence === "true" &&
    subagent.code === "3" &&
    subagent.durationMs === "3333" &&
    subagent.startedAt === "2026-07-08T02:53:00.000Z" &&
    subagent.endedAt === "2026-07-08T02:53:05.000Z"));

  await clickTaskFilter(win, "active");
  assertStep("PASS255_ACTIVE_FILTER_TRACE", await waitFor(win, `
    Boolean(
      document.querySelector('.task-center-filters [data-task-filter="active"].active') &&
      document.querySelector('.automation-task-card[data-automation-id="${AUTOMATION_ACTIVE_ID}"][data-task-kind="automation"][data-task-status="scheduled"][data-task-filter="active"]') &&
      document.querySelector('.subagent-run-card[data-subagent-run-id="${SUBAGENT_RUNNING_ID}"][data-task-kind="subagent"][data-task-status="running"][data-task-filter="active"]')
    )
  `));

  await clickTaskFilter(win, "archived");
  assertStep("PASS255_ARCHIVED_FILTER_TRACE", await waitFor(win, `
    Boolean(
      document.querySelector('.task-center-filters [data-task-filter="archived"].active') &&
      document.querySelector('.subagent-run-card.archived[data-subagent-run-id="${SUBAGENT_ARCHIVED_ID}"][data-task-kind="subagent"][data-task-status="done"][data-task-filter="archived"][data-task-archived="true"]') &&
      !document.querySelector('.automation-task-card')
    )
  `));

  console.log("PASS255_TASK_WORKBENCH_TRACE_CONTEXT_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS255_FAILED", error?.stack || error);
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    const debug = await win.webContents.executeJavaScript(`
      (function() {
        return {
          activeFilter: document.querySelector('.task-center-filters .active')?.getAttribute('data-task-filter') || '',
          automationCards: Array.from(document.querySelectorAll('.automation-task-card')).map((card) => ({
            id: card.getAttribute('data-automation-id'),
            attrs: Object.fromEntries(Array.from(card.attributes).map((attr) => [attr.name, attr.value])),
          })),
          subagentCards: Array.from(document.querySelectorAll('.subagent-run-card')).map((card) => ({
            id: card.getAttribute('data-subagent-run-id'),
            attrs: Object.fromEntries(Array.from(card.attributes).map((attr) => [attr.name, attr.value])),
          })),
        };
      })();
    `).catch((debugError) => ({ error: String(debugError?.stack || debugError) }));
    console.error("PASS255_DEBUG", JSON.stringify(debug, null, 2).slice(0, 16000));
  }
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS255_TIMEOUT");
  cleanup();
  app.exit(1);
}, 100000);
