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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass259-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass259-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const SESSION_ID = "pass259-session";
const AUTOMATION_ID = "pass259-automation";
const AUTOMATION_RUN_ID = "pass259-automation-run";
const SUBAGENT_ID = "pass259-subagent";
const SUBAGENT_REQUEST_ID = "pass259-subagent-request";

const TRACE_FIELDS = [
  "surface",
  "kind",
  "action",
  "id",
  "runId",
  "requestId",
  "status",
  "filter",
  "projectName",
  "projectPath",
  "threadId",
  "sessionId",
  "archived",
  "historyCount",
  "artifactCount",
  "hasEvidence",
  "trigger",
  "code",
  "durationMs",
  "startedAt",
  "endedAt",
  "updatedAt",
];

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

function sharedFieldsMatch(left, right, fields) {
  return Boolean(left && right && fields.every((field) => left[field] === right[field]));
}

function writeInitialStore() {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass259-project" }), "utf8");
  const project = { name: "pass259-project", path: PROJECT_DIR };
  const automationRun = {
    id: AUTOMATION_RUN_ID,
    trigger: "manual",
    status: "failed",
    startedAt: "2026-07-08T02:59:01.000Z",
    endedAt: "2026-07-08T02:59:04.000Z",
    durationMs: 2590,
    sessionId: SESSION_ID,
    code: 6,
    detail: "PASS259 automation failure detail",
    summary: "PASS259 automation failure summary",
    stdout: "PASS259 automation stdout",
    stderr: "PASS259 automation stderr",
  };
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
        id: SESSION_ID,
        title: "PASS259 task trace schema consistency",
        project: project.name,
        projectPath: project.path,
        createdAt: "2026-07-08T02:59:00.000Z",
        updatedAt: "2026-07-08T02:59:00.000Z",
        messages: [],
      },
    ],
    automations: [
      {
        id: AUTOMATION_ID,
        prompt: "PASS259 failed automation schema prompt",
        schedule: { type: "once", runAt: "2099-07-08T03:59:00.000Z" },
        nextRun: "2099-07-08T03:59:00.000Z",
        project,
        threadId: SESSION_ID,
        enabled: true,
        status: "failed",
        createdAt: "2026-07-08T02:59:00.000Z",
        updatedAt: "2026-07-08T02:59:09.000Z",
        lastRun: automationRun,
        history: [automationRun],
      },
    ],
    subagentRuns: [
      {
        id: SUBAGENT_ID,
        requestId: SUBAGENT_REQUEST_ID,
        nickname: "PASS259 Schema Agent",
        task: "PASS259 failed subagent schema task",
        status: "error",
        sessionId: SESSION_ID,
        project,
        cwd: PROJECT_DIR,
        command: "claude",
        args: ["-p", "PASS259 failed subagent schema task"],
        stdout: "PASS259 subagent stdout",
        stderr: "PASS259 subagent stderr",
        summary: "PASS259 subagent summary",
        code: 7,
        durationMs: 2597,
        artifacts: [
          { type: "summary", label: "PASS259 summary artifact", content: "PASS259 artifact content" },
        ],
        startedAt: "2026-07-08T02:58:00.000Z",
        endedAt: "2026-07-08T02:58:05.000Z",
      },
    ],
    commandRuns: [],
    runEvents: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

async function paletteTrace(win, query, commandId) {
  return win.webContents.executeJavaScript(`
    (async function() {
      const fields = ${JSON.stringify(TRACE_FIELDS)};
      const attrNames = {
        surface: "surface",
        kind: "kind",
        action: "action",
        id: "id",
        runId: "run-id",
        requestId: "request-id",
        status: "status",
        filter: "filter",
        projectName: "project-name",
        projectPath: "project-path",
        threadId: "thread-id",
        sessionId: "session-id",
        archived: "archived",
        historyCount: "history-count",
        artifactCount: "artifact-count",
        hasEvidence: "has-evidence",
        trigger: "trigger",
        code: "code",
        durationMs: "duration-ms",
        startedAt: "started-at",
        endedAt: "ended-at",
        updatedAt: "updated-at",
      };
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return null;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 260));
      const button = document.querySelector(${JSON.stringify(`.command-modal .command-list button[data-command-id="${commandId}"]`)});
      const trace = button ? Object.fromEntries(fields.map((field) => [field, button.getAttribute('data-command-task-' + attrNames[field]) || ''])) : null;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 120));
      return trace;
    })();
  `);
}

async function surfaceTraces(win, specs) {
  return win.webContents.executeJavaScript(`
    (function() {
      const fields = ${JSON.stringify(TRACE_FIELDS)};
      const specs = ${JSON.stringify(specs)};
      const attrNames = {
        surface: "surface",
        kind: "kind",
        action: "action",
        id: "id",
        runId: "run-id",
        requestId: "request-id",
        status: "status",
        filter: "filter",
        projectName: "project-name",
        projectPath: "project-path",
        threadId: "thread-id",
        sessionId: "session-id",
        archived: "archived",
        historyCount: "history-count",
        artifactCount: "artifact-count",
        hasEvidence: "has-evidence",
        trigger: "trigger",
        code: "code",
        durationMs: "duration-ms",
        startedAt: "started-at",
        endedAt: "ended-at",
        updatedAt: "updated-at",
      };
      const readTrace = (element) => element ? Object.fromEntries(fields.map((field) => [field, element.getAttribute('data-task-' + attrNames[field]) || ''])) : null;
      return Object.fromEntries(specs.map((spec) => [spec.key, readTrace(document.querySelector(spec.selector))]));
    })();
  `);
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

async function openScheduledModal(win) {
  await win.webContents.executeJavaScript(`
    (function() {
      const button = Array.from(document.querySelectorAll('button'))
        .find((item) => item.getAttribute('aria-label') === '\\u81ea\\u52a8\\u5316');
      button?.click();
      return Boolean(button);
    })();
  `);
  return waitFor(win, "Boolean(document.querySelector('.scheduled-modal'))", 10000);
}

writeInitialStore();
app.setPath("userData", USER_DATA_DIR);
require(path.join(REPO_DIR, "electron", "main.cjs"));

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS259_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS259_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS259_STORE_READY", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      return Boolean(
        state.automations?.some((item) => item.id === ${JSON.stringify(AUTOMATION_ID)}) &&
        state.subagentRuns?.some((item) => item.id === ${JSON.stringify(SUBAGENT_ID)})
      );
    })();
  `));

  const automationCommand = await paletteTrace(win, "PASS259 failed automation schema prompt", `automation:${AUTOMATION_ID}`);
  const subagentCommand = await paletteTrace(win, "PASS259 Schema Agent", `subagent:${SUBAGENT_ID}`);
  assertStep("PASS259_COMMAND_TRACE_SURFACE", Boolean(
    automationCommand?.surface === "command-palette" &&
    subagentCommand?.surface === "command-palette" &&
    automationCommand?.action === "open" &&
    subagentCommand?.action === "open"
  ));

  assertStep("PASS259_WORKBENCH_OPENED", await openTaskWorkbench(win));
  assertStep("PASS259_WORKBENCH_READY", await waitFor(win, `
    Boolean(
      document.querySelector('.automation-task-card[data-automation-id="${AUTOMATION_ID}"]') &&
      document.querySelector('.subagent-run-card[data-subagent-run-id="${SUBAGENT_ID}"]')
    )
  `));
  const workbench = await surfaceTraces(win, [
    { key: "automationCard", selector: `.automation-task-card[data-automation-id="${AUTOMATION_ID}"]` },
    { key: "subagentCard", selector: `.subagent-run-card[data-subagent-run-id="${SUBAGENT_ID}"]` },
  ]);
  const automationShared = [
    "kind",
    "action",
    "id",
    "runId",
    "requestId",
    "status",
    "filter",
    "projectName",
    "projectPath",
    "threadId",
    "sessionId",
    "archived",
    "historyCount",
    "artifactCount",
    "hasEvidence",
    "trigger",
    "code",
    "durationMs",
    "startedAt",
    "endedAt",
    "updatedAt",
  ];
  const subagentShared = [
    "kind",
    "action",
    "id",
    "runId",
    "requestId",
    "status",
    "filter",
    "projectName",
    "projectPath",
    "threadId",
    "sessionId",
    "archived",
    "historyCount",
    "artifactCount",
    "hasEvidence",
    "trigger",
    "code",
    "durationMs",
    "startedAt",
    "endedAt",
    "updatedAt",
  ];
  assertStep("PASS259_COMMAND_WORKBENCH_SCHEMA_MATCH", Boolean(
    workbench.automationCard?.surface === "task-center" &&
    workbench.subagentCard?.surface === "task-center" &&
    sharedFieldsMatch(automationCommand, workbench.automationCard, automationShared) &&
    sharedFieldsMatch(subagentCommand, workbench.subagentCard, subagentShared)
  ));

  assertStep("PASS259_SCHEDULED_MODAL_OPENED", await openScheduledModal(win));
  assertStep("PASS259_SCHEDULED_ACTION_READY", await waitFor(win, `
    Boolean(document.querySelector('.scheduled-modal .schedule-item[data-automation-id="${AUTOMATION_ID}"] [data-automation-schedule-action="run-now"]'))
  `));
  const scheduled = await surfaceTraces(win, [
    { key: "runNow", selector: `.scheduled-modal .schedule-item[data-automation-id="${AUTOMATION_ID}"] [data-automation-schedule-action="run-now"]` },
  ]);
  const automationActionShared = automationShared.filter((field) => field !== "action");
  assertStep("PASS259_WORKBENCH_SCHEDULED_SCHEMA_MATCH", Boolean(
    scheduled.runNow?.surface === "scheduled" &&
    scheduled.runNow?.action === "run-now" &&
    sharedFieldsMatch(workbench.automationCard, scheduled.runNow, automationActionShared)
  ));

  console.log("PASS259_TASK_TRACE_SCHEMA_CONSISTENCY_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS259_FAILED", error?.stack || error);
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    const debug = await win.webContents.executeJavaScript(`
      (function() {
        return {
          commandButtons: Array.from(document.querySelectorAll('.command-modal [data-command-task-kind]')).map((item) => ({
            text: item.textContent,
            attrs: Object.fromEntries(Array.from(item.attributes).map((attr) => [attr.name, attr.value])),
          })),
          taskCards: Array.from(document.querySelectorAll('[data-task-kind]')).slice(0, 20).map((item) => ({
            text: item.textContent,
            attrs: Object.fromEntries(Array.from(item.attributes).map((attr) => [attr.name, attr.value])),
          })),
          body: document.body.textContent?.slice(0, 2000) || '',
        };
      })();
    `).catch((debugError) => ({ error: String(debugError?.stack || debugError) }));
    console.error("PASS259_DEBUG", JSON.stringify(debug, null, 2).slice(0, 16000));
  }
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS259_TIMEOUT");
  cleanup();
  app.exit(1);
}, 100000);
