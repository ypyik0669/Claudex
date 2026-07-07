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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass253-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass253-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass253-project-"));
const MARKETPLACE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass253-market-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");

const INSTALLED_PLUGIN_ID = "pass253-installed-plugin@pass253-market";
const INSTALLED_TOOL_NAME = "pass253-installed-tool";
const INSTALLED_SCHEMA_TOKEN = "pass253_installed_schema_token";
const MCP_SERVER_NAME = "pass253-mcp";
const MCP_TOOL_NAME = "pass253-mcp-search";
const MCP_SCHEMA_TOKEN = "pass253_mcp_schema_token";
const MARKETPLACE_NAME = "pass253-market";
const MARKET_PLUGIN_ID = "pass253-catalog-plugin@pass253-market";
const MARKET_TOOL_NAME = "pass253-catalog-tool";
const MARKET_SCHEMA_TOKEN = "pass253_market_schema_token";

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
      name: 'pass253-installed-plugin',
      marketplace: '${MARKETPLACE_NAME}',
      version: '25.3.0',
      scope: 'project',
      enabled: true,
      status: 'enabled',
      source: 'pass253 installed source',
      tools: [
        {
          name: '${INSTALLED_TOOL_NAME}',
          description: 'PASS253 installed plugin tool description',
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
      status: 'connected',
      transport: 'stdio',
      command: 'node pass253-mcp-server.cjs',
      detail: 'PASS253 structured MCP detail',
      source: 'pass253 mcp source',
      tools: [
        {
          name: '${MCP_TOOL_NAME}',
          description: 'PASS253 MCP search tool',
          inputSchema: {
            type: 'object',
            properties: { '${MCP_SCHEMA_TOKEN}': { type: 'string' } },
            required: ['${MCP_SCHEMA_TOKEN}']
          }
        },
        { name: 'pass253-mcp-open', description: 'PASS253 MCP open tool' }
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
if (args[0] === '--version') out('2.53.0 (Claude Code PASS253)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out(installedJson);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins:\\n\\n  > ${INSTALLED_PLUGIN_ID}\\n    Version: 25.3.0\\n    Status: enabled');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out(mcpJson);
else if (args[0] === 'mcp' && args[1] === 'list') out('${MCP_SERVER_NAME}: connected | 2 tools | stdio | node pass253-mcp-server.cjs');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out(marketplaceJson);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces:\\n\\n  > ${MARKETPLACE_NAME}\\n    Source: Path (' + marketplaceDir + ')');
else out('pass253 fake claude command: ' + args.join(' '));
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass253-project" }), "utf8");
  writeJson(path.join(MARKETPLACE_DIR, ".claude-plugin", "marketplace.json"), {
    name: MARKETPLACE_NAME,
    description: "PASS253 marketplace trace fixture",
    owner: { name: "PASS253 Owner" },
    plugins: [
      {
        name: "pass253-catalog-plugin",
        version: "25.3.1",
        description: "PASS253 catalog plugin trace fixture.",
        category: "qa-tools",
        author: { name: "PASS253 QA" },
        source: { source: "git-subdir", url: "https://example.invalid/pass253.git", path: "plugins/pass253", ref: "v25.3.1" },
        tools: [
          {
            name: MARKET_TOOL_NAME,
            description: "PASS253 marketplace catalog tool",
            inputSchema: {
              type: "object",
              properties: { [MARKET_SCHEMA_TOKEN]: { type: "string" } },
              required: [MARKET_SCHEMA_TOKEN],
            },
          },
        ],
        permissions: { filesystem: ["Read"], shell: true },
        risk: { localCode: "PASS253 local plugin code risk", network: "PASS253 network risk" },
      },
    ],
  });
  const project = { name: "pass253-project", path: PROJECT_DIR };
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
        id: "pass253-session",
        title: "PASS253 capability command trace context",
        project: project.name,
        projectPath: project.path,
        createdAt: "2026-07-08T02:53:00.000Z",
        updatedAt: "2026-07-08T02:53:00.000Z",
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

async function paletteCommandTrace(win, query, expectedId) {
  return win.webContents.executeJavaScript(`
    (async function() {
      if (!document.querySelector('.command-modal')) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 240));
      }
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return null;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 280));
      const button = document.querySelector(${JSON.stringify(`.command-modal .command-list button[data-command-id="${expectedId}"]`)});
      if (!button) return null;
      return {
        id: button.getAttribute('data-command-id') || '',
        target: button.getAttribute('data-command-target') || '',
        kind: button.getAttribute('data-command-capability-kind') || '',
        action: button.getAttribute('data-command-capability-action') || '',
        capabilityId: button.getAttribute('data-command-capability-id') || '',
        name: button.getAttribute('data-command-capability-name') || '',
        status: button.getAttribute('data-command-capability-status') || '',
        enabled: button.getAttribute('data-command-capability-enabled') || '',
        version: button.getAttribute('data-command-capability-version') || '',
        source: button.getAttribute('data-command-capability-source') || '',
        marketplace: button.getAttribute('data-command-capability-marketplace') || '',
        toolCount: button.getAttribute('data-command-capability-tool-count') || '',
        tools: button.getAttribute('data-command-capability-tools') || '',
        risk: button.getAttribute('data-command-capability-risk') || '',
        permissions: button.getAttribute('data-command-capability-permissions') || '',
        transport: button.getAttribute('data-command-capability-transport') || '',
        projectPath: button.getAttribute('data-command-capability-project-path') || '',
        text: button.textContent || '',
      };
    })();
  `);
}

function hasToken(value, token) {
  return String(value || "").includes(token);
}

writeInitialStore();
app.setPath("userData", USER_DATA_DIR);
require(path.join(REPO_DIR, "electron", "main.cjs"));

async function runTest() {
  await wait(1700);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS253_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS253_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS253_STATUS_READY", await waitFor(win, `
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

  const pluginId = "capability-plugin:pass253-installed-plugin%40pass253-market";
  const plugin = await paletteCommandTrace(win, INSTALLED_SCHEMA_TOKEN, pluginId);
  assertStep("PASS253_INSTALLED_PLUGIN_COMMAND_TRACE", Boolean(plugin &&
    plugin.target === "plugin" &&
    plugin.kind === "plugin" &&
    plugin.action === "open" &&
    plugin.capabilityId === INSTALLED_PLUGIN_ID &&
    plugin.name === "pass253-installed-plugin" &&
    plugin.marketplace === MARKETPLACE_NAME &&
    plugin.enabled === "true" &&
    plugin.version === "25.3.0" &&
    plugin.source === "pass253 installed source" &&
    plugin.toolCount === "1" &&
    hasToken(plugin.tools, INSTALLED_TOOL_NAME) &&
    hasToken(plugin.permissions, "Read")));

  const pluginCopy = await paletteCommandTrace(win, `copy ${INSTALLED_SCHEMA_TOKEN}`, "capability-plugin-copy:pass253-installed-plugin%40pass253-market");
  assertStep("PASS253_INSTALLED_PLUGIN_COPY_COMMAND_TRACE", Boolean(pluginCopy &&
    pluginCopy.target === "clipboard" &&
    pluginCopy.kind === "plugin" &&
    pluginCopy.action === "copy" &&
    pluginCopy.capabilityId === INSTALLED_PLUGIN_ID &&
    pluginCopy.toolCount === "1" &&
    hasToken(pluginCopy.tools, INSTALLED_TOOL_NAME)));

  const mcp = await paletteCommandTrace(win, MCP_SCHEMA_TOKEN, "capability-mcp:pass253-mcp");
  assertStep("PASS253_MCP_COMMAND_TRACE", Boolean(mcp &&
    mcp.target === "mcp" &&
    mcp.kind === "mcp" &&
    mcp.action === "open" &&
    mcp.capabilityId === MCP_SERVER_NAME &&
    mcp.name === MCP_SERVER_NAME &&
    mcp.status === "ok" &&
    mcp.transport === "stdio" &&
    mcp.toolCount === "2" &&
    hasToken(mcp.tools, MCP_TOOL_NAME)));

  const source = await paletteCommandTrace(win, MARKETPLACE_NAME, "capability-marketplace-source:pass253-market");
  assertStep("PASS253_MARKETPLACE_SOURCE_COMMAND_TRACE", Boolean(source &&
    source.target === "marketplace-source" &&
    source.kind === "marketplace-source" &&
    source.action === "open" &&
    source.capabilityId === MARKETPLACE_NAME &&
    source.name === MARKETPLACE_NAME &&
    source.status === "ready" &&
    source.version === "2026.7.7" &&
    hasToken(source.source, MARKETPLACE_DIR)));

  const marketPlugin = await paletteCommandTrace(win, MARKET_SCHEMA_TOKEN, "capability-marketplace-plugin:pass253-catalog-plugin%40pass253-market");
  assertStep("PASS253_MARKETPLACE_PLUGIN_COMMAND_TRACE", Boolean(marketPlugin &&
    marketPlugin.target === "marketplace-plugin" &&
    marketPlugin.kind === "marketplace-plugin" &&
    marketPlugin.action === "open" &&
    marketPlugin.capabilityId === MARKET_PLUGIN_ID &&
    marketPlugin.name === "pass253-catalog-plugin" &&
    marketPlugin.marketplace === MARKETPLACE_NAME &&
    marketPlugin.enabled === "false" &&
    marketPlugin.version === "25.3.1" &&
    marketPlugin.toolCount === "1" &&
    hasToken(marketPlugin.tools, MARKET_TOOL_NAME) &&
    hasToken(marketPlugin.risk, "PASS253 local plugin code risk")));

  const marketCopy = await paletteCommandTrace(win, `copy ${MARKET_SCHEMA_TOKEN}`, "capability-marketplace-plugin-copy:pass253-catalog-plugin%40pass253-market");
  assertStep("PASS253_MARKETPLACE_PLUGIN_COPY_COMMAND_TRACE", Boolean(marketCopy &&
    marketCopy.target === "clipboard" &&
    marketCopy.kind === "marketplace-plugin" &&
    marketCopy.action === "copy" &&
    marketCopy.capabilityId === MARKET_PLUGIN_ID &&
    marketCopy.toolCount === "1" &&
    hasToken(marketCopy.tools, MARKET_TOOL_NAME)));

  const install = await paletteCommandTrace(win, `install ${MARKET_SCHEMA_TOKEN}`, "marketplace-install:pass253-catalog-plugin%40pass253-market");
  assertStep("PASS253_MARKETPLACE_INSTALL_COMMAND_TRACE", Boolean(install &&
    install.target === "marketplace-install" &&
    install.kind === "marketplace-plugin" &&
    install.action === "install" &&
    install.capabilityId === MARKET_PLUGIN_ID &&
    install.name === "pass253-catalog-plugin" &&
    install.marketplace === MARKETPLACE_NAME &&
    install.projectPath === PROJECT_DIR &&
    install.toolCount === "1" &&
    hasToken(install.permissions, "Read") &&
    hasToken(install.risk, "PASS253 local plugin code risk")));

  console.log("PASS253_COMMAND_PALETTE_CAPABILITY_TRACE_CONTEXT_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS253_FAILED", error?.stack || error);
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    const debug = await win.webContents.executeJavaScript(`
      (function() {
        return Array.from(document.querySelectorAll('.command-modal .command-list button')).slice(0, 12).map((button) => ({
          text: button.textContent,
          attrs: Object.fromEntries(Array.from(button.attributes).map((attr) => [attr.name, attr.value])),
        }));
      })();
    `).catch((debugError) => ({ error: String(debugError?.stack || debugError) }));
    console.error("PASS253_DEBUG", JSON.stringify(debug, null, 2).slice(0, 16000));
  }
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS253_TIMEOUT");
  cleanup();
  app.exit(1);
}, 100000);
