const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass82-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass82-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");

function cleanup() {
  for (const dir of [USER_DATA_DIR, PROJECT_DIR]) {
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

function dispatchCtrlT(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 't', ctrlKey: true, bubbles: true }));
      return true;
    })();
  `);
}

app.setPath("userData", USER_DATA_DIR);
fs.mkdirSync(PROJECT_DIR, { recursive: true });
fs.mkdirSync(USER_DATA_DIR, { recursive: true });
fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass82-project" }), "utf8");
fs.writeFileSync(
  DATA_FILE,
  JSON.stringify(
    {
      version: 1,
      activeProject: { name: "pass82-project", path: PROJECT_DIR },
      projects: [{ name: "pass82-project", path: PROJECT_DIR }],
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
          id: "pass82-session",
          title: "Browser shortcut toggle",
          project: "pass82-project",
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
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.error("PASS82_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  try {
    assertStep("PASS82_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && document.querySelector('.app-rail'))", 15000));
    assertStep("PASS82_DEFAULT_CLOSED", await waitFor(win, "Boolean(document.querySelector('.app-grid.right-panel-hidden') && document.querySelector('.app-rail'))", 5000));

    assertStep("PASS82_OPEN_BROWSER_SHORTCUT", await dispatchCtrlT(win));
    assertStep("PASS82_BROWSER_PANEL_OPEN", await waitFor(win, `
      Boolean(
        !document.querySelector('.app-grid')?.classList.contains('right-panel-hidden') &&
        document.querySelector('.tools-panel .browser-detail') &&
        document.querySelector('.tool-row.active[aria-controls="browser-tool-detail"]')
      )
    `, 8000));

    assertStep("PASS82_CLOSE_BROWSER_SHORTCUT", await dispatchCtrlT(win));
    assertStep("PASS82_BROWSER_PANEL_CLOSED", await waitFor(win, `
      Boolean(
        document.querySelector('.app-grid.right-panel-hidden') &&
        document.querySelector('.app-rail') &&
        !document.querySelector('.tools-panel .browser-detail')
      )
    `, 8000));

    assertStep("PASS82_REOPEN_BROWSER_SHORTCUT", await dispatchCtrlT(win));
    assertStep("PASS82_BROWSER_PANEL_REOPENED", await waitFor(win, `
      Boolean(
        !document.querySelector('.app-grid')?.classList.contains('right-panel-hidden') &&
        document.querySelector('.tools-panel .browser-detail')
      )
    `, 8000));

    console.log("PASS82_BROWSER_SHORTCUT_TOGGLE_DONE");
    cleanup();
    app.exit(0);
  } catch (error) {
    console.error("PASS82_BROWSER_SHORTCUT_TOGGLE_FAILED", error?.stack || error);
    cleanup();
    app.exit(1);
  }
});

setTimeout(() => {
  console.error("PASS82_BROWSER_SHORTCUT_TOGGLE_TIMEOUT");
  cleanup();
  app.exit(1);
}, 70000);
