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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass296-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass296-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass296-project-"));
const MARKETPLACE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass296-market-"));
const FAIL_MARKER = path.join(FAKE_BIN_DIR, "fail-status.marker");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");

const PLUGIN_ID = "pass296-installed-plugin@pass296-market";
const MCP_NAME = "pass296-mcp";
const MARKETPLACE_NAME = "pass296-market";
const MARKETPLACE_PLUGIN_ID = "pass296-catalog-plugin@pass296-market";

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
    name: MARKETPLACE_NAME,
    description: "PASS296 marketplace fixture",
    plugins: [
      {
        name: "pass296-catalog-plugin",
        version: "9.6.0",
        description: "PASS296 catalog plugin for persistent capability snapshot.",
        source: { source: "git", url: "https://example.invalid/pass296.git" },
        tools: ["pass296-market-tool"],
        permissions: ["Read", "Bash"],
      },
    ],
  });
  const failMarker = FAIL_MARKER.replace(/\\/g, "\\\\");
  const marketPath = MARKETPLACE_DIR.replace(/\\/g, "\\\\");
  fs.writeFileSync(
    FAKE_CLAUDE,
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass296& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      `if exist "${failMarker}" if "%1"=="plugin" if "%2"=="list" (echo pass296 plugin failed 1>&2& exit /b 9)`,
      `if exist "${failMarker}" if "%1"=="mcp" if "%2"=="list" (echo pass296 mcp failed 1>&2& exit /b 8)`,
      `if exist "${failMarker}" if "%1"=="plugin" if "%2"=="marketplace" if "%3"=="list" (echo pass296 marketplace failed 1>&2& exit /b 7)`,
      `if "%1"=="plugin" if "%2"=="list" if "%3"=="--json" (echo {"plugins":[{"id":"${PLUGIN_ID}","name":"pass296-installed-plugin","marketplace":"${MARKETPLACE_NAME}","version":"9.6.1","scope":"project","enabled":true,"source":"pass296 fixture","tools":["pass296-installed-tool"],"permissions":["Read"]}]}& exit /b 0)`,
      `if "%1"=="plugin" if "%2"=="list" (echo Installed plugins:& echo   ^> ${PLUGIN_ID}& exit /b 0)`,
      `if "%1"=="mcp" if "%2"=="list" if "%3"=="--json" (echo {"mcpServers":[{"name":"${MCP_NAME}","status":"connected","tools":["pass296-mcp-tool"],"transport":"stdio","source":"C:/mcp/pass296-server.cjs"}]}& exit /b 0)`,
      `if "%1"=="mcp" if "%2"=="list" (echo ${MCP_NAME}: connected ^| 1 tools ^| stdio ^| C:\\mcp\\pass296-server.cjs& exit /b 0)`,
      `if "%1"=="plugin" if "%2"=="marketplace" if "%3"=="list" if "%4"=="--json" (echo [{"name":"${MARKETPLACE_NAME}","source":"path","repo":"${marketPath}","installLocation":"${marketPath}","version":"2026.7.8","status":"ready","permissions":["Read","Bash"]}]& exit /b 0)`,
      `if "%1"=="plugin" if "%2"=="marketplace" if "%3"=="list" (echo Configured marketplaces:& echo   ^> ${MARKETPLACE_NAME}& exit /b 0)`,
      "echo pass296 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
}

function writeInitialStore() {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass296-project" }), "utf8");
  writeFakeClaude();

  const project = { name: "pass296-project", path: PROJECT_DIR };
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
        id: "pass296-session",
        title: "PASS296 capability status snapshot",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-08T00:00:00.000Z",
        updatedAt: "2026-07-08T00:00:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    runEvents: [],
    notices: [],
    automations: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
  });
}

async function openPaletteCommand(win, commandId, query) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === ${JSON.stringify(commandId)});
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS296_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS296_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));

  assertStep("PASS296_STATUS_REFRESH_WRITES_SNAPSHOT", await win.webContents.executeJavaScript(`
    (async function() {
      const status = await window.claudexDesktop.getClaudeStatus({ projectPath: ${JSON.stringify(PROJECT_DIR)} });
      const state = await window.claudexDesktop.getState();
      const snapshot = state.capabilityStatus || {};
      return Boolean(
        status.refreshedAt &&
        snapshot.refreshedAt &&
        snapshot.project?.path === ${JSON.stringify(PROJECT_DIR)} &&
        snapshot.available === true &&
        snapshot.pluginItems?.some((item) => item.id === ${JSON.stringify(PLUGIN_ID)}) &&
        snapshot.mcpServers?.some((item) => item.name === ${JSON.stringify(MCP_NAME)} && item.tools === 1) &&
        snapshot.marketplaces?.some((item) => item.name === ${JSON.stringify(MARKETPLACE_NAME)}) &&
        snapshot.marketplacePlugins?.some((item) => item.id === ${JSON.stringify(MARKETPLACE_PLUGIN_ID)}) &&
        (!state.commandRuns || state.commandRuns.length === 0)
      );
    })();
  `));

  fs.writeFileSync(FAIL_MARKER, "fail", "utf8");
  assertStep("PASS296_FAILED_REFRESH_RETAINS_LAST_KNOWN_GOOD", await win.webContents.executeJavaScript(`
    (async function() {
      const status = await window.claudexDesktop.getClaudeStatus({ projectPath: ${JSON.stringify(PROJECT_DIR)} });
      const state = await window.claudexDesktop.getState();
      const snapshot = state.capabilityStatus || {};
      return Boolean(
        status.pluginCommand?.code === 9 &&
        status.mcpCommand?.code === 8 &&
        status.marketplaceCommand?.code === 7 &&
        /pass296 plugin failed/.test(status.lastError || '') &&
        /pass296 mcp failed/.test(status.lastError || '') &&
        /pass296 marketplace failed/.test(status.lastError || '') &&
        snapshot.pluginItems?.some((item) => item.id === ${JSON.stringify(PLUGIN_ID)}) &&
        snapshot.mcpServers?.some((item) => item.name === ${JSON.stringify(MCP_NAME)}) &&
        snapshot.marketplaces?.some((item) => item.name === ${JSON.stringify(MARKETPLACE_NAME)}) &&
        snapshot.marketplacePlugins?.some((item) => item.id === ${JSON.stringify(MARKETPLACE_PLUGIN_ID)}) &&
        (!state.commandRuns || state.commandRuns.length === 0)
      );
    })();
  `));

  assertStep("PASS296_OPEN_CAPABILITY_SURFACE_FROM_SNAPSHOT", await openPaletteCommand(win, "capability-mcp", "capability-mcp"));
  assertStep("PASS296_SURFACE_SHOWS_SNAPSHOT_AND_ISSUES", await waitFor(win, `
    Boolean(
      document.querySelector('.capability-modal') &&
      document.querySelector('.capability-modal [data-mcp-server-id="${MCP_NAME}"]') &&
      /pass296 mcp failed/.test(document.querySelector('.capability-modal')?.textContent || '')
    )
  `, 15000));

  assertStep("PASS296_RELOAD_RESTORES_SNAPSHOT", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      return Boolean(
        state.capabilityStatus?.refreshedAt &&
        state.capabilityStatus?.pluginItems?.some((item) => item.id === ${JSON.stringify(PLUGIN_ID)}) &&
        state.capabilityStatus?.mcpServers?.some((item) => item.name === ${JSON.stringify(MCP_NAME)}) &&
        state.capabilityStatus?.marketplacePlugins?.some((item) => item.id === ${JSON.stringify(MARKETPLACE_PLUGIN_ID)})
      );
    })();
  `));

  console.log("PASS296_CAPABILITY_STATUS_SNAPSHOT_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS296_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (async function() {
          return {
            surfaceText: document.querySelector('.capability-modal')?.textContent || '',
            capabilityRows: [...document.querySelectorAll('.capability-modal [data-capability-kind], .capability-modal [data-mcp-server-id]')].slice(0, 30).map((item) => ({
              text: item.textContent || '',
              kind: item.getAttribute('data-capability-kind') || '',
              id: item.getAttribute('data-capability-id') || item.getAttribute('data-mcp-server-id') || '',
              status: item.getAttribute('data-capability-status') || '',
            })),
            state: await window.claudexDesktop.getState().catch((stateError) => ({ error: String(stateError?.message || stateError) })),
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS296_DEBUG", JSON.stringify(debug, null, 2).slice(0, 16000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS296_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
