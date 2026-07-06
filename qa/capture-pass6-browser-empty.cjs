const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const AUDIT_DIR = path.join(REPO_DIR, "docs", "uiux-audit-2026-07-04-live");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass6-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass6-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass6-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_DIR]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_error) {
      // best-effort cleanup
    }
  }
}

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

async function clickTool(win, tool) {
  return win.webContents.executeJavaScript(`
    (function() {
      const rail = document.querySelector('.rail-button[data-tool="${tool}"]');
      if (rail) {
        rail.click();
        return true;
      }
      const row = document.querySelector('button.tool-row[aria-controls="${tool}-tool-detail"]');
      if (!row) return false;
      row.click();
      return true;
    })();
  `);
}

function assertStep(name, ok) {
  console.log(name, ok);
  if (!ok) throw new Error(`${name} failed`);
}

const fakeClaudeScript = `
const args = process.argv.slice(2);
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value) + '\\n'); }
if (args[0] === '--version') out('2.9.0 (pass6 fake)');
else if (args[0] === 'auth') out('Logged in as pass6@example.invalid');
else if (args[0] === 'plugin' && args[1] === 'list' && args[2] === '--json') out([]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins:');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args[3] === '--json') out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces:');
else if (args[0] === 'mcp') out('No MCP servers configured');
else out('pass6 ok');
`;

fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
const FAKE_CLAUDE_COMMAND = path.join(FAKE_BIN_DIR, "claude.cmd");
process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;

app.setPath("userData", USER_DATA_DIR);
fs.mkdirSync(path.join(PROJECT_DIR, "src"), { recursive: true });
fs.mkdirSync(USER_DATA_DIR, { recursive: true });
fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass6-project" }), "utf8");
fs.writeFileSync(path.join(PROJECT_DIR, "src", "index.js"), "console.log('pass6');\n", "utf8");
fs.writeFileSync(
  DATA_FILE,
  JSON.stringify(
    {
      version: 1,
      activeProject: { name: "pass6-project", path: PROJECT_DIR },
      projects: [{ name: "pass6-project", path: PROJECT_DIR }],
      settings: {
        provider: "anthropic",
        model: "claude-haiku-4-5-20251001",
        baseUrl: "https://api.example.invalid",
        temperature: 0.2,
        timeoutMs: 600000,
        language: "zh",
        appearance: { fontSize: "compact", density: "compact" },
        claudeCode: { executionMode: "claude-code", claudeCommand: FAKE_CLAUDE_COMMAND, permissionMode: "default" },
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
          id: "pass6-session",
          title: "新聊天",
          project: "pass6-project",
          projectPath: PROJECT_DIR,
          createdAt: "2026-07-06T00:00:00.000Z",
          updatedAt: "2026-07-06T00:00:00.000Z",
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
    },
    null,
    2,
  ),
  "utf8",
);

require(path.join(REPO_DIR, "electron", "main.cjs"));

app.whenReady().then(async () => {
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.error("CAPTURE_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }

  try {
    win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
    await wait(700);

    assertStep("PASS6_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
    assertStep("PASS6_DEFAULT_RAIL_ONLY", await waitFor(win, "Boolean(document.querySelector('.app-grid.right-panel-hidden') && document.querySelector('.app-rail'))", 5000));
    assertStep("PASS6_OPEN_WORKSPACE_FROM_RAIL", await clickTool(win, "workspace"));
    assertStep("PASS6_CONTEXT_SUMMARY_HAIKU", await waitFor(win, `
      (function() {
        const grid = document.querySelector('.app-grid');
        const card = document.querySelector('.tools-panel .context-summary');
        const text = card?.textContent || '';
        return Boolean(
          grid && !grid.classList.contains('right-panel-hidden') &&
          /pass6-project/.test(text) &&
          /claude-haiku-4-5-20251001/.test(text) &&
          !/claude-sonnet-5|sonnet-5/i.test(text)
        );
      })();
    `, 15000));

    assertStep("PASS6_EMPTY_STATE_COMPOSED", await waitFor(win, `
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
          /What should we work on\\?|\\u4eca\\u5929\\u8981\\u505a\\u4ec0\\u4e48/.test(h1) &&
          /claude-haiku-4-5-20251001/.test(text)
        );
      })();
    `, 5000));

    assertStep("PASS6_WORKSPACE_FOCUSED_TREE", await waitFor(win, `
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
        const runButton = document.querySelector("#workspace-tool-detail .command-runner button");
        if (!group || !runButton) return { ok: false, reason: 'missing tool group or run button' };
        const groupRect = group.getBoundingClientRect();
        const buttonRect = runButton.getBoundingClientRect();
        const ok = (
          page.scrollWidth <= page.clientWidth + 1 &&
          group.scrollWidth <= group.clientWidth + 1 &&
          buttonRect.right <= groupRect.right + 1
        );
        return { ok, pageClientWidth: page.clientWidth, pageScrollWidth: page.scrollWidth, groupClientWidth: group.clientWidth, groupScrollWidth: group.scrollWidth };
      })();
    `);
    console.log("RIGHT_PANEL_METRICS", JSON.stringify(rightPanelOverflow));
    assertStep("PASS6_NO_RIGHT_PANEL_OVERFLOW", rightPanelOverflow.ok);

    await shot(win, "15-pass6-empty-state-source.png");

    assertStep("PASS6_OPEN_BROWSER", await clickTool(win, "browser"));
    assertStep("PASS6_BROWSER_EMPTY", await waitFor(win, "document.querySelector('.browser-empty-panel') !== null", 5000));
    assertStep("PASS6_BROWSER_IDLE", await win.webContents.executeJavaScript(`
      (function() {
        const frame = document.querySelector(".browser-frame");
        const empty = document.querySelector(".browser-empty-panel");
        const webview = document.querySelector(".browser-frame webview");
        const buttons = Array.from(document.querySelectorAll(".browser-toolbar button"));
        const preview = buttons.find((button) => (button.textContent || "").includes("Preview") || (button.textContent || "").includes("\\u9884\\u89c8"));
        const external = buttons.find((button) => (button.textContent || "").includes("external") || (button.textContent || "").includes("\\u5916\\u90e8"));
        return Boolean(frame && empty && !webview && preview?.disabled && external?.disabled);
      })();
    `));
    await wait(300);
    await shot(win, "16-pass6-browser-empty-source.png");

    console.log("PASS6_BROWSER_EMPTY_DONE");
    cleanup();
    app.exit(0);
  } catch (error) {
    console.error("CAPTURE_FAILED", error?.stack || error);
    cleanup();
    app.exit(1);
  }
});

setTimeout(() => {
  console.error("CAPTURE_TIMEOUT");
  cleanup();
  app.exit(1);
}, 70000);
