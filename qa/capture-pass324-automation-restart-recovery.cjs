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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass324-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass324-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass324-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE_COMMAND = path.join(FAKE_BIN_DIR, process.platform === "win32" ? "claude.cmd" : "claude");
const UNEXPECTED_RUN_MARKER = path.join(PROJECT_DIR, "pass324-must-not-run.txt");
const AUTOMATION_ID = "pass324-stale-automation";
const RUN_ID = "pass324-stale-run";
const SESSION_ID = "pass324-session";
const STALE_RUNTIME_OWNER = "pass324-dead-runtime";
const SUBAGENT_RUN_ID = "pass324-stale-subagent-run";
const SUBAGENT_REQUEST_ID = "pass324-stale-subagent-request";
const WORKSPACE_REQUEST_ID = "workspace_pass324_stale_command";

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_DIR]) {
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

function writeFakeClaude() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  const script = `
const fs = require('fs');
const args = process.argv.slice(2);
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value) + '\\n'); }
if (args[0] === '--version') {
  out('claude fake pass324');
  process.exit(0);
}
if (args[0] === 'auth') {
  out({ loggedIn: true, apiProvider: 'qa', authMethod: 'api_key' });
  process.exit(0);
}
if (args[0] === '-p') {
  fs.writeFileSync(${JSON.stringify(UNEXPECTED_RUN_MARKER)}, 'stale automation was restarted', 'utf8');
  out({ result: 'pass324 unexpected run', session_id: 'pass324-unexpected-session' });
  process.exit(0);
}
out({ result: 'pass324 generic ok', session_id: 'pass324-generic-session' });
`;
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), script, "utf8");
  fs.writeFileSync(
    path.join(FAKE_BIN_DIR, "claude.cmd"),
    `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`,
    "utf8",
  );
  const posixShim = path.join(FAKE_BIN_DIR, "claude");
  fs.writeFileSync(posixShim, `#!/bin/sh\nexec node "$(dirname "$0")/fake-claude.cjs" "$@"\n`, "utf8");
  fs.chmodSync(posixShim, 0o755);
}

function writeInitialStore() {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass324-project" }), "utf8");
  writeFakeClaude();
  const project = { name: "pass324-project", path: PROJECT_DIR };
  const createdAt = "2026-07-15T00:00:00.000Z";
  const startedAt = "2026-07-15T00:01:00.000Z";
  const prompt = "pass324 stale scheduled automation";
  const runningEntry = {
    id: RUN_ID,
    trigger: "scheduled",
    status: "running",
    startedAt,
    endedAt: "",
    durationMs: 0,
    sessionId: SESSION_ID,
    detail: "",
    error: "",
    summary: "",
    stdout: "pass324 partial stdout",
    stderr: "pass324 partial stderr",
    code: null,
    artifacts: [],
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
      systemPrompt: "PASS324 QA",
      claudeCode: {
        executionMode: "claude-code",
        claudeCommand: FAKE_CLAUDE_COMMAND,
        permissionMode: "default",
      },
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
        id: SESSION_ID,
        title: "PASS324 interrupted automation",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt,
        updatedAt: startedAt,
        messages: [
          {
            role: "user",
            content: prompt,
            createdAt: startedAt,
            automationId: AUTOMATION_ID,
            automationRunId: RUN_ID,
          },
        ],
      },
    ],
    automations: [
      {
        id: AUTOMATION_ID,
        prompt,
        enabled: true,
        status: "running",
        project,
        threadId: SESSION_ID,
        schedule: { type: "once", runAt: "2000-01-01T00:00:00.000Z" },
        history: [runningEntry],
        lastRun: runningEntry,
        createdAt,
        updatedAt: startedAt,
      },
    ],
    commandRuns: [],
    runEvents: [
      {
        id: RUN_ID,
        type: "automation",
        status: "running",
        title: "Automation: pass324 stale scheduled automation",
        detail: "scheduled",
        cwd: PROJECT_DIR,
        stdout: "pass324 partial stdout",
        stderr: "pass324 partial stderr",
        project,
        sessionId: SESSION_ID,
        code: null,
        durationMs: 0,
        createdAt: startedAt,
      },
      {
        id: SUBAGENT_REQUEST_ID,
        type: "subagent",
        status: "running",
        title: "Subagent: pass324 stale subagent",
        detail: "pass324 stale subagent",
        cwd: PROJECT_DIR,
        project,
        sessionId: SESSION_ID,
        code: null,
        durationMs: 0,
        createdAt: startedAt,
        runtimeOwner: STALE_RUNTIME_OWNER,
      },
      {
        id: WORKSPACE_REQUEST_ID,
        type: "workspace-command",
        status: "running",
        title: "Workspace: pass324 stale command",
        detail: PROJECT_DIR,
        commandLine: "node pass324-stale-command.cjs",
        cwd: PROJECT_DIR,
        project,
        sessionId: WORKSPACE_REQUEST_ID,
        code: null,
        durationMs: 0,
        createdAt: startedAt,
        runtimeOwner: STALE_RUNTIME_OWNER,
      },
    ],
    notices: [],
    subagentRuns: [
      {
        id: SUBAGENT_RUN_ID,
        requestId: SUBAGENT_REQUEST_ID,
        nickname: "PASS324 stale subagent",
        task: "pass324 stale subagent task",
        status: "running",
        sessionId: SESSION_ID,
        project,
        cwd: PROJECT_DIR,
        command: FAKE_CLAUDE_COMMAND,
        args: ["-p", "pass324 stale subagent task"],
        stdout: "pass324 partial subagent stdout",
        stderr: "",
        summary: "",
        code: null,
        durationMs: 0,
        startedAt,
        endedAt: "",
        artifacts: [],
        runtimeOwner: STALE_RUNTIME_OWNER,
      },
    ],
    sourceRefs: [],
    browserVisits: [],
  });
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

async function openTaskCenter(win) {
  const clicked = await win.webContents.executeJavaScript(`
    (function() {
      if (document.querySelector('.subagent-workbench')) return true;
      const button =
        document.querySelector('button[data-context-tab="subagents"]') ||
        document.querySelector('button[data-bottom-tab="subagents"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
  if (!clicked) return false;
  return waitFor(win, "Boolean(document.querySelector('.subagent-workbench'))", 5000);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS324_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });

  assertStep("PASS324_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS324_STALE_RUN_RECOVERED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const automation = state.automations?.find((item) => item.id === ${JSON.stringify(AUTOMATION_ID)});
      const entry = automation?.history?.find((item) => item.id === ${JSON.stringify(RUN_ID)});
      const event = state.runEvents?.find((item) => item.id === ${JSON.stringify(RUN_ID)});
      const session = state.sessions?.find((item) => item.id === ${JSON.stringify(SESSION_ID)});
      const messages = session?.messages?.filter((message) => message.automationRunId === ${JSON.stringify(RUN_ID)} && message.role === 'error') || [];
      return Boolean(
        automation?.status === 'failed' &&
        automation.enabled === false &&
        entry?.status === 'failed' &&
        entry.code === null &&
        entry.endedAt &&
        /\u4e2d\u65ad/.test(entry.stderr || '') &&
        event?.status === 'error' &&
        event.code === null &&
        /\u4e2d\u65ad/.test(event.stderr || '') &&
        messages.length === 1 &&
        /\u4e2d\u65ad/.test(messages[0].content || '')
      );
    })();
  `, 7000));
  assertStep("PASS324_LOCAL_RUNS_RECOVERED", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      const subagent = state.subagentRuns?.find((item) => item.id === ${JSON.stringify(SUBAGENT_RUN_ID)});
      const subagentEvent = state.runEvents?.find((item) => item.id === ${JSON.stringify(SUBAGENT_REQUEST_ID)});
      const workspaceEvent = state.runEvents?.find((item) => item.id === ${JSON.stringify(WORKSPACE_REQUEST_ID)});
      return Boolean(
        subagent?.status === 'error' &&
        subagent.code === null &&
        subagent.endedAt &&
        !subagent.runtimeOwner &&
        /\u4e2d\u65ad/.test(subagent.stderr || '') &&
        subagentEvent?.status === 'error' &&
        subagentEvent.code === null &&
        !subagentEvent.runtimeOwner &&
        workspaceEvent?.status === 'error' &&
        workspaceEvent.code === null &&
        !workspaceEvent.runtimeOwner &&
        /\u4e2d\u65ad/.test(workspaceEvent.stderr || '')
      );
    })();
  `));

  assertStep("PASS324_OPEN_TASK_CENTER", await openTaskCenter(win));
  assertStep("PASS324_TERMINAL_UI_ACTIONS", await waitFor(win, `
    (function() {
      const card = document.querySelector('.automation-task-card[data-automation-id="${AUTOMATION_ID}"]');
      const run = card?.querySelector('[data-automation-task-action="run-now"]');
      const stop = card?.querySelector('[data-automation-task-action="cancel"]');
      const del = card?.querySelector('[data-automation-task-action="delete"]');
      return Boolean(card?.classList.contains('failed') && run && !run.disabled && !stop && del && !del.disabled);
    })();
  `, 5000));

  assertStep("PASS324_CANCEL_REJECTS_TERMINAL_RUN", await win.webContents.executeJavaScript(`
    (async function() {
      try {
        await window.claudexDesktop.cancelAutomation({
          automationId: ${JSON.stringify(AUTOMATION_ID)},
          runId: ${JSON.stringify(RUN_ID)}
        });
        return false;
      } catch (error) {
        return /AUTOMATION_NOT_RUNNING/.test(String(error?.message || error));
      }
    })();
  `));

  await wait(3500);
  assertStep("PASS324_SCHEDULER_DID_NOT_RESTART_STALE_RUN", !fs.existsSync(UNEXPECTED_RUN_MARKER));
  assertStep("PASS324_RECOVERY_PERSISTED_ONCE", (() => {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    const automation = parsed.automations?.find((item) => item.id === AUTOMATION_ID);
    const entries = automation?.history?.filter((entry) => entry.id === RUN_ID) || [];
    const event = parsed.runEvents?.find((item) => item.id === RUN_ID);
    const subagent = parsed.subagentRuns?.find((item) => item.id === SUBAGENT_RUN_ID);
    const subagentEvent = parsed.runEvents?.find((item) => item.id === SUBAGENT_REQUEST_ID);
    const workspaceEvent = parsed.runEvents?.find((item) => item.id === WORKSPACE_REQUEST_ID);
    const session = parsed.sessions?.find((item) => item.id === SESSION_ID);
    const messages = session?.messages?.filter((message) => message.automationRunId === RUN_ID && message.role === "error") || [];
    return automation?.status === "failed" &&
      automation.enabled === false &&
      entries.length === 1 &&
      entries[0].status === "failed" &&
      entries[0].code === null &&
      event?.status === "error" &&
      event.code === null &&
      subagent?.status === "error" &&
      subagent.code === null &&
      subagent.endedAt &&
      !subagent.runtimeOwner &&
      subagentEvent?.status === "error" &&
      subagentEvent.code === null &&
      workspaceEvent?.status === "error" &&
      workspaceEvent.code === null &&
      messages.length === 1;
  })());

  console.log("PASS324_AUTOMATION_RESTART_RECOVERY_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS324_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS324_TIMEOUT");
  cleanup();
  app.exit(1);
}, 45000);
