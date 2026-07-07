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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass267-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass267-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const SESSION_ID = "pass267-session";
const SUBAGENT_ID = "pass267-subagent";
const SUBAGENT_REQUEST_ID = "pass267-request";
const ARTIFACT_RELATIVE = "docs/pass267-timeline-artifact.md";
const ARTIFACT_FILE = path.join(PROJECT_DIR, ARTIFACT_RELATIVE);
const ARTIFACT_LABEL = "PASS267 Timeline Artifact";
const ARTIFACT_BODY = "pass267 timeline artifact command palette evidence";

const TASK_FIELDS = [
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
const TASK_SUFFIX = {
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
const ARTIFACT_FIELDS = ["index", "label", "path", "projectPath", "type", "openable"];
const ARTIFACT_SUFFIX = {
  index: "index",
  label: "label",
  path: "path",
  projectPath: "project-path",
  type: "type",
  openable: "openable",
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

function writeInitialStore() {
  fs.mkdirSync(path.dirname(ARTIFACT_FILE), { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass267-project" }), "utf8");
  fs.writeFileSync(ARTIFACT_FILE, `# PASS267 Artifact\n\n${ARTIFACT_BODY}`, "utf8");
  const project = { name: "pass267-project", path: PROJECT_DIR };
  const subagentRun = {
    id: SUBAGENT_ID,
    requestId: SUBAGENT_REQUEST_ID,
    nickname: "PASS267 Timeline Agent",
    task: "pass267 focus subagent artifact in run timeline",
    status: "done",
    sessionId: SESSION_ID,
    project,
    cwd: PROJECT_DIR,
    command: "claude",
    args: ["-p", "pass267 focus subagent artifact in run timeline", "--model", "claude-haiku-4-5-20251001"],
    stdout: "PASS267 subagent stdout",
    stderr: "",
    summary: "PASS267 subagent produced timeline focusable artifact",
    code: 0,
    durationMs: 2670,
    artifacts: [
      {
        label: ARTIFACT_LABEL,
        path: ARTIFACT_RELATIVE,
        projectPath: PROJECT_DIR,
        type: "markdown",
        content: ARTIFACT_BODY,
      },
      {
        label: "PASS267 Secondary Timeline Artifact",
        type: "summary",
        content: "pass267 secondary timeline artifact should not be focused",
      },
    ],
    startedAt: "2026-07-08T03:07:00.000Z",
    endedAt: "2026-07-08T03:07:02.670Z",
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
        title: "PASS267 subagent artifact timeline focus command",
        project: project.name,
        projectPath: project.path,
        createdAt: "2026-07-08T03:07:00.000Z",
        updatedAt: "2026-07-08T03:07:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    runEvents: [],
    automations: [],
    subagentRuns: [subagentRun],
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
      const taskFields = ${JSON.stringify(TASK_FIELDS)};
      const taskSuffix = ${JSON.stringify(TASK_SUFFIX)};
      const artifactFields = ${JSON.stringify(ARTIFACT_FIELDS)};
      const artifactSuffix = ${JSON.stringify(ARTIFACT_SUFFIX)};
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
          commands: Array.from(document.querySelectorAll('.command-modal .command-list button')).slice(0, 25).map((item) => ({
            id: item.getAttribute('data-command-id'),
            target: item.getAttribute('data-command-target'),
            text: item.textContent,
          })),
        };
      }
      const task = Object.fromEntries(taskFields.map((field) => [field, button.getAttribute('data-command-task-' + taskSuffix[field]) || '']));
      const artifact = Object.fromEntries(artifactFields.map((field) => [field, button.getAttribute('data-command-task-artifact-' + artifactSuffix[field]) || '']));
      const result = {
        id: button.getAttribute('data-command-id') || '',
        target: button.getAttribute('data-command-target') || '',
        runEventId: button.getAttribute('data-run-event-id') || '',
        runEvidenceSource: button.getAttribute('data-run-evidence-source') || '',
        text: button.textContent || '',
        task,
        artifact,
      };
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
      const taskFields = ${JSON.stringify(TASK_FIELDS)};
      const taskSuffix = ${JSON.stringify(TASK_SUFFIX)};
      const artifactFields = ${JSON.stringify(ARTIFACT_FIELDS)};
      const artifactSuffix = ${JSON.stringify(ARTIFACT_SUFFIX)};
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return null;
      const task = Object.fromEntries(taskFields.map((field) => [field, element.getAttribute('data-task-' + taskSuffix[field]) || '']));
      const artifact = Object.fromEntries(artifactFields.map((field) => [field, element.getAttribute('data-task-artifact-' + artifactSuffix[field]) || '']));
      return {
        task,
        artifact,
        runEventId: element.getAttribute('data-run-event-id') || '',
        runEvidenceSource: element.getAttribute('data-run-evidence-source') || '',
        text: element.textContent || '',
        focused: element.classList.contains('focused-run-timeline-artifact'),
        ariaCurrent: element.getAttribute('aria-current') || '',
        timelineFocused: element.getAttribute('data-run-timeline-artifact-focused') || '',
      };
    })();
  `);
}

function assertTimelineArtifactCommand(command) {
  const expectedProjectName = path.basename(PROJECT_DIR);
  assertStep("PASS267_COMMAND_READY", Boolean(command && !command.missing));
  assertStep("PASS267_COMMAND_TARGET", command?.target === "timeline");
  assertStep("PASS267_COMMAND_RUN_TRACE", command?.runEventId === SUBAGENT_REQUEST_ID && command?.runEvidenceSource === "subagent");
  assertStep("PASS267_COMMAND_TASK_TRACE", Boolean(traceMatches(command?.task, {
    surface: "command-palette",
    kind: "subagent",
    action: "artifact-focus",
    id: SUBAGENT_ID,
    runId: SUBAGENT_REQUEST_ID,
    requestId: SUBAGENT_REQUEST_ID,
    status: "ok",
    projectName: expectedProjectName,
    projectPath: PROJECT_DIR,
    sessionId: SESSION_ID,
    archived: "false",
    artifactCount: "2",
    hasEvidence: "true",
    code: "0",
    durationMs: "2670",
    startedAt: "2026-07-08T03:07:02.670Z",
  })));
  assertStep("PASS267_COMMAND_ARTIFACT_TRACE", Boolean(traceMatches(command?.artifact, {
    index: "0",
    label: ARTIFACT_LABEL,
    path: ARTIFACT_RELATIVE,
    projectPath: PROJECT_DIR,
    type: "markdown",
    openable: "true",
  })));
}

writeInitialStore();
app.setPath("userData", USER_DATA_DIR);
require(path.join(REPO_DIR, "electron", "main.cjs"));

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS267_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  const timelineCommandId = `subagent-artifact-timeline:${encodeURIComponent(SUBAGENT_ID)}:0`;

  assertStep("PASS267_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS267_STORE_READY", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      const run = state.subagentRuns?.find((item) => item.id === ${JSON.stringify(SUBAGENT_ID)});
      return Boolean(run && run.artifacts?.length === 2 && run.artifacts[0]?.path === ${JSON.stringify(ARTIFACT_RELATIVE)});
    })();
  `));

  const command = await paletteTrace(win, `timeline ${ARTIFACT_BODY}`, timelineCommandId);
  assertTimelineArtifactCommand(command);
  assertTimelineArtifactCommand(await paletteTrace(win, `timeline ${ARTIFACT_BODY}`, timelineCommandId, true));

  const rowSelector = `.selected-run-evidence-panel .subagent-artifact-item[data-run-timeline-artifact-index="0"]`;
  assertStep("PASS267_TIMELINE_FOCUSED_ARTIFACT_READY", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.bottom-work-panel .selected-run-evidence-panel[data-run-event-id="${SUBAGENT_REQUEST_ID}"]');
      const row = document.querySelector(${JSON.stringify(rowSelector)});
      const other = document.querySelector('.selected-run-evidence-panel .subagent-artifact-item[data-run-timeline-artifact-index="1"]');
      return Boolean(
        panel &&
        panel.getAttribute('data-run-evidence-source') === 'subagent' &&
        row &&
        row.classList.contains('focused-run-timeline-artifact') &&
        row.getAttribute('aria-current') === 'true' &&
        row.getAttribute('data-run-timeline-artifact-focused') === 'true' &&
        /${ARTIFACT_BODY}/.test(row.textContent || '') &&
        other &&
        !other.classList.contains('focused-run-timeline-artifact') &&
        document.querySelector('.selected-run-evidence-panel [data-run-timeline-artifact-open="0"]') &&
        document.querySelector('.selected-run-evidence-panel [data-run-timeline-artifact-copy="0"]')
      );
    })();
  `, 12000));

  const row = await surfaceTrace(win, rowSelector);
  const openButton = await surfaceTrace(win, `${rowSelector} [data-run-timeline-artifact-open="0"]`);
  const copyButton = await surfaceTrace(win, `${rowSelector} [data-run-timeline-artifact-copy="0"]`);
  const sharedTaskFields = ["kind", "action", "id", "runId", "requestId", "projectName", "projectPath", "sessionId", "archived", "artifactCount", "hasEvidence", "code", "durationMs", "startedAt"];
  assertStep("PASS267_ARTIFACT_ROW_TRACE_MATCH", Boolean(
    row?.task?.surface === "timeline" &&
    row.focused &&
    row.ariaCurrent === "true" &&
    row.timelineFocused === "true" &&
    row.runEventId === command.runEventId &&
    row.runEvidenceSource === command.runEvidenceSource &&
    sharedFieldsMatch(command.task, row.task, sharedTaskFields) &&
    sharedFieldsMatch(command.artifact, row.artifact, ARTIFACT_FIELDS)
  ));
  assertStep("PASS267_TIMELINE_ARTIFACT_ACTION_TRACES_STILL_WORK", Boolean(
    openButton?.task?.action === "artifact-open" &&
    copyButton?.task?.action === "artifact-copy" &&
    openButton?.runEventId === SUBAGENT_REQUEST_ID &&
    copyButton?.runEventId === SUBAGENT_REQUEST_ID &&
    sharedFieldsMatch(command.artifact, openButton.artifact, ARTIFACT_FIELDS) &&
    sharedFieldsMatch(command.artifact, copyButton.artifact, ARTIFACT_FIELDS) &&
    openButton.task.id === SUBAGENT_ID &&
    copyButton.task.id === SUBAGENT_ID
  ));

  console.log("PASS267_SUBAGENT_ARTIFACT_TIMELINE_FOCUS_COMMAND_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS267_FAILED", error?.stack || error);
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
          artifacts: Array.from(document.querySelectorAll('.subagent-artifact-item')).map((item) => ({
            text: item.textContent,
            focused: item.classList.contains('focused-run-timeline-artifact'),
            attrs: Object.fromEntries(Array.from(item.attributes).map((attr) => [attr.name, attr.value])),
          })),
          body: document.body.textContent?.slice(0, 4000) || '',
        };
      })();
    `).catch((debugError) => ({ error: String(debugError?.stack || debugError) }));
    console.error("PASS267_DEBUG", JSON.stringify(debug, null, 2).slice(0, 20000));
  }
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS267_TIMEOUT");
  cleanup();
  app.exit(1);
}, 120000);
