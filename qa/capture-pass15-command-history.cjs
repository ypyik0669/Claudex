const path = require("path");
const fs = require("fs");
const { app, BrowserWindow } = require("electron");

require(path.join(__dirname, "..", "electron", "main.cjs"));

const PROJECT_PATH = path.join(__dirname, "..");
const AUDIT_DIR = path.join(PROJECT_PATH, "docs", "uiux-audit-2026-07-04-live");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(win, script, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const ok = await win.webContents.executeJavaScript(script);
    if (ok) return true;
    await wait(180);
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

async function ensureToolOpen(win, label, detailId) {
  return win.webContents.executeJavaScript(`
    (function() {
      if (document.querySelector(${JSON.stringify(`#${detailId}`)})) return true;
      const button = Array.from(document.querySelectorAll("button.tool-row")).find((item) => (item.textContent || "").includes(${JSON.stringify(label)}));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runClaudeArgs(win, args) {
  const filled = await win.webContents.executeJavaScript(`
    (function() {
      const detail = document.querySelector("#claude-tool-detail");
      const input = detail?.querySelector("input");
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(input, ${JSON.stringify(args)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })();
  `);
  if (!filled) return false;
  await wait(150);
  return win.webContents.executeJavaScript(`
    (function() {
      const detail = document.querySelector("#claude-tool-detail");
      const button = Array.from(detail?.querySelectorAll("button") || []).find((item) => /Run Claude|运行 Claude/i.test(item.textContent || ""));
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `);
}

async function runClaudeQuick(win, args) {
  return win.webContents.executeJavaScript(`
    (function() {
      const detail = document.querySelector("#claude-tool-detail");
      const button = Array.from(detail?.querySelectorAll(".quick-command-row button") || []).find((item) =>
        item.title === ${JSON.stringify(args)} || (item.textContent || "").trim() === ${JSON.stringify(args)}
      );
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `);
}

async function runWorkspaceCommand(win, command) {
  const filled = await win.webContents.executeJavaScript(`
    (function() {
      const detail = document.querySelector("#workspace-tool-detail");
      const input = detail?.querySelector(".command-runner input");
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(input, ${JSON.stringify(command)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })();
  `);
  if (!filled) return false;
  await wait(150);
  return win.webContents.executeJavaScript(`
    (function() {
      const detail = document.querySelector("#workspace-tool-detail");
      const button = detail?.querySelector(".command-runner button");
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `);
}

app.whenReady().then(async () => {
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
  await wait(1600);
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

  assertStep("PASS15_READY_SONNET45", await waitFor(win, `
    /claude-sonnet-4-5-20250929/i.test(document.body.textContent || "") &&
    !/claude-sonnet-5|sonnet-5/i.test(document.body.textContent || "")
  `, 15000));

  assertStep("PASS15_CLAUDE_OPEN", await ensureToolOpen(win, "Claude Code", "claude-tool-detail"));
  assertStep("PASS15_CONTEXT_READY_BEFORE_COMMAND", await waitFor(win, `
    (function() {
      const text = document.querySelector(".context-summary")?.textContent || "";
      return /Ready for work|可以开始工作/i.test(text) && !/Loading|加载中/i.test(text);
    })();
  `, 15000));
  const claudeQuickReady = await waitFor(win, `
    (function() {
      const detail = document.querySelector("#claude-tool-detail");
      const button = Array.from(detail?.querySelectorAll(".quick-command-row button") || []).find((item) => item.title === "auth status");
      return Boolean(button && !button.disabled);
    })();
  `, 15000);
  if (!claudeQuickReady) {
    const debug = await win.webContents.executeJavaScript(`
      (function() {
        const detail = document.querySelector("#claude-tool-detail");
        return {
          text: detail?.textContent || "",
          buttons: Array.from(detail?.querySelectorAll("button") || []).map((item) => ({
            text: (item.textContent || "").trim(),
            title: item.title || "",
            disabled: item.disabled,
            className: item.className || ""
          }))
        };
      })();
    `);
    console.log("PASS15_CLAUDE_QUICK_DEBUG", JSON.stringify(debug));
  }
  assertStep("PASS15_CLAUDE_QUICK_READY", claudeQuickReady);
  assertStep("PASS15_CLAUDE_RUN_AUTH", await runClaudeQuick(win, "auth status"));
  assertStep("PASS15_CLAUDE_HISTORY_FIRST", await waitFor(win, `
    document.querySelectorAll("#claude-tool-detail .command-history .command-output-card.ok, #claude-tool-detail .command-history .command-output-card.error").length >= 1
  `, 20000));
  assertStep("PASS15_CLAUDE_QUICK_READY_AGAIN", await waitFor(win, `
    (function() {
      const detail = document.querySelector("#claude-tool-detail");
      const button = Array.from(detail?.querySelectorAll(".quick-command-row button") || []).find((item) => item.title === "mcp list");
      return Boolean(button && !button.disabled);
    })();
  `, 15000));
  assertStep("PASS15_CLAUDE_RUN_MCP", await runClaudeQuick(win, "mcp list"));
  assertStep("PASS15_CLAUDE_HISTORY_TIMELINE", await waitFor(win, `
    (function() {
      const detail = document.querySelector("#claude-tool-detail");
      const text = detail?.textContent || "";
      return /Recent runs|最近运行/.test(text) &&
        detail.querySelectorAll(".command-history .command-output-card").length >= 1 &&
        detail.querySelectorAll(".command-history-item").length >= 1;
    })();
  `, 25000));
  assertStep("PASS15_CONTEXT_STAYS_READY_DURING_COMMAND", await win.webContents.executeJavaScript(`
    (function() {
      const text = document.querySelector(".context-summary")?.textContent || "";
      return /Ready for work|可以开始工作/i.test(text) && !/Loading|加载中/i.test(text);
    })();
  `));
  await wait(350);
  await shot(win, "27-pass15-claude-command-history-source.png");

  assertStep("PASS15_WORKSPACE_CLICK", await ensureToolOpen(win, "Workspace", "workspace-tool-detail"));
  assertStep("PASS15_WORKSPACE_OPEN", await waitFor(win, `
    Boolean(document.querySelector("#workspace-tool-detail .command-runner input"))
  `, 10000));
  assertStep("PASS15_WORKSPACE_RUN_VERSION", await runWorkspaceCommand(win, "node --version"));
  assertStep("PASS15_WORKSPACE_HISTORY_FIRST", await waitFor(win, `
    document.querySelectorAll("#workspace-tool-detail .command-history .command-output-card.ok, #workspace-tool-detail .command-history .command-output-card.error").length >= 1
  `, 15000));
  assertStep("PASS15_WORKSPACE_RUN_ECHO", await runWorkspaceCommand(win, "node -e \"console.log('history-ok')\""));
  assertStep("PASS15_WORKSPACE_HISTORY_TIMELINE", await waitFor(win, `
    (function() {
      const detail = document.querySelector("#workspace-tool-detail");
      const text = detail?.textContent || "";
      return /Recent runs|最近运行/.test(text) &&
        detail.querySelectorAll(".command-history .command-output-card").length >= 1 &&
        detail.querySelectorAll(".command-history-item").length >= 1;
    })();
  `, 15000));
  await wait(350);
  await shot(win, "28-pass15-workspace-command-history-source.png");

  console.log("PASS15_CAPTURE_DONE");
  app.exit(0);
}).catch((error) => {
  console.error("PASS15_CAPTURE_FAILED", error?.stack || error);
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS15_CAPTURE_TIMEOUT");
  app.exit(1);
}, 90000);
