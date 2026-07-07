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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass257-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass257-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const SESSION_ID = "pass257-session";
const AUTOMATION_ID = "pass257-automation";
const AUTOMATION_RUN_ID = "pass257-automation-history-run";
const SUBAGENT_ID = "pass257-subagent";
const SUBAGENT_REQUEST_ID = "pass257-subagent-request";
const ARTIFACT_PATH = "pass257-artifact.md";

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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass257-project" }), "utf8");
  fs.writeFileSync(path.join(PROJECT_DIR, ARTIFACT_PATH), "# PASS257 artifact\n", "utf8");

  const project = { name: "pass257-project", path: PROJECT_DIR };
  const automationRun = {
    id: AUTOMATION_RUN_ID,
    trigger: "manual",
    status: "succeeded",
    startedAt: "2026-07-08T02:57:01.000Z",
    endedAt: "2026-07-08T02:57:04.000Z",
    durationMs: 2570,
    sessionId: SESSION_ID,
    code: 0,
    detail: "PASS257 automation history detail",
    summary: "PASS257 automation history summary",
    stdout: "PASS257 automation stdout",
    stderr: "",
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
        title: "PASS257 artifact scheduled trace context",
        project: project.name,
        projectPath: project.path,
        createdAt: "2026-07-08T02:57:00.000Z",
        updatedAt: "2026-07-08T02:57:00.000Z",
        messages: [],
      },
    ],
    automations: [
      {
        id: AUTOMATION_ID,
        prompt: "PASS257 scheduled modal history trace prompt",
        schedule: { type: "once", runAt: "2026-07-08T03:57:00.000Z" },
        project,
        threadId: SESSION_ID,
        enabled: false,
        status: "succeeded",
        createdAt: "2026-07-08T02:57:00.000Z",
        updatedAt: "2026-07-08T02:57:09.000Z",
        lastRun: automationRun,
        history: [automationRun],
      },
    ],
    subagentRuns: [
      {
        id: SUBAGENT_ID,
        requestId: SUBAGENT_REQUEST_ID,
        nickname: "PASS257 Artifact Agent",
        task: "PASS257 failed subagent artifact trace task",
        status: "error",
        sessionId: SESSION_ID,
        project,
        cwd: PROJECT_DIR,
        command: "claude",
        args: ["-p", "PASS257 failed subagent artifact trace task"],
        stdout: "PASS257 subagent stdout",
        stderr: "PASS257 subagent stderr",
        summary: "PASS257 subagent summary",
        code: 4,
        durationMs: 4444,
        artifacts: [
          {
            type: "file",
            label: "PASS257 artifact file",
            path: ARTIFACT_PATH,
            projectPath: PROJECT_DIR,
            content: "# PASS257 artifact",
          },
          {
            type: "summary",
            label: "PASS257 summary artifact",
            content: "PASS257 summary artifact content",
          },
        ],
        startedAt: "2026-07-08T02:56:00.000Z",
        endedAt: "2026-07-08T02:56:05.000Z",
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
        projectPath: element.getAttribute('data-task-project-path') || '',
        threadId: element.getAttribute('data-task-thread-id') || '',
        sessionId: element.getAttribute('data-task-session-id') || '',
        archived: element.getAttribute('data-task-archived') || '',
        artifactCount: element.getAttribute('data-task-artifact-count') || '',
        hasEvidence: element.getAttribute('data-task-has-evidence') || '',
        code: element.getAttribute('data-task-code') || '',
        durationMs: element.getAttribute('data-task-duration-ms') || '',
        artifactIndex: element.getAttribute('data-task-artifact-index') || '',
        artifactLabel: element.getAttribute('data-task-artifact-label') || '',
        artifactPath: element.getAttribute('data-task-artifact-path') || '',
        artifactProjectPath: element.getAttribute('data-task-artifact-project-path') || '',
        artifactType: element.getAttribute('data-task-artifact-type') || '',
        artifactOpenable: element.getAttribute('data-task-artifact-openable') || '',
        runEventId: element.getAttribute('data-run-event-id') || '',
        runEvidenceSource: element.getAttribute('data-run-evidence-source') || '',
        runEventProjectPath: element.getAttribute('data-run-event-project-path') || '',
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
  if (!win) throw new Error("PASS257_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS257_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS257_STORE_READY", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      return Boolean(
        state.automations?.some((item) => item.id === ${JSON.stringify(AUTOMATION_ID)}) &&
        state.subagentRuns?.some((item) => item.id === ${JSON.stringify(SUBAGENT_ID)})
      );
    })();
  `));

  assertStep("PASS257_WORKBENCH_OPENED", await openTaskWorkbench(win));
  assertStep("PASS257_ARTIFACTS_READY", await waitFor(win, `
    Boolean(
      document.querySelector('.subagent-run-card[data-subagent-run-id="${SUBAGENT_ID}"] [data-subagent-artifact-open="0"]') &&
      document.querySelector('.subagent-run-card[data-subagent-run-id="${SUBAGENT_ID}"] [data-subagent-artifact-copy="1"]')
    )
  `));

  const workbenchArtifactActions = await tracesForSelectors(win, [
    { key: "artifactOpen", selector: `.subagent-run-card[data-subagent-run-id="${SUBAGENT_ID}"] [data-subagent-artifact-open="0"]` },
    { key: "artifactCopy", selector: `.subagent-run-card[data-subagent-run-id="${SUBAGENT_ID}"] [data-subagent-artifact-copy="1"]` },
  ]);
  const subagentBase = {
    surface: "task-center",
    kind: "subagent",
    id: SUBAGENT_ID,
    runId: SUBAGENT_REQUEST_ID,
    requestId: SUBAGENT_REQUEST_ID,
    status: "error",
    filter: "failed",
    projectPath: PROJECT_DIR,
    sessionId: SESSION_ID,
    artifactCount: "2",
    code: "4",
  };
  assertStep("PASS257_WORKBENCH_ARTIFACT_ACTION_TRACE", Boolean(
    traceMatches(workbenchArtifactActions.artifactOpen, {
      ...subagentBase,
      action: "artifact-open",
      artifactIndex: "0",
      artifactLabel: "PASS257 artifact file",
      artifactPath: ARTIFACT_PATH,
      artifactProjectPath: PROJECT_DIR,
      artifactType: "file",
      artifactOpenable: "true",
    }) &&
    traceMatches(workbenchArtifactActions.artifactCopy, {
      ...subagentBase,
      action: "artifact-copy",
      artifactIndex: "1",
      artifactLabel: "PASS257 summary artifact",
      artifactPath: "",
      artifactProjectPath: PROJECT_DIR,
      artifactType: "summary",
      artifactOpenable: "false",
    }),
  ));

  await win.webContents.executeJavaScript(`
    (function() {
      document.querySelector('.subagent-run-card[data-subagent-run-id="${SUBAGENT_ID}"] [data-subagent-run-action="timeline"]')?.click();
      return true;
    })();
  `);
  assertStep("PASS257_TIMELINE_ARTIFACTS_READY", await waitFor(win, `
    Boolean(
      document.querySelector('.selected-run-evidence-panel') &&
      document.querySelector('[data-run-timeline-artifact-open="0"]') &&
      document.querySelector('[data-run-timeline-artifact-copy="1"]')
    )
  `));
  const timelineArtifactActions = await tracesForSelectors(win, [
    { key: "artifactOpen", selector: `[data-run-timeline-artifact-open="0"]` },
    { key: "artifactCopy", selector: `[data-run-timeline-artifact-copy="1"]` },
  ]);
  assertStep("PASS257_TIMELINE_ARTIFACT_ACTION_TRACE", Boolean(
    traceMatches(timelineArtifactActions.artifactOpen, {
      ...subagentBase,
      surface: "timeline",
      action: "artifact-open",
      artifactIndex: "0",
      artifactLabel: "PASS257 artifact file",
      artifactPath: ARTIFACT_PATH,
      artifactProjectPath: PROJECT_DIR,
      artifactType: "file",
      artifactOpenable: "true",
      runEventId: SUBAGENT_REQUEST_ID,
      runEvidenceSource: "subagent",
      runEventProjectPath: PROJECT_DIR,
    }) &&
    traceMatches(timelineArtifactActions.artifactCopy, {
      ...subagentBase,
      surface: "timeline",
      action: "artifact-copy",
      artifactIndex: "1",
      artifactLabel: "PASS257 summary artifact",
      artifactPath: "",
      artifactProjectPath: PROJECT_DIR,
      artifactType: "summary",
      artifactOpenable: "false",
      runEventId: SUBAGENT_REQUEST_ID,
      runEvidenceSource: "subagent",
      runEventProjectPath: PROJECT_DIR,
    }),
  ));

  assertStep("PASS257_SCHEDULED_MODAL_OPENED", await openScheduledModal(win));
  assertStep("PASS257_SCHEDULED_HISTORY_READY", await waitFor(win, `
    (function() {
      const summary = document.querySelector('.scheduled-modal .schedule-history summary');
      if (!summary) return false;
      if (!document.querySelector('.scheduled-modal .schedule-history[open]')) summary.click();
      return Boolean(
        document.querySelector('.scheduled-modal .schedule-history [data-automation-history-action="copy"]') &&
        document.querySelector('.scheduled-modal .schedule-history [data-automation-history-action="timeline"]')
      );
    })();
  `));
  const scheduledHistoryActions = await tracesForSelectors(win, [
    { key: "copy", selector: `.scheduled-modal .schedule-history [data-automation-history-action="copy"]` },
    { key: "timeline", selector: `.scheduled-modal .schedule-history [data-automation-history-action="timeline"]` },
  ]);
  const automationHistoryBase = {
    surface: "scheduled",
    kind: "automation",
    id: AUTOMATION_ID,
    runId: AUTOMATION_RUN_ID,
    requestId: "",
    status: "succeeded",
    filter: "",
    projectPath: PROJECT_DIR,
    threadId: SESSION_ID,
    sessionId: SESSION_ID,
    code: "0",
    durationMs: "2570",
  };
  assertStep("PASS257_SCHEDULED_HISTORY_ACTION_TRACE", Boolean(
    traceMatches(scheduledHistoryActions.copy, { ...automationHistoryBase, action: "copy-evidence" }) &&
    traceMatches(scheduledHistoryActions.timeline, { ...automationHistoryBase, action: "timeline" }),
  ));

  console.log("PASS257_ARTIFACT_SCHEDULED_TRACE_CONTEXT_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS257_FAILED", error?.stack || error);
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    const debug = await win.webContents.executeJavaScript(`
      (function() {
        return {
          subagentArtifacts: Array.from(document.querySelectorAll('[data-subagent-artifact-open], [data-subagent-artifact-copy], [data-run-timeline-artifact-open], [data-run-timeline-artifact-copy]')).map((item) => ({
            attrs: Object.fromEntries(Array.from(item.attributes).map((attr) => [attr.name, attr.value])),
          })),
          scheduledHistory: Array.from(document.querySelectorAll('.scheduled-modal [data-automation-history-action]')).map((item) => ({
            attrs: Object.fromEntries(Array.from(item.attributes).map((attr) => [attr.name, attr.value])),
          })),
          body: document.body.textContent?.slice(0, 2000) || '',
        };
      })();
    `).catch((debugError) => ({ error: String(debugError?.stack || debugError) }));
    console.error("PASS257_DEBUG", JSON.stringify(debug, null, 2).slice(0, 16000));
  }
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS257_TIMEOUT");
  cleanup();
  app.exit(1);
}, 100000);
