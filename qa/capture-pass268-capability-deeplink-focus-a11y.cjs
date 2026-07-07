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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass268-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass268-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass268-project-"));
const MARKETPLACE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass268-market-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");

const INSTALLED_PLUGIN_ID = "pass268-installed-plugin@pass268-market";
const INSTALLED_TOOL_NAME = "pass268-installed-tool";
const INSTALLED_SCHEMA_TOKEN = "pass268_installed_schema_token";
const MCP_SERVER_NAME = "pass268-mcp";
const MCP_TOOL_NAME = "pass268-mcp-tool";
const MCP_SCHEMA_TOKEN = "pass268_mcp_schema_token";
const MARKETPLACE_NAME = "pass268-market";
const MARKET_PLUGIN_ID = "pass268-catalog-plugin@pass268-market";
const MARKET_TOOL_NAME = "pass268-catalog-tool";
const MARKET_SCHEMA_TOKEN = "pass268_market_schema_token";

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_DIR, MARKETPLACE_DIR]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_error) {
      // best-effort cleanup
    }
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
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

function writeFakeClaude() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  const fakeClaudeScript = `
const marketplaceDir = ${JSON.stringify(MARKETPLACE_DIR)};
const args = process.argv.slice(2);
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value) + '\\n'); }
const installedJson = {
  plugins: [{
    id: '${INSTALLED_PLUGIN_ID}',
    name: 'pass268-installed-plugin',
    marketplace: '${MARKETPLACE_NAME}',
    version: '26.8.0',
    scope: 'project',
    enabled: true,
    status: 'enabled',
    source: 'pass268 installed source',
    tools: [{
      name: '${INSTALLED_TOOL_NAME}',
      description: 'PASS268 installed plugin tool description',
      inputSchema: { type: 'object', properties: { '${INSTALLED_SCHEMA_TOKEN}': { type: 'string' } } }
    }],
    permissions: ['Read', 'Bash']
  }]
};
const mcpJson = {
  servers: [{
    name: '${MCP_SERVER_NAME}',
    status: 'ok',
    transport: 'stdio',
    command: 'node pass268-mcp-server.cjs',
    detail: 'PASS268 structured MCP detail',
    source: 'pass268 mcp source',
    tools: [{
      name: '${MCP_TOOL_NAME}',
      description: 'PASS268 MCP tool description',
      inputSchema: { type: 'object', properties: { '${MCP_SCHEMA_TOKEN}': { type: 'string' } } }
    }]
  }]
};
const marketplaceJson = [{
  name: '${MARKETPLACE_NAME}',
  source: 'path',
  repo: marketplaceDir,
  installLocation: marketplaceDir,
  version: '2026.7.8',
  status: 'ready',
  permissions: ['Read', 'Bash']
}];
if (args[0] === '--version') out('2.68.0 (Claude Code PASS268)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out(installedJson);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins:\\n\\n  > ${INSTALLED_PLUGIN_ID}');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out(mcpJson);
else if (args[0] === 'mcp' && args[1] === 'list') out('${MCP_SERVER_NAME}: ok | 1 tools | stdio');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out(marketplaceJson);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces:\\n\\n  > ${MARKETPLACE_NAME}\\n    Source: Path (' + marketplaceDir + ')');
else out('pass268 fake claude command: ' + args.join(' '));
`;
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(FAKE_CLAUDE, '@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n', "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function writeInitialStore() {
  writeFakeClaude();
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass268-project" }), "utf8");
  writeJson(path.join(MARKETPLACE_DIR, ".claude-plugin", "marketplace.json"), {
    name: MARKETPLACE_NAME,
    description: "PASS268 marketplace focus fixture",
    owner: { name: "PASS268 Owner" },
    plugins: [{
      name: "pass268-catalog-plugin",
      version: "26.8.1",
      description: "PASS268 marketplace catalog focus fixture.",
      category: "qa-tools",
      author: { name: "PASS268 QA" },
      source: { source: "git-subdir", url: "https://example.invalid/pass268.git", path: "plugins/pass268", ref: "v26.8.1" },
      tools: [{
        name: MARKET_TOOL_NAME,
        description: "PASS268 marketplace catalog tool",
        inputSchema: { type: "object", properties: { [MARKET_SCHEMA_TOKEN]: { type: "string" } } },
      }],
      permissions: { filesystem: ["Read"], shell: true },
      risk: { localCode: "PASS268 local plugin code risk", network: "PASS268 network risk" },
    }],
  });
  const project = { name: "pass268-project", path: PROJECT_DIR };
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
    sessions: [{
      id: "pass268-session",
      title: "PASS268 capability focus a11y",
      project: project.name,
      projectPath: PROJECT_DIR,
      createdAt: "2026-07-08T02:68:00.000Z",
      updatedAt: "2026-07-08T02:68:00.000Z",
      messages: [],
    }],
    commandRuns: [],
    runEvents: [],
    automations: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
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
      await new Promise((resolve) => setTimeout(resolve, 300));
      const button = document.querySelector(${JSON.stringify(`.command-modal .command-list button[data-command-id="${expectedId}"]`)});
      if (!button) return false;
      button.click();
      return true;
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

async function focusedRowState(win, selector) {
  return win.webContents.executeJavaScript(`
    (function() {
      const target = document.querySelector(${JSON.stringify(selector)});
      const focusedRows = Array.from(document.querySelectorAll('.capability-modal [data-capability-focused="true"]'));
      if (!target) return null;
      return {
        tag: target.tagName,
        text: target.textContent || '',
        focused: target.classList.contains('focused-capability-row'),
        dataFocused: target.getAttribute('data-capability-focused') || '',
        ariaCurrent: target.getAttribute('aria-current') || '',
        capabilityKind: target.getAttribute('data-capability-kind') || '',
        capabilityAction: target.getAttribute('data-capability-action') || '',
        capabilityId: target.getAttribute('data-capability-id') || '',
        focusedCount: focusedRows.length,
        focusedIds: focusedRows.map((item) => item.getAttribute('data-capability-id') || item.getAttribute('data-marketplace-plugin-id') || item.getAttribute('data-mcp-server-id') || item.getAttribute('data-plugin-id') || ''),
      };
    })();
  `);
}

async function openAndAssertFocused(win, spec) {
  assertStep(`${spec.name}_COMMAND_CLICKED`, await runPaletteCommand(win, spec.query, spec.commandId));
  assertStep(`${spec.name}_FOCUSED_ROW_READY`, await waitFor(win, `
    (function() {
      const target = document.querySelector(${JSON.stringify(spec.selector)});
      return Boolean(
        target &&
        target.classList.contains('focused-capability-row') &&
        target.getAttribute('data-capability-focused') === 'true' &&
        target.getAttribute('aria-current') === 'true' &&
        target.getAttribute('data-capability-kind') === ${JSON.stringify(spec.kind)} &&
        target.getAttribute('data-capability-action') === 'open' &&
        target.getAttribute('data-capability-id') === ${JSON.stringify(spec.capabilityId)}
      );
    })();
  `, 12000));
  const row = await focusedRowState(win, spec.selector);
  assertStep(`${spec.name}_FOCUS_A11Y_TRACE`, Boolean(
    row &&
    row.focused &&
    row.dataFocused === "true" &&
    row.ariaCurrent === "true" &&
    row.capabilityKind === spec.kind &&
    row.capabilityAction === "open" &&
    row.capabilityId === spec.capabilityId &&
    row.focusedCount === 1 &&
    spec.requiredText.every((token) => row.text.includes(token))
  ));
  await closeCapabilitySurface(win);
}

writeInitialStore();
app.setPath("userData", USER_DATA_DIR);
require(path.join(REPO_DIR, "electron", "main.cjs"));

async function runTest() {
  await wait(1700);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS268_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS268_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS268_STATUS_READY", await waitFor(win, `
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

  await openAndAssertFocused(win, {
    name: "PASS268_PLUGIN",
    query: INSTALLED_SCHEMA_TOKEN,
    commandId: "capability-plugin:pass268-installed-plugin%40pass268-market",
    selector: `.capability-modal [data-plugin-id="${INSTALLED_PLUGIN_ID}"]`,
    kind: "plugin",
    capabilityId: INSTALLED_PLUGIN_ID,
    requiredText: ["pass268-installed-plugin", INSTALLED_TOOL_NAME],
  });

  await openAndAssertFocused(win, {
    name: "PASS268_MCP",
    query: MCP_SCHEMA_TOKEN,
    commandId: "capability-mcp:pass268-mcp",
    selector: `.capability-modal [data-mcp-server-id="${MCP_SERVER_NAME}"]`,
    kind: "mcp",
    capabilityId: MCP_SERVER_NAME,
    requiredText: [MCP_SERVER_NAME, MCP_TOOL_NAME],
  });

  await openAndAssertFocused(win, {
    name: "PASS268_MARKETPLACE_SOURCE",
    query: MARKETPLACE_NAME,
    commandId: "capability-marketplace-source:pass268-market",
    selector: `.capability-modal [data-marketplace-source-id="${MARKETPLACE_NAME}"]`,
    kind: "marketplace-source",
    capabilityId: MARKETPLACE_NAME,
    requiredText: [MARKETPLACE_NAME, "2026.7.8"],
  });

  await openAndAssertFocused(win, {
    name: "PASS268_MARKETPLACE_PLUGIN",
    query: MARKET_SCHEMA_TOKEN,
    commandId: "capability-marketplace-plugin:pass268-catalog-plugin%40pass268-market",
    selector: `.capability-modal [data-marketplace-plugin-id="${MARKET_PLUGIN_ID}"]`,
    kind: "marketplace-plugin",
    capabilityId: MARKET_PLUGIN_ID,
    requiredText: ["pass268-catalog-plugin", MARKET_TOOL_NAME, "PASS268 local plugin code risk"],
  });

  console.log("PASS268_CAPABILITY_DEEPLINK_FOCUS_A11Y_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS268_FAILED", error?.stack || error);
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
          rows: Array.from(document.querySelectorAll('.capability-modal [data-capability-kind]')).slice(0, 30).map((item) => ({
            text: item.textContent,
            attrs: Object.fromEntries(Array.from(item.attributes).map((attr) => [attr.name, attr.value])),
          })),
          body: document.body.textContent?.slice(0, 4000) || '',
        };
      })();
    `).catch((debugError) => ({ error: String(debugError?.stack || debugError) }));
    console.error("PASS268_DEBUG", JSON.stringify(debug, null, 2).slice(0, 20000));
  }
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS268_TIMEOUT");
  cleanup();
  app.exit(1);
}, 120000);
