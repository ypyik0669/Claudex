const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const PROJECT_PATH = path.join(__dirname, "..");
const AUDIT_DIR = path.join(PROJECT_PATH, "docs", "uiux-audit-2026-07-04-live");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass23-main-"));

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
    console.error("PASS23_FAILED_NO_WINDOW");
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(500);

  assertStep("PASS23_READY_SONNET45", await waitFor(win, `
    /claude-sonnet-4-5-20250929/i.test(document.body.textContent || "") &&
    !/claude-sonnet-5|sonnet-5/i.test(document.body.textContent || "")
  `, 15000));

  assertStep("PASS23_DEFAULT_MAIN_FOCUS", await waitFor(win, `
    (function() {
      const grid = document.querySelector(".app-grid");
      const panel = document.querySelector(".tools-panel");
      const toggle = document.querySelector(".workspace-panel-toggle");
      const prompt = document.querySelector(".empty-state .prompt-box");
      const emptyLabel = document.querySelector(".empty-state-copy > span");
      const h1 = document.querySelector(".empty-state h1");
      if (!grid || !panel || !toggle || !prompt || !h1 || emptyLabel) return false;
      const panelStyle = getComputedStyle(panel);
      const toggleRect = toggle.getBoundingClientRect();
      const promptRect = prompt.getBoundingClientRect();
      const workspaceRect = document.querySelector(".workspace").getBoundingClientRect();
      const promptCenter = promptRect.left + promptRect.width / 2;
      const workspaceCenter = workspaceRect.left + workspaceRect.width / 2;
      return Boolean(
        grid.classList.contains("right-panel-hidden") &&
        panelStyle.display === "none" &&
        toggleRect.width > 60 &&
        /Tools/i.test(toggle.textContent || "") &&
        /What should we work on/i.test(h1.textContent || "") &&
        Math.abs(promptCenter - workspaceCenter) < 48
      );
    })();
  `, 8000));

  await shot(win, "50-pass23-main-focus-source.png");

  assertStep("PASS23_OPEN_TOOLS", await win.webContents.executeJavaScript(`
    (function() {
      const toggle = document.querySelector(".workspace-panel-toggle");
      if (!toggle) return false;
      toggle.click();
      return true;
    })();
  `));

  assertStep("PASS23_TOOLS_VISIBLE", await waitFor(win, `
    (function() {
      const grid = document.querySelector(".app-grid");
      const panel = document.querySelector(".tools-panel");
      const panelStyle = panel ? getComputedStyle(panel) : null;
      const title = panel?.querySelector(".panel-toggle > span");
      const context = panel?.querySelector(".context-summary");
      const text = panel?.textContent || "";
      return Boolean(
        grid &&
        panel &&
        panelStyle.display !== "none" &&
        !grid.classList.contains("right-panel-hidden") &&
        title &&
        /Tools/i.test(title.textContent || "") &&
        context &&
        /Ready for work/i.test(text) &&
        /Workspace/i.test(text) &&
        /Claude Code/i.test(text)
      );
    })();
  `, 8000));

  await shot(win, "51-pass23-tools-open-source.png");

  assertStep("PASS23_CTRL_T_OPENS_BROWSER", await win.webContents.executeJavaScript(`
    (function() {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "t", ctrlKey: true, bubbles: true }));
      const panel = document.querySelector(".tools-panel");
      const text = panel?.textContent || "";
      return Boolean(panel && /Browser/i.test(text));
    })();
  `));

  console.log("PASS23_MAIN_FOCUS_DONE");
  app.exit(0);
}).catch((error) => {
  console.error("PASS23_MAIN_FOCUS_FAILED", error?.stack || error);
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS23_MAIN_FOCUS_TIMEOUT");
  app.exit(1);
}, 60000);
