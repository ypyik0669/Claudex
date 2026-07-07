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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass265-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass265-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const SESSION_ID = "pass265-session";
const AUTOMATION_ID = "pass265-automation";
const TARGET_RUN_ID = "pass265-history-target";
const LATEST_RUN_ID = "pass265-history-latest-failed";
const PROMPT = "PASS265 automation history focus command prompt";
const TARGET_STDOUT = "PASS265 target history stdout focus evidence";

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

function assertStep(name, ok) {
  console.log(name, ok);
  if (!ok) throw new Error(`${name} failed`);
}

function automationRun({ id, status, code, durationMs, summary, stdout, stderr = "" }) {
  return {
    id,
    trigger: "manual",
    status,
    startedAt: id === TARGET_RUN_ID ? "2026-07-08T03:05:01.000Z" : "2026-07-08T03:05:11.000Z",
    endedAt: id === TARGET_RUN_ID ? "2026-07-08T03:05:03.650Z" : "2026-07-08T03:05:15.000Z",
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass265-project" }), "utf8");
  const project = { name: "pass265-project", path: PROJECT_DIR };
  const targetRun = automationRun({
    id: TARGET_RUN_ID,
    status: "succeeded",
    code: 0,
    durationMs: 2650,
    summary: "PASS265 target history summary",
    stdout: TARGET_STDOUT,
  });
  const latestRun = automationRun({
    id: LATEST_RUN_ID,
    status: "failed",
    code: 5,
    durationMs: 2655,
    summary: "PASS265 latest failure summary",
    stdout: "PASS265 latest failed stdout",
    stderr: "PASS265 latest failed stderr",
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
        title: "PASS265 automation history focus command",
        project: project.name,
        projectPath: project.path,
        createdAt: "2026-07-08T03:05:00.000Z",
        updatedAt: "2026-07-08T03:05:00.000Z",
        messages: [],
      },
    ],
    automations: [
      {
        id: AUTOMATION_ID,
        prompt: PROMPT,
        schedule: { type: "once", runAt: "2026-07-08T04:05:00.000Z" },
        nextRun: "2026-07-08T04:05:00.000Z",
        project,
        threadId: SESSION_ID,
        enabled: true,
        status: "failed",
        createdAt: "2026-07-08T03:05:00.000Z",
        updatedAt: "2026-07-08T03:05:20.000Z",
        lastRun: latestRun,
        history: [targetRun, latestRun],
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
      return {
        trace: Object.fromEntries(fields.map((field) => [field, element.getAttribute('data-task-' + suffix[field]) || ''])),
        text: element.textContent || '',
        focused: element.classList.contains('focused-automation-history-run'),
        ariaCurrent: element.getAttribute('aria-current') || '',
        evidenceOpen: Boolean(element.querySelector('.automation-run-evidence-details[open]')),
      };
    })();
  `);
}

function assertCommandTrace(command) {
  const expectedProjectName = path.basename(PROJECT_DIR);
  assertStep("PASS265_COMMAND_READY", Boolean(command && !command.missing));
  assertStep("PASS265_COMMAND_TARGET", command?.target === "automation");
  assertStep("PASS265_COMMAND_TRACE", Boolean(traceMatches(command?.trace, {
    surface: "command-palette",
    kind: "automation",
    action: "open-history",
    id: AUTOMATION_ID,
    runId: TARGET_RUN_ID,
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
    durationMs: "2650",
    startedAt: "2026-07-08T03:05:01.000Z",
    endedAt: "2026-07-08T03:05:03.650Z",
    updatedAt: "2026-07-08T03:05:20.000Z",
  })));
}

writeInitialStore();
app.setPath("userData", USER_DATA_DIR);
require(path.join(REPO_DIR, "electron", "main.cjs"));

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS265_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  const focusCommandId = `automation-history:${encodeURIComponent(TARGET_RUN_ID)}`;

  assertStep("PASS265_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS265_STORE_READY", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      const automation = state.automations?.find((item) => item.id === ${JSON.stringify(AUTOMATION_ID)});
      return Boolean(
        automation &&
        automation.history?.some((entry) => entry.id === ${JSON.stringify(TARGET_RUN_ID)}) &&
        automation.history?.some((entry) => entry.id === ${JSON.stringify(LATEST_RUN_ID)})
      );
    })();
  `));

  const command = await paletteTrace(win, TARGET_STDOUT, focusCommandId);
  assertCommandTrace(command);
  assertCommandTrace(await paletteTrace(win, TARGET_STDOUT, focusCommandId, true));
  const rowSelector = `.automation-task-card[data-automation-id="${AUTOMATION_ID}"] [data-automation-history-run-id="${TARGET_RUN_ID}"]`;
  assertStep("PASS265_TASK_CENTER_FOCUSED_HISTORY_READY", await waitFor(win, `
    (function() {
      const card = document.querySelector('.automation-task-card[data-automation-id="${AUTOMATION_ID}"].focused-task-card');
      const row = document.querySelector(${JSON.stringify(rowSelector)});
      return Boolean(
        document.querySelector('.bottom-work-panel .subagent-workbench') &&
        document.querySelector('.task-center-filters [data-task-filter="failed"].active') &&
        card &&
        card.getAttribute('aria-current') === 'true' &&
        row &&
        row.classList.contains('focused-automation-history-run') &&
        row.getAttribute('aria-current') === 'true' &&
        row.querySelector('.automation-run-evidence-details[open]') &&
        /${TARGET_STDOUT}/.test(row.textContent || '')
      );
    })();
  `, 12000));

  const row = await surfaceTrace(win, rowSelector);
  const shared = TRACE_FIELDS.filter((field) => field !== "surface");
  assertStep("PASS265_HISTORY_ROW_TRACE_MATCH", Boolean(
    row?.trace?.surface === "task-center" &&
    row.focused &&
    row.ariaCurrent === "true" &&
    row.evidenceOpen &&
    sharedFieldsMatch(command.trace, row.trace, shared)
  ));

  const copyButton = await surfaceTrace(win, `${rowSelector} [data-automation-history-action="copy"]`);
  const timelineButton = await surfaceTrace(win, `${rowSelector} [data-automation-history-action="timeline"]`);
  assertStep("PASS265_HISTORY_ACTIONS_STILL_TRACE", Boolean(
    copyButton?.trace?.action === "copy-evidence" &&
    timelineButton?.trace?.action === "timeline" &&
    copyButton.trace.runId === TARGET_RUN_ID &&
    timelineButton.trace.runId === TARGET_RUN_ID &&
    copyButton.trace.projectPath === PROJECT_DIR &&
    timelineButton.trace.projectPath === PROJECT_DIR
  ));

  console.log("PASS265_AUTOMATION_HISTORY_FOCUS_COMMAND_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS265_FAILED", error?.stack || error);
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
          historyRows: Array.from(document.querySelectorAll('[data-automation-history-run-id]')).map((item) => ({
            text: item.textContent,
            focused: item.classList.contains('focused-automation-history-run'),
            attrs: Object.fromEntries(Array.from(item.attributes).map((attr) => [attr.name, attr.value])),
          })),
          body: document.body.textContent?.slice(0, 4000) || '',
        };
      })();
    `).catch((debugError) => ({ error: String(debugError?.stack || debugError) }));
    console.error("PASS265_DEBUG", JSON.stringify(debug, null, 2).slice(0, 20000));
  }
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS265_TIMEOUT");
  cleanup();
  app.exit(1);
}, 120000);
