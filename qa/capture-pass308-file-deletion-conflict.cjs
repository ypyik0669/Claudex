const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
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
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass308-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass308-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FILE_NAME = "deleted-conflict.txt";
const FILE_PATH = path.join(PROJECT_DIR, FILE_NAME);
const IPC_FILE_NAME = "ipc-deleted-conflict.txt";
const IPC_FILE_PATH = path.join(PROJECT_DIR, IPC_FILE_NAME);
const DIRECT_FILE_NAME = "direct-save-snapshot.txt";
const DIRECT_FILE_PATH = path.join(PROJECT_DIR, DIRECT_FILE_NAME);
const ROLLBACK_FILE_NAME = "partial-write-rollback.txt";
const ROLLBACK_FILE_PATH = path.join(PROJECT_DIR, ROLLBACK_FILE_NAME);
const UNVERSIONED_FILE_NAME = "created-without-base.txt";
const ORIGINAL_CONTENT = "pass308 original\n";
const DRAFT_CONTENT = "pass308 original\nrenderer draft after read\n";
const IPC_ORIGINAL_CONTENT = "pass308 IPC original\n";
const IPC_DRAFT_CONTENT = "pass308 IPC draft after delete\n";
const DIRECT_ORIGINAL_CONTENT = "pass308 direct original\n";
const DIRECT_SAVED_CONTENT = "pass308 direct saved snapshot\n";
const ROLLBACK_ORIGINAL_CONTENT = "pass308 rollback original bytes\n";
const ROLLBACK_DRAFT_CONTENT = "pass308 rollback replacement that must not survive\n";

function sha256Text(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

const ORIGINAL_SHA256 = sha256Text(ORIGINAL_CONTENT);
const DRAFT_SHA256 = sha256Text(DRAFT_CONTENT);
const DRAFT_BYTES = Buffer.byteLength(DRAFT_CONTENT, "utf8");
let deleteAfterSaveGuardRead = false;
let deleteInjected = false;
let deleteTriggeredByGuardRead = false;
let guardReadTriggerCount = 0;
const guardReadHandles = new Set();
const originalOpenSync = fs.openSync;
const originalReadSync = fs.readSync;
const originalWriteSync = fs.writeSync;
const originalCloseSync = fs.closeSync;
let partialWriteInjected = false;
let partialWriteBytes = 0;
const partialWriteHandles = new Set();

function isGuardTarget(candidate) {
  try {
    return path.resolve(String(candidate)) === FILE_PATH;
  } catch (_error) {
    return false;
  }
}

function injectDeleteAfterGuardRead() {
  if (!deleteAfterSaveGuardRead || deleteInjected) return;
  deleteTriggeredByGuardRead = true;
  guardReadTriggerCount += 1;
  deleteInjected = true;
  try {
    fs.unlinkSync(FILE_PATH);
  } finally {
    deleteAfterSaveGuardRead = false;
    restoreSaveGuardDeleteHooks();
  }
}

function installSaveGuardDeleteHooks() {
  deleteAfterSaveGuardRead = true;
  fs.openSync = function patchedOpenSync(file, flags, ...args) {
    const fd = originalOpenSync.call(fs, file, flags, ...args);
    if (deleteAfterSaveGuardRead && flags === "r+" && isGuardTarget(file)) guardReadHandles.add(fd);
    return fd;
  };
  fs.readSync = function patchedReadSync(fd, ...args) {
    const result = originalReadSync.call(fs, fd, ...args);
    if (guardReadHandles.has(fd)) injectDeleteAfterGuardRead();
    return result;
  };
  fs.closeSync = function patchedCloseSync(fd, ...args) {
    guardReadHandles.delete(fd);
    return originalCloseSync.call(fs, fd, ...args);
  };
}

function restoreSaveGuardDeleteHooks() {
  fs.openSync = originalOpenSync;
  fs.readSync = originalReadSync;
  fs.closeSync = originalCloseSync;
  guardReadHandles.clear();
}

function isRollbackTarget(candidate) {
  try {
    return path.resolve(String(candidate)) === ROLLBACK_FILE_PATH;
  } catch (_error) {
    return false;
  }
}

function restorePartialWriteFailureHooks() {
  fs.openSync = originalOpenSync;
  fs.writeSync = originalWriteSync;
  partialWriteHandles.clear();
}

function installPartialWriteFailureHooks() {
  fs.openSync = function patchedOpenSync(file, flags, ...args) {
    const fd = originalOpenSync.call(fs, file, flags, ...args);
    if (flags === "r+" && isRollbackTarget(file)) partialWriteHandles.add(fd);
    return fd;
  };
  fs.writeSync = function patchedWriteSync(fd, buffer, offset, length, position) {
    if (!partialWriteInjected && partialWriteHandles.has(fd)) {
      const injectedLength = Math.max(1, Math.min(5, length));
      partialWriteBytes = originalWriteSync.call(fs, fd, buffer, offset, injectedLength, position);
      partialWriteInjected = true;
      restorePartialWriteFailureHooks();
      const error = new Error("PASS308_INJECTED_PARTIAL_WRITE");
      error.code = "PASS308_INJECTED_PARTIAL_WRITE";
      throw error;
    }
    return originalWriteSync.call(fs, fd, buffer, offset, length, position);
  };
}

function cleanup() {
  restoreSaveGuardDeleteHooks();
  restorePartialWriteFailureHooks();
  for (const dir of [USER_DATA_DIR, PROJECT_DIR]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_error) {
      // Best-effort cleanup for Windows file-handle races.
    }
  }
}

async function exitWithCleanup(code) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.destroy();
  }
  await wait(250);
  cleanup();
  app.exit(code);
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

async function waitForStore(predicate, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      if (predicate(parsed)) return true;
    } catch (_error) {
      // Store may be mid-write or temporarily locked on Windows.
    }
    await wait(150);
  }
  return false;
}

function assertStep(name, ok) {
  console.log(name, ok);
  if (!ok) throw new Error(`${name} failed`);
}

function writeInitialStore() {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass308-project" }), "utf8");
  fs.writeFileSync(FILE_PATH, ORIGINAL_CONTENT, "utf8");
  fs.writeFileSync(IPC_FILE_PATH, IPC_ORIGINAL_CONTENT, "utf8");
  fs.writeFileSync(DIRECT_FILE_PATH, DIRECT_ORIGINAL_CONTENT, "utf8");
  fs.writeFileSync(ROLLBACK_FILE_PATH, ROLLBACK_ORIGINAL_CONTENT, "utf8");
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
    activeProject: { name: "pass308-project", path: PROJECT_DIR },
    projects: [{ name: "pass308-project", path: PROJECT_DIR }],
    sessions: [{
      id: "default",
      title: "新聊天",
      project: "pass308-project",
      projectPath: PROJECT_DIR,
      createdAt: "2026-07-11T00:00:00.000Z",
      updatedAt: "2026-07-11T00:00:00.000Z",
      messages: [],
    }],
    automations: [],
    subagentRuns: [],
    commandRuns: [],
    runEvents: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

async function openWorkspaceTool(win) {
  return win.webContents.executeJavaScript(`
    (() => {
      const button = Array.from(document.querySelectorAll('button.tool-row')).find((item) =>
        /Workspace|工作区/.test(item.textContent || '')
      );
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function openConflictFile(win) {
  return win.webContents.executeJavaScript(`
    (() => {
      const item = Array.from(document.querySelectorAll('.file-tree .tree-item')).find((row) =>
        row.textContent.includes(${JSON.stringify(FILE_NAME)})
      );
      if (!item) return false;
      item.click();
      return true;
    })();
  `);
}

async function editFileDraft(win) {
  return win.webContents.executeJavaScript(`
    (() => {
      const textarea = document.querySelector('.file-editor textarea');
      if (!textarea) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(textarea, ${JSON.stringify(DRAFT_CONTENT)});
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })();
  `);
}

async function clickEditorButton(win, patternSource) {
  return win.webContents.executeJavaScript(`
    (() => {
      const pattern = new RegExp(${JSON.stringify(patternSource)}, 'i');
      const button = Array.from(document.querySelectorAll('.editor-change-bar button')).find((item) =>
        pattern.test((item.textContent || '').trim()) && !item.disabled
      );
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function openOutputsPanel(win) {
  return win.webContents.executeJavaScript(`
    (() => {
      if (document.querySelector('.bottom-work-panel .run-timeline')) return true;
      const button = Array.from(document.querySelectorAll('.workspace-context-tabs .workspace-context-button'))[1];
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function verifyPreloadSaveContracts(win) {
  const read = await win.webContents.executeJavaScript(`
    window.claudexDesktop.readWorkspaceFile({
      projectPath: ${JSON.stringify(PROJECT_DIR)},
      relativePath: ${JSON.stringify(IPC_FILE_NAME)},
    })
  `);
  assertStep("PASS308_PRELOAD_READ_BASE_VERSION", Boolean(read?.updatedAt && read?.sha256));
  fs.unlinkSync(IPC_FILE_PATH);
  const conflict = await win.webContents.executeJavaScript(`
    window.claudexDesktop.saveWorkspaceFile({
      projectPath: ${JSON.stringify(PROJECT_DIR)},
      relativePath: ${JSON.stringify(IPC_FILE_NAME)},
      content: ${JSON.stringify(IPC_DRAFT_CONTENT)},
      baseUpdatedAt: ${JSON.stringify(read.updatedAt)},
      baseSha256: ${JSON.stringify(read.sha256)},
    })
  `);
  assertStep("PASS308_PRELOAD_DELETE_CONFLICT", Boolean(
    conflict?.conflict &&
    conflict?.details?.reason === "deleted" &&
    conflict?.details?.baseExists === true &&
    conflict?.details?.currentExists === false
  ));

  const directBase = await win.webContents.executeJavaScript(`
    window.claudexDesktop.readWorkspaceFile({
      projectPath: ${JSON.stringify(PROJECT_DIR)},
      relativePath: ${JSON.stringify(DIRECT_FILE_NAME)},
    })
  `);
  const directResult = await win.webContents.executeJavaScript(`
    window.claudexDesktop.saveWorkspaceFile({
      projectPath: ${JSON.stringify(PROJECT_DIR)},
      relativePath: ${JSON.stringify(DIRECT_FILE_NAME)},
      content: ${JSON.stringify(DIRECT_SAVED_CONTENT)},
      baseUpdatedAt: ${JSON.stringify(directBase.updatedAt)},
      baseSha256: ${JSON.stringify(directBase.sha256)},
    })
  `);
  const directDisk = fs.readFileSync(DIRECT_FILE_PATH);
  const directDiskSha256 = crypto.createHash("sha256").update(directDisk).digest("hex");
  console.log("PASS308_DIRECT_SNAPSHOT", JSON.stringify({
    result: directResult,
    content: directResult?.content,
    size: directResult?.size,
    sha256: directResult?.sha256,
    diskSize: directDisk.length,
    diskSha256: directDiskSha256,
  }));
  assertStep("PASS308_DIRECT_SAVE_SNAPSHOT_MATCHES_DISK", Boolean(
    directResult?.content === directDisk.toString("utf8") &&
    directResult?.size === directDisk.length &&
    directResult?.sha256 === directDiskSha256
  ));

  const rollbackBase = await win.webContents.executeJavaScript(`
    window.claudexDesktop.readWorkspaceFile({
      projectPath: ${JSON.stringify(PROJECT_DIR)},
      relativePath: ${JSON.stringify(ROLLBACK_FILE_NAME)},
    })
  `);
  const rollbackOriginal = fs.readFileSync(ROLLBACK_FILE_PATH);
  let rollbackRejection;
  installPartialWriteFailureHooks();
  try {
    rollbackRejection = await win.webContents.executeJavaScript(`
      window.claudexDesktop.saveWorkspaceFile({
        projectPath: ${JSON.stringify(PROJECT_DIR)},
        relativePath: ${JSON.stringify(ROLLBACK_FILE_NAME)},
        content: ${JSON.stringify(ROLLBACK_DRAFT_CONTENT)},
        baseUpdatedAt: ${JSON.stringify(rollbackBase.updatedAt)},
        baseSha256: ${JSON.stringify(rollbackBase.sha256)},
      }).then(
        (value) => ({ rejected: false, value }),
        (error) => ({ rejected: true, message: error?.message || String(error) }),
      )
    `);
  } finally {
    restorePartialWriteFailureHooks();
  }
  const rollbackDisk = fs.readFileSync(ROLLBACK_FILE_PATH);
  console.log("PASS308_ROLLBACK_EVIDENCE", JSON.stringify({
    rejected: rollbackRejection?.rejected,
    message: rollbackRejection?.message,
    partialWriteInjected,
    partialWriteBytes,
    originalBytes: rollbackOriginal.length,
    diskBytes: rollbackDisk.length,
    diskSha256: crypto.createHash("sha256").update(rollbackDisk).digest("hex"),
  }));
  assertStep("PASS308_PARTIAL_WRITE_INJECTED", partialWriteInjected && partialWriteBytes > 0);
  assertStep("PASS308_PARTIAL_WRITE_IPC_REJECTED", rollbackRejection?.rejected === true);
  assertStep("PASS308_PARTIAL_WRITE_ROLLED_BACK", rollbackDisk.equals(rollbackOriginal));

  const created = await win.webContents.executeJavaScript(`
    window.claudexDesktop.saveWorkspaceFile({
      projectPath: ${JSON.stringify(PROJECT_DIR)},
      relativePath: ${JSON.stringify(UNVERSIONED_FILE_NAME)},
      content: "pass308 unversioned create\\n",
    })
  `);
  assertStep("PASS308_PRELOAD_UNVERSIONED_CREATE", Boolean(
    created?.path === UNVERSIONED_FILE_NAME &&
    fs.existsSync(path.join(PROJECT_DIR, UNVERSIONED_FILE_NAME))
  ));
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS308_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS308_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  await verifyPreloadSaveContracts(win);
  assertStep("PASS308_OPEN_WORKSPACE", await openWorkspaceTool(win));
  assertStep("PASS308_FILE_VISIBLE", await waitFor(win, `
    Array.from(document.querySelectorAll('.file-tree .tree-item')).some((row) => row.textContent.includes(${JSON.stringify(FILE_NAME)}))
  `, 15000));
  assertStep("PASS308_OPEN_FILE", await openConflictFile(win));
  assertStep("PASS308_FILE_OPENED", await waitFor(win, `
    document.querySelector('.file-editor textarea')?.value === ${JSON.stringify(ORIGINAL_CONTENT)}
  `, 8000));
  assertStep("PASS308_EDIT_DRAFT", await editFileDraft(win));
  assertStep("PASS308_REVIEW_FIRST", await clickEditorButton(win, "^(Review|审查)$"));
  assertStep("PASS308_READY_TO_SAVE", await waitFor(win, `
    Boolean(
      document.querySelector('.editor-review-pane') &&
      Array.from(document.querySelectorAll('.editor-change-bar button')).some((button) => /^(Save|保存)$/i.test((button.textContent || '').trim()) && !button.disabled)
    )
  `, 8000));

  installSaveGuardDeleteHooks();
  try {
    assertStep("PASS308_SAVE_CONFLICT", await clickEditorButton(win, "^(Save|保存)$"));
    const injectedByDeadline = Date.now() + 5000;
    while (!deleteInjected && Date.now() < injectedByDeadline) await wait(25);
  } finally {
    deleteAfterSaveGuardRead = false;
    restoreSaveGuardDeleteHooks();
  }
  await wait(500);
  const raceEvidence = await win.webContents.executeJavaScript(`
    (() => ({
      error: document.querySelector('#workspace-tool-detail .tool-error-row')?.textContent || '',
      saveStatus: document.querySelector('.editor-change-bar')?.textContent || '',
    }))()
  `);
  console.log("PASS308_RED_EVIDENCE", JSON.stringify({
    injectedDelete: deleteInjected,
    diskExistsAfterSave: fs.existsSync(FILE_PATH),
    ...raceEvidence,
  }));
  assertStep("PASS308_DELETE_INJECTED_AFTER_SAVE_GUARD_READ", deleteInjected);
  assertStep("PASS308_DELETE_TRIGGERED_BY_TARGET_RPLUS_READSYNC", deleteTriggeredByGuardRead && guardReadTriggerCount === 1);
  assertStep("PASS308_CONFLICT_UI", await waitFor(win, `
    /WORKSPACE_FILE_CONFLICT|外部修改或删除/.test(document.querySelector('#workspace-tool-detail .tool-error-row')?.textContent || '')
  `, 10000));
  assertStep("PASS308_DISK_STILL_DELETED", !fs.existsSync(FILE_PATH));
  assertStep("PASS308_DRAFT_STILL_RECOVERABLE_AFTER_CONFLICT", await waitFor(win, `
    (() => {
      const editButton = Array.from(document.querySelectorAll('.editor-change-bar button')).find((item) =>
        /^(Edit|编辑)$/.test((item.textContent || '').trim()) && !item.disabled
      );
      if (editButton) editButton.click();
      const textarea = document.querySelector('.file-editor textarea');
      return Boolean(textarea && textarea.value === ${JSON.stringify(DRAFT_CONTENT)});
    })()
  `, 8000));
  assertStep("PASS308_OPEN_OUTPUTS_PANEL", await openOutputsPanel(win));
  assertStep("PASS308_TIMELINE_CONFLICT_VISIBLE", await waitFor(win, `
    Boolean(Array.from(document.querySelectorAll('.run-timeline-row.error')).find((item) =>
      item.textContent.includes(${JSON.stringify(FILE_NAME)}) && /WORKSPACE_FILE_CONFLICT|外部修改或删除/.test(item.textContent || '')
    ))
  `, 8000));
  assertStep("PASS308_CONFLICT_EVENT_PERSISTED", await waitForStore((parsed) => {
    const events = parsed.runEvents?.filter((event) => event.type === "file-save" && event.path === FILE_NAME) || [];
    const event = events[0] || {};
    const stdout = String(event.stdout || "");
    return events.length === 1 &&
      event.status === "error" &&
      event.cwd === PROJECT_DIR &&
      event.action?.startsWith("workspace:file:") &&
      /WORKSPACE_FILE_CONFLICT|外部修改或删除/.test(event.detail || "") &&
      stdout.includes(FILE_NAME) &&
      stdout.includes(ORIGINAL_SHA256) &&
      stdout.includes(DRAFT_SHA256) &&
      stdout.includes(String(DRAFT_BYTES)) &&
      stdout.includes("\u51b2\u7a81\u539f\u56e0: deleted") &&
      stdout.includes("\u8bfb\u53d6\u65f6\u5b58\u5728: true") &&
      stdout.includes("\u78c1\u76d8\u5f53\u524d\u5b58\u5728: false") &&
      /(?:磁盘字节|Disk bytes): 0/.test(stdout);
  }));

  console.log("PASS308_FILE_DELETION_CONFLICT_DONE");
  await exitWithCleanup(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS308_FAILED", error?.stack || error);
  void exitWithCleanup(1);
});

setTimeout(() => {
  console.error("PASS308_TIMEOUT");
  void exitWithCleanup(1);
}, 90000);
