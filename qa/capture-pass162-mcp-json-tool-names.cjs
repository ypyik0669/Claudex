const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

function findRepoDir() {
  const candidates = [
    process.env.CLAUDEX_REPO_DIR,
    process.cwd(),
    __dirname,
    path.join(__dirname, ".."),
  ].filter(Boolean);
  for (const candidate of candidates) {
    let current = path.resolve(candidate);
    while (current && current !== path.dirname(current)) {
      if (
        fs.existsSync(path.join(current, "package.json")) &&
        fs.existsSync(path.join(current, "electron", "main.cjs"))
      ) {
        return current;
      }
      current = path.dirname(current);
    }
  }
  throw new Error("Unable to locate Claudex repo root");
}

const REPO_DIR = findRepoDir();
process.chdir(REPO_DIR);

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass162-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass162-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass162-project-"));
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
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
  const mcpJson = JSON.stringify({
    servers: [
      {
        name: "pass162-mcp",
        status: "connected",
        detail: "PASS162 JSON MCP fixture",
        transport: "stdio",
        source: "C:/mcp/pass162-server.cjs",
        tools: [
          { name: "pass162-search", description: "search fixture workspace" },
          { name: "pass162-fetch", description: "fetch fixture evidence" },
        ],
      },
    ],
  });
  fs.writeFileSync(
    FAKE_CLAUDE,
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass162& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo {\"plugins\":[]}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins: none& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces: none& exit /b 0)",
      `if "%1"=="mcp" if "%2"=="list" if "%3"=="--json" (echo ${mcpJson}& exit /b 0)`,
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo pass162-mcp: connected ^| 2 tools ^| stdio ^| C:\\mcp\\pass162-server.cjs& exit /b 0)",
      "echo pass162 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
}

function writeInitialStore() {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass162-project" }), "utf8");
  writeFakeClaude();

  const project = { name: "pass162-project", path: PROJECT_DIR };
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
        id: "pass162-session",
        title: "pass162 mcp tool names",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    runEvents: [],
    automations: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
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
      await new Promise((resolve) => setTimeout(resolve, 180));
      const button = document.querySelector('.command-modal .command-list button');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function paletteCommands(win, query) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return null;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 180));
      const result = Array.from(document.querySelectorAll('.command-modal .command-list button'))
        .map((button) => ({ id: button.getAttribute('data-command-id') || '', text: button.textContent || '' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return result;
    })();
  `);
}

async function waitForPaletteCommand(win, query, predicate, timeoutMs = 12000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const commands = await paletteCommands(win, query);
    if (Array.isArray(commands) && commands.some((command) => predicate(command))) return true;
    await wait(180);
  }
  return false;
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS162_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS162_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS162_STATUS_HAS_MCP_TOOL_NAMES", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const status = await window.claudexDesktop.getClaudeStatus({ projectPath: state.activeProject?.path });
      const server = (status.mcpServers || []).find((item) => item.name === "pass162-mcp");
      return Boolean(
        server &&
        server.tools === 2 &&
        /pass162-search/.test(server.toolsSummary || "") &&
        /pass162-fetch/.test(server.toolsSummary || "")
      );
    })();
  `, 15000));

  assertStep("PASS162_OPEN_CAPABILITY_MCP", await runPaletteCommand(win, "capability mcp"));
  assertStep("PASS162_CAPABILITY_MCP_TOOL_NAMES_VISIBLE", await waitFor(win, `
    (function() {
      const row = document.querySelector('.structured-plugin-row[data-mcp-server-id="pass162-mcp"]');
      const text = row?.textContent || "";
      return Boolean(row && /pass162-search/.test(text) && /pass162-fetch/.test(text) && /pass162-server\\.cjs/.test(text));
    })();
  `, 12000));

  assertStep("PASS162_MCP_TOOL_NAME_COMMAND_SEARCHABLE", await waitForPaletteCommand(
    win,
    "pass162-fetch",
    (command) => command.id.includes("capability-mcp:pass162-mcp"),
  ));

  await win.webContents.executeJavaScript(`
    (function() {
      const close = document.querySelector('.plugin-manager-modal header button.icon-only');
      if (close) close.click();
      return true;
    })();
  `);
  assertStep("PASS162_OPEN_MCP_SETTINGS", await runPaletteCommand(win, "mcp settings"));
  assertStep("PASS162_SETTINGS_MCP_TOOL_NAMES_VISIBLE", await waitFor(win, `
    (function() {
      const row = document.querySelector('.settings-mcp-server-row');
      const text = row?.textContent || "";
      return Boolean(row && /pass162-mcp/.test(text) && /pass162-search/.test(text) && /pass162-fetch/.test(text));
    })();
  `, 12000));

  console.log("PASS162_MCP_JSON_TOOL_NAMES_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS162_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS162_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
