const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow, clipboard } = require("electron");

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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass227-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass227-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass227-project-"));
const MARKETPLACE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass227-market-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const INSTALLED_PLUGIN_ID = "pass227-installed-plugin@pass227-market";
const INSTALLED_TOOL_NAME = "pass227-installed-command";
const INSTALLED_TOOL_DESCRIPTION = "PASS227 installed plugin command description from Claude JSON";
const INSTALLED_SCHEMA_TOKEN = "pass227_installed_schema_token";
const MARKET_PLUGIN_ID = "pass227-catalog-plugin@pass227-market";
const MARKET_TOOL_NAME = "pass227-catalog-command";
const MARKET_TOOL_DESCRIPTION = "PASS227 marketplace plugin tool description from manifest";
const MARKET_SCHEMA_TOKEN = "pass227_catalog_schema_token";

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

async function waitForClipboard(patterns, timeoutMs = 6000) {
  const checks = Array.isArray(patterns) ? patterns : [patterns];
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const text = clipboard.readText() || "";
    if (checks.every((pattern) => (pattern instanceof RegExp ? pattern.test(text) : text.includes(String(pattern))))) return true;
    await wait(120);
  }
  console.error("PASS227_CLIPBOARD_DEBUG", clipboard.readText());
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
      name: 'pass227-installed-plugin',
      marketplace: 'pass227-market',
      version: '22.7.0',
      scope: 'project',
      enabled: true,
      source: 'pass227 installed source',
      tools: [
        {
          name: '${INSTALLED_TOOL_NAME}',
          description: '${INSTALLED_TOOL_DESCRIPTION}',
          inputSchema: {
            type: 'object',
            properties: {
              '${INSTALLED_SCHEMA_TOKEN}': { type: 'string', description: 'PASS227 installed parameter' },
              dryRun: { type: 'boolean' }
            },
            required: ['${INSTALLED_SCHEMA_TOKEN}']
          }
        }
      ],
      permissions: ['Read', 'Bash']
    }
  ]
};
const marketplaceJson = [
  {
    name: 'pass227-market',
    source: 'path',
    repo: marketplaceDir,
    installLocation: marketplaceDir,
    version: '2026.7.7',
    status: 'ready',
    permissions: ['Read', 'Bash']
  }
];
if (args[0] === '--version') out('2.27.0 (Claude Code PASS227)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out(installedJson);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins:\\n\\n  > ${INSTALLED_PLUGIN_ID}\\n    Version: 22.7.0\\n    Scope: project\\n    Status: enabled');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out(marketplaceJson);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces:\\n\\n  > pass227-market\\n    Source: Path (' + marketplaceDir + ')');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out({ servers: [] });
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else out('pass227 fake claude command: ' + args.join(' '));
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass227-project" }), "utf8");
  writeJson(path.join(MARKETPLACE_DIR, ".claude-plugin", "marketplace.json"), {
    name: "pass227-market",
    description: "PASS227 marketplace tool details fixture",
    owner: { name: "PASS227 Owner" },
    plugins: [
      {
        name: "pass227-catalog-plugin",
        version: "22.7.1",
        description: "PASS227 catalog plugin with structured tool details.",
        category: "qa-tools",
        author: { name: "PASS227 QA" },
        source: { source: "git-subdir", url: "https://example.invalid/pass227.git", path: "plugins/pass227", ref: "v22.7.1" },
        tools: [
          {
            name: MARKET_TOOL_NAME,
            description: MARKET_TOOL_DESCRIPTION,
            inputSchema: {
              type: "object",
              properties: {
                [MARKET_SCHEMA_TOKEN]: { type: "string", description: "PASS227 catalog parameter" },
                limit: { type: "number" },
              },
              required: [MARKET_SCHEMA_TOKEN],
            },
          },
        ],
        permissions: { filesystem: ["Read"], shell: true },
        risk: { localCode: "PASS227 marketplace tool fixture risk" },
      },
    ],
  });
  const project = { name: "pass227-project", path: PROJECT_DIR };
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
        id: "pass227-session",
        title: "PASS227 marketplace plugin tool details",
        project: project.name,
        projectPath: project.path,
        createdAt: "2026-07-08T02:27:00.000Z",
        updatedAt: "2026-07-08T02:27:00.000Z",
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

async function paletteCommands(win, query) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 240));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return null;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 260));
      const result = [...document.querySelectorAll('.command-modal .command-list button')].map((button) => ({
        id: button.getAttribute('data-command-id') || '',
        target: button.getAttribute('data-command-target') || '',
        text: button.textContent || '',
      }));
      window.__pass227Commands = result;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return result;
    })();
  `);
}

async function waitForCommand(win, query, expectedId, timeoutMs = 12000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const commands = await paletteCommands(win, query);
    if (Array.isArray(commands) && commands.some((command) => command.id === expectedId)) return true;
    await wait(180);
  }
  return false;
}

async function runPaletteCommand(win, query, expectedId) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 240));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 260));
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === ${JSON.stringify(expectedId)});
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1700);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS227_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS227_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS227_STATUS_HAS_PLUGIN_AND_MARKETPLACE_TOOL_DETAILS", await win.webContents.executeJavaScript(`
    (async function() {
      const status = await window.claudexDesktop.getClaudeStatus({ projectPath: ${JSON.stringify(PROJECT_DIR)} });
      window.__pass227Status = status;
      const installed = status.pluginItems?.find((item) => item.id === ${JSON.stringify(INSTALLED_PLUGIN_ID)});
      const installedTool = installed?.toolDetails?.find((item) => item.name === ${JSON.stringify(INSTALLED_TOOL_NAME)});
      const market = status.marketplacePlugins?.find((item) => item.id === ${JSON.stringify(MARKET_PLUGIN_ID)});
      const marketTool = market?.toolDetails?.find((item) => item.name === ${JSON.stringify(MARKET_TOOL_NAME)});
      return Boolean(
        installedTool &&
        installedTool.description === ${JSON.stringify(INSTALLED_TOOL_DESCRIPTION)} &&
        /${INSTALLED_SCHEMA_TOKEN}/.test(installedTool.schema || '') &&
        market?.tools &&
        marketTool &&
        marketTool.description === ${JSON.stringify(MARKET_TOOL_DESCRIPTION)} &&
        /${MARKET_SCHEMA_TOKEN}/.test(marketTool.schema || '')
      );
    })();
  `));

  assertStep("PASS227_INSTALLED_PLUGIN_COMMAND_SEARCHES_TOOL_SCHEMA", await waitForCommand(
    win,
    INSTALLED_SCHEMA_TOKEN,
    "capability-plugin:pass227-installed-plugin%40pass227-market",
  ));
  assertStep("PASS227_MARKETPLACE_PLUGIN_COMMAND_SEARCHES_TOOL_SCHEMA", await waitForCommand(
    win,
    MARKET_SCHEMA_TOKEN,
    "capability-marketplace-plugin:pass227-catalog-plugin%40pass227-market",
  ));
  assertStep("PASS227_MARKETPLACE_COPY_COMMAND_SEARCHES_TOOL_DESCRIPTION", await waitForCommand(
    win,
    MARKET_TOOL_DESCRIPTION,
    "capability-marketplace-plugin-copy:pass227-catalog-plugin%40pass227-market",
  ));
  clipboard.writeText("");
  assertStep("PASS227_COPY_MARKETPLACE_EVIDENCE_FROM_PALETTE", await runPaletteCommand(
    win,
    MARKET_TOOL_DESCRIPTION,
    "capability-marketplace-plugin-copy:pass227-catalog-plugin%40pass227-market",
  ));
  assertStep("PASS227_MARKETPLACE_EVIDENCE_CLIPBOARD_HAS_TOOL_DETAILS", await waitForClipboard([
    /pass227-catalog-plugin@pass227-market/,
    new RegExp(MARKET_TOOL_NAME),
    new RegExp(MARKET_TOOL_DESCRIPTION),
    new RegExp(MARKET_SCHEMA_TOKEN),
  ]));

  assertStep("PASS227_OPEN_INSTALLED_PLUGIN_SURFACE_FROM_PALETTE", await runPaletteCommand(
    win,
    INSTALLED_SCHEMA_TOKEN,
    "capability-plugin:pass227-installed-plugin%40pass227-market",
  ));
  assertStep("PASS227_INSTALLED_PLUGIN_SURFACE_TOOL_DETAILS_VISIBLE", await waitFor(win, `
    (function() {
      const row = document.querySelector('.capability-modal [data-plugin-id="${INSTALLED_PLUGIN_ID}"]');
      const details = row?.querySelector('.plugin-tool-details');
      if (details && !details.open) details.open = true;
      const text = row?.textContent || '';
      return Boolean(
        row?.classList.contains('focused-capability-row') &&
        details &&
        /${INSTALLED_TOOL_NAME}/.test(text) &&
        /${INSTALLED_TOOL_DESCRIPTION}/.test(text) &&
        /${INSTALLED_SCHEMA_TOKEN}/.test(text)
      );
    })();
  `, 12000));

  assertStep("PASS227_OPEN_MARKETPLACE_PLUGIN_SURFACE_FROM_PALETTE", await runPaletteCommand(
    win,
    MARKET_SCHEMA_TOKEN,
    "capability-marketplace-plugin:pass227-catalog-plugin%40pass227-market",
  ));
  assertStep("PASS227_MARKETPLACE_PLUGIN_SURFACE_TOOL_DETAILS_VISIBLE", await waitFor(win, `
    (function() {
      const card = document.querySelector('.marketplace-plugin-card[data-marketplace-plugin-id="${MARKET_PLUGIN_ID}"]');
      const details = card?.querySelector('.marketplace-plugin-tool-details');
      if (details && !details.open) details.open = true;
      const text = card?.textContent || '';
      return Boolean(
        card?.classList.contains('focused-capability-row') &&
        details &&
        /${MARKET_TOOL_NAME}/.test(text) &&
        /${MARKET_TOOL_DESCRIPTION}/.test(text) &&
        /${MARKET_SCHEMA_TOKEN}/.test(text)
      );
    })();
  `, 12000));

  assertStep("PASS227_OPEN_CLAUDE_PANEL", await runPaletteCommand(win, "tool-claude", "tool-claude"));
  assertStep("PASS227_CLAUDE_PANEL_TOOL_DETAILS_VISIBLE", await waitFor(win, `
    (function() {
      const installed = [...document.querySelectorAll('#claude-tool-detail .plugin-status-item')]
        .find((item) => /${INSTALLED_PLUGIN_ID}/.test(item.textContent || ''));
      const market = [...document.querySelectorAll('#claude-tool-detail .claude-panel-marketplace-plugin')]
        .find((item) => /pass227-catalog-plugin/.test(item.textContent || ''));
      const installedDetails = installed?.querySelector('.claude-panel-plugin-tool-details');
      const marketDetails = market?.querySelector('.claude-panel-marketplace-tool-details');
      if (installedDetails && !installedDetails.open) installedDetails.open = true;
      if (marketDetails && !marketDetails.open) marketDetails.open = true;
      const installedText = installed?.textContent || '';
      const marketText = market?.textContent || '';
      return Boolean(
        installedDetails &&
        marketDetails &&
        /${INSTALLED_TOOL_NAME}/.test(installedText) &&
        /${INSTALLED_SCHEMA_TOKEN}/.test(installedText) &&
        /${MARKET_TOOL_NAME}/.test(marketText) &&
        /${MARKET_SCHEMA_TOKEN}/.test(marketText)
      );
    })();
  `, 15000));

  console.log("PASS227_MARKETPLACE_PLUGIN_TOOL_DETAILS_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS227_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (async function() {
          return {
            commands: window.__pass227Commands || [],
            status: window.__pass227Status || null,
            modalText: document.querySelector('.capability-modal')?.textContent || '',
            claudeText: document.querySelector('#claude-tool-detail')?.textContent || '',
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS227_DEBUG", JSON.stringify(debug, null, 2).slice(0, 14000));
      console.error("PASS227_CLIPBOARD", clipboard.readText());
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS227_TIMEOUT");
  console.error("PASS227_CLIPBOARD", clipboard.readText());
  cleanup();
  app.exit(1);
}, 100000);
