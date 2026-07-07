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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass254-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass254-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const AUTOMATION_ID = "pass254-automation";
const AUTOMATION_RUN_ID = "pass254-automation-run";
const SUBAGENT_ID = "pass254-subagent";
const SUBAGENT_REQUEST_ID = "pass254-subagent-request";

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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass254-project" }), "utf8");
  const project = { name: "pass254-project", path: PROJECT_DIR };
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
        id: "pass254-session",
        title: "PASS254 task trace context",
        project: project.name,
        projectPath: project.path,
        createdAt: "2026-07-08T02:54:00.000Z",
        updatedAt: "2026-07-08T02:54:00.000Z",
        messages: [],
      },
    ],
    automations: [
      {
        id: AUTOMATION_ID,
        prompt: "PASS254 failed automation trace prompt",
        schedule: { type: "once", runAt: "2026-07-08T02:54:00.000Z" },
        project,
        threadId: "pass254-session",
        enabled: false,
        status: "failed",
        createdAt: "2026-07-08T02:54:00.000Z",
        updatedAt: "2026-07-08T02:54:09.000Z",
        lastRun: {
          id: AUTOMATION_RUN_ID,
          trigger: "manual",
          status: "failed",
          startedAt: "2026-07-08T02:54:01.000Z",
          endedAt: "2026-07-08T02:54:04.000Z",
          durationMs: 3456,
          sessionId: "pass254-session",
          code: 7,
          detail: "PASS254 automation failure detail",
          summary: "PASS254 automation failure summary",
          stdout: "PASS254 automation stdout",
          stderr: "PASS254 automation stderr",
        },
        history: [],
      },
    ],
    subagentRuns: [
      {
        id: SUBAGENT_ID,
        requestId: SUBAGENT_REQUEST_ID,
        nickname: "PASS254 Failed Agent",
        task: "PASS254 failed subagent trace task",
        status: "error",
        sessionId: "pass254-session",
        project,
        cwd: PROJECT_DIR,
        command: "claude",
        args: ["-p", "PASS254 failed subagent trace task"],
        stdout: "PASS254 subagent stdout",
        stderr: "PASS254 subagent stderr",
        summary: "PASS254 subagent summary",
        code: 2,
        durationMs: 2222,
        artifacts: [
          { type: "stderr", label: "PASS254 stderr artifact", content: "PASS254 artifact content" },
        ],
        startedAt: "2026-07-08T02:53:00.000Z",
        endedAt: "2026-07-08T02:53:05.000Z",
      },
    ],
    commandRuns: [],
    runEvents: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

async function paletteCommandTrace(win, query, expectedId) {
  return win.webContents.executeJavaScript(`
    (async function() {
      if (!document.querySelector('.command-modal')) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 220));
      }
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return null;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 260));
      const button = document.querySelector(${JSON.stringify(`.command-modal .command-list button[data-command-id="${expectedId}"]`)});
      if (!button) return null;
      return {
        id: button.getAttribute('data-command-id') || '',
        target: button.getAttribute('data-command-target') || '',
        kind: button.getAttribute('data-command-task-kind') || '',
        action: button.getAttribute('data-command-task-action') || '',
        taskId: button.getAttribute('data-command-task-id') || '',
        runId: button.getAttribute('data-command-task-run-id') || '',
        requestId: button.getAttribute('data-command-task-request-id') || '',
        status: button.getAttribute('data-command-task-status') || '',
        filter: button.getAttribute('data-command-task-filter') || '',
        projectName: button.getAttribute('data-command-task-project-name') || '',
        projectPath: button.getAttribute('data-command-task-project-path') || '',
        threadId: button.getAttribute('data-command-task-thread-id') || '',
        sessionId: button.getAttribute('data-command-task-session-id') || '',
        archived: button.getAttribute('data-command-task-archived') || '',
        historyCount: button.getAttribute('data-command-task-history-count') || '',
        artifactCount: button.getAttribute('data-command-task-artifact-count') || '',
        hasEvidence: button.getAttribute('data-command-task-has-evidence') || '',
        trigger: button.getAttribute('data-command-task-trigger') || '',
        code: button.getAttribute('data-command-task-code') || '',
        durationMs: button.getAttribute('data-command-task-duration-ms') || '',
        startedAt: button.getAttribute('data-command-task-started-at') || '',
        endedAt: button.getAttribute('data-command-task-ended-at') || '',
        text: button.textContent || '',
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
  if (!win) throw new Error("PASS254_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS254_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS254_STORE_READY", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      return Boolean(
        state.automations?.some((item) => item.id === ${JSON.stringify(AUTOMATION_ID)}) &&
        state.subagentRuns?.some((item) => item.id === ${JSON.stringify(SUBAGENT_ID)})
      );
    })();
  `));

  const automation = await paletteCommandTrace(win, "PASS254 failed automation trace prompt", `automation:${AUTOMATION_ID}`);
  assertStep("PASS254_AUTOMATION_COMMAND_TRACE", Boolean(automation &&
    automation.target === "automation" &&
    automation.kind === "automation" &&
    automation.action === "open" &&
    automation.taskId === AUTOMATION_ID &&
    automation.runId === AUTOMATION_RUN_ID &&
    automation.status === "failed" &&
    automation.filter === "failed" &&
    /pass254-project/.test(automation.projectName) &&
    automation.projectPath === PROJECT_DIR &&
    automation.threadId === "pass254-session" &&
    automation.sessionId === "pass254-session" &&
    automation.historyCount === "1" &&
    automation.hasEvidence === "true" &&
    automation.trigger === "manual" &&
    automation.code === "7" &&
    automation.durationMs === "3456"));

  const automationRun = await paletteCommandTrace(win, "PASS254 automation failure summary", `automation-run:${AUTOMATION_RUN_ID}`);
  assertStep("PASS254_AUTOMATION_RUN_COMMAND_TRACE", Boolean(automationRun &&
    automationRun.target === "timeline" &&
    automationRun.kind === "automation" &&
    automationRun.action === "timeline" &&
    automationRun.taskId === AUTOMATION_ID &&
    automationRun.runId === AUTOMATION_RUN_ID &&
    automationRun.status === "failed" &&
    automationRun.filter === "failed" &&
    automationRun.projectPath === PROJECT_DIR &&
    automationRun.sessionId === "pass254-session" &&
    automationRun.hasEvidence === "true" &&
    automationRun.trigger === "manual" &&
    automationRun.code === "7"));

  const automationCopy = await paletteCommandTrace(win, "copy PASS254 automation failure summary", `automation-recovery:copy:${AUTOMATION_RUN_ID}`);
  assertStep("PASS254_AUTOMATION_COPY_COMMAND_TRACE", Boolean(automationCopy &&
    automationCopy.target === "clipboard" &&
    automationCopy.kind === "automation" &&
    automationCopy.action === "copy" &&
    automationCopy.taskId === AUTOMATION_ID &&
    automationCopy.runId === AUTOMATION_RUN_ID &&
    automationCopy.status === "failed" &&
    automationCopy.filter === "failed" &&
    automationCopy.hasEvidence === "true"));

  const subagent = await paletteCommandTrace(win, "PASS254 Failed Agent", `subagent:${SUBAGENT_ID}`);
  assertStep("PASS254_SUBAGENT_COMMAND_TRACE", Boolean(subagent &&
    subagent.target === "subagent" &&
    subagent.kind === "subagent" &&
    subagent.action === "open" &&
    subagent.taskId === SUBAGENT_ID &&
    subagent.runId === SUBAGENT_REQUEST_ID &&
    subagent.requestId === SUBAGENT_REQUEST_ID &&
    subagent.status === "error" &&
    subagent.filter === "failed" &&
    /pass254-project/.test(subagent.projectName) &&
    subagent.projectPath === PROJECT_DIR &&
    subagent.sessionId === "pass254-session" &&
    subagent.artifactCount === "1" &&
    subagent.hasEvidence === "true" &&
    subagent.code === "2" &&
    subagent.durationMs === "2222" &&
    subagent.archived === "false"));

  const subagentRun = await paletteCommandTrace(win, "PASS254 subagent summary", `subagent-run:${SUBAGENT_REQUEST_ID}`);
  assertStep("PASS254_SUBAGENT_RUN_COMMAND_TRACE", Boolean(subagentRun &&
    subagentRun.target === "timeline" &&
    subagentRun.kind === "subagent" &&
    subagentRun.action === "timeline" &&
    subagentRun.taskId === SUBAGENT_ID &&
    subagentRun.runId === SUBAGENT_REQUEST_ID &&
    subagentRun.status === "error" &&
    subagentRun.filter === "failed" &&
    subagentRun.projectPath === PROJECT_DIR &&
    subagentRun.artifactCount === "1" &&
    subagentRun.hasEvidence === "true"));

  const subagentContinue = await paletteCommandTrace(win, "continue PASS254 Failed Agent", `subagent-recovery:continue:${SUBAGENT_ID}`);
  assertStep("PASS254_SUBAGENT_CONTINUE_COMMAND_TRACE", Boolean(subagentContinue &&
    subagentContinue.target === "subagent-action" &&
    subagentContinue.kind === "subagent" &&
    subagentContinue.action === "continue" &&
    subagentContinue.taskId === SUBAGENT_ID &&
    subagentContinue.runId === SUBAGENT_REQUEST_ID &&
    subagentContinue.status === "error" &&
    subagentContinue.filter === "failed" &&
    subagentContinue.hasEvidence === "true"));

  console.log("PASS254_COMMAND_PALETTE_TASK_TRACE_CONTEXT_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS254_FAILED", error?.stack || error);
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    const debug = await win.webContents.executeJavaScript(`
      (function() {
        return Array.from(document.querySelectorAll('.command-modal .command-list button')).slice(0, 12).map((button) => ({
          text: button.textContent,
          attrs: Object.fromEntries(Array.from(button.attributes).map((attr) => [attr.name, attr.value])),
        }));
      })();
    `).catch((debugError) => ({ error: String(debugError?.stack || debugError) }));
    console.error("PASS254_DEBUG", JSON.stringify(debug, null, 2).slice(0, 16000));
  }
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS254_TIMEOUT");
  cleanup();
  app.exit(1);
}, 100000);
