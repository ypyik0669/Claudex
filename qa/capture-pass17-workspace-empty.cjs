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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass17-workspace-empty-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass17-project-"));
const PROJECT_NAME = "pass17-workspace-project";

function cleanup() {
  for (const dir of [USER_DATA_DIR, PROJECT_DIR]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_error) {
      // best-effort cleanup
    }
  }
}

app.setPath("userData", USER_DATA_DIR);

fs.mkdirSync(USER_DATA_DIR, { recursive: true });
fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: PROJECT_NAME }), "utf8");
fs.writeFileSync(
  path.join(USER_DATA_DIR, "desktop-data.json"),
  JSON.stringify(
    {
      version: 1,
      activeProject: { name: PROJECT_NAME, path: PROJECT_DIR },
      projects: [{ name: PROJECT_NAME, path: PROJECT_DIR }],
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
      sessions: [
        {
          id: "default",
          title: "New chat",
          project: PROJECT_NAME,
          projectPath: PROJECT_DIR,
          createdAt: "2026-07-04T04:00:00.000Z",
          updatedAt: "2026-07-04T04:00:00.000Z",
          messages: [],
        },
      ],
    },
    null,
    2,
  ),
  "utf8",
);

require(path.join(REPO_DIR, "electron", "main.cjs"));

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

app.whenReady().then(async () => {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.error("PASS17_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(500);

  assertStep("PASS17_READY_HAIKU45", await waitFor(win, `
    (async function() {
      if (!document.querySelector('.app-grid') || !window.claudexDesktop) return false;
      const state = await window.claudexDesktop.getState();
      return state?.settings?.model === 'claude-haiku-4-5-20251001' &&
        state?.activeProject?.path === ${JSON.stringify(PROJECT_DIR)} &&
        !/claude-sonnet-4-5|claude-sonnet-5|sonnet-5/i.test(document.body.textContent || "");
    })()
  `, 15000));

  assertStep("PASS17_OPEN_WORKSPACE", await win.webContents.executeJavaScript(`
    (function() {
      const button = Array.from(document.querySelectorAll("button.tool-row")).find((item) => /Workspace|\\u5de5\\u4f5c\\u533a/i.test(item.textContent || ""));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));

  assertStep("PASS17_WORKSPACE_EMPTY_EDITOR_READY", await waitFor(win, `
    (function() {
      const detail = document.querySelector("#workspace-tool-detail");
      const empty = detail?.querySelector(".workspace-empty-editor");
      const project = empty?.querySelector(".workspace-empty-project");
      const text = empty?.textContent || "";
      const actions = empty?.querySelectorAll(".workspace-empty-actions button") || [];
      return Boolean(
        empty &&
        /No file open|\\u8fd8\\u6ca1\\u6709\\u6253\\u5f00\\u6587\\u4ef6/.test(text) &&
        project?.getAttribute('title') === ${JSON.stringify(PROJECT_DIR)} &&
        actions.length === 2 &&
        Array.from(actions).every((button) => !button.disabled)
      );
    })();
  `, 15000));

  assertStep("PASS17_WORKSPACE_EMPTY_NO_OVERFLOW", await win.webContents.executeJavaScript(`
    (function() {
      const editor = document.querySelector("#workspace-tool-detail .file-editor");
      const empty = document.querySelector("#workspace-tool-detail .workspace-empty-editor");
      const actions = document.querySelector("#workspace-tool-detail .workspace-empty-actions");
      if (!editor || !empty || !actions) return false;
      const editorBox = editor.getBoundingClientRect();
      const actionsBox = actions.getBoundingClientRect();
      return editor.scrollWidth <= editor.clientWidth + 1 &&
        empty.scrollWidth <= empty.clientWidth + 1 &&
        actionsBox.left >= editorBox.left &&
        actionsBox.right <= editorBox.right + 1;
    })();
  `));

  assertStep("PASS17_CONTEXT_READY", await waitFor(win, `
    (function() {
      const text = document.querySelector(".context-summary")?.textContent || "";
      return /Ready for work|\\u53ef\\u4ee5\\u5f00\\u59cb\\u5de5\\u4f5c/i.test(text) && !/Loading|\\u52a0\\u8f7d\\u4e2d/i.test(text);
    })();
  `, 20000));

  console.log("PASS17_WORKSPACE_EMPTY_DONE");
  cleanup();
  app.exit(0);
}).catch((error) => {
  console.error("PASS17_WORKSPACE_EMPTY_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS17_WORKSPACE_EMPTY_TIMEOUT");
  cleanup();
  app.exit(1);
}, 60000);
