const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { app, BrowserWindow } = require("electron");

for (const stream of [process.stdout, process.stderr]) stream.on("error", (error) => { if (error?.code !== "EPIPE") throw error; });

function findRepoDir() {
  for (const candidate of [process.env.CLAUDEX_REPO_DIR, process.cwd(), __dirname, path.join(__dirname, "..")] .filter(Boolean)) {
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
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass340-data-"));
const BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass340-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass340-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const BLOCKING_SCRIPT = path.join(BIN_DIR, "pass340-blocking-child.cjs");
const ORPHAN_PARENT = path.join(BIN_DIR, "pass340-orphan-parent.cjs");
const NODE_EXE = findNodeExecutable();
const DEAD_OWNER = "pass340-dead-runtime";
const SUBAGENT_REQUEST = "pass340-subagent-request";
const WORKSPACE_REQUEST = "workspace_pass340-command";
const AUTOMATION_REQUEST = "pass340-automation-request";
const MISMATCH_REQUEST = "pass340-mismatch-request";
let subagentPid = 0;
let workspacePid = 0;
let automationPid = 0;
let mismatchPid = 0;

function findNodeExecutable() {
  const result = spawnSync(process.platform === "win32" ? "where.exe" : "which", ["node"], { encoding: "utf8", windowsHide: true, timeout: 5000 });
  const candidate = String(result.stdout || "").split(/\r?\n/).map((item) => item.trim()).find(Boolean);
  if (!candidate || !fs.existsSync(candidate)) throw new Error("PASS340_NODE_NOT_FOUND");
  return candidate;
}

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function sleepSync(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
function assertStep(name, ok) { console.log(name, ok); if (!ok) throw new Error(`${name} failed`); }

function processExists(pid) {
  const target = Number(pid || 0);
  if (!target) return false;
  if (process.platform !== "win32") {
    try { process.kill(target, 0); return true; } catch (_error) { return false; }
  }
  const powershell = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  return spawnSync(fs.existsSync(powershell) ? powershell : "powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `if (Get-Process -Id ${target} -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }`], { windowsHide: true, stdio: "ignore", timeout: 5000 }).status === 0;
}

function stopProcessTree(pid) {
  if (!processExists(pid)) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"], { windowsHide: true, stdio: "ignore", timeout: 5000 });
  else { try { process.kill(pid, "SIGKILL"); } catch (_error) {} }
}

function cleanup() {
  [subagentPid, workspacePid, automationPid, mismatchPid].forEach(stopProcessTree);
  for (const dir of [USER_DATA_DIR, BIN_DIR, PROJECT_DIR]) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_error) {} }
}

async function exitWithCleanup(code) {
  for (const win of BrowserWindow.getAllWindows()) { try { if (!win.isDestroyed()) win.destroy(); } catch (_error) {} }
  await wait(200);
  cleanup();
  app.exit(code);
}

function writeFixtures() {
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass340-project" }), "utf8");
  fs.writeFileSync(BLOCKING_SCRIPT, "setInterval(() => {}, 1000);\n", "utf8");
  fs.writeFileSync(ORPHAN_PARENT, `
const fs = require('fs'); const { spawn } = require('child_process');
const child = spawn(process.execPath, [process.argv[2]], { detached: true, stdio: 'ignore', windowsHide: true });
child.unref(); fs.writeFileSync(process.argv[3], JSON.stringify({ pid: child.pid, command: process.argv[2], executable: process.execPath, startedAt: new Date().toISOString() }));
setInterval(() => {}, 1000);
`, "utf8");
}

function createOrphan(name) {
  const metadataFile = path.join(BIN_DIR, `${name}.json`);
  const parent = spawn(NODE_EXE, [ORPHAN_PARENT, BLOCKING_SCRIPT, metadataFile], { windowsHide: true, stdio: "ignore" });
  const deadline = Date.now() + 10000;
  while (!fs.existsSync(metadataFile) && Date.now() < deadline) sleepSync(80);
  if (!fs.existsSync(metadataFile)) throw new Error(`PASS340_${name}_METADATA_MISSING`);
  const metadata = JSON.parse(fs.readFileSync(metadataFile, "utf8"));
  if (!processExists(metadata.pid)) throw new Error(`PASS340_${name}_NOT_STARTED`);
  try { process.kill(parent.pid, "SIGKILL"); } catch (_error) { stopProcessTree(parent.pid); }
  sleepSync(300);
  if (!processExists(metadata.pid)) throw new Error(`PASS340_${name}_NOT_ORPHANED`);
  return metadata;
}

function createMismatch() {
  const child = spawn(NODE_EXE, [BLOCKING_SCRIPT], { windowsHide: true, stdio: "ignore" });
  mismatchPid = Number(child.pid || 0);
  const deadline = Date.now() + 5000;
  while (!processExists(mismatchPid) && Date.now() < deadline) sleepSync(80);
  if (!processExists(mismatchPid)) throw new Error("PASS340_MISMATCH_NOT_STARTED");
}

function runtimeFields(metadata) {
  return { runtimeOwner: DEAD_OWNER, runtimePid: metadata.pid, runtimeCommand: metadata.command, runtimeExecutable: metadata.executable, runtimeStartedAt: metadata.startedAt, runtimeStopStatus: "running" };
}

function runningEvent(id, type, metadata) {
  return { id, type, status: "running", title: `${type}: ${id}`, detail: id, cwd: PROJECT_DIR, project: { name: "pass340-project", path: PROJECT_DIR }, sessionId: "default", code: null, durationMs: 0, createdAt: "2026-07-16T00:00:00.000Z", ...runtimeFields(metadata) };
}

function writeInitialStore(subagent, workspace, automationRuntime) {
  const project = { name: "pass340-project", path: PROJECT_DIR };
  const mismatch = { pid: mismatchPid, command: path.join(BIN_DIR, "not-this-process.cjs"), executable: NODE_EXE, startedAt: "2000-01-01T00:00:00.000Z" };
  fs.writeFileSync(DATA_FILE, JSON.stringify({
    version: 1,
    settings: { provider: "anthropic", model: "claude-haiku-4-5-20251001", baseUrl: "https://api.example.invalid", temperature: 0.2, timeoutMs: 600000, language: "zh", appearance: { fontSize: "compact", density: "compact" }, claudeCode: { executionMode: "claude-code", claudeCommand: NODE_EXE, permissionMode: "default" }, capabilities: {}, customMarketplaces: [], apiKeys: {} },
    activeProject: project, projects: [project], sessions: [{ id: "default", title: "PASS340", project: project.name, projectPath: PROJECT_DIR, createdAt: "2026-07-16T00:00:00.000Z", updatedAt: "2026-07-16T00:00:00.000Z", messages: [] }],
    automations: [{
      id: "pass340-automation", prompt: "PASS340 automation orphan", enabled: false, status: "running", project, threadId: "default", schedule: { type: "once", runAt: "" }, createdAt: automationRuntime.startedAt, updatedAt: automationRuntime.startedAt,
      history: [{ id: AUTOMATION_REQUEST, trigger: "manual", status: "running", startedAt: automationRuntime.startedAt, endedAt: "", durationMs: 0, sessionId: "default", detail: "", error: "", summary: "", stdout: "", stderr: "", code: null, artifacts: [], ...runtimeFields(automationRuntime) }],
    }], notices: [], sourceRefs: [], browserVisits: [],
    subagentRuns: [
      { id: "pass340-subagent-run", requestId: SUBAGENT_REQUEST, nickname: "PASS340 orphan subagent", task: "blocking", status: "running", project, cwd: PROJECT_DIR, command: NODE_EXE, args: [BLOCKING_SCRIPT], startedAt: subagent.startedAt, artifacts: [], ...runtimeFields(subagent) },
      { id: "pass340-mismatch-run", requestId: MISMATCH_REQUEST, nickname: "PASS340 mismatch", task: "blocking", status: "running", project, cwd: PROJECT_DIR, command: NODE_EXE, args: [BLOCKING_SCRIPT], startedAt: mismatch.startedAt, artifacts: [], ...runtimeFields(mismatch) },
    ],
    commandRuns: [{ id: WORKSPACE_REQUEST, requestId: WORKSPACE_REQUEST, kind: "workspace", command: "node pass340-blocking-child.cjs", cwd: PROJECT_DIR, project, code: null, durationMs: 0, stdout: "", stderr: "", cancelled: false, startedAt: workspace.startedAt, ...runtimeFields(workspace) }],
    runEvents: [runningEvent(SUBAGENT_REQUEST, "subagent", subagent), runningEvent(WORKSPACE_REQUEST, "workspace-command", workspace), runningEvent(AUTOMATION_REQUEST, "automation", automationRuntime)],
  }, null, 2), "utf8");
}

function readState() { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); }

async function runTest() {
  const deadline = Date.now() + 20000;
  let win = null;
  while (!win && Date.now() < deadline) { win = BrowserWindow.getAllWindows()[0] || null; if (!win) await wait(100); }
  if (!win) throw new Error("PASS340_NO_WINDOW");
  assertStep("PASS340_READY", Boolean(await win.webContents.executeJavaScript("Boolean(document.querySelector('.app-grid') && window.claudexDesktop)")));
  const state = readState();
  const subagent = state.subagentRuns.find((item) => item.requestId === SUBAGENT_REQUEST);
  const mismatch = state.subagentRuns.find((item) => item.requestId === MISMATCH_REQUEST);
  const workspace = state.commandRuns.find((item) => item.requestId === WORKSPACE_REQUEST);
  const automation = state.automations.find((item) => item.id === "pass340-automation");
  const automationEntry = automation?.history?.find((item) => item.id === AUTOMATION_REQUEST);
  const subagentEvent = state.runEvents.find((item) => item.id === SUBAGENT_REQUEST);
  const workspaceEvent = state.runEvents.find((item) => item.id === WORKSPACE_REQUEST);
  const automationEvent = state.runEvents.find((item) => item.id === AUTOMATION_REQUEST);
  assertStep("PASS340_SUBAGENT_ORPHAN_REAPED", subagent?.status === "error" && subagent?.runtimeStopStatus === "stopped" && !subagent.runtimePid && !subagent.runtimeOwner && subagentEvent?.status === "error" && !processExists(subagentPid));
  assertStep("PASS340_WORKSPACE_ORPHAN_REAPED", workspace?.runtimeStopStatus === "stopped" && !workspace.runtimePid && !workspace.runtimeOwner && workspaceEvent?.status === "error" && workspaceEvent?.runtimeStopStatus === "stopped" && !processExists(workspacePid));
  assertStep("PASS340_AUTOMATION_ORPHAN_REAPED", automation?.status === "failed" && automationEntry?.status === "failed" && automationEntry?.runtimeStopStatus === "stopped" && !automationEntry.runtimePid && !automationEntry.runtimeOwner && automationEvent?.status === "error" && automationEvent?.runtimeStopStatus === "stopped" && !processExists(automationPid));
  assertStep("PASS340_IDENTITY_MISMATCH_SURVIVES", mismatch?.status === "error" && mismatch?.runtimeStopStatus === "identity-mismatch" && !mismatch.runtimePid && !mismatch.runtimeOwner && processExists(mismatchPid));
  const retried = await win.webContents.executeJavaScript("Promise.all([window.claudexDesktop.retryRuntimeRecovery(), window.claudexDesktop.retryRuntimeRecovery()]).then((states) => states.every((state) => Boolean(state && Array.isArray(state.runEvents))))");
  assertStep("PASS340_RUNTIME_RECOVERY_RETRY_API", retried);
  assertStep("PASS340_LOCAL_ORPHAN_REAP_DONE", true);
  await exitWithCleanup(0);
}

try {
  writeFixtures();
  const subagent = createOrphan("subagent"); subagentPid = Number(subagent.pid);
  const workspace = createOrphan("workspace"); workspacePid = Number(workspace.pid);
  const automationRuntime = createOrphan("automation"); automationPid = Number(automationRuntime.pid);
  createMismatch();
  console.log("PASS340_FIXTURES_READY", Boolean(subagentPid && workspacePid && automationPid && mismatchPid));
  app.setPath("userData", USER_DATA_DIR);
  writeInitialStore(subagent, workspace, automationRuntime);
  require(path.join(REPO_DIR, "electron", "main.cjs"));
  app.whenReady().then(runTest).catch(async (error) => { console.error("PASS340_FAILED", error?.stack || error); await exitWithCleanup(1); });
} catch (error) {
  console.error("PASS340_SETUP_FAILED", error?.stack || error);
  cleanup(); process.exitCode = 1; setTimeout(() => app.exit(1), 200);
}

setTimeout(() => { console.error("PASS340_TIMEOUT"); void exitWithCleanup(1); }, 120000);
