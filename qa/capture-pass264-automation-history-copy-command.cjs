const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow, clipboard } = require("electron");

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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass264-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass264-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const SESSION_ID = "pass264-session";
const AUTOMATION_ID = "pass264-automation";
const SUCCESS_RUN_ID = "pass264-history-success";
const FAILED_RUN_ID = "pass264-history-failed";
const PROMPT = "PASS264 automation history copy command prompt";
const SUCCESS_STDOUT = "PASS264 previous success stdout command evidence";

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
const TRACE_SUFFIX = {
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

async function waitForClipboard(patterns, timeoutMs = 6000) {
  const checks = Array.isArray(patterns) ? patterns : [patterns];
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const text = clipboard.readText() || "";
    if (checks.every((pattern) => (pattern instanceof RegExp ? pattern.test(text) : text.includes(String(pattern))))) {
      return true;
    }
    await wait(120);
  }
  return false;
}

function assertStep(name, ok) {
  console.log(name, ok);
  if (!ok) throw new Error(`${name} failed`);
}

function automationRun({ id, status, code, durationMs, summary, stdout, stderr = "" }) {
  return {
    id,
    trigger: "manual",
    status,
    startedAt: id === SUCCESS_RUN_ID ? "2026-07-08T03:04:01.000Z" : "2026-07-08T03:04:11.000Z",
    endedAt: id === SUCCESS_RUN_ID ? "2026-07-08T03:04:03.640Z" : "2026-07-08T03:04:15.000Z",
    durationMs,
    sessionId: SESSION_ID,
    code,
    detail: summary,
    summary,
    stdout,
    stderr,
  };
}

function writeInitialStore() {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass264-project" }), "utf8");
  const project = { name: "pass264-project", path: PROJECT_DIR };
  const successRun = automationRun({
    id: SUCCESS_RUN_ID,
    status: "succeeded",
    code: 0,
    durationMs: 2640,
    summary: "PASS264 previous success summary",
    stdout: SUCCESS_STDOUT,
  });
  const failedRun = automationRun({
    id: FAILED_RUN_ID,
    status: "failed",
    code: 4,
    durationMs: 2644,
    summary: "PASS264 latest failure summary",
    stdout: "PASS264 latest failed stdout",
    stderr: "PASS264 latest failed stderr",
  });
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
        title: "PASS264 automation history copy command",
        project: project.name,
        projectPath: project.path,
        createdAt: "2026-07-08T03:04:00.000Z",
        updatedAt: "2026-07-08T03:04:00.000Z",
        messages: [],
      },
    ],
    automations: [
      {
        id: AUTOMATION_ID,
        prompt: PROMPT,
        // This is history evidence, not a due scheduler fixture.  A past runAt
        // would race the main-process scheduler and mutate the trace under test.
        schedule: { type: "once", runAt: "" },
        nextRun: "",
        project,
        threadId: SESSION_ID,
        enabled: true,
        status: "failed",
        createdAt: "2026-07-08T03:04:00.000Z",
        updatedAt: "2026-07-08T03:04:20.000Z",
        lastRun: failedRun,
        history: [successRun, failedRun],
      },
    ],
    subagentRuns: [],
    commandRuns: [],
    runEvents: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

function traceMatches(trace, expected) {
  return Boolean(trace && Object.entries(expected).every(([key, value]) => trace[key] === value));
}

function sharedFieldsMatch(left, right, fields) {
  return Boolean(left && right && fields.every((field) => left[field] === right[field]));
}

async function paletteTrace(win, query, commandId, click = false) {
  return win.webContents.executeJavaScript(`
    (async function() {
      const fields = ${JSON.stringify(TRACE_FIELDS)};
      const suffix = ${JSON.stringify(TRACE_SUFFIX)};
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return null;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 280));
      const button = document.querySelector(${JSON.stringify(`.command-modal .command-list button[data-command-id="${commandId}"]`)});
      if (!button) {
        return {
          missing: true,
          commands: Array.from(document.querySelectorAll('.command-modal .command-list button')).slice(0, 20).map((item) => ({
            id: item.getAttribute('data-command-id'),
            target: item.getAttribute('data-command-target'),
            text: item.textContent,
          })),
        };
      }
      const trace = Object.fromEntries(fields.map((field) => [field, button.getAttribute('data-command-task-' + suffix[field]) || '']));
      const result = { id: button.getAttribute('data-command-id') || '', target: button.getAttribute('data-command-target') || '', text: button.textContent || '', trace };
      if (${click ? "true" : "false"}) {
        button.click();
      } else {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      }
      await new Promise((resolve) => setTimeout(resolve, 260));
      return result;
    })();
  `);
}

async function surfaceTrace(win, selector) {
  return win.webContents.executeJavaScript(`
    (function() {
      const fields = ${JSON.stringify(TRACE_FIELDS)};
      const suffix = ${JSON.stringify(TRACE_SUFFIX)};
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return null;
      return Object.fromEntries(fields.map((field) => [field, element.getAttribute('data-task-' + suffix[field]) || '']));
    })();
  `);
}

async function openTaskWorkbench(win) {
  await win.webContents.executeJavaScript(`
    (function() {
      const direct = document.querySelector('[data-tool="subagents"]');
      if (direct) {
        direct.click();
        return true;
      }
      const contextButton = Array.from(document.querySelectorAll('.workspace-context-button, button'))
        .find((item) => /\\u5b50\\u4ee3\\u7406|Subagent|\\u4efb\\u52a1/.test(item.textContent || ''));
      contextButton?.click();
      return Boolean(contextButton);
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

function assertCommandTrace(command) {
  const expectedProjectName = path.basename(PROJECT_DIR);
  const expected = {
    surface: "command-palette",
    kind: "automation",
    action: "copy-evidence",
    id: AUTOMATION_ID,
    runId: SUCCESS_RUN_ID,
    requestId: "",
    status: "succeeded",
    filter: "failed",
    projectName: expectedProjectName,
    projectPath: PROJECT_DIR,
    threadId: SESSION_ID,
    sessionId: SESSION_ID,
    archived: "false",
    historyCount: "2",
    artifactCount: "",
    hasEvidence: "true",
    trigger: "manual",
    code: "0",
    durationMs: "2640",
    startedAt: "2026-07-08T03:04:01.000Z",
    endedAt: "2026-07-08T03:04:03.640Z",
    updatedAt: "2026-07-08T03:04:20.000Z",
  };
  assertStep("PASS264_COMMAND_READY", Boolean(command && !command.missing));
  assertStep("PASS264_COMMAND_TARGET", command?.target === "clipboard");
  if (!traceMatches(command?.trace, expected)) {
    console.error("PASS264_COMMAND_TRACE_DEBUG", JSON.stringify(command?.trace, null, 2));
  }
  assertStep("PASS264_COMMAND_TRACE", Boolean(traceMatches(command?.trace, expected)));
}

writeInitialStore();
app.setPath("userData", USER_DATA_DIR);
require(path.join(REPO_DIR, "electron", "main.cjs"));

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS264_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  const copyCommandId = `automation-history-copy:${encodeURIComponent(SUCCESS_RUN_ID)}`;

  assertStep("PASS264_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS264_STORE_READY", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      const automation = state.automations?.find((item) => item.id === ${JSON.stringify(AUTOMATION_ID)});
      return Boolean(
        automation &&
        automation.history?.some((entry) => entry.id === ${JSON.stringify(SUCCESS_RUN_ID)}) &&
        automation.history?.some((entry) => entry.id === ${JSON.stringify(FAILED_RUN_ID)})
      );
    })();
  `));

  const command = await paletteTrace(win, SUCCESS_STDOUT, copyCommandId);
  assertCommandTrace(command);
  clipboard.writeText("");
  assertCommandTrace(await paletteTrace(win, SUCCESS_STDOUT, copyCommandId, true));
  assertStep("PASS264_COMMAND_COPIED_HISTORY_EVIDENCE", await waitForClipboard([
    PROMPT,
    SUCCESS_RUN_ID,
    SUCCESS_STDOUT,
    PROJECT_DIR,
    /Exit|退出|退出码|exit|命令/,
  ]));

  assertStep("PASS264_TASK_WORKBENCH_OPENED", await openTaskWorkbench(win));
  assertStep("PASS264_TASK_HISTORY_COPY_READY", await waitFor(win, `
    Boolean(document.querySelector('.automation-task-card[data-automation-id="${AUTOMATION_ID}"] [data-automation-history-action="copy"][data-task-run-id="${SUCCESS_RUN_ID}"]'))
  `, 10000));
  const taskCopy = await surfaceTrace(win, `.automation-task-card[data-automation-id="${AUTOMATION_ID}"] [data-automation-history-action="copy"][data-task-run-id="${SUCCESS_RUN_ID}"]`);
  const shared = TRACE_FIELDS.filter((field) => field !== "surface");
  assertStep("PASS264_TASK_HISTORY_TRACE_MATCH", Boolean(
    taskCopy?.surface === "task-center" &&
    sharedFieldsMatch(command.trace, taskCopy, shared)
  ));

  assertStep("PASS264_SCHEDULED_MODAL_OPENED", await openScheduledModal(win));
  assertStep("PASS264_SCHEDULED_HISTORY_COPY_READY", await waitFor(win, `
    Boolean(document.querySelector('.scheduled-modal .schedule-item[data-automation-id="${AUTOMATION_ID}"] [data-automation-history-action="copy"][data-task-run-id="${SUCCESS_RUN_ID}"]'))
  `, 10000));
  const scheduledCopy = await surfaceTrace(win, `.scheduled-modal .schedule-item[data-automation-id="${AUTOMATION_ID}"] [data-automation-history-action="copy"][data-task-run-id="${SUCCESS_RUN_ID}"]`);
  assertStep("PASS264_SCHEDULED_HISTORY_TRACE_MATCH", Boolean(
    scheduledCopy?.surface === "scheduled" &&
    sharedFieldsMatch(command.trace, scheduledCopy, shared)
  ));

  console.log("PASS264_AUTOMATION_HISTORY_COPY_COMMAND_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS264_FAILED", error?.stack || error);
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    const debug = await win.webContents.executeJavaScript(`
      (function() {
        return {
          commands: Array.from(document.querySelectorAll('.command-modal .command-list button')).slice(0, 25).map((item) => ({
            id: item.getAttribute('data-command-id'),
            target: item.getAttribute('data-command-target'),
            text: item.textContent,
            attrs: Object.fromEntries(Array.from(item.attributes).map((attr) => [attr.name, attr.value])),
          })),
          historyActions: Array.from(document.querySelectorAll('[data-automation-history-action]')).map((item) => ({
            text: item.textContent,
            attrs: Object.fromEntries(Array.from(item.attributes).map((attr) => [attr.name, attr.value])),
          })),
          body: document.body.textContent?.slice(0, 4000) || '',
        };
      })();
    `).catch((debugError) => ({ error: String(debugError?.stack || debugError) }));
    console.error("PASS264_DEBUG", JSON.stringify(debug, null, 2).slice(0, 20000));
    console.error("PASS264_CLIPBOARD", clipboard.readText());
  }
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS264_TIMEOUT");
  console.error("PASS264_CLIPBOARD", clipboard.readText());
  cleanup();
  app.exit(1);
}, 120000);
