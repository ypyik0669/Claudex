const path = require("path");
const fs = require("fs");
const { app, BrowserWindow } = require("electron");

require(path.join(__dirname, "..", "electron", "main.cjs"));

const PROJECT_PATH = path.join(__dirname, "..");
const AUDIT_DIR = path.join(PROJECT_PATH, "docs", "uiux-audit-2026-07-04-live");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(win, script, timeoutMs = 8000) {
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

async function clickTool(win, pattern) {
  return await win.webContents.executeJavaScript(`
    (function() {
      const re = new RegExp(${JSON.stringify(pattern)}, "i");
      const button = Array.from(document.querySelectorAll("button.tool-row")).find((item) => re.test(item.textContent || ""));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

function assertStep(name, ok) {
  console.log(name, ok);
  if (!ok) throw new Error(`${name} failed`);
}

app.whenReady().then(async () => {
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
  await wait(1800);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.error("CAPTURE_FAILED_NO_WINDOW");
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(500);
  await win.webContents.executeJavaScript(`
    window.claudexDesktop.setActiveProject(${JSON.stringify({ name: "claude-code-app", path: PROJECT_PATH })});
  `);
  await new Promise((resolve) => {
    win.webContents.once("did-finish-load", resolve);
    win.webContents.reload();
  });
  await wait(1200);
  assertStep("WAIT_CONTEXT_SUMMARY", await waitFor(win, `
    (function() {
      const card = document.querySelector(".context-summary");
      const text = card?.textContent || "";
      return /Ready for work|已准备/i.test(text) && /api_key/i.test(text) && /claude-sonnet-4-5-20250929/i.test(text);
    })();
  `, 15000));
  console.log("CONTEXT_SUMMARY", await win.webContents.executeJavaScript(`
    document.querySelector(".context-summary")?.innerText || ""
  `));
  assertStep("EMPTY_STATE_COMPOSED", await waitFor(win, `
    (function() {
      const empty = document.querySelector(".empty-state");
      const text = empty?.textContent || "";
      const h1 = empty?.querySelector("h1")?.textContent || "";
      const prompt = empty?.querySelector(".prompt-box textarea");
      const starterActions = empty?.querySelector(".starter-actions");
      return Boolean(
        empty &&
        prompt &&
        !starterActions &&
        /What should we work on\\?|今天要做什么/.test(h1) &&
        /Sonnet 4\\.5/.test(text)
      );
    })();
  `, 5000));
  assertStep("DEFAULT_TOOLS_COLLAPSED", await win.webContents.executeJavaScript(`
    (function() {
      const details = ["#workspace-tool-detail", "#claude-tool-detail", "#browser-tool-detail", "#terminal-tool-detail"];
      const rows = Array.from(document.querySelectorAll("button.tool-row"));
      return details.every((selector) => !document.querySelector(selector)) &&
        rows.length >= 4 &&
        rows.every((row) => row.getAttribute("aria-expanded") === "false");
    })();
  `));
  assertStep("OPEN_WORKSPACE", await clickTool(win, "Workspace|工作区"));
  assertStep("WORKSPACE_FOCUSED_TREE", await waitFor(win, `
    (function() {
      const detail = document.querySelector("#workspace-tool-detail");
      const text = detail?.textContent || "";
      const commandInput = detail?.querySelector(".command-runner input");
      const runButton = detail?.querySelector(".command-runner button");
      return Boolean(
        detail &&
        /src/.test(text) &&
        !/release-pass\\d+/i.test(text) &&
        commandInput &&
        commandInput.value === "" &&
        runButton?.disabled
      );
    })();
  `, 8000));
  const rightPanelOverflow = await win.webContents.executeJavaScript(`
    (function() {
      const page = document.documentElement;
      const group = document.querySelector(".tool-group");
      const detail = document.querySelector("#workspace-tool-detail");
      const workspaceGrid = document.querySelector("#workspace-tool-detail .workspace-grid");
      const commandRunner = document.querySelector("#workspace-tool-detail .command-runner");
      const runButton = document.querySelector("#workspace-tool-detail .command-runner button");
      if (!group || !runButton) return false;
      const groupRect = group.getBoundingClientRect();
      const detailRect = detail?.getBoundingClientRect();
      const workspaceGridRect = workspaceGrid?.getBoundingClientRect();
      const commandRunnerRect = commandRunner?.getBoundingClientRect();
      const buttonRect = runButton.getBoundingClientRect();
      const ok = (
        page.scrollWidth <= page.clientWidth + 1 &&
        group.scrollWidth <= group.clientWidth + 1 &&
        buttonRect.right <= groupRect.right + 1
      );
      return {
        ok,
        pageClientWidth: page.clientWidth,
        pageScrollWidth: page.scrollWidth,
        groupClientWidth: group.clientWidth,
        groupScrollWidth: group.scrollWidth,
        groupRight: groupRect.right,
        detailWidth: detailRect?.width,
        detailRight: detailRect?.right,
        workspaceGridWidth: workspaceGridRect?.width,
        commandRunnerWidth: commandRunnerRect?.width,
        commandRunnerRight: commandRunnerRect?.right,
        buttonRight: buttonRect.right
      };
    })();
  `);
  console.log("RIGHT_PANEL_METRICS", JSON.stringify(rightPanelOverflow));
  assertStep("ASSERT_NO_RIGHT_PANEL_OVERFLOW", rightPanelOverflow.ok);

  await shot(win, "15-pass11-empty-state-source.png");

  assertStep("OPEN_BROWSER", await clickTool(win, "Browser|浏览器"));
  assertStep("WAIT_BROWSER_EMPTY", await waitFor(win, `document.querySelector(".browser-empty-panel") !== null`, 5000));
  assertStep("ASSERT_BROWSER_IDLE", await win.webContents.executeJavaScript(`
    (function() {
      const frame = document.querySelector(".browser-frame");
      const empty = document.querySelector(".browser-empty-panel");
      const webview = document.querySelector(".browser-frame webview");
      const buttons = Array.from(document.querySelectorAll(".browser-toolbar button"));
      const preview = buttons.find((button) => (button.textContent || "").includes("Preview") || (button.textContent || "").includes("预览"));
      const external = buttons.find((button) => (button.textContent || "").includes("external") || (button.textContent || "").includes("外部"));
      return Boolean(frame && empty && !webview && preview?.disabled && external?.disabled);
    })();
  `));
  await wait(300);
  await shot(win, "16-pass11-browser-empty-source.png");

  console.log("CAPTURE_DONE");
  app.exit(0);
}).catch((error) => {
  console.error("CAPTURE_FAILED", error?.stack || error);
  app.exit(1);
});

setTimeout(() => {
  console.error("CAPTURE_TIMEOUT");
  app.exit(1);
}, 60000);
