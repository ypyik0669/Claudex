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
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass54-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass54-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FILE_NAME = "conflict.txt";
const FILE_PATH = path.join(PROJECT_DIR, FILE_NAME);
const ORIGINAL_CONTENT = "pass54 original\n";
const DRAFT_CONTENT = "pass54 original\nrenderer draft\n";
const EXTERNAL_CONTENT = "pass54 external edit\n";

function sha256Text(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

const ORIGINAL_SHA256 = sha256Text(ORIGINAL_CONTENT);
const DRAFT_SHA256 = sha256Text(DRAFT_CONTENT);
const EXTERNAL_SHA256 = sha256Text(EXTERNAL_CONTENT);
const DRAFT_BYTES = Buffer.byteLength(DRAFT_CONTENT, "utf8");
const EXTERNAL_BYTES = Buffer.byteLength(EXTERNAL_CONTENT, "utf8");

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

async function waitForStore(predicate, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      if (predicate(parsed)) return true;
    } catch (_error) {
      // Store may still be mid-write.
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass54-project" }), "utf8");
  fs.writeFileSync(FILE_PATH, ORIGINAL_CONTENT, "utf8");
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
    activeProject: { name: "pass54-project", path: PROJECT_DIR },
    projects: [{ name: "pass54-project", path: PROJECT_DIR }],
    sessions: [
      {
        id: "default",
        title: "新聊天",
        project: "pass54-project",
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-05T00:00:00.000Z",
        updatedAt: "2026-07-05T00:00:00.000Z",
        messages: [],
      },
    ],
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
    (function() {
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
    (function() {
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
    (function() {
      const ta = document.querySelector('.file-editor textarea');
      if (!ta) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, ${JSON.stringify(DRAFT_CONTENT)});
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })();
  `);
}

async function clickEditorButton(win, patternSource) {
  return win.webContents.executeJavaScript(`
    (function() {
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
    (function() {
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
  if (!win) throw new Error("PASS54_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS54_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS54_OPEN_WORKSPACE", await openWorkspaceTool(win));
  assertStep("PASS54_FILE_VISIBLE", await waitFor(win, `
    Array.from(document.querySelectorAll('.file-tree .tree-item')).some((row) => row.textContent.includes(${JSON.stringify(FILE_NAME)}))
  `, 15000));
  assertStep("PASS54_OPEN_FILE", await openConflictFile(win));
  assertStep("PASS54_FILE_OPENED", await waitFor(win, `
    document.querySelector('.file-editor textarea')?.value === ${JSON.stringify(ORIGINAL_CONTENT)}
  `, 8000));
  assertStep("PASS54_EDIT_DRAFT", await editFileDraft(win));
  assertStep("PASS54_REVIEW_FIRST", await clickEditorButton(win, "^(Review|审查)$"));
  assertStep("PASS54_READY_TO_SAVE", await waitFor(win, `
    Boolean(
      document.querySelector('.editor-review-pane') &&
      Array.from(document.querySelectorAll('.editor-change-bar button')).some((button) => /^(Save|保存)$/i.test((button.textContent || '').trim()) && !button.disabled)
    )
  `, 8000));

  fs.writeFileSync(FILE_PATH, EXTERNAL_CONTENT, "utf8");
  assertStep("PASS54_EXTERNAL_WRITE_VISIBLE_TO_DISK", fs.readFileSync(FILE_PATH, "utf8") === EXTERNAL_CONTENT);
  assertStep("PASS54_SAVE_CONFLICT", await clickEditorButton(win, "^(Save|保存)$"));
  assertStep("PASS54_CONFLICT_UI", await waitFor(win, `
    Boolean(
      /外部修改/.test(document.querySelector('#workspace-tool-detail .tool-error-row')?.textContent || '') &&
      /重新读取文件/.test(document.querySelector('#workspace-tool-detail .tool-error-row')?.textContent || '')
    )
  `, 10000));
  assertStep("PASS54_DISK_NOT_OVERWRITTEN", fs.readFileSync(FILE_PATH, "utf8") === EXTERNAL_CONTENT);
  assertStep("PASS54_DRAFT_STILL_RECOVERABLE_AFTER_CONFLICT", await waitFor(win, `
    (function() {
      const editButton = Array.from(document.querySelectorAll('.editor-change-bar button')).find((item) =>
        /^(Edit|编辑)$/.test((item.textContent || '').trim()) && !item.disabled
      );
      if (editButton) editButton.click();
      const textarea = document.querySelector('.file-editor textarea');
      const barText = document.querySelector('.editor-change-bar')?.textContent || '';
      return Boolean(
        textarea &&
        textarea.value === ${JSON.stringify(DRAFT_CONTENT)} &&
        !textarea.value.includes(${JSON.stringify(EXTERNAL_CONTENT.trim())}) &&
        /Save|保存|Review|审查|改动|未保存/.test(barText)
      );
    })()
  `, 8000));
  assertStep("PASS54_OPEN_OUTPUTS_PANEL", await openOutputsPanel(win));
  assertStep("PASS54_TIMELINE_CONFLICT_VISIBLE", await waitFor(win, `
    (() => {
      const row = Array.from(document.querySelectorAll('.run-timeline-row.error')).find((item) =>
        /conflict\\.txt/.test(item.textContent || '') && /外部修改/.test(item.textContent || '')
      );
      return Boolean(row);
    })()
  `, 8000));
  assertStep("PASS54_CONFLICT_EVENT_PERSISTED", await waitForStore((parsed) => {
    const events = parsed.runEvents?.filter((event) => event.type === "file-save" && /conflict\.txt/.test(event.title || "")) || [];
    const event = events[0] || {};
    const stdout = String(event.stdout || "");
    return events.length === 1 &&
      event.status === "error" &&
      event.cwd === PROJECT_DIR &&
      event.action?.startsWith("workspace:file:") &&
      /外部修改/.test(event.detail || "") &&
      stdout.includes(FILE_NAME) &&
      stdout.includes(ORIGINAL_SHA256) &&
      stdout.includes(EXTERNAL_SHA256) &&
      stdout.includes(DRAFT_SHA256) &&
      stdout.includes(String(DRAFT_BYTES)) &&
      stdout.includes(String(EXTERNAL_BYTES));
  }));
  assertStep("PASS54_RELOAD_AFTER_CONFLICT", await win.webContents.executeJavaScript(`
    (function() {
      const button = Array.from(document.querySelectorAll('#workspace-tool-detail .tool-error-row button')).find((item) =>
        /重新读取文件/.test(item.textContent || '')
      );
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS54_RELOADED_EXTERNAL_CONTENT", await waitFor(win, `
    document.querySelector('.file-editor textarea')?.value === ${JSON.stringify(EXTERNAL_CONTENT)}
  `, 8000));

  console.log("PASS54_FILE_CONFLICT_EVIDENCE_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS54_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS54_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
