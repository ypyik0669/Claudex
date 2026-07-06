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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass134-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass134-project-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass134-bin-"));
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FILE_NAME = "conflict-notice.txt";
const FILE_PATH = path.join(PROJECT_DIR, FILE_NAME);
const ORIGINAL_CONTENT = "pass134 original\n";
const DRAFT_CONTENT = "pass134 original\nrenderer draft should not overwrite\n";
const EXTERNAL_CONTENT = "pass134 external edit wins\n";

function cleanup() {
  for (const dir of [USER_DATA_DIR, PROJECT_DIR, FAKE_BIN_DIR]) {
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

function writeFakeClaude() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(
    FAKE_CLAUDE,
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass134& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins: none& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces: none& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass134 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function writeInitialStore() {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass134-project" }), "utf8");
  fs.writeFileSync(FILE_PATH, ORIGINAL_CONTENT, "utf8");
  writeFakeClaude();
  const project = { name: "pass134-project", path: PROJECT_DIR };
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
      claudeCode: { executionMode: "claude-code", claudeCommand: FAKE_CLAUDE, permissionMode: "default" },
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
        id: "pass134-session",
        title: "Pass134 file conflict notice action",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    runEvents: [],
    automations: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

async function openWorkspaceTool(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = Array.from(document.querySelectorAll('.rail-button[data-tool="workspace"], button.tool-row, button'))
        .find((item) => item.getAttribute('data-tool') === 'workspace' || /Workspace|\\u5de5\\u4f5c\\u533a/.test(item.textContent || ''));
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

async function openNoticesPanel(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = Array.from(document.querySelectorAll('.workspace-context-button, .bottom-panel-tabs button, button'))
        .find((item) => /\\u901a\\u77e5|Notices|Errors/i.test(item.textContent || '') || (item.getAttribute('aria-label') || '').includes('\\u901a\\u77e5'));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS134_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS134_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS134_OPEN_WORKSPACE", await openWorkspaceTool(win));
  assertStep("PASS134_FILE_VISIBLE", await waitFor(win, `
    Array.from(document.querySelectorAll('.file-tree .tree-item')).some((row) => row.textContent.includes(${JSON.stringify(FILE_NAME)}))
  `, 15000));
  assertStep("PASS134_OPEN_FILE", await openConflictFile(win));
  assertStep("PASS134_FILE_OPENED", await waitFor(win, `
    document.querySelector('.file-editor textarea')?.value === ${JSON.stringify(ORIGINAL_CONTENT)}
  `, 8000));
  assertStep("PASS134_EDIT_DRAFT", await editFileDraft(win));
  assertStep("PASS134_REVIEW_FIRST", await clickEditorButton(win, "^(Review|审查)$"));
  assertStep("PASS134_READY_TO_SAVE", await waitFor(win, `
    Boolean(
      document.querySelector('.editor-review-pane') &&
      Array.from(document.querySelectorAll('.editor-change-bar button')).some((button) => /^(Save|保存)$/i.test((button.textContent || '').trim()) && !button.disabled)
    )
  `, 8000));

  fs.writeFileSync(FILE_PATH, EXTERNAL_CONTENT, "utf8");
  assertStep("PASS134_EXTERNAL_WRITE_VISIBLE_TO_DISK", fs.readFileSync(FILE_PATH, "utf8") === EXTERNAL_CONTENT);
  assertStep("PASS134_SAVE_CONFLICT", await clickEditorButton(win, "^(Save|保存)$"));
  assertStep("PASS134_DISK_NOT_OVERWRITTEN", fs.readFileSync(FILE_PATH, "utf8") === EXTERNAL_CONTENT);
  assertStep("PASS134_CONFLICT_EVENT_AND_NOTICE_PERSISTED", await waitForStore((parsed) => {
    const event = parsed.runEvents?.find((item) => item.type === "file-save" && /conflict-notice\.txt/.test(item.title || ""));
    const notice = parsed.notices?.find((item) => /conflict-notice\.txt/.test(item.title || "") && /外部修改/.test(item.detail || ""));
    return Boolean(
      event &&
      event.status === "error" &&
      /外部修改/.test(event.detail || "") &&
      notice &&
      notice.level === "error" &&
      (notice.action || "").startsWith(`workspace:file:${encodeURIComponent(FILE_NAME)}`) &&
      (notice.action || "").includes(`project=${encodeURIComponent(PROJECT_DIR)}`)
    );
  }, 10000));
  assertStep("PASS134_SWITCH_AWAY_FROM_WORKSPACE", await win.webContents.executeJavaScript(`
    (async function() {
      const button = document.querySelector('button[aria-controls="terminal-tool-detail"]') ||
        Array.from(document.querySelectorAll('.rail-button[data-tool="terminal"], button.tool-row, button'))
        .find((item) => item.getAttribute('data-tool') === 'terminal' || /Terminal|\\u7ec8\\u7aef/.test(item.textContent || ''));
      if (!button) return false;
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 250));
      return Boolean(document.querySelector('#terminal-tool-detail') || !document.querySelector('#workspace-tool-detail'));
    })();
  `));
  assertStep("PASS134_OPEN_NOTICES", await openNoticesPanel(win));
  assertStep("PASS134_NOTICE_CARD_ACTION_VISIBLE", await waitFor(win, `
    (function() {
      const card = Array.from(document.querySelectorAll('.notice-card')).find((item) =>
        /conflict-notice\\.txt/.test(item.textContent || '') && /\\u5916\\u90e8\\u4fee\\u6539/.test(item.textContent || '')
      );
      return Boolean(card && card.querySelector('[data-notice-action="open"]'));
    })();
  `, 8000));
  assertStep("PASS134_NOTICE_ACTION_RELOADS_WORKSPACE_FILE", await win.webContents.executeJavaScript(`
    (async function() {
      const card = Array.from(document.querySelectorAll('.notice-card')).find((item) =>
        /conflict-notice\\.txt/.test(item.textContent || '') && /\\u5916\\u90e8\\u4fee\\u6539/.test(item.textContent || '')
      );
      const action = card?.querySelector('[data-notice-action="open"]');
      if (!action) return false;
      action.click();
      await new Promise((resolve) => setTimeout(resolve, 600));
      return Boolean(
        document.querySelector('#workspace-tool-detail') &&
        document.querySelector('.file-editor textarea')?.value === ${JSON.stringify(EXTERNAL_CONTENT)}
      );
    })();
  `));

  console.log("PASS134_FILE_CONFLICT_NOTICE_ACTION_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS134_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS134_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
