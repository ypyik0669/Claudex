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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass263-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass263-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const SESSION_ID = "pass263-session";
const SUBAGENT_ID = "pass263-subagent";
const SUBAGENT_REQUEST_ID = "pass263-request";
const ARTIFACT_RELATIVE = "docs/pass263-artifact.md";
const ARTIFACT_FILE = path.join(PROJECT_DIR, ARTIFACT_RELATIVE);
const ARTIFACT_LABEL = "PASS263 Command Artifact";
const ARTIFACT_BODY = "pass263 direct command palette artifact body evidence";

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

function writeInitialStore() {
  fs.mkdirSync(path.dirname(ARTIFACT_FILE), { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass263-project" }), "utf8");
  fs.writeFileSync(ARTIFACT_FILE, `# PASS263 Artifact\n\n${ARTIFACT_BODY}`, "utf8");
  const project = { name: "pass263-project", path: PROJECT_DIR };
  const subagentRun = {
    id: SUBAGENT_ID,
    requestId: SUBAGENT_REQUEST_ID,
    nickname: "PASS263 Artifact Agent",
    task: "pass263 direct artifact command palette task",
    status: "done",
    sessionId: SESSION_ID,
    project,
    cwd: PROJECT_DIR,
    command: "claude",
    args: ["-p", "pass263 direct artifact command palette task", "--model", "claude-haiku-4-5-20251001"],
    stdout: "PASS263 subagent stdout",
    stderr: "",
    summary: "PASS263 subagent produced a command palette artifact",
    code: 0,
    durationMs: 2630,
    artifacts: [
      {
        label: ARTIFACT_LABEL,
        path: ARTIFACT_RELATIVE,
        projectPath: PROJECT_DIR,
        type: "markdown",
        content: ARTIFACT_BODY,
      },
    ],
    startedAt: "2026-07-08T03:03:00.000Z",
    endedAt: "2026-07-08T03:03:02.630Z",
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
        title: "PASS263 subagent artifact command trace",
        project: project.name,
        projectPath: project.path,
        createdAt: "2026-07-08T03:03:00.000Z",
        updatedAt: "2026-07-08T03:03:00.000Z",
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
          commands: Array.from(document.querySelectorAll('.command-modal .command-list button')).slice(0, 20).map((item) => ({
            id: item.getAttribute('data-command-id'),
            target: item.getAttribute('data-command-target'),
            text: item.textContent,
          })),
        };
      }
      const task = Object.fromEntries(taskFields.map((field) => [field, button.getAttribute('data-command-task-' + taskSuffix[field]) || '']));
      const artifact = Object.fromEntries(artifactFields.map((field) => [field, button.getAttribute('data-command-task-artifact-' + artifactSuffix[field]) || '']));
      const result = { id: button.getAttribute('data-command-id') || '', target: button.getAttribute('data-command-target') || '', text: button.textContent || '', task, artifact };
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

async function surfaceTrace(win, selector, command = false) {
  return win.webContents.executeJavaScript(`
    (function() {
      const taskFields = ${JSON.stringify(TASK_FIELDS)};
      const taskSuffix = ${JSON.stringify(TASK_SUFFIX)};
      const artifactFields = ${JSON.stringify(ARTIFACT_FIELDS)};
      const artifactSuffix = ${JSON.stringify(ARTIFACT_SUFFIX)};
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return null;
      const taskPrefix = ${command ? "'data-command-task-'" : "'data-task-'"};
      const artifactPrefix = ${command ? "'data-command-task-artifact-'" : "'data-task-artifact-'"};
      const task = Object.fromEntries(taskFields.map((field) => [field, element.getAttribute(taskPrefix + taskSuffix[field]) || '']));
      const artifact = Object.fromEntries(artifactFields.map((field) => [field, element.getAttribute(artifactPrefix + artifactSuffix[field]) || '']));
      return { task, artifact, text: element.textContent || '' };
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
        .find((item) => /\\u5b50\\u4ee3\\u7406|Subagent/.test(item.textContent || ''));
      contextButton?.click();
      return Boolean(contextButton);
    })();
  `);
  return waitFor(win, "Boolean(document.querySelector('.bottom-work-panel .subagent-workbench'))", 10000);
}

function assertArtifactCommand(name, command, action, target) {
  assertStep(`${name}_READY`, Boolean(command && !command.missing));
  assertStep(`${name}_TASK_TRACE`, Boolean(traceMatches(command?.task, {
    surface: "command-palette",
    kind: "subagent",
    action,
    id: SUBAGENT_ID,
    runId: SUBAGENT_REQUEST_ID,
    requestId: SUBAGENT_REQUEST_ID,
    status: "done",
    projectPath: PROJECT_DIR,
    sessionId: SESSION_ID,
    artifactCount: "1",
    hasEvidence: "true",
    code: "0",
    durationMs: "2630",
  })));
  assertStep(`${name}_ARTIFACT_TRACE`, Boolean(traceMatches(command?.artifact, {
    index: "0",
    label: ARTIFACT_LABEL,
    path: ARTIFACT_RELATIVE,
    projectPath: PROJECT_DIR,
    type: "markdown",
    openable: "true",
  })));
  assertStep(`${name}_TARGET`, command?.target === target);
}

writeInitialStore();
app.setPath("userData", USER_DATA_DIR);
require(path.join(REPO_DIR, "electron", "main.cjs"));

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS263_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  const openCommandId = `subagent-artifact-open:${encodeURIComponent(SUBAGENT_ID)}:0`;
  const copyCommandId = `subagent-artifact-copy:${encodeURIComponent(SUBAGENT_ID)}:0`;

  assertStep("PASS263_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS263_STORE_READY", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      const run = state.subagentRuns?.find((item) => item.id === ${JSON.stringify(SUBAGENT_ID)});
      return Boolean(run && run.artifacts?.[0]?.path === ${JSON.stringify(ARTIFACT_RELATIVE)});
    })();
  `));

  const openCommand = await paletteTrace(win, ARTIFACT_BODY, openCommandId);
  assertArtifactCommand("PASS263_OPEN_COMMAND", openCommand, "artifact-open", "workspace");
  const copyCommand = await paletteTrace(win, ARTIFACT_BODY, copyCommandId);
  assertArtifactCommand("PASS263_COPY_COMMAND", copyCommand, "artifact-copy", "clipboard");

  assertArtifactCommand("PASS263_CLICK_OPEN_COMMAND", await paletteTrace(win, ARTIFACT_BODY, openCommandId, true), "artifact-open", "workspace");
  assertStep("PASS263_ARTIFACT_FILE_OPENED_FROM_COMMAND", await waitFor(win, `
    (async function() {
      const activeTool = document.querySelector('.tool-row.active')?.textContent || '';
      const textarea = document.querySelector('.workspace-detail textarea[aria-label="${ARTIFACT_RELATIVE}"]');
      const state = await window.claudexDesktop.getState();
      return /\\u5de5\\u4f5c\\u533a|Workspace/.test(activeTool) &&
        Boolean(textarea) &&
        /${ARTIFACT_BODY}/.test(textarea.value || '') &&
        state.sourceRefs?.some((source) => source.path === ${JSON.stringify(ARTIFACT_RELATIVE)} && source.project?.path === ${JSON.stringify(PROJECT_DIR)});
    })();
  `, 12000));

  clipboard.writeText("");
  assertArtifactCommand("PASS263_CLICK_COPY_COMMAND", await paletteTrace(win, ARTIFACT_BODY, copyCommandId, true), "artifact-copy", "clipboard");
  assertStep("PASS263_ARTIFACT_COPIED_FROM_COMMAND", await waitForClipboard([ARTIFACT_LABEL, ARTIFACT_BODY, ARTIFACT_RELATIVE]));

  assertStep("PASS263_TASK_WORKBENCH_OPENED", await openTaskWorkbench(win));
  assertStep("PASS263_TASK_ARTIFACT_ACTIONS_READY", await waitFor(win, `
    Boolean(
      document.querySelector('.subagent-run-card[data-subagent-run-id="${SUBAGENT_ID}"] [data-subagent-artifact-open="0"]') &&
      document.querySelector('.subagent-run-card[data-subagent-run-id="${SUBAGENT_ID}"] [data-subagent-artifact-copy="0"]')
    )
  `, 10000));
  const taskOpen = await surfaceTrace(win, `.subagent-run-card[data-subagent-run-id="${SUBAGENT_ID}"] [data-subagent-artifact-open="0"]`);
  const taskCopy = await surfaceTrace(win, `.subagent-run-card[data-subagent-run-id="${SUBAGENT_ID}"] [data-subagent-artifact-copy="0"]`);
  const sharedTaskFields = ["kind", "action", "id", "runId", "requestId", "status", "projectPath", "sessionId", "artifactCount", "hasEvidence", "code", "durationMs"];
  assertStep("PASS263_TASK_ARTIFACT_TRACE_MATCH", Boolean(
    taskOpen?.task?.surface === "task-center" &&
    taskCopy?.task?.surface === "task-center" &&
    sharedFieldsMatch(openCommand.task, taskOpen.task, sharedTaskFields) &&
    sharedFieldsMatch(copyCommand.task, taskCopy.task, sharedTaskFields) &&
    sharedFieldsMatch(openCommand.artifact, taskOpen.artifact, ARTIFACT_FIELDS) &&
    sharedFieldsMatch(copyCommand.artifact, taskCopy.artifact, ARTIFACT_FIELDS)
  ));

  assertStep("PASS263_OPEN_TIMELINE_FROM_COMMAND", await paletteTrace(win, ARTIFACT_BODY, `subagent-run:${encodeURIComponent(SUBAGENT_REQUEST_ID)}`, true).then((command) => Boolean(command && !command.missing)));
  assertStep("PASS263_TIMELINE_ARTIFACT_ACTIONS_READY", await waitFor(win, `
    Boolean(
      document.querySelector('.selected-run-evidence-panel [data-run-timeline-artifact-open="0"]') &&
      document.querySelector('.selected-run-evidence-panel [data-run-timeline-artifact-copy="0"]')
    )
  `, 12000));
  const timelineOpen = await surfaceTrace(win, `.selected-run-evidence-panel [data-run-timeline-artifact-open="0"]`);
  const timelineCopy = await surfaceTrace(win, `.selected-run-evidence-panel [data-run-timeline-artifact-copy="0"]`);
  const timelineTaskFields = ["kind", "action", "id", "runId", "requestId", "projectPath", "sessionId", "artifactCount", "hasEvidence", "code", "durationMs"];
  assertStep("PASS263_TIMELINE_ARTIFACT_TRACE_MATCH", Boolean(
    timelineOpen?.task?.surface === "timeline" &&
    timelineCopy?.task?.surface === "timeline" &&
    sharedFieldsMatch(openCommand.task, timelineOpen.task, timelineTaskFields) &&
    sharedFieldsMatch(copyCommand.task, timelineCopy.task, timelineTaskFields) &&
    sharedFieldsMatch(openCommand.artifact, timelineOpen.artifact, ARTIFACT_FIELDS) &&
    sharedFieldsMatch(copyCommand.artifact, timelineCopy.artifact, ARTIFACT_FIELDS)
  ));

  console.log("PASS263_SUBAGENT_ARTIFACT_COMMAND_TRACE_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS263_FAILED", error?.stack || error);
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
          taskArtifacts: Array.from(document.querySelectorAll('[data-subagent-artifact-open], [data-subagent-artifact-copy], [data-run-timeline-artifact-open], [data-run-timeline-artifact-copy]')).map((item) => ({
            text: item.textContent,
            attrs: Object.fromEntries(Array.from(item.attributes).map((attr) => [attr.name, attr.value])),
          })),
          editor: document.querySelector('.workspace-detail')?.textContent || '',
          body: document.body.textContent?.slice(0, 4000) || '',
        };
      })();
    `).catch((debugError) => ({ error: String(debugError?.stack || debugError) }));
    console.error("PASS263_DEBUG", JSON.stringify(debug, null, 2).slice(0, 20000));
    console.error("PASS263_CLIPBOARD", clipboard.readText());
  }
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS263_TIMEOUT");
  console.error("PASS263_CLIPBOARD", clipboard.readText());
  cleanup();
  app.exit(1);
}, 120000);
