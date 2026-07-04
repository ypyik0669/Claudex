const path = require("path");
const fs = require("fs");
const { app, BrowserWindow } = require("electron");

require(path.join(__dirname, "..", "electron", "main.cjs"));

const PROJECT_PATH = path.join(__dirname, "..");
const AUDIT_DIR = path.join(PROJECT_PATH, "docs", "uiux-audit-2026-07-04");

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
      const buttons = Array.from(document.querySelectorAll("button.tool-row"));
      const button = buttons.find((item) => re.test(item.textContent || ""));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function setInput(win, selector, value) {
  return await win.webContents.executeJavaScript(`
    (function() {
      const input = document.querySelector(${JSON.stringify(selector)});
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })();
  `);
}

async function clickSelector(win, selector) {
  return await win.webContents.executeJavaScript(`
    (function() {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el || el.disabled) return false;
      el.click();
      return true;
    })();
  `);
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

  console.log("OPEN_BROWSER", await clickTool(win, "Browser|浏览器"));
  await wait(400);
  console.log("SET_BROWSER_URL", await setInput(win, ".browser-toolbar input", "https://example.com"));
  console.log("SUBMIT_BROWSER", await clickSelector(win, ".browser-toolbar button[type='submit']"));
  await waitFor(win, `document.querySelector(".browser-status-row.ready, .browser-status-row.error") !== null`, 10000);
  await wait(800);
  await shot(win, "18-pass4-browser-preview.png");

  console.log("OPEN_WORKSPACE", await clickTool(win, "Workspace|工作区"));
  await waitFor(win, `document.querySelector(".workspace-detail .command-runner input") !== null`, 10000);
  console.log("SET_WORKSPACE_COMMAND", await setInput(win, ".workspace-detail .command-runner input", "node --version"));
  console.log("RUN_WORKSPACE_COMMAND", await clickSelector(win, ".workspace-detail .command-runner button"));
  await waitFor(win, `document.querySelector(".workspace-detail .command-output-card.ok, .workspace-detail .command-output-card.error") !== null`, 15000);
  await wait(400);
  await shot(win, "19-pass4-workspace-command-output.png");

  console.log("OPEN_CLAUDE", await clickTool(win, "Claude Code"));
  await waitFor(win, `document.querySelector(".claude-command-detail .command-runner input") !== null`, 10000);
  console.log("SET_CLAUDE_ARGS", await setInput(win, ".claude-command-detail .command-runner input", "--version"));
  await waitFor(win, `document.querySelector(".claude-command-detail .command-runner button:not([disabled])") !== null`, 15000);
  console.log("RUN_CLAUDE_COMMAND", await clickSelector(win, ".claude-command-detail .command-runner button"));
  await waitFor(win, `document.querySelector(".claude-command-detail .command-output-card.ok, .claude-command-detail .command-output-card.error") !== null`, 30000);
  await wait(400);
  await shot(win, "20-pass4-claude-command-output.png");

  console.log("CAPTURE_DONE");
  app.exit(0);
});

setTimeout(() => {
  console.error("CAPTURE_TIMEOUT");
  app.exit(1);
}, 60000);
