const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const PROJECT_PATH = path.join(__dirname, "..");
const AUDIT_DIR = path.join(PROJECT_PATH, "docs", "uiux-audit-2026-07-04-live");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass26-workspace-"));

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
          createdAt: "2026-07-04T05:00:00.000Z",
          updatedAt: "2026-07-04T05:00:00.000Z",
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
  await win.webContents.executeJavaScript("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  await wait(250);
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
    console.error("PASS26_FAILED_NO_WINDOW");
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(500);

  assertStep("PASS26_READY_MODEL", await waitFor(win, `
    Boolean(document.querySelector(".model-pill strong")?.textContent?.trim()) &&
    !/claude-sonnet-5|sonnet-5/i.test(document.body.textContent || "")
  `, 15000));

  assertStep("PASS26_OPEN_TOOLS", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.rail-button[data-tool="workspace"]') || document.querySelector(".side-panel-button");
      if (!button) return false;
      button.click();
      return true;
    })();
  `));

  assertStep("PASS26_OPEN_WORKSPACE", await waitFor(win, `
    Boolean(document.querySelector(".tools-panel") && !document.querySelector(".app-grid")?.classList.contains("right-panel-hidden"))
  `, 5000) && await win.webContents.executeJavaScript(`
    (function() {
      if (document.querySelector(".tools-panel .workspace-detail")) return true;
      const row = [...document.querySelectorAll(".tool-row")].find((candidate) => /Workspace|工作区/i.test(candidate.textContent || ""));
      if (!row) return false;
      row.click();
      return true;
    })();
  `));

  assertStep("PASS26_WORKSPACE_SINGLE_COLUMN", await waitFor(win, `
    (function() {
      const detail = document.querySelector(".tools-panel .workspace-detail");
      const grid = detail?.querySelector(".workspace-grid");
      const tree = detail?.querySelector(".file-tree");
      const editor = detail?.querySelector(".file-editor");
      const emptyActions = detail?.querySelector(".workspace-empty-actions");
      const buttons = [...(emptyActions?.querySelectorAll("button") || [])];
      if (!detail || !grid || !tree || !editor || buttons.length < 2) return false;
      const gridStyle = getComputedStyle(grid);
      const treeRect = tree.getBoundingClientRect();
      const editorRect = editor.getBoundingClientRect();
      const actionRects = buttons.map((button) => button.getBoundingClientRect());
      const actionsDoNotOverlap =
        actionRects[0].right <= actionRects[1].left ||
        actionRects[1].right <= actionRects[0].left ||
        actionRects[0].bottom <= actionRects[1].top ||
        actionRects[1].bottom <= actionRects[0].top;
      return Boolean(
        gridStyle.gridTemplateColumns.split(" ").length === 1 &&
        Math.abs(treeRect.left - editorRect.left) <= 2 &&
        editorRect.top > treeRect.bottom - 2 &&
        treeRect.width >= 280 &&
        editorRect.width >= 280 &&
        actionsDoNotOverlap
      );
    })();
  `, 8000));

  await shot(win, "58-pass26-workspace-tool-source.png");
  console.log("PASS26_WORKSPACE_TOOL_DONE");
  app.exit(0);
}).catch((error) => {
  console.error("PASS26_WORKSPACE_TOOL_FAILED", error?.stack || error);
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS26_WORKSPACE_TOOL_TIMEOUT");
  app.exit(1);
}, 60000);
