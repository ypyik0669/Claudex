const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
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
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass339-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass339-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass339-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const BLOCKING_SCRIPT = path.join(FAKE_BIN_DIR, "pass339-blocking-child.cjs");
const ORPHAN_PARENT_SCRIPT = path.join(FAKE_BIN_DIR, "pass339-orphan-parent.cjs");
const ORPHAN_METADATA_FILE = path.join(FAKE_BIN_DIR, "pass339-orphan.json");
const FAKE_CLAUDE_COMMAND = path.join(FAKE_BIN_DIR, process.platform === "win32" ? "claude.cmd" : "claude");
const NODE_EXE = findNodeExecutable();
const ORPHAN_REQUEST_ID = "pass339-orphan-request";
const MISMATCH_REQUEST_ID = "pass339-mismatch-request";
const ORPHAN_SESSION_ID = "pass339-orphan-session";
const MISMATCH_SESSION_ID = "pass339-mismatch-session";
const DEAD_RUNTIME_OWNER = "pass339-dead-runtime";
let orphanPid = 0;
let mismatchPid = 0;

function findNodeExecutable() {
  const command = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(command, ["node"], { encoding: "utf8", windowsHide: true, timeout: 5000 });
  const candidate = String(result.stdout || "").split(/\r?\n/).map((item) => item.trim()).find(Boolean);
  if (!candidate || !fs.existsSync(candidate)) throw new Error("PASS339_NODE_NOT_FOUND");
  return candidate;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function processExists(pid) {
  const targetPid = Number(pid || 0);
  if (!targetPid) return false;
  if (process.platform === "win32") {
    const powershell = path.join(
      process.env.SystemRoot || "C:\\Windows",
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe",
    );
    const result = spawnSync(
      fs.existsSync(powershell) ? powershell : "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `if (Get-Process -Id ${targetPid} -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }`,
      ],
      { windowsHide: true, stdio: "ignore", timeout: 5000 },
    );
    return result.status === 0;
  }
  try {
    process.kill(targetPid, 0);
    return true;
  } catch (_error) {
    return false;
  }
}

function stopProcessTree(pid) {
  const targetPid = Number(pid || 0);
  if (!targetPid || !processExists(targetPid)) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(targetPid), "/t", "/f"], { windowsHide: true, stdio: "ignore", timeout: 5000 });
    return;
  }
  try {
    process.kill(targetPid, "SIGKILL");
  } catch (_error) {
    // Process already exited.
  }
}

function cleanup() {
  stopProcessTree(orphanPid);
  stopProcessTree(mismatchPid);
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
      // Renderer can be between load contexts.
    }
    await wait(120);
  }
  return false;
}

function writeFixtures() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass339-project" }), "utf8");
  fs.writeFileSync(BLOCKING_SCRIPT, "setInterval(() => {}, 1000);\n", "utf8");
  fs.writeFileSync(ORPHAN_PARENT_SCRIPT, `
const fs = require('fs');
const { spawn } = require('child_process');
const child = spawn(process.execPath, [process.argv[2]], { windowsHide: true, stdio: 'ignore', detached: true });
child.unref();
fs.writeFileSync(process.argv[3], JSON.stringify({
  pid: child.pid,
  startedAt: new Date().toISOString(),
  command: process.argv[2],
  executable: process.execPath,
}));
setInterval(() => {}, 1000);
`, "utf8");
  const fakeClaude = `
const args = process.argv.slice(2);
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value) + '\\n'); }
if (args[0] === '--version') out('2.10.0 (Claude Code PASS339)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'pass339-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else out('pass339 generic');
`;
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaude, "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  const posixShim = path.join(FAKE_BIN_DIR, "claude");
  fs.writeFileSync(posixShim, `#!/bin/sh\nexec node "$(dirname "$0")/fake-claude.cjs" "$@"\n`, "utf8");
  fs.chmodSync(posixShim, 0o755);
}

function createActualOrphan() {
  const parent = spawn(NODE_EXE, [ORPHAN_PARENT_SCRIPT, BLOCKING_SCRIPT, ORPHAN_METADATA_FILE], {
    windowsHide: true,
    stdio: "ignore",
  });
  const deadline = Date.now() + 10000;
  while (!fs.existsSync(ORPHAN_METADATA_FILE) && Date.now() < deadline) sleepSync(100);
  if (!fs.existsSync(ORPHAN_METADATA_FILE)) {
    stopProcessTree(parent.pid);
    throw new Error("PASS339_ORPHAN_METADATA_NOT_WRITTEN");
  }
  const metadata = JSON.parse(fs.readFileSync(ORPHAN_METADATA_FILE, "utf8"));
  orphanPid = Number(metadata.pid || 0);
  if (!orphanPid || !processExists(orphanPid)) throw new Error("PASS339_ORPHAN_NOT_STARTED");
  try {
    process.kill(parent.pid, "SIGKILL");
  } catch (_error) {
    stopProcessTree(parent.pid);
  }
  const stoppedDeadline = Date.now() + 5000;
  while (processExists(parent.pid) && Date.now() < stoppedDeadline) sleepSync(100);
  sleepSync(400);
  if (!processExists(orphanPid)) throw new Error("PASS339_CHILD_DID_NOT_SURVIVE_PARENT");
  return metadata;
}

function createMismatchProcess() {
  const child = spawn(NODE_EXE, [BLOCKING_SCRIPT], { windowsHide: true, stdio: "ignore" });
  mismatchPid = Number(child.pid || 0);
  const deadline = Date.now() + 5000;
  while (!processExists(mismatchPid) && Date.now() < deadline) sleepSync(100);
  if (!processExists(mismatchPid)) throw new Error("PASS339_MISMATCH_PROCESS_NOT_STARTED");
}

function runningChatEvent({ id, sessionId, runtimePid, runtimeCommand, runtimeExecutable, runtimeStartedAt }) {
  return {
    id,
    type: "chat",
    status: "running",
    title: `Chat: ${id}`,
    detail: id,
    cwd: PROJECT_DIR,
    project: { name: "pass339-project", path: PROJECT_DIR },
    sessionId,
    code: null,
    durationMs: 0,
    createdAt: "2026-07-15T00:01:00.000Z",
    runtimeOwner: DEAD_RUNTIME_OWNER,
    runtimePid,
    runtimeCommand,
    runtimeExecutable,
    runtimeStartedAt,
    steps: [{ id: `${id}-tool`, toolUseId: `${id}-tool`, toolName: "Bash", title: "Bash", status: "running", input: "long-running", createdAt: "2026-07-15T00:01:00.000Z" }],
  };
}

function writeInitialStore(orphanMetadata) {
  const project = { name: "pass339-project", path: PROJECT_DIR };
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
      systemPrompt: "PASS339 QA",
      claudeCode: { executionMode: "claude-code", claudeCommand: FAKE_CLAUDE_COMMAND, permissionMode: "default" },
      capabilities: { "project-context": true, "terminal-helper": true, "mcp-runtime": true, "plugin-router": true, "marketplace-router": true },
      customMarketplaces: [],
      apiKeys: {},
    },
    activeProject: project,
    projects: [project],
    sessions: [
      { id: ORPHAN_SESSION_ID, title: "PASS339 orphan", project: project.name, projectPath: PROJECT_DIR, createdAt, updatedAt: startedAt, messages: [{ role: "user", content: ORPHAN_REQUEST_ID, requestId: ORPHAN_REQUEST_ID, createdAt: startedAt }] },
      { id: MISMATCH_SESSION_ID, title: "PASS339 mismatch", project: project.name, projectPath: PROJECT_DIR, createdAt, updatedAt: startedAt, messages: [{ role: "user", content: MISMATCH_REQUEST_ID, requestId: MISMATCH_REQUEST_ID, createdAt: startedAt }] },
    ],
    automations: [],
    subagentRuns: [],
    commandRuns: [],
    runEvents: [
      runningChatEvent({
        id: ORPHAN_REQUEST_ID,
        sessionId: ORPHAN_SESSION_ID,
        runtimePid: orphanMetadata.pid,
        runtimeCommand: orphanMetadata.command,
        runtimeExecutable: orphanMetadata.executable,
        runtimeStartedAt: orphanMetadata.startedAt,
      }),
      runningChatEvent({
        id: MISMATCH_REQUEST_ID,
        sessionId: MISMATCH_SESSION_ID,
        runtimePid: mismatchPid,
        runtimeCommand: path.join(FAKE_BIN_DIR, "definitely-not-this-process.cjs"),
        runtimeExecutable: NODE_EXE,
        runtimeStartedAt: "2000-01-01T00:00:00.000Z",
      }),
    ],
    notices: [],
    sourceRefs: [],
    browserVisits: [],
  }, null, 2), "utf8");
}

function recoveredState() {
  const state = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  const orphanEvent = state.runEvents?.find((event) => event.id === ORPHAN_REQUEST_ID);
  const mismatchEvent = state.runEvents?.find((event) => event.id === MISMATCH_REQUEST_ID);
  return { state, orphanEvent, mismatchEvent };
}

async function runTest() {
  const windowDeadline = Date.now() + 20000;
  let win = null;
  while (!win && Date.now() < windowDeadline) {
    win = BrowserWindow.getAllWindows()[0] || null;
    if (!win) await wait(120);
  }
  if (!win) throw new Error("PASS339_FAILED_NO_WINDOW");
  assertStep("PASS339_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS339_HAIKU_45", await win.webContents.executeJavaScript("window.claudexDesktop.getState().then((state) => state.settings?.model === 'claude-haiku-4-5-20251001')"));
  const { orphanEvent, mismatchEvent } = recoveredState();
  assertStep("PASS339_ORPHAN_REAP_CONFIRMED", Boolean(
    orphanEvent?.status === "error" && orphanEvent?.runtimeStopStatus === "stopped" &&
    !orphanEvent.runtimePid && !orphanEvent.runtimeOwner && !processExists(orphanPid) &&
    !(orphanEvent.steps || []).some((step) => step.status === "running")
  ));
  assertStep("PASS339_IDENTITY_MISMATCH_NOT_KILLED", Boolean(
    mismatchEvent?.status === "error" && mismatchEvent?.runtimeStopStatus === "identity-mismatch" &&
    !mismatchEvent.runtimePid && !mismatchEvent.runtimeOwner && processExists(mismatchPid)
  ));
  assertStep("PASS339_CHAT_ORPHAN_REAP_DONE", true);
  await exitWithCleanup(0);
}

try {
  writeFixtures();
  console.log("PASS339_FIXTURES_READY", true);
  const orphanMetadata = createActualOrphan();
  console.log("PASS339_ORPHAN_CREATED", Boolean(orphanMetadata?.pid));
  createMismatchProcess();
  console.log("PASS339_MISMATCH_CREATED", processExists(mismatchPid));
  console.log("PASS339_ORPHAN_SURVIVED_PARENT", processExists(orphanPid));
  app.setPath("userData", USER_DATA_DIR);
  writeInitialStore(orphanMetadata);
  require(path.join(REPO_DIR, "electron", "main.cjs"));
  app.whenReady().then(runTest).catch(async (error) => {
    console.error("PASS339_FAILED", error?.stack || error);
    await exitWithCleanup(1);
  });
} catch (error) {
  console.error("PASS339_SETUP_FAILED", error?.stack || error);
  cleanup();
  process.exitCode = 1;
  setTimeout(() => app.exit(1), 250);
}

setTimeout(() => {
  console.error("PASS339_TIMEOUT");
  void exitWithCleanup(1);
}, 120000);
