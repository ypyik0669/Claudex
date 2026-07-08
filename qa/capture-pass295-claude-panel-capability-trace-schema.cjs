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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass295-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass295-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass295-project-"));
const MARKETPLACE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass295-market-"));
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");

const INSTALLED_PLUGIN_ID = "pass295-panel-plugin@pass295-market";
const INSTALLED_PLUGIN_NAME = "pass295-panel-plugin";
const MARKETPLACE_NAME = "pass295-market";
const MCP_NAME = "pass295-mcp";
const MARKETPLACE_PLUGIN_ID = "pass295-catalog-plugin@pass295-market";
const MARKETPLACE_PLUGIN_NAME = "pass295-catalog-plugin";

const TRACE_FIELDS = [
  "kind",
  "action",
  "id",
  "name",
  "status",
  "enabled",
  "version",
  "source",
  "marketplace",
  "toolCount",
  "tools",
  "risk",
  "permissions",
  "transport",
  "error",
  "projectPath",
];

const TRACE_SUFFIX = {
  kind: "kind",
  action: "action",
  id: "id",
  name: "name",
  status: "status",
  enabled: "enabled",
  version: "version",
  source: "source",
  marketplace: "marketplace",
  toolCount: "tool-count",
  tools: "tools",
  risk: "risk",
  permissions: "permissions",
  transport: "transport",
  error: "error",
  projectPath: "project-path",
};

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
    description: "PASS295 marketplace fixture",
    owner: { name: "PASS295 Owner" },
    plugins: [
      {
        name: MARKETPLACE_PLUGIN_NAME,
        version: "9.5.1",
        description: "PASS295 catalog plugin shown in the Claude panel trace schema.",
        category: "qa",
        author: { name: "PASS295 QA" },
        source: { source: "git", url: "https://example.invalid/pass295.git", path: "plugins/pass295" },
        tools: [{ name: "pass295-market-tool", description: "PASS295 marketplace tool" }],
        permissions: ["Read", "Bash"],
        risk: "review required",
      },
    ],
  });
  const marketPath = MARKETPLACE_DIR.replace(/\\/g, "\\\\");
  fs.writeFileSync(
    FAKE_CLAUDE,
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass295& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      `if "%1"=="plugin" if "%2"=="list" if "%3"=="--json" (echo {"plugins":[{"id":"${INSTALLED_PLUGIN_ID}","name":"${INSTALLED_PLUGIN_NAME}","marketplace":"${MARKETPLACE_NAME}","version":"9.5.0","scope":"project","enabled":true,"source":"panel fixture","tools":[{"name":"pass295-panel-tool","description":"PASS295 panel tool"}],"permissions":["Read"]}]}& exit /b 0)`,
      `if "%1"=="plugin" if "%2"=="list" (echo Installed plugins:& echo   ^> ${INSTALLED_PLUGIN_ID}& exit /b 0)`,
      `if "%1"=="plugin" if "%2"=="marketplace" if "%3"=="list" if "%4"=="--json" (echo [{"name":"${MARKETPLACE_NAME}","source":"path","repo":"${marketPath}","installLocation":"${marketPath}","version":"2026.7.8","status":"ready","permissions":["Read","Bash"]}]& exit /b 0)`,
      `if "%1"=="plugin" if "%2"=="marketplace" if "%3"=="list" (echo Configured marketplaces:& echo   ^> ${MARKETPLACE_NAME}& exit /b 0)`,
      `if "%1"=="mcp" if "%2"=="list" (echo ${MCP_NAME}: connected ^| 3 tools ^| stdio ^| C:\\mcp\\pass295-server.cjs& exit /b 0)`,
      "echo pass295 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
}

function writeInitialStore() {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass295-project" }), "utf8");
  writeFakeClaude();

  const project = { name: "pass295-project", path: PROJECT_DIR };
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
        id: "pass295-session",
        title: "pass295 trace thread",
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

async function runPaletteCommand(win, query) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));
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

async function readTrace(win, selector) {
  return win.webContents.executeJavaScript(`
    (function() {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return null;
      const fields = ${JSON.stringify(TRACE_FIELDS)};
      const suffix = ${JSON.stringify(TRACE_SUFFIX)};
      return Object.fromEntries(fields.map((field) => [field, element.getAttribute('data-capability-' + suffix[field]) || '']));
    })();
  `);
}

function hasFullTrace(trace) {
  return Boolean(trace && TRACE_FIELDS.every((field) => Object.prototype.hasOwnProperty.call(trace, field)));
}

function traceContains(trace, expected) {
  return Boolean(hasFullTrace(trace) && Object.entries(expected).every(([field, value]) => trace[field] === value));
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS295_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS295_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS295_OPEN_CLAUDE_TOOL", await runPaletteCommand(win, "tool-claude"));
  assertStep("PASS295_CLAUDE_PANEL_TRACE_ROWS_VISIBLE", await waitFor(win, `
    Boolean(
      document.querySelector('#claude-tool-detail [data-capability-kind="plugin"][data-capability-id="${INSTALLED_PLUGIN_ID}"]') &&
      document.querySelector('#claude-tool-detail [data-capability-kind="mcp"][data-capability-id="${MCP_NAME}"]') &&
      document.querySelector('#claude-tool-detail [data-capability-kind="marketplace-source"][data-capability-id="${MARKETPLACE_NAME}"]') &&
      document.querySelector('#claude-tool-detail [data-capability-kind="marketplace-plugin"][data-capability-id="${MARKETPLACE_PLUGIN_ID}"]')
    )
  `, 15000));

  const pluginRow = await readTrace(win, `#claude-tool-detail .plugin-status-item[data-capability-id="${INSTALLED_PLUGIN_ID}"]`);
  const pluginCopy = await readTrace(win, `#claude-tool-detail [data-claude-panel-plugin-action="copy-evidence"][data-capability-id="${INSTALLED_PLUGIN_ID}"]`);
  const pluginDisable = await readTrace(win, `#claude-tool-detail button[data-capability-action="disable"][data-capability-id="${INSTALLED_PLUGIN_ID}"]`);
  assertStep("PASS295_PLUGIN_ROW_TRACE", traceContains(pluginRow, {
    kind: "plugin",
    action: "open",
    id: INSTALLED_PLUGIN_ID,
    name: INSTALLED_PLUGIN_NAME,
    status: "enabled",
    enabled: "true",
    version: "9.5.0",
    marketplace: MARKETPLACE_NAME,
    toolCount: "1",
    tools: "pass295-panel-tool",
    permissions: "Read",
    projectPath: PROJECT_DIR,
  }));
  assertStep("PASS295_PLUGIN_ACTION_TRACE", traceContains(pluginCopy, {
    kind: "plugin",
    action: "copy",
    id: INSTALLED_PLUGIN_ID,
    name: INSTALLED_PLUGIN_NAME,
    projectPath: PROJECT_DIR,
  }) && traceContains(pluginDisable, {
    kind: "plugin",
    action: "disable",
    id: INSTALLED_PLUGIN_ID,
    name: INSTALLED_PLUGIN_NAME,
    projectPath: PROJECT_DIR,
  }));

  const mcpRow = await readTrace(win, `#claude-tool-detail .claude-panel-mcp-row[data-capability-id="${MCP_NAME}"]`);
  const mcpCopy = await readTrace(win, `#claude-tool-detail [data-claude-panel-mcp-action="copy-evidence"][data-capability-id="${MCP_NAME}"]`);
  assertStep("PASS295_MCP_ROW_TRACE", traceContains(mcpRow, {
    kind: "mcp",
    action: "open",
    id: MCP_NAME,
    name: MCP_NAME,
    status: "ok",
    toolCount: "3",
    transport: "stdio",
    projectPath: PROJECT_DIR,
  }));
  assertStep("PASS295_MCP_ACTION_TRACE", traceContains(mcpCopy, {
    kind: "mcp",
    action: "copy",
    id: MCP_NAME,
    name: MCP_NAME,
    status: "ok",
    toolCount: "3",
    transport: "stdio",
    projectPath: PROJECT_DIR,
  }));

  const marketplaceSourceRow = await readTrace(win, `#claude-tool-detail .claude-panel-marketplace-row[data-capability-id="${MARKETPLACE_NAME}"]`);
  const marketplaceSourceCopy = await readTrace(win, `#claude-tool-detail [data-claude-panel-marketplace-source-action="copy-evidence"][data-capability-id="${MARKETPLACE_NAME}"]`);
  assertStep("PASS295_MARKETPLACE_SOURCE_TRACE", traceContains(marketplaceSourceRow, {
    kind: "marketplace-source",
    action: "open",
    id: MARKETPLACE_NAME,
    name: MARKETPLACE_NAME,
    status: "ready",
    version: "2026.7.8",
    permissions: "Read, Bash",
    projectPath: PROJECT_DIR,
  }) && traceContains(marketplaceSourceCopy, {
    kind: "marketplace-source",
    action: "copy",
    id: MARKETPLACE_NAME,
    name: MARKETPLACE_NAME,
    status: "ready",
    version: "2026.7.8",
    permissions: "Read, Bash",
    projectPath: PROJECT_DIR,
  }));

  const marketplacePluginRow = await readTrace(win, `#claude-tool-detail .claude-panel-marketplace-plugin[data-capability-id="${MARKETPLACE_PLUGIN_ID}"]`);
  const marketplacePluginCopy = await readTrace(win, `#claude-tool-detail [data-claude-panel-marketplace-plugin-action="copy-evidence"][data-capability-id="${MARKETPLACE_PLUGIN_ID}"]`);
  assertStep("PASS295_MARKETPLACE_PLUGIN_TRACE", traceContains(marketplacePluginRow, {
    kind: "marketplace-plugin",
    action: "open",
    id: MARKETPLACE_PLUGIN_ID,
    name: MARKETPLACE_PLUGIN_NAME,
    status: "available",
    enabled: "false",
    version: "9.5.1",
    marketplace: MARKETPLACE_NAME,
    toolCount: "1",
    tools: "pass295-market-tool",
    risk: "review required",
    permissions: "Read, Bash",
    projectPath: PROJECT_DIR,
  }) && traceContains(marketplacePluginCopy, {
    kind: "marketplace-plugin",
    action: "copy",
    id: MARKETPLACE_PLUGIN_ID,
    name: MARKETPLACE_PLUGIN_NAME,
    status: "available",
    enabled: "false",
    version: "9.5.1",
    marketplace: MARKETPLACE_NAME,
    toolCount: "1",
    tools: "pass295-market-tool",
    risk: "review required",
    permissions: "Read, Bash",
    projectPath: PROJECT_DIR,
  }));

  assertStep("PASS295_STATUS_REFRESH_DID_NOT_PERSIST_COMMAND_RUNS", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      return !state.commandRuns || state.commandRuns.length === 0;
    })();
  `));

  console.log("PASS295_CLAUDE_PANEL_CAPABILITY_TRACE_SCHEMA_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS295_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (async function() {
          return {
            rows: [...document.querySelectorAll('#claude-tool-detail [data-capability-kind]')].map((item) => ({
              text: item.textContent || '',
              kind: item.getAttribute('data-capability-kind') || '',
              action: item.getAttribute('data-capability-action') || '',
              id: item.getAttribute('data-capability-id') || '',
              name: item.getAttribute('data-capability-name') || '',
              status: item.getAttribute('data-capability-status') || '',
              enabled: item.getAttribute('data-capability-enabled') || '',
              version: item.getAttribute('data-capability-version') || '',
              marketplace: item.getAttribute('data-capability-marketplace') || '',
              toolCount: item.getAttribute('data-capability-tool-count') || '',
              tools: item.getAttribute('data-capability-tools') || '',
              risk: item.getAttribute('data-capability-risk') || '',
              permissions: item.getAttribute('data-capability-permissions') || '',
              transport: item.getAttribute('data-capability-transport') || '',
              projectPath: item.getAttribute('data-capability-project-path') || '',
            })).slice(0, 40),
            text: document.querySelector('#claude-tool-detail')?.textContent || '',
            state: await window.claudexDesktop.getState().catch((stateError) => ({ error: String(stateError?.message || stateError) })),
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS295_DEBUG", JSON.stringify(debug, null, 2).slice(0, 16000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS295_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
