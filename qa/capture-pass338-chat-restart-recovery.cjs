const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", (error) => {
    if (error?.code !== "EPIPE") throw error;
  });
}

function findRepoDir() {
  const candidates = [process.env.CLAUDEX_REPO_DIR, process.cwd(), __dirname, path.join(__dirname, "..")].filter(Boolean);
  for (const candidate of candidates) {
    let current = path.resolve(candidate);
    while (current && current !== path.dirname(current)) {
      if (fs.existsSync(path.join(current, "package.json")) && fs.existsSync(path.join(current, "electron", "main.cjs"))) return current;
      current = path.dirname(current);
    }
  }
  throw new Error("Unable to locate Claudex repo root");
}

const REPO_DIR = findRepoDir();
process.chdir(REPO_DIR);
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass338-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass338-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass338-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE_COMMAND = path.join(FAKE_BIN_DIR, process.platform === "win32" ? "claude.cmd" : "claude");
const UNEXPECTED_PROMPT_MARKER = path.join(PROJECT_DIR, "pass338-unexpected-prompt.txt");
const INTERRUPTED_MESSAGE = "Claudex 上次退出时，聊天回复已中断。";
const STALE_SESSION_ID = "pass338-stale-session";
const COMPLETED_SESSION_ID = "pass338-completed-session";
const CANCELLED_SESSION_ID = "pass338-cancelled-session";
const ERROR_SESSION_ID = "pass338-error-session";
const STALE_REQUEST_ID = "pass338-stale-request";
const COMPLETED_REQUEST_ID = "pass338-completed-request";
const CANCELLED_REQUEST_ID = "pass338-cancelled-request";
const ERROR_REQUEST_ID = "pass338-error-request";
const STALE_TOOL_ID = "toolu_pass338_stale";
const COMPLETED_TOOL_ID = "toolu_pass338_completed";
const ERROR_TOOL_ID = "toolu_pass338_error";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_DIR]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_error) {
      // Best-effort cleanup for Windows file-handle races.
    }
  }
}

async function exitWithCleanup(code) {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win.isDestroyed()) win.destroy();
    } catch (_error) {
      // Best-effort teardown.
    }
  }
  await wait(250);
  cleanup();
  app.exit(code);
}

async function waitFor(win, script, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const value = await win.webContents.executeJavaScript(script);
      if (value) return value;
    } catch (_error) {
      // Renderer can be between reload contexts.
    }
    await wait(120);
  }
  return false;
}

async function reloadWindow(win) {
  await win.webContents.reload();
  return waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000);
}

function readPersistedStore() {
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function assertStep(name, ok) {
  console.log(name, ok);
  if (!ok) throw new Error(`${name} failed`);
}

function writeFakeClaude() {
  const script = `
const fs = require('fs');
const args = process.argv.slice(2);
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value) + '\\n'); }
if (args[0] === '-p') {
  fs.writeFileSync(${JSON.stringify(UNEXPECTED_PROMPT_MARKER)}, 'stale chat was restarted', 'utf8');
  out({ type: 'result', result: 'unexpected pass338 chat run', session_id: 'pass338-unexpected-session' });
} else if (args[0] === '--version') {
  out('2.10.0 (Claude Code PASS338)');
} else if (args[0] === 'auth' && args[1] === 'status') {
  out({ loggedIn: true, apiProvider: 'pass338-provider', authMethod: 'api_key' });
} else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) {
  out([]);
} else if (args[0] === 'plugin' && args[1] === 'list') {
  out('Installed plugins: none');
} else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) {
  out([]);
} else if (args[0] === 'mcp' && args[1] === 'list') {
  out('No MCP servers configured');
} else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) {
  out([]);
} else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') {
  out('Configured marketplaces: none');
} else {
  out('pass338 generic');
}
`;
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), script, "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  const posixShim = path.join(FAKE_BIN_DIR, "claude");
  fs.writeFileSync(posixShim, `#!/bin/sh\nexec node "$(dirname "$0")/fake-claude.cjs" "$@"\n`, "utf8");
  fs.chmodSync(posixShim, 0o755);
}

function chatEvent({ id, sessionId, title, detail, steps = [] }) {
  return {
    id,
    type: "chat",
    status: "running",
    title,
    detail,
    cwd: PROJECT_DIR,
    project: { name: "pass338-project", path: PROJECT_DIR },
    sessionId,
    code: null,
    durationMs: 0,
    createdAt: "2026-07-15T00:01:00.000Z",
    steps,
  };
}

function writeInitialStore() {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass338-project" }), "utf8");
  writeFakeClaude();
  const project = { name: "pass338-project", path: PROJECT_DIR };
  const createdAt = "2026-07-15T00:00:00.000Z";
  const startedAt = "2026-07-15T00:01:00.000Z";
  fs.writeFileSync(DATA_FILE, JSON.stringify({
    version: 1,
    settings: {
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      baseUrl: "https://api.example.invalid",
      temperature: 0.2,
      timeoutMs: 600000,
      language: "zh",
      appearance: { fontSize: "compact", density: "compact" },
      systemPrompt: "PASS338 QA",
      claudeCode: { executionMode: "claude-code", claudeCommand: FAKE_CLAUDE_COMMAND, permissionMode: "default" },
      capabilities: { "project-context": true, "terminal-helper": true, "mcp-runtime": true, "plugin-router": true, "marketplace-router": true },
      customMarketplaces: [],
      apiKeys: {},
    },
    activeProject: project,
    projects: [project],
    sessions: [
      {
        id: STALE_SESSION_ID,
        title: "PASS338 stale chat",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt,
        updatedAt: startedAt,
        messages: [{ role: "user", content: "pass338 interrupted chat", requestId: STALE_REQUEST_ID, createdAt: startedAt }],
      },
      {
        id: COMPLETED_SESSION_ID,
        title: "PASS338 completed chat",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt,
        updatedAt: startedAt,
        messages: [
          { role: "user", content: "pass338 already completed", requestId: COMPLETED_REQUEST_ID, createdAt: startedAt },
          { role: "assistant", content: "pass338 persisted terminal answer", requestId: COMPLETED_REQUEST_ID, createdAt: "2026-07-15T00:01:01.000Z" },
        ],
      },
      {
        id: CANCELLED_SESSION_ID,
        title: "PASS338 cancelled chat",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt,
        updatedAt: startedAt,
        messages: [
          { role: "user", content: "pass338 already cancelled", requestId: CANCELLED_REQUEST_ID, createdAt: startedAt },
          { role: "cancelled", content: "已停止本次回复。", requestId: CANCELLED_REQUEST_ID, createdAt: "2026-07-15T00:01:01.000Z" },
        ],
      },
      {
        id: ERROR_SESSION_ID,
        title: "PASS338 error chat",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt,
        updatedAt: startedAt,
        messages: [
          { role: "user", content: "pass338 already errored", requestId: ERROR_REQUEST_ID, createdAt: startedAt },
          { role: "error", content: "pass338 persisted terminal error", requestId: ERROR_REQUEST_ID, createdAt: "2026-07-15T00:01:01.000Z" },
        ],
      },
    ],
    automations: [],
    commandRuns: [],
    runEvents: [
      chatEvent({
        id: STALE_REQUEST_ID,
        sessionId: STALE_SESSION_ID,
        title: "Chat: PASS338 stale chat",
        detail: "pass338 interrupted chat",
        steps: [
          { id: STALE_TOOL_ID, toolUseId: STALE_TOOL_ID, toolName: "Bash", title: "Bash", status: "running", input: "echo pass338", createdAt: startedAt },
          { id: "toolu_pass338_finished", toolUseId: "toolu_pass338_finished", toolName: "Read", title: "Read", status: "ok", input: "README.md", output: "pass338 completed tool", createdAt: startedAt, endedAt: "2026-07-15T00:01:00.500Z" },
        ],
      }),
      chatEvent({
        id: COMPLETED_REQUEST_ID,
        sessionId: "pass338-missing-session",
        title: "Chat: PASS338 completed chat",
        detail: "pass338 already completed",
        steps: [{ id: COMPLETED_TOOL_ID, toolUseId: COMPLETED_TOOL_ID, toolName: "Read", title: "Read", status: "running", input: "README.md", createdAt: startedAt }],
      }),
      chatEvent({
        id: CANCELLED_REQUEST_ID,
        sessionId: CANCELLED_SESSION_ID,
        title: "Chat: PASS338 cancelled chat",
        detail: "pass338 already cancelled",
        steps: [],
      }),
      chatEvent({
        id: ERROR_REQUEST_ID,
        sessionId: ERROR_SESSION_ID,
        title: "Chat: PASS338 error chat",
        detail: "pass338 already errored",
        steps: [{ id: ERROR_TOOL_ID, toolUseId: ERROR_TOOL_ID, toolName: "Bash", title: "Bash", status: "running", input: "exit 1", createdAt: startedAt }],
      }),
    ],
    notices: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
  }, null, 2), "utf8");
}

function recoveryIsPersisted() {
  const state = readPersistedStore();
  const staleEvent = state.runEvents?.find((event) => event.id === STALE_REQUEST_ID);
  const completedEvent = state.runEvents?.find((event) => event.id === COMPLETED_REQUEST_ID);
  const cancelledEvent = state.runEvents?.find((event) => event.id === CANCELLED_REQUEST_ID);
  const errorEvent = state.runEvents?.find((event) => event.id === ERROR_REQUEST_ID);
  const staleSession = state.sessions?.find((session) => session.id === STALE_SESSION_ID);
  const completedSession = state.sessions?.find((session) => session.id === COMPLETED_SESSION_ID);
  const cancelledSession = state.sessions?.find((session) => session.id === CANCELLED_SESSION_ID);
  const errorSession = state.sessions?.find((session) => session.id === ERROR_SESSION_ID);
  const staleErrorMessages = (staleSession?.messages || []).filter((message) => message.requestId === STALE_REQUEST_ID && message.role === "error");
  const completedTerminalMessages = (completedSession?.messages || []).filter((message) => message.requestId === COMPLETED_REQUEST_ID && ["assistant", "cancelled", "error"].includes(message.role));
  const cancelledTerminalMessages = (cancelledSession?.messages || []).filter((message) => message.requestId === CANCELLED_REQUEST_ID && ["assistant", "cancelled", "error"].includes(message.role));
  const errorTerminalMessages = (errorSession?.messages || []).filter((message) => message.requestId === ERROR_REQUEST_ID && ["assistant", "cancelled", "error"].includes(message.role));
  const staleRunningStep = (staleEvent?.steps || []).find((step) => step.toolUseId === STALE_TOOL_ID);
  const completedRunningStep = (completedEvent?.steps || []).find((step) => step.toolUseId === COMPLETED_TOOL_ID);
  const errorRunningStep = (errorEvent?.steps || []).find((step) => step.toolUseId === ERROR_TOOL_ID);
  return Boolean(
    staleEvent?.status === "error" &&
    staleEvent?.detail?.includes(INTERRUPTED_MESSAGE) &&
    staleEvent?.stderr?.includes(INTERRUPTED_MESSAGE) &&
    Number(staleEvent?.durationMs) >= 0 &&
    staleRunningStep?.status === "error" && Boolean(staleRunningStep?.endedAt) &&
    !(staleEvent?.steps || []).some((step) => step.status === "running") &&
    staleErrorMessages.length === 1 && staleErrorMessages[0]?.content === INTERRUPTED_MESSAGE &&
    completedEvent?.status === "ok" && completedRunningStep?.status === "ok" && completedTerminalMessages.length === 1 && completedTerminalMessages[0]?.role === "assistant" &&
    cancelledEvent?.status === "cancelled" && cancelledTerminalMessages.length === 1 && cancelledTerminalMessages[0]?.role === "cancelled" &&
    errorEvent?.status === "error" && errorRunningStep?.status === "error" && errorTerminalMessages.length === 1 &&
    errorTerminalMessages[0]?.role === "error" && errorTerminalMessages[0]?.content === "pass338 persisted terminal error"
  );
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS338_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(600);

  assertStep("PASS338_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS338_HAIKU_45", await win.webContents.executeJavaScript("window.claudexDesktop.getState().then((state) => state.settings?.model === 'claude-haiku-4-5-20251001')"));
  assertStep("PASS338_STALE_CHAT_RECOVERED", recoveryIsPersisted());
  assertStep("PASS338_NO_STALE_CHAT_RUNTIME", await win.webContents.executeJavaScript(`
    window.claudexDesktop.getState().then((state) => !state.activeChatRequests?.some((request) => [
      ${JSON.stringify(STALE_REQUEST_ID)},
      ${JSON.stringify(COMPLETED_REQUEST_ID)},
      ${JSON.stringify(CANCELLED_REQUEST_ID)},
      ${JSON.stringify(ERROR_REQUEST_ID)},
    ].includes(request.requestId)))
  `));
  assertStep("PASS338_NO_UNEXPECTED_CHAT_RESTART", !fs.existsSync(UNEXPECTED_PROMPT_MARKER));
  assertStep("PASS338_OPEN_OUTPUTS", await win.webContents.executeJavaScript(`
    (() => {
      if (document.querySelector('.bottom-work-panel .run-timeline')) return true;
      const button = [...document.querySelectorAll('.workspace-context-tabs .workspace-context-button')]
        .find((candidate) => /输出/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })()
  `));
  assertStep("PASS338_RECOVERED_EVIDENCE_VISIBLE", await waitFor(win, `
    (() => {
      const row = document.querySelector('.run-timeline-row[data-run-event-id="${STALE_REQUEST_ID}"]');
      if (!row) return false;
      row.open = true;
      const step = row.querySelector('[data-run-step-id="${STALE_TOOL_ID}"]');
      return row.classList.contains('error') && step?.getAttribute('data-run-step-status') === 'error' && /Claudex/.test(row.textContent || '');
    })()
  `, 10000));
  assertStep("PASS338_RELOAD_READY", await reloadWindow(win));
  assertStep("PASS338_RELOAD_IDEMPOTENT", recoveryIsPersisted());

  console.log("PASS338_CHAT_RESTART_RECOVERY_DONE");
  await exitWithCleanup(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS338_FAILED", error?.stack || error);
  await exitWithCleanup(1);
});

setTimeout(() => {
  console.error("PASS338_TIMEOUT");
  void exitWithCleanup(1);
}, 120000);
