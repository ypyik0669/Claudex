const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass87-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass87-project-"));
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass87-project" }), "utf8");
  fs.writeFileSync(
    FAKE_CLAUDE,
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass87& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo [{\"id\":\"pass87-plugin@qa\",\"version\":\"1.0.0\",\"scope\":\"user\",\"enabled\":true}]& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins:& echo   ^> pass87-plugin@qa& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo [{\"name\":\"pass87-market\",\"source\":\"qa\",\"repo\":\"https://example.invalid/pass87\"}]& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces:& echo   ^> pass87-market& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo ✓ pass87-mcp: connected& exit /b 0)",
      "echo pass87 ok %*",
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
          model: "claude-haiku-4-5-20251001",
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
        activeProject: { name: "pass87-project", path: PROJECT_DIR },
        projects: [{ name: "pass87-project", path: PROJECT_DIR }],
        sessions: [
          {
            id: "pass87-session",
            title: "pass87 work thread",
            project: "pass87-project",
            projectPath: PROJECT_DIR,
            createdAt: "2026-07-06T00:00:00.000Z",
            updatedAt: "2026-07-06T00:00:00.000Z",
            messages: [],
          },
        ],
        commandRuns: [],
        runEvents: [],
      },
      null,
      2,
    ),
    "utf8",
  );
}

async function firstPaletteCommand(win, query) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return null;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 150));
      const button = document.querySelector('.command-modal .command-list button');
      const result = button ? { id: button.getAttribute('data-command-id') || '', text: button.textContent || '' } : null;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return result;
    })();
  `);
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
      await new Promise((resolve) => setTimeout(resolve, 150));
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
  if (!win) throw new Error("PASS87_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(600);

  assertStep("PASS87_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));

  const mcpCommand = await firstPaletteCommand(win, "mcp settings");
  assertStep("PASS87_MCP_SETTINGS_COMMAND_SEARCHABLE", Boolean(
    mcpCommand &&
    mcpCommand.id.includes("settings-section:mcp") &&
    /MCP/.test(mcpCommand.text || ""),
  ));
  assertStep("PASS87_OPEN_MCP_SETTINGS_SECTION", await runPaletteCommand(win, "mcp settings"));
  assertStep("PASS87_MCP_SETTINGS_SECTION_ACTIVE", await waitFor(win, `
    Boolean(
      document.querySelector('.settings-workspace') &&
      document.querySelector('.settings-nav button.active[data-settings-section="mcp"]') &&
      /pass87-mcp/.test(document.querySelector('.settings-content')?.textContent || '') &&
      document.querySelector('.settings-quick-actions')
    )
  `, 12000));

  const worktreesCommand = await firstPaletteCommand(win, "worktrees settings");
  assertStep("PASS87_WORKTREES_SETTINGS_COMMAND_SEARCHABLE", Boolean(
    worktreesCommand &&
    worktreesCommand.id.includes("settings-section:worktrees") &&
    /Worktrees|工作树/.test(worktreesCommand.text || ""),
  ));
  assertStep("PASS87_OPEN_WORKTREES_SETTINGS_SECTION", await runPaletteCommand(win, "worktrees settings"));
  assertStep("PASS87_WORKTREES_SETTINGS_SECTION_ACTIVE", await waitFor(win, `
    Boolean(
      document.querySelector('.settings-workspace') &&
      document.querySelector('.settings-nav button.active[data-settings-section="worktrees"]') &&
      /pass87-project/.test(document.querySelector('.settings-content')?.textContent || '') &&
      /Git|变更|Claude/.test(document.querySelector('.settings-quick-actions')?.textContent || '')
    )
  `, 8000));

  console.log("PASS87_COMMAND_PALETTE_SETTINGS_SECTION_DEEP_LINKS_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS87_COMMAND_PALETTE_SETTINGS_SECTION_DEEP_LINKS_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS87_COMMAND_PALETTE_SETTINGS_SECTION_DEEP_LINKS_TIMEOUT");
  cleanup();
  app.exit(1);
}, 80000);
