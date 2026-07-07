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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass261-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass261-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass261-project-"));
const MARKETPLACE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass261-market-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");

const INSTALLED_PLUGIN_ID = "pass261-installed-plugin@pass261-market";
const INSTALLED_TOOL_NAME = "pass261-installed-tool";
const INSTALLED_SCHEMA_TOKEN = "pass261_installed_schema_token";
const MCP_SERVER_NAME = "pass261-mcp";
const MCP_TOOL_NAME = "pass261-mcp-search";
const MCP_SCHEMA_TOKEN = "pass261_mcp_schema_token";
const MARKETPLACE_NAME = "pass261-market";
const MARKET_PLUGIN_ID = "pass261-catalog-plugin@pass261-market";
const MARKET_TOOL_NAME = "pass261-catalog-tool";
const MARKET_SCHEMA_TOKEN = "pass261_market_schema_token";

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
  const fakeClaudeScript = `
const marketplaceDir = ${JSON.stringify(MARKETPLACE_DIR)};
const args = process.argv.slice(2);
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value) + '\\n'); }
const installedJson = {
  plugins: [
    {
      id: '${INSTALLED_PLUGIN_ID}',
      name: 'pass261-installed-plugin',
      marketplace: '${MARKETPLACE_NAME}',
      version: '26.1.0',
      scope: 'project',
      enabled: true,
      status: 'enabled',
      source: 'pass261 installed source',
      tools: [
        {
          name: '${INSTALLED_TOOL_NAME}',
          description: 'PASS261 installed plugin tool description',
          inputSchema: {
            type: 'object',
            properties: { '${INSTALLED_SCHEMA_TOKEN}': { type: 'string' } },
            required: ['${INSTALLED_SCHEMA_TOKEN}']
          }
        }
      ],
      permissions: ['Read', 'Bash']
    }
  ]
};
const mcpJson = {
  servers: [
    {
      name: '${MCP_SERVER_NAME}',
      status: 'ok',
      transport: 'stdio',
      command: 'node pass261-mcp-server.cjs',
      detail: 'PASS261 structured MCP detail',
      source: 'pass261 mcp source',
      tools: [
        {
          name: '${MCP_TOOL_NAME}',
          description: 'PASS261 MCP search tool',
          inputSchema: {
            type: 'object',
            properties: { '${MCP_SCHEMA_TOKEN}': { type: 'string' } },
            required: ['${MCP_SCHEMA_TOKEN}']
          }
        },
        { name: 'pass261-mcp-open', description: 'PASS261 MCP open tool' }
      ]
    }
  ]
};
const marketplaceJson = [
  {
    name: '${MARKETPLACE_NAME}',
    source: 'path',
    repo: marketplaceDir,
    installLocation: marketplaceDir,
    version: '2026.7.7',
    status: 'ready',
    permissions: ['Read', 'Bash']
  }
];
if (args[0] === '--version') out('2.61.0 (Claude Code PASS261)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out(installedJson);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins:\\n\\n  > ${INSTALLED_PLUGIN_ID}\\n    Version: 26.1.0\\n    Status: enabled');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out(mcpJson);
else if (args[0] === 'mcp' && args[1] === 'list') out('${MCP_SERVER_NAME}: ok | 2 tools | stdio | node pass261-mcp-server.cjs');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out(marketplaceJson);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces:\\n\\n  > ${MARKETPLACE_NAME}\\n    Source: Path (' + marketplaceDir + ')');
else out('pass261 fake claude command: ' + args.join(' '));
`;
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(FAKE_CLAUDE, `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function writeInitialStore() {
  writeFakeClaude();
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass261-project" }), "utf8");
  writeJson(path.join(MARKETPLACE_DIR, ".claude-plugin", "marketplace.json"), {
    name: MARKETPLACE_NAME,
    description: "PASS261 marketplace trace fixture",
    owner: { name: "PASS261 Owner" },
    plugins: [
      {
        name: "pass261-catalog-plugin",
        version: "26.1.1",
        description: "PASS261 catalog plugin trace fixture.",
        category: "qa-tools",
        author: { name: "PASS261 QA" },
        source: { source: "git-subdir", url: "https://example.invalid/pass261.git", path: "plugins/pass261", ref: "v26.1.1" },
        tools: [
          {
            name: MARKET_TOOL_NAME,
            description: "PASS261 marketplace catalog tool",
            inputSchema: {
              type: "object",
              properties: { [MARKET_SCHEMA_TOKEN]: { type: "string" } },
              required: [MARKET_SCHEMA_TOKEN],
            },
          },
        ],
        permissions: { filesystem: ["Read"], shell: true },
        risk: { localCode: "PASS261 local plugin code risk", network: "PASS261 network risk" },
      },
    ],
  });
  const project = { name: "pass261-project", path: PROJECT_DIR };
  writeJson(DATA_FILE, {
    version: 1,
    activeProject: project,
    projects: [project],
    settings: {
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      baseUrl: "https://api.example.invalid",
      temperature: 0.2,
      timeoutMs: 600000,
      language: "zh",
      appearance: { fontSize: "compact", density: "compact" },
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
    sessions: [
      {
        id: "pass261-session",
        title: "PASS261 capability surface trace context",
        project: project.name,
        projectPath: project.path,
        createdAt: "2026-07-08T02:61:00.000Z",
        updatedAt: "2026-07-08T02:61:00.000Z",
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

function sharedFieldsMatch(left, right, fields) {
  return Boolean(left && right && fields.every((field) => left[field] === right[field]));
}

async function paletteTrace(win, query, expectedId, click = false) {
  return win.webContents.executeJavaScript(`
    (async function() {
      const fields = ${JSON.stringify(TRACE_FIELDS)};
      const suffix = ${JSON.stringify(TRACE_SUFFIX)};
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 240));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return null;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 300));
      const button = document.querySelector(${JSON.stringify(`.command-modal .command-list button[data-command-id="${expectedId}"]`)});
      if (!button) {
        return {
          missing: true,
          commands: Array.from(document.querySelectorAll('.command-modal .command-list button')).slice(0, 12).map((item) => ({ id: item.getAttribute('data-command-id'), text: item.textContent }))
        };
      }
      const trace = Object.fromEntries(fields.map((field) => [field, button.getAttribute('data-command-capability-' + suffix[field]) || '']));
      const result = { id: button.getAttribute('data-command-id') || '', target: button.getAttribute('data-command-target') || '', text: button.textContent || '', trace };
      if (${click ? "true" : "false"}) {
        button.click();
      } else {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
      return result;
    })();
  `);
}

async function surfaceTrace(win, selector) {
  return win.webContents.executeJavaScript(`
    (function() {
      const fields = ${JSON.stringify(TRACE_FIELDS)};
      const suffix = ${JSON.stringify(TRACE_SUFFIX)};
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return null;
      return Object.fromEntries(fields.map((field) => [field, element.getAttribute('data-capability-' + suffix[field]) || '']));
    })();
  `);
}

async function closeCapabilitySurface(win) {
  await win.webContents.executeJavaScript(`
    (function() {
      document.querySelector('.capability-modal header .icon-only')?.click();
      return true;
    })();
  `);
  await waitFor(win, "!document.querySelector('.capability-modal')", 5000);
}

async function openCommandAndCompareSurface(win, spec) {
  const command = await paletteTrace(win, spec.query, spec.commandId, true);
  assertStep(`${spec.name}_COMMAND_TRACE_READY`, Boolean(command && !command.missing && command.trace?.kind === spec.kind && command.trace?.action === spec.action));
  assertStep(`${spec.name}_SURFACE_READY`, await waitFor(win, `Boolean(document.querySelector(${JSON.stringify(spec.surfaceSelector)}))`, 12000));
  const row = await surfaceTrace(win, spec.surfaceSelector);
  const action = spec.actionSelector ? await surfaceTrace(win, spec.actionSelector) : null;
  const sharedFields = TRACE_FIELDS.filter((field) => field !== "action");
  assertStep(`${spec.name}_ROW_SCHEMA_MATCH`, Boolean(
    row?.action === "open" &&
    sharedFieldsMatch(command.trace, row, sharedFields)
  ));
  if (spec.actionSelector) {
    assertStep(`${spec.name}_ACTION_SCHEMA_MATCH`, Boolean(
      action?.action === spec.actionTraceAction &&
      sharedFieldsMatch(command.trace, action, sharedFields)
    ));
  }
  await closeCapabilitySurface(win);
}

writeInitialStore();
app.setPath("userData", USER_DATA_DIR);
require(path.join(REPO_DIR, "electron", "main.cjs"));

async function runTest() {
  await wait(1700);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS261_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS261_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS261_STATUS_READY", await waitFor(win, `
    (async function() {
      const status = await window.claudexDesktop.getClaudeStatus({ projectPath: ${JSON.stringify(PROJECT_DIR)} });
      return Boolean(
        status.pluginItems?.some((item) => item.id === ${JSON.stringify(INSTALLED_PLUGIN_ID)}) &&
        status.mcpServers?.some((item) => item.name === ${JSON.stringify(MCP_SERVER_NAME)}) &&
        status.marketplaces?.some((item) => item.name === ${JSON.stringify(MARKETPLACE_NAME)}) &&
        status.marketplacePlugins?.some((item) => item.id === ${JSON.stringify(MARKET_PLUGIN_ID)})
      );
    })();
  `, 15000));

  await openCommandAndCompareSurface(win, {
    name: "PASS261_PLUGIN_OPEN_COPY",
    query: INSTALLED_SCHEMA_TOKEN,
    commandId: "capability-plugin:pass261-installed-plugin%40pass261-market",
    kind: "plugin",
    action: "open",
    surfaceSelector: `.capability-modal [data-plugin-id="${INSTALLED_PLUGIN_ID}"]`,
    actionSelector: `.capability-modal [data-plugin-id="${INSTALLED_PLUGIN_ID}"] [data-plugin-action="copy-evidence"]`,
    actionTraceAction: "copy",
  });

  await openCommandAndCompareSurface(win, {
    name: "PASS261_MCP_OPEN_COPY",
    query: MCP_SCHEMA_TOKEN,
    commandId: "capability-mcp:pass261-mcp",
    kind: "mcp",
    action: "open",
    surfaceSelector: `.capability-modal [data-mcp-server-id="${MCP_SERVER_NAME}"]`,
    actionSelector: `.capability-modal [data-mcp-server-id="${MCP_SERVER_NAME}"] [data-mcp-server-action="copy-evidence"]`,
    actionTraceAction: "copy",
  });

  await openCommandAndCompareSurface(win, {
    name: "PASS261_MARKETPLACE_SOURCE_OPEN_COPY",
    query: MARKETPLACE_NAME,
    commandId: "capability-marketplace-source:pass261-market",
    kind: "marketplace-source",
    action: "open",
    surfaceSelector: `.capability-modal [data-marketplace-source-id="${MARKETPLACE_NAME}"]`,
    actionSelector: `.capability-modal [data-marketplace-source-id="${MARKETPLACE_NAME}"] [data-marketplace-source-action="copy-evidence"]`,
    actionTraceAction: "copy",
  });

  await openCommandAndCompareSurface(win, {
    name: "PASS261_MARKETPLACE_PLUGIN_OPEN_COPY",
    query: MARKET_SCHEMA_TOKEN,
    commandId: "capability-marketplace-plugin:pass261-catalog-plugin%40pass261-market",
    kind: "marketplace-plugin",
    action: "open",
    surfaceSelector: `.capability-modal [data-marketplace-plugin-id="${MARKET_PLUGIN_ID}"]`,
    actionSelector: `.capability-modal [data-marketplace-plugin-id="${MARKET_PLUGIN_ID}"] [data-marketplace-plugin-action="copy-evidence"]`,
    actionTraceAction: "copy",
  });

  const install = await paletteTrace(win, `install ${MARKET_SCHEMA_TOKEN}`, "marketplace-install:pass261-catalog-plugin%40pass261-market", true);
  assertStep("PASS261_MARKETPLACE_INSTALL_COMMAND_TRACE_READY", Boolean(install && !install.missing && install.trace?.kind === "marketplace-plugin" && install.trace?.action === "install" && install.trace?.projectPath === PROJECT_DIR));
  assertStep("PASS261_MARKETPLACE_INSTALL_SURFACE_READY", await waitFor(win, `Boolean(document.querySelector('.capability-modal [data-marketplace-plugin-id="${MARKET_PLUGIN_ID}"] [data-capability-action="install"]'))`, 12000));
  const installButton = await surfaceTrace(win, `.capability-modal [data-marketplace-plugin-id="${MARKET_PLUGIN_ID}"] [data-capability-action="install"]`);
  assertStep("PASS261_MARKETPLACE_INSTALL_ACTION_SCHEMA_MATCH", Boolean(
    installButton?.action === "install" &&
    sharedFieldsMatch(install.trace, installButton, TRACE_FIELDS.filter((field) => field !== "action"))
  ));

  console.log("PASS261_CAPABILITY_SURFACE_TRACE_CONTEXT_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS261_FAILED", error?.stack || error);
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    const debug = await win.webContents.executeJavaScript(`
      (function() {
        return {
          commands: Array.from(document.querySelectorAll('.command-modal .command-list button')).slice(0, 20).map((item) => ({
            id: item.getAttribute('data-command-id'),
            text: item.textContent,
            attrs: Object.fromEntries(Array.from(item.attributes).map((attr) => [attr.name, attr.value])),
          })),
          capabilityRows: Array.from(document.querySelectorAll('.capability-modal [data-capability-kind]')).slice(0, 20).map((item) => ({
            text: item.textContent,
            attrs: Object.fromEntries(Array.from(item.attributes).map((attr) => [attr.name, attr.value])),
          })),
          body: document.body.textContent?.slice(0, 3000) || '',
        };
      })();
    `).catch((debugError) => ({ error: String(debugError?.stack || debugError) }));
    console.error("PASS261_DEBUG", JSON.stringify(debug, null, 2).slice(0, 20000));
  }
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS261_TIMEOUT");
  cleanup();
  app.exit(1);
}, 120000);
