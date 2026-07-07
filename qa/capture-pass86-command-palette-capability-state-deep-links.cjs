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
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass86-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass86-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass86-project-"));
const MARKETPLACE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass86-market-"));
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

function writeInitialStore() {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.mkdirSync(path.join(MARKETPLACE_DIR, ".claude-plugin"), { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass86-project" }), "utf8");
  writeJson(path.join(MARKETPLACE_DIR, ".claude-plugin", "marketplace.json"), {
    name: "pass86-market-source",
    description: "PASS86 marketplace catalog fixture",
    owner: { name: "PASS86 Owner" },
    plugins: [
      {
        name: "pass86-catalog-plugin",
        version: "8.6.0",
        description: "PASS86 catalog plugin can be deep linked from the command palette.",
        category: "qa",
        author: { name: "PASS86 QA" },
        source: { source: "git", url: "https://example.invalid/pass86.git", path: "plugins/catalog" },
        permissions: ["Read", "Bash"],
      },
    ],
  });
  fs.writeFileSync(
    FAKE_CLAUDE,
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass86& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo {\"plugins\":[{\"id\":\"pass86-plugin@qa-market\",\"name\":\"pass86-plugin\",\"marketplace\":\"qa-market\",\"version\":\"8.6.1\",\"scope\":\"project\",\"enabled\":true,\"source\":\"pass86 local fixture\",\"tools\":[\"pass86-tool\"],\"permissions\":[\"Read\"]}]}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins:& echo   ^> pass86-plugin@qa-market& exit /b 0)",
      `if "%1"=="plugin" if "%2"=="marketplace" if "%3"=="list" if "%4"=="--json" (echo [{"name":"pass86-market-source","source":"path","repo":"${MARKETPLACE_DIR.replace(/\\/g, "\\\\")}","installLocation":"${MARKETPLACE_DIR.replace(/\\/g, "\\\\")}","version":"2026.7.6","status":"ready","permissions":["Read","Bash"]}]& exit /b 0)`,
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces:& echo   ^> pass86-market-source& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo ✓ pass86-mcp: connected · 3 tools · stdio · C:\\\\mcp\\\\pass86-server.cjs& exit /b 0)",
      "echo pass86 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );

  const project = { name: "pass86-project", path: PROJECT_DIR };
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
        id: "pass86-session",
        title: "pass86 work thread",
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

async function runPaletteCommand(win, query, expectedId = "") {
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
      const buttons = Array.from(document.querySelectorAll('.command-modal .command-list button'));
      const expectedId = ${JSON.stringify(expectedId)};
      const button = expectedId
        ? buttons.find((candidate) => (candidate.getAttribute('data-command-id') || '').includes(expectedId))
        : buttons[0];
      if (!button) return false;
      button.click();
      return true;
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
  if (!win) throw new Error("PASS86_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(600);

  assertStep("PASS86_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));

  assertStep("PASS86_PLUGIN_COMMAND_SEARCHABLE", await waitForPaletteCommand(
    win,
    "pass86-tool",
    (command) => command.id.includes("capability-plugin:pass86-plugin%40qa-market") && /pass86-plugin@qa-market/.test(command.text || ""),
  ));
  assertStep("PASS86_OPEN_PLUGIN_FOCUS", await runPaletteCommand(win, "pass86-tool", "capability-plugin:pass86-plugin%40qa-market"));
  assertStep("PASS86_PLUGIN_ROW_FOCUSED", await waitFor(win, `
    Boolean(
      document.querySelector('.plugin-manager-modal') &&
      /\\u63d2\\u4ef6/.test(document.querySelector('.plugin-manager-tabs button.active')?.textContent || '') &&
      document.querySelector('.structured-plugin-row.focused-capability-row[data-plugin-id="pass86-plugin@qa-market"]') &&
      /pass86-tool/.test(document.querySelector('.structured-plugin-row.focused-capability-row')?.textContent || '')
    )
  `, 12000));

  assertStep("PASS86_MCP_COMMAND_SEARCHABLE", await waitForPaletteCommand(
    win,
    "pass86-mcp",
    (command) => command.id.includes("capability-mcp:pass86-mcp") && /pass86-mcp/.test(command.text || ""),
  ));
  assertStep("PASS86_OPEN_MCP_FOCUS", await runPaletteCommand(win, "pass86-mcp", "capability-mcp:pass86-mcp"));
  assertStep("PASS86_MCP_ROW_FOCUSED", await waitFor(win, `
    Boolean(
      document.querySelector('.plugin-manager-modal') &&
      /MCP/.test(document.querySelector('.plugin-manager-tabs button.active')?.textContent || '') &&
      document.querySelector('.structured-plugin-row.focused-capability-row[data-mcp-server-id="pass86-mcp"]') &&
      /pass86-server\\.cjs/.test(document.querySelector('.structured-plugin-row.focused-capability-row')?.textContent || '')
    )
  `, 12000));

  assertStep("PASS86_MARKETPLACE_PLUGIN_COMMAND_SEARCHABLE", await waitForPaletteCommand(
    win,
    "pass86-catalog-plugin",
    (command) => command.id.includes("capability-marketplace-plugin:pass86-catalog-plugin%40pass86-market-source") && /pass86-catalog-plugin/.test(command.text || ""),
  ));
  assertStep("PASS86_OPEN_MARKETPLACE_PLUGIN_FOCUS", await runPaletteCommand(win, "pass86-catalog-plugin", "capability-marketplace-plugin:pass86-catalog-plugin%40pass86-market-source"));
  assertStep("PASS86_MARKETPLACE_PLUGIN_CARD_FOCUSED", await waitFor(win, `
    Boolean(
      document.querySelector('.plugin-manager-modal .marketplace-workbench') &&
      /\\u5e02\\u573a/.test(document.querySelector('.plugin-manager-tabs button.active')?.textContent || '') &&
      document.querySelector('.marketplace-plugin-card.focused-capability-row[data-marketplace-plugin-id="pass86-catalog-plugin@pass86-market-source"]') &&
      /PASS86 QA/.test(document.querySelector('.marketplace-plugin-card.focused-capability-row')?.textContent || '')
    )
  `, 12000));

  assertStep("PASS86_MARKETPLACE_SOURCE_COMMAND_SEARCHABLE", await waitForPaletteCommand(
    win,
    "pass86-market-source",
    (command) => command.id.includes("capability-marketplace-source:pass86-market-source") && /pass86-market-source/.test(command.text || ""),
  ));
  assertStep("PASS86_OPEN_MARKETPLACE_SOURCE_FOCUS", await runPaletteCommand(win, "pass86-market-source", "capability-marketplace-source:pass86-market-source"));
  assertStep("PASS86_MARKETPLACE_SOURCE_ROW_FOCUSED", await waitFor(win, `
    Boolean(
      document.querySelector('.plugin-manager-modal .marketplace-workbench') &&
      /\\u5e02\\u573a/.test(document.querySelector('.plugin-manager-tabs button.active')?.textContent || '') &&
      document.querySelector('.marketplace-source-row.focused-capability-row[data-marketplace-source-id="pass86-market-source"]') &&
      /2026\\.7\\.6/.test(document.querySelector('.marketplace-source-row.focused-capability-row')?.textContent || '')
    )
  `, 12000));

  console.log("PASS86_COMMAND_PALETTE_CAPABILITY_STATE_DEEP_LINKS_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS86_COMMAND_PALETTE_CAPABILITY_STATE_DEEP_LINKS_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS86_COMMAND_PALETTE_CAPABILITY_STATE_DEEP_LINKS_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
