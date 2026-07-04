const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const PROJECT_PATH = path.join(__dirname, "..");
const AUDIT_DIR = path.join(PROJECT_PATH, "docs", "uiux-audit-2026-07-04-live");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass17-workspace-empty-"));

app.setPath("userData", USER_DATA_DIR);

fs.mkdirSync(USER_DATA_DIR, { recursive: true });
fs.writeFileSync(
  path.join(USER_DATA_DIR, "desktop-data.json"),
  JSON.stringify(
    {
      version: 1,
      activeProject: { name: "claude-code-app", path: PROJECT_PATH },
      projects: [{ name: "claude-code-app", path: PROJECT_PATH }],
      sessions: [
        {
          id: "default",
          title: "New chat",
          project: "claude-code-app",
          projectPath: PROJECT_PATH,
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

require(path.join(__dirname, "..", "electron", "main.cjs"));

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

async function shot(win, name) {
  const image = await win.webContents.capturePage();
  const outPath = path.join(AUDIT_DIR, name);
  fs.writeFileSync(outPath, image.toPNG());
  console.log("CAPTURED", outPath);
}

function assertStep(name, ok) {
  console.log(name, ok);
  if (!ok) throw new Error(`${name} failed`);
}

app.whenReady().then(async () => {
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.error("PASS17_FAILED_NO_WINDOW");
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(500);

  assertStep("PASS17_READY_SONNET45", await waitFor(win, `
    /claude-sonnet-4-5-20250929/i.test(document.body.textContent || "") &&
    !/claude-sonnet-5|sonnet-5/i.test(document.body.textContent || "")
  `, 15000));

  assertStep("PASS17_OPEN_WORKSPACE", await win.webContents.executeJavaScript(`
    (function() {
      const button = Array.from(document.querySelectorAll("button.tool-row")).find((item) => /Workspace|工作区/i.test(item.textContent || ""));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));

  assertStep("PASS17_WORKSPACE_EMPTY_EDITOR_READY", await waitFor(win, `
    (function() {
      const detail = document.querySelector("#workspace-tool-detail");
      const empty = detail?.querySelector(".workspace-empty-editor");
      const text = empty?.textContent || "";
      const actions = empty?.querySelectorAll(".workspace-empty-actions button") || [];
      return Boolean(
        empty &&
        /No file open|还没有打开文件/.test(text) &&
        /claude-code-app/.test(text) &&
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

  assertStep("PASS17_CONTEXT_READY_FOR_CAPTURE", await waitFor(win, `
    (function() {
      const text = document.querySelector(".context-summary")?.textContent || "";
      return /Ready for work|可以开始工作/i.test(text) && !/Loading|加载中/i.test(text);
    })();
  `, 20000));

  await wait(350);
  await shot(win, "33-pass17-workspace-empty-source.png");

  console.log("PASS17_WORKSPACE_EMPTY_DONE");
  app.exit(0);
}).catch((error) => {
  console.error("PASS17_WORKSPACE_EMPTY_FAILED", error?.stack || error);
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS17_WORKSPACE_EMPTY_TIMEOUT");
  app.exit(1);
}, 60000);
