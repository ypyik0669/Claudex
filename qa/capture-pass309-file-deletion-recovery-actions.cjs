const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { app, BrowserWindow, dialog } = require("electron");

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
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass309-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass309-project-"));
const OUTSIDE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass309-outside-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FILE_NAME = "deleted-recovery.txt";
const FILE_PATH = path.join(PROJECT_DIR, FILE_NAME);
const RECOVERY_NAME = "deleted-recovery.recovered.txt";
const RECOVERY_PATH = path.join(PROJECT_DIR, RECOVERY_NAME);
const OUTSIDE_PATH = path.join(OUTSIDE_DIR, RECOVERY_NAME);
const OUTSIDE_PROJECT_FILE = path.join(OUTSIDE_DIR, "unauthorized.recovered.txt");
const OUTSIDE_LINK_DIR = path.join(PROJECT_DIR, "outside-link");
const OUTSIDE_LINK_PATH = path.join(OUTSIDE_LINK_DIR, RECOVERY_NAME);
const HARDLINK_NAME = "outside-hardlink.txt";
const HARDLINK_PATH = path.join(PROJECT_DIR, HARDLINK_NAME);
const OUTSIDE_HARDLINK_PATH = path.join(OUTSIDE_DIR, HARDLINK_NAME);
const NEW_FAILURE_NAME = "new-recovery-write-failure.txt";
const NEW_FAILURE_PATH = path.join(PROJECT_DIR, NEW_FAILURE_NAME);
const ORIGINAL_CONTENT = "pass309 original\n";
const DRAFT_CONTENT = "pass309 original\nrecover this draft\n";
const REVIEWED_DRAFT_CONTENT = "pass309 original\nrecover this draft\nreviewed after conflict\n";
const EXISTING_RECOVERY_CONTENT = "pass309 existing recovery target\n";
const dialogCalls = [];
const dialogResponses = [
  { canceled: true, filePath: undefined },
  { canceled: false, filePath: OUTSIDE_PATH },
  { canceled: false, filePath: OUTSIDE_LINK_PATH },
  { canceled: false, filePath: HARDLINK_PATH },
  { canceled: false, filePath: NEW_FAILURE_PATH },
  { canceled: false, filePath: RECOVERY_PATH },
  { canceled: false, filePath: RECOVERY_PATH },
];
const originalShowSaveDialog = dialog.showSaveDialog;
const originalOpenSync = fs.openSync;
const originalWriteSync = fs.writeSync;
const originalWriteFileSync = fs.writeFileSync;
const partialWriteHandles = new Set();
let partialWriteInjected = false;
let partialWriteBytes = 0;
let partialWriteTarget = RECOVERY_PATH;
let outsideLinkError = "";
let hardlinkError = "";

dialog.showSaveDialog = async (...args) => {
  const options = args.length > 1 ? args[1] : args[0];
  dialogCalls.push(options || {});
  const defaultPath = path.resolve(options?.defaultPath || ".");
  if (defaultPath === path.join(OUTSIDE_DIR, "unauthorized.recovered.txt")) {
    return { canceled: false, filePath: OUTSIDE_PROJECT_FILE };
  }
  return dialogResponses.shift() || { canceled: true, filePath: undefined };
};

function sha256Text(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function isPartialWriteTarget(candidate) {
  try {
    return path.resolve(String(candidate)) === partialWriteTarget;
  } catch (_error) {
    return false;
  }
}

function restorePartialWriteFailureHooks() {
  fs.openSync = originalOpenSync;
  fs.writeSync = originalWriteSync;
  fs.writeFileSync = originalWriteFileSync;
  partialWriteHandles.clear();
}

function injectPartialWrite(buffer, writePartial) {
  const partial = Buffer.from(buffer).subarray(0, Math.max(1, Math.min(7, Buffer.byteLength(buffer))));
  partialWriteBytes = writePartial(partial);
  partialWriteInjected = true;
  restorePartialWriteFailureHooks();
  const error = new Error("PASS309_INJECTED_PARTIAL_WRITE");
  error.code = "PASS309_INJECTED_PARTIAL_WRITE";
  throw error;
}

function installPartialWriteFailureHooks(target = RECOVERY_PATH) {
  partialWriteTarget = path.resolve(target);
  partialWriteInjected = false;
  partialWriteBytes = 0;
  fs.openSync = function patchedOpenSync(file, flags, ...args) {
    const fd = originalOpenSync.call(fs, file, flags, ...args);
    if (isPartialWriteTarget(file) && (flags === "r+" || flags === "wx")) partialWriteHandles.add(fd);
    return fd;
  };
  fs.writeSync = function patchedWriteSync(fd, buffer, offset, length, position) {
    if (!partialWriteInjected && partialWriteHandles.has(fd)) {
      const selected = Buffer.from(buffer).subarray(offset, offset + length);
      return injectPartialWrite(selected, (partial) => originalWriteSync.call(fs, fd, partial, 0, partial.length, position));
    }
    return originalWriteSync.call(fs, fd, buffer, offset, length, position);
  };
  fs.writeFileSync = function patchedWriteFileSync(file, data, options) {
    if (!partialWriteInjected && isPartialWriteTarget(file)) {
      const encoding = typeof options === "string" ? options : options?.encoding || "utf8";
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(String(data), encoding);
      return injectPartialWrite(buffer, (partial) => {
        originalWriteFileSync.call(fs, file, partial);
        return partial.length;
      });
    }
    return originalWriteFileSync.call(fs, file, data, options);
  };
}

function recoveryDialogCalls() {
  return dialogCalls.filter((options) => path.resolve(options?.defaultPath || ".") === RECOVERY_PATH);
}

function cleanup() {
  dialog.showSaveDialog = originalShowSaveDialog;
  restorePartialWriteFailureHooks();
  for (const dir of [USER_DATA_DIR, PROJECT_DIR, OUTSIDE_DIR]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_error) {
      // Best-effort cleanup for Windows file-handle races.
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

async function exitWithCleanup(code) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.destroy();
  }
  await wait(250);
  cleanup();
  app.exit(code);
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
      // Store may be mid-write.
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass309-project" }), "utf8");
  fs.writeFileSync(FILE_PATH, ORIGINAL_CONTENT, "utf8");
  try {
    fs.symlinkSync(OUTSIDE_DIR, OUTSIDE_LINK_DIR, "junction");
  } catch (error) {
    outsideLinkError = error?.message || String(error);
  }
  try {
    fs.writeFileSync(OUTSIDE_HARDLINK_PATH, EXISTING_RECOVERY_CONTENT, "utf8");
    fs.linkSync(OUTSIDE_HARDLINK_PATH, HARDLINK_PATH);
  } catch (error) {
    hardlinkError = error?.message || String(error);
  }
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
    activeProject: { name: "pass309-project", path: PROJECT_DIR },
    projects: [{ name: "pass309-project", path: PROJECT_DIR }],
    sessions: [{
      id: "default",
      title: "PASS309 file deletion recovery actions",
      project: "pass309-project",
      projectPath: PROJECT_DIR,
      createdAt: "2026-07-12T00:00:00.000Z",
      updatedAt: "2026-07-12T00:00:00.000Z",
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
      const panel = document.querySelector('.tools-panel');
      if (!panel || getComputedStyle(panel).display === 'none') {
        const railButton = document.querySelector('.tool-rail-button[data-tool="workspace"]');
        if (!railButton) return false;
        railButton.click();
        return true;
      }
      const button = Array.from(document.querySelectorAll('button.tool-row')).find((item) =>
        /Workspace|工作区/.test(item.textContent || '')
      );
      if (!button) return false;
      if (button.getAttribute('aria-expanded') !== 'true') button.click();
      return true;
    })();
  `);
}

async function openFile(win, fileName) {
  return win.webContents.executeJavaScript(`
    (() => {
      const item = Array.from(document.querySelectorAll('.file-tree .tree-item')).find((row) =>
        row.textContent.includes(${JSON.stringify(fileName)})
      );
      if (!item) return false;
      item.click();
      return true;
    })();
  `);
}

async function editDraft(win, content = DRAFT_CONTENT) {
  return win.webContents.executeJavaScript(`
    (() => {
      const textarea = document.querySelector('.file-editor textarea');
      if (!textarea) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(textarea, ${JSON.stringify(content)});
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

async function clickConflictAction(win, action) {
  return win.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector('[data-file-conflict-action=${JSON.stringify(action)}]');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `);
}

async function waitForDeletedConflictActions(win) {
  return waitFor(win, `
    (() => {
      const row = document.querySelector('#workspace-tool-detail .tool-error-row');
      const saveAs = row?.querySelector('[data-file-conflict-action="save-as"]');
      const refresh = row?.querySelector('[data-file-conflict-action="refresh"]');
      return Boolean(
        row &&
        /外部修改或删除/.test(row.textContent || '') &&
        saveAs &&
        refresh &&
        !/重新读取文件/.test(row.textContent || '')
      );
    })()
  `, 10000);
}

async function waitForRecoveryActions(win, expectedDraft = REVIEWED_DRAFT_CONTENT) {
  return waitFor(win, `
    (() => {
      const saveAs = document.querySelector('[data-file-conflict-action="save-as"]');
      const refresh = document.querySelector('[data-file-conflict-action="refresh"]');
      const draftVisible = document.querySelector('.file-editor textarea')?.value === ${JSON.stringify(expectedDraft)} ||
        /reviewed after conflict/.test(document.querySelector('.editor-review-pane')?.textContent || '');
      return Boolean(saveAs && refresh && !saveAs.disabled && !refresh.disabled && draftVisible);
    })()
  `, 10000);
}

async function openSourcesPanel(win) {
  return win.webContents.executeJavaScript(`
    (() => {
      const button = Array.from(document.querySelectorAll('.workspace-context-button, .bottom-panel-tabs button'))
        .find((item) => item.getAttribute('aria-label') === '\u6765\u6e90' || /\u6765\u6e90|Sources/.test(item.textContent || ''));
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

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS309_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS309_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS309_HAIKU_45", await win.webContents.executeJavaScript(`
    window.claudexDesktop.getState().then((state) => state.settings?.model === 'claude-haiku-4-5-20251001')
  `));
  assertStep("PASS309_OUTSIDE_JUNCTION_READY", !outsideLinkError && fs.lstatSync(OUTSIDE_LINK_DIR).isSymbolicLink());
  assertStep("PASS309_OUTSIDE_HARDLINK_READY", !hardlinkError && fs.statSync(HARDLINK_PATH, { bigint: true }).nlink > 1n);
  const unauthorizedRootResult = await win.webContents.executeJavaScript(`
    window.claudexDesktop.saveWorkspaceFileAs({
      projectPath: ${JSON.stringify(OUTSIDE_DIR)},
      relativePath: "unauthorized.txt",
      content: "pass309 unauthorized root write\\n",
    })
  `);
  assertStep("PASS309_UNAUTHORIZED_PROJECT_ROOT_REJECTED", Boolean(
    unauthorizedRootResult?.ok === false &&
    unauthorizedRootResult?.code === "WORKSPACE_SAVE_AS_PROJECT_MISMATCH"
  ));
  assertStep("PASS309_UNAUTHORIZED_ROOT_NOT_WRITTEN", !fs.existsSync(OUTSIDE_PROJECT_FILE) && dialogCalls.length === 0);
  assertStep("PASS309_OPEN_WORKSPACE", await openWorkspaceTool(win));
  assertStep("PASS309_FILE_VISIBLE", await waitFor(win, `
    Array.from(document.querySelectorAll('.file-tree .tree-item')).some((row) => row.textContent.includes(${JSON.stringify(FILE_NAME)}))
  `, 15000));
  assertStep("PASS309_OPEN_FILE", await openFile(win, FILE_NAME));
  assertStep("PASS309_FILE_OPENED", await waitFor(win, `
    document.querySelector('.file-editor textarea')?.value === ${JSON.stringify(ORIGINAL_CONTENT)}
  `, 8000));
  assertStep("PASS309_EDIT_DRAFT", await editDraft(win));
  assertStep("PASS309_REVIEW_FIRST", await clickEditorButton(win, "^(Review|审查)$"));
  assertStep("PASS309_READY_TO_SAVE", await waitFor(win, `
    Boolean(
      document.querySelector('.editor-review-pane') &&
      Array.from(document.querySelectorAll('.editor-change-bar button')).some((button) => /^(Save|保存)$/i.test((button.textContent || '').trim()) && !button.disabled)
    )
  `, 8000));

  fs.unlinkSync(FILE_PATH);
  assertStep("PASS309_ORIGINAL_DELETED", !fs.existsSync(FILE_PATH));
  assertStep("PASS309_SAVE_CONFLICT", await clickEditorButton(win, "^(Save|保存)$"));
  assertStep("PASS309_DELETED_CONFLICT_ACTIONS_VISIBLE", await waitForDeletedConflictActions(win));
  assertStep("PASS309_RECOVERY_ACTIONS_VISIBLE_IN_VIEWPORT", await win.webContents.executeJavaScript(`
    (() => {
      const panel = document.querySelector('.tools-panel');
      const actions = document.querySelector('.tool-error-actions');
      if (!panel || !actions || getComputedStyle(panel).display === 'none') return false;
      const rect = actions.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
    })()
  `));
  if (process.env.CLAUDEX_PASS309_CAPTURE) {
    const layout = await win.webContents.executeJavaScript(`
      (() => {
        const describe = (selector) => {
          const element = document.querySelector(selector);
          if (!element) return null;
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            selector,
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom },
            display: style.display,
            visibility: style.visibility,
            opacity: style.opacity,
            position: style.position,
          };
        };
        return {
          viewport: { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth },
          tools: describe('.tools-panel'),
          detail: describe('#workspace-tool-detail'),
          actions: describe('.tool-error-actions'),
          rail: describe('.tool-rail'),
        };
      })()
    `);
    console.log("PASS309_CAPTURE_LAYOUT", JSON.stringify(layout));
    const capturePath = path.resolve(process.env.CLAUDEX_PASS309_CAPTURE);
    fs.mkdirSync(path.dirname(capturePath), { recursive: true });
    const image = await win.webContents.capturePage();
    fs.writeFileSync(capturePath, image.toPNG());
    console.log("PASS309_CAPTURED", capturePath);
  }
  assertStep("PASS309_DIALOG_NOT_OPENED_BEFORE_ACTION", dialogCalls.length === 0);

  assertStep("PASS309_REFRESH_ACTION_CLICKED", await clickConflictAction(win, "refresh"));
  assertStep("PASS309_REFRESH_KEEPS_DRAFT_AND_REMOVES_STALE_TREE_ROW", await waitFor(win, `
    (() => {
      const draftVisible = document.querySelector('.file-editor textarea')?.value === ${JSON.stringify(DRAFT_CONTENT)} ||
        /recover this draft/.test(document.querySelector('.editor-review-pane')?.textContent || '');
      const staleRow = Array.from(document.querySelectorAll('.file-tree .tree-item')).some((row) => row.textContent.includes(${JSON.stringify(FILE_NAME)}));
      return draftVisible && !staleRow && !document.querySelector('#workspace-tool-detail .tool-error-row');
    })()
  `, 10000));

  assertStep("PASS309_SAVE_CONFLICT_AGAIN", await clickEditorButton(win, "^(Save|保存)$"));
  assertStep("PASS309_ACTIONS_VISIBLE_AGAIN", await waitForDeletedConflictActions(win));

  assertStep("PASS309_SAVE_AS_CANCEL_CLICKED", await clickConflictAction(win, "save-as"));
  assertStep("PASS309_SAVE_AS_CANCEL_EVENT_SETTLED", await waitForStore((state) =>
    (state.runEvents || []).some((event) => event.type === "file-save" && event.status === "cancelled" && /另存草稿/.test(event.title || ""))
  ));
  assertStep("PASS309_SAVE_AS_CANCEL_PRESERVES_DRAFT", await waitFor(win, `
    (() => {
      const draftVisible = document.querySelector('.file-editor textarea')?.value === ${JSON.stringify(DRAFT_CONTENT)} ||
        /recover this draft/.test(document.querySelector('.editor-review-pane')?.textContent || '');
      const saveAs = document.querySelector('[data-file-conflict-action="save-as"]');
      return draftVisible && Boolean(saveAs && !saveAs.disabled);
    })()
  `, 10000));
  assertStep("PASS309_CANCEL_DIALOG_TRACE", recoveryDialogCalls().length === 1 && !fs.existsSync(RECOVERY_PATH));

  assertStep("PASS309_KEEP_EDITING_AFTER_CONFLICT", await clickEditorButton(win, "^(Edit|编辑)$"));
  assertStep("PASS309_EDIT_REVIEWED_DRAFT", await editDraft(win, REVIEWED_DRAFT_CONTENT));
  assertStep("PASS309_SAVE_AS_REQUIRES_REVIEW", await clickConflictAction(win, "save-as"));
  assertStep("PASS309_SAVE_AS_REVIEW_GATE_VISIBLE", await waitFor(win, `
    Boolean(
      document.querySelector('.editor-review-pane') &&
      /reviewed after conflict/.test(document.querySelector('.editor-review-pane')?.textContent || '') &&
      document.querySelector('[data-file-conflict-action="save-as"]')
    )
  `, 8000));
  assertStep("PASS309_REVIEW_GATE_DID_NOT_OPEN_DIALOG", recoveryDialogCalls().length === 1 && !fs.existsSync(RECOVERY_PATH));

  assertStep("PASS309_SAVE_AS_OUTSIDE_CLICKED", await clickConflictAction(win, "save-as"));
  assertStep("PASS309_OUTSIDE_EVENT_SETTLED", await waitForStore((state) =>
    (state.runEvents || []).filter((event) => event.type === "file-save" && event.status === "error" && /另存草稿/.test(event.title || "")).length === 1
  ));
  assertStep("PASS309_OUTSIDE_REJECTED", await waitFor(win, `
    /当前项目内/.test(document.querySelector('#workspace-tool-detail .tool-error-row')?.textContent || '')
  `, 10000));
  assertStep("PASS309_OUTSIDE_NOT_WRITTEN", recoveryDialogCalls().length === 2 && !fs.existsSync(OUTSIDE_PATH));
  assertStep("PASS309_OUTSIDE_REJECTION_KEEPS_ACTIONS", await waitFor(win, `
    (() => {
      const draftVisible = document.querySelector('.file-editor textarea')?.value === ${JSON.stringify(REVIEWED_DRAFT_CONTENT)} ||
        /reviewed after conflict/.test(document.querySelector('.editor-review-pane')?.textContent || '');
      return Boolean(document.querySelector('[data-file-conflict-action="save-as"]') && draftVisible);
    })()
  `, 5000));

  assertStep("PASS309_SAVE_AS_LINK_ESCAPE_CLICKED", await clickConflictAction(win, "save-as"));
  assertStep("PASS309_LINK_ESCAPE_EVENT_SETTLED", await waitForStore((state) =>
    (state.runEvents || []).filter((event) => event.type === "file-save" && event.status === "error" && /另存草稿/.test(event.title || "")).length === 2
  ));
  assertStep("PASS309_LINK_ESCAPE_REJECTED", recoveryDialogCalls().length === 3 && !fs.existsSync(OUTSIDE_PATH));
  assertStep("PASS309_LINK_ESCAPE_KEEPS_ACTIONS", await waitForRecoveryActions(win));

  assertStep("PASS309_SAVE_AS_HARDLINK_CLICKED", await clickConflictAction(win, "save-as"));
  assertStep("PASS309_HARDLINK_EVENT_SETTLED", await waitForStore((state) =>
    (state.runEvents || []).filter((event) => event.type === "file-save" && event.status === "error" && /另存草稿/.test(event.title || "")).length === 3
  ));
  assertStep("PASS309_HARDLINK_REJECTED", recoveryDialogCalls().length === 4 && fs.readFileSync(OUTSIDE_HARDLINK_PATH, "utf8") === EXISTING_RECOVERY_CONTENT);
  assertStep("PASS309_HARDLINK_KEEPS_ACTIONS", await waitForRecoveryActions(win));

  installPartialWriteFailureHooks(NEW_FAILURE_PATH);
  try {
    assertStep("PASS309_NEW_PARTIAL_WRITE_CLICKED", await clickConflictAction(win, "save-as"));
    assertStep("PASS309_NEW_PARTIAL_WRITE_EVENT_SETTLED", await waitForStore((state) =>
      (state.runEvents || []).filter((event) => event.type === "file-save" && event.status === "error" && /另存草稿/.test(event.title || "")).length === 4
    ));
  } finally {
    restorePartialWriteFailureHooks();
  }
  console.log("PASS309_NEW_PARTIAL_WRITE_EVIDENCE", JSON.stringify({
    partialWriteInjected,
    partialWriteBytes,
    targetExists: fs.existsSync(NEW_FAILURE_PATH),
    latestSaveAsEvent: (JSON.parse(fs.readFileSync(DATA_FILE, "utf8")).runEvents || [])
      .find((event) => event.type === "file-save" && /另存草稿/.test(event.title || "")),
  }));
  assertStep("PASS309_NEW_PARTIAL_WRITE_INJECTED", partialWriteInjected && partialWriteBytes > 0);
  assertStep("PASS309_NEW_PARTIAL_WRITE_CLEANED", !fs.existsSync(NEW_FAILURE_PATH));
  assertStep("PASS309_NEW_PARTIAL_WRITE_KEEPS_ACTIONS", await waitForRecoveryActions(win));

  fs.writeFileSync(RECOVERY_PATH, EXISTING_RECOVERY_CONTENT, "utf8");
  installPartialWriteFailureHooks(RECOVERY_PATH);
  try {
    assertStep("PASS309_PARTIAL_WRITE_CLICKED", await clickConflictAction(win, "save-as"));
    assertStep("PASS309_PARTIAL_WRITE_EVENT_SETTLED", await waitForStore((state) =>
      (state.runEvents || []).filter((event) => event.type === "file-save" && event.status === "error" && /另存草稿/.test(event.title || "")).length === 5
    ));
  } finally {
    restorePartialWriteFailureHooks();
  }
  assertStep("PASS309_PARTIAL_WRITE_INJECTED", partialWriteInjected && partialWriteBytes > 0);
  assertStep("PASS309_PARTIAL_WRITE_ROLLED_BACK", fs.readFileSync(RECOVERY_PATH, "utf8") === EXISTING_RECOVERY_CONTENT);
  assertStep("PASS309_PARTIAL_WRITE_KEEPS_ACTIONS", await waitForRecoveryActions(win));

  assertStep("PASS309_SAVE_AS_PROJECT_CLICKED", await clickConflictAction(win, "save-as"));
  assertStep("PASS309_RECOVERY_FILE_WRITTEN", await waitFor(win, `
    !document.querySelector('#workspace-tool-detail .tool-error-row') &&
    document.querySelector('.file-editor textarea')?.value === ${JSON.stringify(REVIEWED_DRAFT_CONTENT)}
  `, 10000));
  assertStep("PASS309_RECOVERY_EDITOR_BOUND_TO_NEW_PATH", await waitFor(win, `
    document.querySelector('.file-editor textarea')?.getAttribute('aria-label') === ${JSON.stringify(RECOVERY_NAME)}
  `, 5000));
  assertStep("PASS309_RECOVERY_DISK_CONTENT", fs.existsSync(RECOVERY_PATH) && fs.readFileSync(RECOVERY_PATH, "utf8") === REVIEWED_DRAFT_CONTENT);
  assertStep("PASS309_ORIGINAL_REMAINS_DELETED", !fs.existsSync(FILE_PATH));
  assertStep("PASS309_RECOVERY_TREE_VISIBLE", await waitFor(win, `
    Array.from(document.querySelectorAll('.file-tree .tree-item')).some((row) => row.textContent.includes(${JSON.stringify(RECOVERY_NAME)}))
  `, 10000));
  assertStep("PASS309_DIALOG_OPTIONS_AND_COUNT", Boolean(
    recoveryDialogCalls().length === 7 &&
    recoveryDialogCalls().every((options) => /另存草稿/.test(options.title || ""))
  ));
  assertStep("PASS309_RECOVERY_SOURCE_PERSISTED", await waitForStore((state) => {
    const source = (state.sourceRefs || []).find((item) => item.path === RECOVERY_NAME);
    return source?.project?.path === PROJECT_DIR &&
      source?.sha256 === sha256Text(REVIEWED_DRAFT_CONTENT) &&
      source?.size === Buffer.byteLength(REVIEWED_DRAFT_CONTENT, "utf8");
  }));
  assertStep("PASS309_SAVE_AS_EVENTS_PERSISTED", await waitForStore((state) => {
    const events = (state.runEvents || []).filter((event) => event.type === "file-save" && /另存草稿/.test(event.title || ""));
    const statuses = events.map((event) => event.status).sort();
    const success = events.find((event) => event.status === "ok");
    return events.length === 7 &&
      JSON.stringify(statuses) === JSON.stringify(["cancelled", "error", "error", "error", "error", "error", "ok"]) &&
      success?.path === RECOVERY_NAME &&
      success?.action?.startsWith("workspace:file:");
  }, 10000));
  assertStep("PASS309_OPEN_SOURCES", await openSourcesPanel(win));
  assertStep("PASS309_RECOVERY_SOURCE_VISIBLE", await waitFor(win, `
    Boolean(Array.from(document.querySelectorAll('.source-ref-card')).find((card) =>
      card.textContent.includes(${JSON.stringify(RECOVERY_NAME)})
    ))
  `, 8000));
  assertStep("PASS309_OPEN_OUTPUTS", await openOutputsPanel(win));
  assertStep("PASS309_SAVE_AS_TIMELINE_VISIBLE", await waitFor(win, `
    (() => {
      const rows = Array.from(document.querySelectorAll('.run-timeline-row')).filter((row) =>
        /另存草稿/.test(row.textContent || '')
      );
      return rows.length === 7 &&
        rows.filter((row) => row.classList.contains('cancelled')).length === 1 &&
        rows.filter((row) => row.classList.contains('error')).length === 5 &&
        rows.filter((row) => row.classList.contains('ok')).length === 1 &&
        rows.some((row) => row.classList.contains('ok') && row.textContent.includes(${JSON.stringify(RECOVERY_NAME)}));
    })()
  `, 10000));

  console.log("PASS309_FILE_DELETION_RECOVERY_ACTIONS_DONE");
  await exitWithCleanup(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS309_FAILED", error?.stack || error);
  void exitWithCleanup(1);
});

setTimeout(() => {
  console.error("PASS309_TIMEOUT");
  void exitWithCleanup(1);
}, 120000);
