const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass51-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass51-project-"));
const FAKE_CLAUDE = path.join(USER_DATA_DIR, "fake-claude.cmd");
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

function writeInitialStore() {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass51-project" }), "utf8");
  fs.writeFileSync(
    FAKE_CLAUDE,
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass51& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo [{\"id\":\"pass51-plugin@qa\",\"version\":\"1.0.0\",\"scope\":\"user\",\"enabled\":true}]& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins:& echo   ^> pass51-plugin@qa& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo [{\"name\":\"pass51-market\",\"source\":\"qa\",\"repo\":\"https://example.invalid/pass51\"}]& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces:& echo   ^> pass51-market& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo ✓ pass51-mcp: connected& exit /b 0)",
      "echo ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(
      {
        version: 1,
        settings: {
          provider: "anthropic",
          model: "claude-sonnet-4-5-20250929",
          baseUrl: "https://api.example.invalid",
          temperature: 0.2,
          timeoutMs: 600000,
          language: "zh",
          appearance: { fontSize: "compact", density: "compact" },
          systemPrompt: "QA",
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
        activeProject: { name: "pass51-project", path: PROJECT_DIR },
        projects: [{ name: "pass51-project", path: PROJECT_DIR }],
        sessions: [
          {
            id: "default",
            title: "新聊天",
            project: "pass51-project",
            projectPath: PROJECT_DIR,
            createdAt: "2026-07-05T00:00:00.000Z",
            updatedAt: "2026-07-05T00:00:00.000Z",
            messages: [],
          },
        ],
        automations: [
          {
            id: "automation_pass51",
            title: "pass51 automation evidence",
            prompt: "pass51",
            enabled: true,
            status: "scheduled",
            schedule: { runAt: "2026-07-06T00:00:00.000Z" },
            project: { name: "pass51-project", path: PROJECT_DIR },
            history: [],
          },
        ],
        subagentRuns: [],
      },
      null,
      2,
    ),
    "utf8",
  );
}

async function runPaletteCommand(win, query) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 120));
      const button = document.querySelector('.command-modal .command-list button');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS51_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(600);

  assertStep("PASS51_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));

  assertStep("PASS51_OPEN_MCP_FROM_PALETTE", await runPaletteCommand(win, "mcp servers"));
  assertStep("PASS51_MCP_TAB_VISIBLE", await waitFor(win, `
    Boolean(
      document.querySelector('.plugin-manager-modal') &&
      /MCP/.test(document.querySelector('.plugin-manager-tabs button.active')?.textContent || '') &&
      /pass51-mcp/.test(document.querySelector('.plugin-manager-list')?.textContent || '')
    )
  `, 12000));

  assertStep("PASS51_OPEN_MARKETPLACE_FROM_PALETTE", await runPaletteCommand(win, "marketplace catalog"));
  assertStep("PASS51_MARKETPLACE_TAB_VISIBLE", await waitFor(win, `
    Boolean(
      document.querySelector('.plugin-manager-modal .marketplace-workbench') &&
      /\\u5e02\\u573a/.test(document.querySelector('.plugin-manager-tabs button.active')?.textContent || '') &&
      /pass51-market/.test(document.querySelector('.marketplace-workbench')?.textContent || '')
    )
  `, 12000));

  assertStep("PASS51_OPEN_PLUGINS_FROM_PALETTE", await runPaletteCommand(win, "installed plugins"));
  assertStep("PASS51_PLUGINS_TAB_VISIBLE", await waitFor(win, `
    Boolean(
      document.querySelector('.plugin-manager-modal') &&
      /\\u63d2\\u4ef6/.test(document.querySelector('.plugin-manager-tabs button.active')?.textContent || '') &&
      /pass51-plugin@qa/.test(document.querySelector('.plugin-manager-list')?.textContent || '')
    )
  `, 12000));

  assertStep("PASS51_OPEN_AUTOMATION_FROM_PALETTE", await runPaletteCommand(win, "automation schedule"));
  assertStep("PASS51_AUTOMATION_MODAL_VISIBLE", await waitFor(win, `
    Boolean(
      document.querySelector('.scheduled-modal') &&
      document.querySelector('.schedule-queue') &&
      /pass51/.test(document.querySelector('.scheduled-modal')?.textContent || '') &&
      /pass51-project/.test(document.querySelector('.scheduled-modal')?.textContent || '')
    )
  `, 8000));

  assertStep("PASS51_OPEN_TASK_CENTER_FROM_PALETTE", await runPaletteCommand(win, "task center"));
  assertStep("PASS51_TASK_CENTER_VISIBLE", await waitFor(win, `
    Boolean(
      !document.querySelector('.scheduled-modal') &&
      document.querySelector('.bottom-work-panel .task-center-summary') &&
      /pass51/.test(document.querySelector('.bottom-work-panel')?.textContent || '')
    )
  `, 8000));

  console.log("PASS51_COMMAND_PALETTE_DEEP_LINKS_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS51_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS51_TIMEOUT");
  cleanup();
  app.exit(1);
}, 80000);
