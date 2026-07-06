const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass93-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass93-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass93-project-"));
const MARKETPLACE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass93-market-"));
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
    name: "pass93-market-source",
    description: "PASS93 marketplace fixture",
    plugins: [
      {
        name: "pass93-catalog-plugin",
        version: "9.3.0",
        description: "PASS93 catalog plugin shown in settings.",
        author: { name: "PASS93 QA" },
        source: { source: "git", url: "https://example.invalid/pass93.git", path: "plugins/pass93" },
        permissions: ["Read", "Bash"],
      },
    ],
  });
  const marketPath = MARKETPLACE_DIR.replace(/\\/g, "\\\\");
  fs.writeFileSync(
    FAKE_CLAUDE,
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass93& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo {\"plugins\":[{\"id\":\"pass93-installed-plugin@pass93-market-source\",\"name\":\"pass93-installed-plugin\",\"marketplace\":\"pass93-market-source\",\"version\":\"9.3.1\",\"scope\":\"project\",\"enabled\":true,\"source\":\"pass93 installed\",\"tools\":[\"pass93-tool\"],\"permissions\":[\"Read\"]}]}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins:& echo   ^> pass93-installed-plugin@pass93-market-source& exit /b 0)",
      `if "%1"=="plugin" if "%2"=="marketplace" if "%3"=="list" if "%4"=="--json" (echo [{"name":"pass93-market-source","source":"path","repo":"${marketPath}","installLocation":"${marketPath}","version":"2026.7.6","status":"ready","permissions":["Read","Bash"]}]& exit /b 0)`,
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces:& echo   ^> pass93-market-source& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo pass93-mcp: connected ^| 3 tools ^| stdio ^| C:\\mcp\\pass93-server.cjs& exit /b 0)",
      "echo pass93 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
}

function writeInitialStore() {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass93-project" }), "utf8");
  writeFakeClaude();

  const project = { name: "pass93-project", path: PROJECT_DIR };
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
        id: "pass93-session",
        title: "pass93 thread",
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
  if (!win) throw new Error("PASS93_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(600);

  assertStep("PASS93_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS93_OPEN_MCP_SETTINGS", await runPaletteCommand(win, "mcp settings"));
  assertStep("PASS93_SETTINGS_MCP_STRUCTURED_VISIBLE", await waitFor(win, `
    (function() {
      const content = document.querySelector('.settings-content');
      const plugin = content?.querySelector('.settings-mcp-plugin-row');
      const mcp = content?.querySelector('.settings-mcp-server-row');
      const source = content?.querySelector('.settings-mcp-marketplace-row');
      const catalog = content?.querySelector('.settings-mcp-marketplace-plugin-row');
      const text = content?.textContent || '';
      return Boolean(
        document.querySelector('.settings-nav button.active[data-settings-section="mcp"]') &&
        plugin && /pass93-installed-plugin/.test(plugin.textContent || '') && /9\\.3\\.1/.test(plugin.textContent || '') &&
        mcp && /pass93-mcp/.test(mcp.textContent || '') && /3/.test(mcp.textContent || '') && /stdio/.test(mcp.textContent || '') &&
        source && /pass93-market-source/.test(source.textContent || '') && /2026\\.7\\.6/.test(source.textContent || '') &&
        catalog && /pass93-catalog-plugin/.test(catalog.textContent || '') && /PASS93 QA/.test(catalog.textContent || '') &&
        /结构化|structured|MCP/.test(text)
      );
    })();
  `, 15000));

  assertStep("PASS93_SETTINGS_RAW_OUTPUT_COLLAPSED", await waitFor(win, `
    (function() {
      const raw = document.querySelector('.settings-mcp-raw-details .settings-raw-output');
      return Boolean(raw && /pass93-installed-plugin/.test(raw.textContent || '') && /pass93-mcp/.test(raw.textContent || ''));
    })();
  `, 5000));

  assertStep("PASS93_STATUS_REFRESH_DID_NOT_PERSIST_COMMAND_RUNS", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      return !state.commandRuns || state.commandRuns.length === 0;
    })();
  `));

  console.log("PASS93_SETTINGS_MCP_STRUCTURED_STATUS_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS93_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS93_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
