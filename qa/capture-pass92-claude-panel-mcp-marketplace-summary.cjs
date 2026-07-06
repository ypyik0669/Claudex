const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass92-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass92-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass92-project-"));
const MARKETPLACE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass92-market-"));
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_DIR, MARKETPLACE_DIR]) {
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

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function writeFakeClaude() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.mkdirSync(path.join(MARKETPLACE_DIR, ".claude-plugin"), { recursive: true });
  writeJson(path.join(MARKETPLACE_DIR, ".claude-plugin", "marketplace.json"), {
    name: "pass92-market-source",
    description: "PASS92 marketplace fixture",
    owner: { name: "PASS92 Owner" },
    plugins: [
      {
        name: "pass92-catalog-plugin",
        version: "9.2.0",
        description: "PASS92 catalog plugin shown in the Claude panel.",
        category: "qa",
        author: { name: "PASS92 QA" },
        source: { source: "git", url: "https://example.invalid/pass92.git", path: "plugins/pass92" },
        permissions: ["Read", "Bash"],
      },
    ],
  });
  const marketPath = MARKETPLACE_DIR.replace(/\\/g, "\\\\");
  fs.writeFileSync(
    FAKE_CLAUDE,
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass92& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo {\"plugins\":[{\"id\":\"pass92-installed-plugin@pass92-market-source\",\"name\":\"pass92-installed-plugin\",\"marketplace\":\"pass92-market-source\",\"version\":\"9.2.1\",\"scope\":\"project\",\"enabled\":true,\"source\":\"pass92 installed\",\"tools\":[\"pass92-tool\"],\"permissions\":[\"Read\"]}]}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins:& echo   ^> pass92-installed-plugin@pass92-market-source& exit /b 0)",
      `if "%1"=="plugin" if "%2"=="marketplace" if "%3"=="list" if "%4"=="--json" (echo [{"name":"pass92-market-source","source":"path","repo":"${marketPath}","installLocation":"${marketPath}","version":"2026.7.6","status":"ready","permissions":["Read","Bash"]}]& exit /b 0)`,
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces:& echo   ^> pass92-market-source& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo âœ“ pass92-mcp: connected Â· 4 tools Â· stdio Â· C:\\\\mcp\\\\pass92-server.cjs& exit /b 0)",
      "echo pass92 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
}

function writeInitialStore() {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass92-project" }), "utf8");
  writeFakeClaude();

  const project = { name: "pass92-project", path: PROJECT_DIR };
  writeJson(DATA_FILE, {
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
    activeProject: project,
    projects: [project],
    sessions: [
      {
        id: "pass92-session",
        title: "pass92 thread",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-06T00:00:00.000Z",
        updatedAt: "2026-07-06T00:00:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    runEvents: [],
  });
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
  if (!win) throw new Error("PASS92_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(600);

  assertStep("PASS92_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS92_OPEN_CLAUDE_TOOL", await runPaletteCommand(win, "tool-claude"));
  assertStep("PASS92_CLAUDE_PANEL_MCP_SUMMARY_VISIBLE", await waitFor(win, `
    (function() {
      const row = [...document.querySelectorAll('#claude-tool-detail .claude-panel-mcp-row')]
        .find((item) => /pass92-mcp/.test(item.textContent || ''));
      const text = row?.textContent || '';
      return Boolean(row &&
        /4/.test(text) &&
        /stdio/.test(text) &&
        /pass92-server\\.cjs/.test(text));
    })();
  `, 15000));

  assertStep("PASS92_CLAUDE_PANEL_MARKETPLACE_SUMMARY_VISIBLE", await waitFor(win, `
    (function() {
      const source = [...document.querySelectorAll('#claude-tool-detail .claude-panel-marketplace-row')]
        .find((item) => /pass92-market-source/.test(item.textContent || ''));
      const plugin = [...document.querySelectorAll('#claude-tool-detail .claude-panel-marketplace-plugin')]
        .find((item) => /pass92-catalog-plugin/.test(item.textContent || ''));
      const sourceText = source?.textContent || '';
      const pluginText = plugin?.textContent || '';
      return Boolean(source && plugin &&
        /2026\\.7\\.6/.test(sourceText) &&
        /ready/.test(sourceText) &&
        /PASS92 QA/.test(pluginText) &&
        /9\\.2\\.0/.test(pluginText) &&
        /Read/.test(pluginText));
    })();
  `, 15000));

  assertStep("PASS92_STATUS_REFRESH_DID_NOT_PERSIST_COMMAND_RUNS", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      return !state.commandRuns || state.commandRuns.length === 0;
    })();
  `));

  console.log("PASS92_CLAUDE_PANEL_MCP_MARKETPLACE_SUMMARY_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS92_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS92_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
