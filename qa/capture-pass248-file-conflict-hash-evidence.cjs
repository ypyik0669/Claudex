const crypto = require("crypto");
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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass248-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass248-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FILE_NAME = "conflict-hash.txt";
const FILE_PATH = path.join(PROJECT_DIR, FILE_NAME);
const ORIGINAL_CONTENT = "pass248 original base\n";
const DRAFT_CONTENT = "pass248 original base\nrenderer protected draft\n";
const EXTERNAL_CONTENT = "pass248 external disk edit\n";
const ORIGINAL_SHA = sha256(ORIGINAL_CONTENT);
const DRAFT_SHA = sha256(DRAFT_CONTENT);
const EXTERNAL_SHA = sha256(EXTERNAL_CONTENT);

function sha256(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass248-project" }), "utf8");
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
    activeProject: { name: "pass248-project", path: PROJECT_DIR },
    projects: [{ name: "pass248-project", path: PROJECT_DIR }],
    sessions: [
      {
        id: "pass248-session",
        title: "PASS248 file conflict hash evidence",
        project: "pass248-project",
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-08T04:48:00.000Z",
        updatedAt: "2026-07-08T04:48:00.000Z",
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
      const button = Array.from(document.querySelectorAll('.workspace-context-button, .bottom-panel-tabs button, button'))
        .find((item) => item.getAttribute('aria-label') === '\\u8f93\\u51fa' || /\\u8f93\\u51fa|Outputs/i.test(item.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS248_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS248_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS248_OPEN_WORKSPACE", await openWorkspaceTool(win));
  assertStep("PASS248_FILE_VISIBLE", await waitFor(win, `
    Array.from(document.querySelectorAll('.file-tree .tree-item')).some((row) => row.textContent.includes(${JSON.stringify(FILE_NAME)}))
  `, 15000));
  assertStep("PASS248_OPEN_FILE", await openConflictFile(win));
  assertStep("PASS248_FILE_OPENED", await waitFor(win, `
    document.querySelector('.file-editor textarea')?.value === ${JSON.stringify(ORIGINAL_CONTENT)}
  `, 8000));
  assertStep("PASS248_EDIT_DRAFT", await editFileDraft(win));
  assertStep("PASS248_REVIEW_FIRST", await clickEditorButton(win, "^(Review|审查)$"));
  assertStep("PASS248_READY_TO_SAVE", await waitFor(win, `
    Boolean(
      document.querySelector('.editor-review-pane') &&
      Array.from(document.querySelectorAll('.editor-change-bar button')).some((button) => /^(Save|保存)$/i.test((button.textContent || '').trim()) && !button.disabled)
    )
  `, 8000));

  fs.writeFileSync(FILE_PATH, EXTERNAL_CONTENT, "utf8");
  assertStep("PASS248_EXTERNAL_WRITE_VISIBLE_TO_DISK", fs.readFileSync(FILE_PATH, "utf8") === EXTERNAL_CONTENT);
  assertStep("PASS248_SAVE_CONFLICT", await clickEditorButton(win, "^(Save|保存)$"));
  assertStep("PASS248_DISK_NOT_OVERWRITTEN", fs.readFileSync(FILE_PATH, "utf8") === EXTERNAL_CONTENT);
  assertStep("PASS248_OPEN_OUTPUTS_PANEL", await openOutputsPanel(win));
  assertStep("PASS248_SELECTED_CONFLICT_HASH_EVIDENCE", await waitFor(win, `
    (function() {
      const row = Array.from(document.querySelectorAll('.run-timeline-row.error')).find((item) =>
        /conflict-hash\\.txt/.test(item.textContent || '') && /外部修改/.test(item.textContent || '')
      );
      row?.querySelector('summary')?.click();
      const panel = document.querySelector('.selected-run-evidence-panel.error');
      const text = panel?.textContent || '';
      return Boolean(
        row &&
        panel &&
        /保存冲突证据/.test(text) &&
        /读取 SHA/.test(text) &&
        /磁盘 SHA/.test(text) &&
        /草稿 SHA/.test(text) &&
        /${ORIGINAL_SHA}/.test(text) &&
        /${EXTERNAL_SHA}/.test(text) &&
        /${DRAFT_SHA}/.test(text) &&
        /草稿字节/.test(text) &&
        /磁盘字节/.test(text)
      );
    })();
  `, 10000));
  assertStep("PASS248_CONFLICT_EVENT_PERSISTED_WITH_HASHES", await waitForStore((parsed) => {
    const event = parsed.runEvents?.find((item) => item.type === "file-save" && /conflict-hash\.txt/.test(item.title || ""));
    const stdout = event?.stdout || "";
    return event?.status === "error" &&
      /保存冲突证据/.test(stdout) &&
      stdout.includes(ORIGINAL_SHA) &&
      stdout.includes(EXTERNAL_SHA) &&
      stdout.includes(DRAFT_SHA);
  }));
  assertStep("PASS248_COPY_CONFLICT_HASH_EVIDENCE", await win.webContents.executeJavaScript(`
    (function() {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text) => { window.__pass248Clipboard = String(text || ''); } },
      });
      const copy = document.querySelector('.selected-run-evidence-panel.error [data-run-timeline-action="copy-evidence"]');
      if (!copy) return false;
      copy.click();
      return true;
    })();
  `));
  assertStep("PASS248_COPIED_CONFLICT_HASH_EVIDENCE", await waitFor(win, `
    (function() {
      const text = window.__pass248Clipboard || '';
      return /保存冲突证据/.test(text) &&
        /读取 SHA: ${ORIGINAL_SHA}/.test(text) &&
        /磁盘 SHA: ${EXTERNAL_SHA}/.test(text) &&
        /草稿 SHA: ${DRAFT_SHA}/.test(text) &&
        /conflict-hash\\.txt/.test(text);
    })();
  `, 5000));

  console.log("PASS248_FILE_CONFLICT_HASH_EVIDENCE_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS248_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (function() {
          return {
            workspace: document.querySelector('#workspace-tool-detail')?.textContent || '',
            panel: document.querySelector('.selected-run-evidence-panel')?.textContent || '',
            clipboard: window.__pass248Clipboard || '',
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS248_DEBUG", JSON.stringify(debug, null, 2).slice(0, 12000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS248_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
