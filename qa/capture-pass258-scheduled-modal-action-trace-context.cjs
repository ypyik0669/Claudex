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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass258-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass258-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const SESSION_ID = "pass258-session";
const ENABLED_AUTOMATION_ID = "pass258-automation-enabled";
const ENABLED_RUN_ID = "pass258-enabled-run";
const PAUSED_AUTOMATION_ID = "pass258-automation-paused";
const PAUSED_RUN_ID = "pass258-paused-run";

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

function automationRun({ id, status, code, durationMs, detail }) {
  return {
    id,
    trigger: "manual",
    status,
    startedAt: "2026-07-08T02:58:01.000Z",
    endedAt: "2026-07-08T02:58:04.000Z",
    durationMs,
    sessionId: SESSION_ID,
    code,
    detail,
    summary: detail,
    stdout: `${detail} stdout`,
    stderr: "",
  };
}

function writeInitialStore() {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass258-project" }), "utf8");

  const project = { name: "pass258-project", path: PROJECT_DIR };
  const enabledRun = automationRun({
    id: ENABLED_RUN_ID,
    status: "succeeded",
    code: 0,
    durationMs: 2580,
    detail: "PASS258 enabled automation detail",
  });
  const pausedRun = automationRun({
    id: PAUSED_RUN_ID,
    status: "failed",
    code: 5,
    durationMs: 2585,
    detail: "PASS258 paused automation failure",
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
        title: "PASS258 scheduled action trace context",
        project: project.name,
        projectPath: project.path,
        createdAt: "2026-07-08T02:58:00.000Z",
        updatedAt: "2026-07-08T02:58:00.000Z",
        messages: [],
      },
    ],
    automations: [
      {
        id: ENABLED_AUTOMATION_ID,
        prompt: "PASS258 enabled scheduled automation",
        schedule: { type: "once", runAt: "2099-07-08T03:58:00.000Z" },
        nextRun: "2099-07-08T03:58:00.000Z",
        project,
        threadId: SESSION_ID,
        enabled: true,
        status: "scheduled",
        createdAt: "2026-07-08T02:58:00.000Z",
        updatedAt: "2026-07-08T02:58:09.000Z",
        lastRun: enabledRun,
        history: [enabledRun],
      },
      {
        id: PAUSED_AUTOMATION_ID,
        prompt: "PASS258 paused scheduled automation",
        schedule: { type: "once", runAt: "2099-07-08T04:58:00.000Z" },
        nextRun: "2099-07-08T04:58:00.000Z",
        project,
        threadId: SESSION_ID,
        enabled: false,
        status: "paused",
        createdAt: "2026-07-08T02:58:00.000Z",
        updatedAt: "2026-07-08T02:58:19.000Z",
        lastRun: pausedRun,
        history: [pausedRun],
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

async function tracesForSelectors(win, specs) {
  return win.webContents.executeJavaScript(`
    (function() {
      const specs = ${JSON.stringify(specs)};
      const readTrace = (element) => element ? ({
        surface: element.getAttribute('data-task-surface') || '',
        kind: element.getAttribute('data-task-kind') || '',
        action: element.getAttribute('data-task-action') || '',
        id: element.getAttribute('data-task-id') || '',
        runId: element.getAttribute('data-task-run-id') || '',
        requestId: element.getAttribute('data-task-request-id') || '',
        status: element.getAttribute('data-task-status') || '',
        filter: element.getAttribute('data-task-filter') || '',
        projectName: element.getAttribute('data-task-project-name') || '',
        projectPath: element.getAttribute('data-task-project-path') || '',
        threadId: element.getAttribute('data-task-thread-id') || '',
        sessionId: element.getAttribute('data-task-session-id') || '',
        archived: element.getAttribute('data-task-archived') || '',
        historyCount: element.getAttribute('data-task-history-count') || '',
        artifactCount: element.getAttribute('data-task-artifact-count') || '',
        hasEvidence: element.getAttribute('data-task-has-evidence') || '',
        trigger: element.getAttribute('data-task-trigger') || '',
        code: element.getAttribute('data-task-code') || '',
        durationMs: element.getAttribute('data-task-duration-ms') || '',
        updatedAt: element.getAttribute('data-task-updated-at') || '',
        disabled: element.disabled ? 'true' : 'false',
        text: element.textContent || '',
      }) : null;
      return Object.fromEntries(specs.map((spec) => [spec.key, readTrace(document.querySelector(spec.selector))]));
    })();
  `);
}

function traceMatches(trace, expected) {
  return Boolean(trace && Object.entries(expected).every(([key, value]) => trace[key] === value));
}

writeInitialStore();
app.setPath("userData", USER_DATA_DIR);
require(path.join(REPO_DIR, "electron", "main.cjs"));

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS258_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS258_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS258_STORE_READY", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      return Boolean(
        state.automations?.some((item) => item.id === ${JSON.stringify(ENABLED_AUTOMATION_ID)}) &&
        state.automations?.some((item) => item.id === ${JSON.stringify(PAUSED_AUTOMATION_ID)})
      );
    })();
  `));
  assertStep("PASS258_SCHEDULED_MODAL_OPENED", await openScheduledModal(win));
  assertStep("PASS258_ACTIONS_READY", await waitFor(win, `
    Boolean(
      document.querySelector('.scheduled-modal .schedule-item[data-automation-id="${ENABLED_AUTOMATION_ID}"] [data-automation-schedule-action="run-now"]') &&
      document.querySelector('.scheduled-modal .schedule-item[data-automation-id="${ENABLED_AUTOMATION_ID}"] [data-automation-schedule-action="pause"]') &&
      document.querySelector('.scheduled-modal .schedule-item[data-automation-id="${ENABLED_AUTOMATION_ID}"] [data-automation-schedule-action="copy-evidence"]') &&
      document.querySelector('.scheduled-modal .schedule-item[data-automation-id="${ENABLED_AUTOMATION_ID}"] [data-automation-schedule-action="timeline"]') &&
      document.querySelector('.scheduled-modal .schedule-item[data-automation-id="${ENABLED_AUTOMATION_ID}"] [data-automation-schedule-action="delete"]') &&
      document.querySelector('.scheduled-modal .schedule-item[data-automation-id="${PAUSED_AUTOMATION_ID}"] [data-automation-schedule-action="resume"]')
    )
  `));

  const traces = await tracesForSelectors(win, [
    { key: "enabledRunNow", selector: `.scheduled-modal .schedule-item[data-automation-id="${ENABLED_AUTOMATION_ID}"] [data-automation-schedule-action="run-now"]` },
    { key: "enabledPause", selector: `.scheduled-modal .schedule-item[data-automation-id="${ENABLED_AUTOMATION_ID}"] [data-automation-schedule-action="pause"]` },
    { key: "enabledCopy", selector: `.scheduled-modal .schedule-item[data-automation-id="${ENABLED_AUTOMATION_ID}"] [data-automation-schedule-action="copy-evidence"]` },
    { key: "enabledTimeline", selector: `.scheduled-modal .schedule-item[data-automation-id="${ENABLED_AUTOMATION_ID}"] [data-automation-schedule-action="timeline"]` },
    { key: "enabledDelete", selector: `.scheduled-modal .schedule-item[data-automation-id="${ENABLED_AUTOMATION_ID}"] [data-automation-schedule-action="delete"]` },
    { key: "pausedResume", selector: `.scheduled-modal .schedule-item[data-automation-id="${PAUSED_AUTOMATION_ID}"] [data-automation-schedule-action="resume"]` },
    { key: "pausedRunNow", selector: `.scheduled-modal .schedule-item[data-automation-id="${PAUSED_AUTOMATION_ID}"] [data-automation-schedule-action="run-now"]` },
    { key: "pausedDelete", selector: `.scheduled-modal .schedule-item[data-automation-id="${PAUSED_AUTOMATION_ID}"] [data-automation-schedule-action="delete"]` },
  ]);

  const enabledBase = {
    surface: "scheduled",
    kind: "automation",
    id: ENABLED_AUTOMATION_ID,
    runId: ENABLED_RUN_ID,
    requestId: "",
    status: "succeeded",
    filter: "active",
    projectPath: PROJECT_DIR,
    threadId: SESSION_ID,
    sessionId: SESSION_ID,
    archived: "false",
    historyCount: "1",
    hasEvidence: "true",
    trigger: "manual",
    code: "0",
    durationMs: "2580",
    updatedAt: "2026-07-08T02:58:09.000Z",
  };
  const pausedBase = {
    surface: "scheduled",
    kind: "automation",
    id: PAUSED_AUTOMATION_ID,
    runId: PAUSED_RUN_ID,
    requestId: "",
    status: "failed",
    filter: "failed",
    projectPath: PROJECT_DIR,
    threadId: SESSION_ID,
    sessionId: SESSION_ID,
    archived: "false",
    historyCount: "1",
    hasEvidence: "true",
    trigger: "manual",
    code: "5",
    durationMs: "2585",
    updatedAt: "2026-07-08T02:58:19.000Z",
  };

  assertStep("PASS258_ENABLED_SCHEDULE_ACTION_TRACE", Boolean(
    traceMatches(traces.enabledRunNow, { ...enabledBase, action: "run-now" }) &&
    traceMatches(traces.enabledPause, { ...enabledBase, action: "pause" }) &&
    traceMatches(traces.enabledCopy, { ...enabledBase, action: "copy-evidence" }) &&
    traceMatches(traces.enabledTimeline, { ...enabledBase, action: "timeline" }) &&
    traceMatches(traces.enabledDelete, { ...enabledBase, action: "delete" }),
  ));
  assertStep("PASS258_PAUSED_SCHEDULE_ACTION_TRACE", Boolean(
    traceMatches(traces.pausedResume, { ...pausedBase, action: "resume" }) &&
    traceMatches(traces.pausedRunNow, { ...pausedBase, action: "run-now" }) &&
    traceMatches(traces.pausedDelete, { ...pausedBase, action: "delete" }),
  ));

  console.log("PASS258_SCHEDULED_MODAL_ACTION_TRACE_CONTEXT_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS258_FAILED", error?.stack || error);
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    const debug = await win.webContents.executeJavaScript(`
      (function() {
        return {
          actions: Array.from(document.querySelectorAll('.scheduled-modal [data-automation-schedule-action]')).map((item) => ({
            attrs: Object.fromEntries(Array.from(item.attributes).map((attr) => [attr.name, attr.value])),
          })),
          body: document.body.textContent?.slice(0, 2000) || '',
        };
      })();
    `).catch((debugError) => ({ error: String(debugError?.stack || debugError) }));
    console.error("PASS258_DEBUG", JSON.stringify(debug, null, 2).slice(0, 16000));
  }
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS258_TIMEOUT");
  cleanup();
  app.exit(1);
}, 100000);
