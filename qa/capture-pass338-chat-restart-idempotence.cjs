const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.resolve(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass338-idempotence-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass338-idempotence-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass338-idempotence-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const REQUEST_ID = "pass338-idempotent-request";
const SESSION_ID = "pass338-idempotent-session";
const INTERRUPTED_MESSAGE = "Claudex 上次退出时，聊天回复已中断。";
const FAKE_CLAUDE_COMMAND = path.join(FAKE_BIN_DIR, process.platform === "win32" ? "claude.cmd" : "claude");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_DIR]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_error) {
      // Best-effort cleanup.
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

function assertStep(name, ok) {
  console.log(name, ok);
  if (!ok) throw new Error(`${name} failed`);
}

async function waitFor(win, script, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const value = await win.webContents.executeJavaScript(script);
      if (value) return value;
    } catch (_error) {
      // Renderer may still be loading.
    }
    await wait(120);
  }
  return false;
}

function writeFakeClaude() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  const script = `
const args = process.argv.slice(2);
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value) + '\\n'); }
if (args[0] === '--version') out('2.10.0 (Claude Code PASS338 idempotence)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'pass338-provider', authMethod: 'api_key' });
else if (args.includes('--json')) out([]);
else out('pass338 idempotence generic');
`;
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), script, "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  const posixShim = path.join(FAKE_BIN_DIR, "claude");
  fs.writeFileSync(posixShim, `#!/bin/sh\nexec node "$(dirname "$0")/fake-claude.cjs" "$@"\n`, "utf8");
  fs.chmodSync(posixShim, 0o755);
}

function writeRecoveredStore() {
  writeFakeClaude();
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass338-idempotence-project" }), "utf8");
  const project = { name: "pass338-idempotence-project", path: PROJECT_DIR };
  const createdAt = "2026-07-15T00:00:00.000Z";
  fs.writeFileSync(DATA_FILE, JSON.stringify({
    version: 1,
    settings: {
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      language: "zh",
      appearance: { fontSize: "compact", density: "compact" },
      claudeCode: { executionMode: "claude-code", claudeCommand: FAKE_CLAUDE_COMMAND, permissionMode: "default" },
      customMarketplaces: [],
      capabilities: {},
      apiKeys: {},
    },
    activeProject: project,
    projects: [project],
    sessions: [{
      id: SESSION_ID,
      title: "PASS338 recovered chat",
      project: project.name,
      projectPath: PROJECT_DIR,
      createdAt,
      updatedAt: createdAt,
      messages: [
        { role: "user", content: "pass338 interrupted chat", requestId: REQUEST_ID, createdAt },
        { role: "error", content: INTERRUPTED_MESSAGE, requestId: REQUEST_ID, createdAt: "2026-07-15T00:01:00.000Z" },
      ],
    }],
    automations: [],
    subagentRuns: [],
    commandRuns: [],
    runEvents: [{
      id: REQUEST_ID,
      type: "chat",
      status: "error",
      title: "Chat: PASS338 recovered chat",
      detail: `pass338 interrupted chat · ${INTERRUPTED_MESSAGE}`,
      cwd: PROJECT_DIR,
      project,
      sessionId: SESSION_ID,
      stderr: INTERRUPTED_MESSAGE,
      durationMs: 60000,
      createdAt,
      runtimeOwner: "",
      runtimePid: 0,
      runtimeCommand: "",
      runtimeExecutable: "",
      runtimeStartedAt: "",
      runtimeStopStatus: "not-recorded",
      steps: [{
        id: "toolu_pass338_idempotent",
        toolUseId: "toolu_pass338_idempotent",
        toolName: "Bash",
        title: "Bash",
        status: "error",
        input: "long-running",
        createdAt,
        endedAt: "2026-07-15T00:01:00.000Z",
      }],
    }],
    notices: [],
    sourceRefs: [],
    browserVisits: [],
  }, null, 2), "utf8");
}

function persistedExactlyOnce() {
  const state = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  const session = state.sessions?.find((item) => item.id === SESSION_ID);
  const event = state.runEvents?.find((item) => item.id === REQUEST_ID);
  const terminals = (session?.messages || []).filter((message) => message.requestId === REQUEST_ID && ["assistant", "cancelled", "error"].includes(message.role));
  return event?.status === "error" && event?.runtimeStopStatus === "not-recorded" &&
    terminals.length === 1 && terminals[0]?.role === "error" && terminals[0]?.content === INTERRUPTED_MESSAGE;
}

async function runTest() {
  const deadline = Date.now() + 15000;
  let win = null;
  while (!win && Date.now() < deadline) {
    win = BrowserWindow.getAllWindows()[0] || null;
    if (!win) await wait(120);
  }
  if (!win) throw new Error("PASS338_IDEMPOTENCE_NO_WINDOW");
  assertStep("PASS338_IDEMPOTENCE_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS338_SECOND_MAIN_PRESERVES_TERMINAL", persistedExactlyOnce());
  assertStep("PASS338_SECOND_MAIN_NO_ACTIVE_RUNTIME", await win.webContents.executeJavaScript(`
    window.claudexDesktop.getState().then((state) => !state.activeChatRequests?.some((request) => request.requestId === ${JSON.stringify(REQUEST_ID)}))
  `));
  console.log("PASS338_CHAT_RESTART_IDEMPOTENCE_DONE");
  await exitWithCleanup(0);
}

app.setPath("userData", USER_DATA_DIR);
writeRecoveredStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS338_IDEMPOTENCE_FAILED", error?.stack || error);
  await exitWithCleanup(1);
});

setTimeout(() => {
  console.error("PASS338_IDEMPOTENCE_TIMEOUT");
  void exitWithCleanup(1);
}, 120000);
