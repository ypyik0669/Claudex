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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass270-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass270-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass270-project-"));
const MARKETPLACE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass270-market-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");

const INSTALLED_PLUGIN_ID = "pass270-installed-plugin@pass270-market";
const INSTALLED_TOOL_NAME = "pass270-installed-tool";
const MCP_SERVER_NAME = "pass270-mcp";
const MCP_TOOL_NAME = "pass270-mcp-tool";
const MARKETPLACE_NAME = "pass270-market";
const MARKET_PLUGIN_ID = "pass270-catalog-plugin@pass270-market";
const MARKET_TOOL_NAME = "pass270-catalog-tool";
const MARKET_SCHEMA_TOKEN = "pass270_market_schema_token";

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
  plugins: [
    {
      id: '${INSTALLED_PLUGIN_ID}',
      name: 'pass270-installed-plugin',
      marketplace: '${MARKETPLACE_NAME}',
      version: '27.0.0',
      scope: 'project',
      enabled: true,
      status: 'enabled',
      source: 'pass270 installed source',
      tools: [{ name: '${INSTALLED_TOOL_NAME}', description: 'PASS270 installed plugin tool description' }],
      permissions: ['Read', 'Bash']
    },
    {
      id: '${MARKET_PLUGIN_ID}',
      name: 'pass270-catalog-plugin',
      marketplace: '${MARKETPLACE_NAME}',
      version: '27.0.1',
      scope: 'project',
      enabled: true,
      status: 'enabled',
      source: 'pass270 catalog installed source',
      tools: [{ name: '${MARKET_TOOL_NAME}', description: 'PASS270 installed catalog plugin tool description' }],
      permissions: ['Read']
    }
  ]
};
const mcpJson = {
  servers: [{
    name: '${MCP_SERVER_NAME}',
    status: 'ok',
    transport: 'stdio',
    command: 'node pass270-mcp-server.cjs',
    detail: 'PASS270 structured MCP detail',
    source: 'pass270 mcp source',
    raw: 'PASS270 raw MCP status output',
    tools: [{ name: '${MCP_TOOL_NAME}', description: 'PASS270 MCP tool description' }]
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
if (args[0] === '--version') out('2.70.0 (Claude Code PASS270)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out(installedJson);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins:\\n\\n  > ${INSTALLED_PLUGIN_ID}\\n  > ${MARKET_PLUGIN_ID}');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out(mcpJson);
else if (args[0] === 'mcp' && args[1] === 'list') out('${MCP_SERVER_NAME}: ok | 1 tools | stdio');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out(marketplaceJson);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces:\\n\\n  > ${MARKETPLACE_NAME}\\n    Source: Path (' + marketplaceDir + ')');
else out('pass270 fake claude command: ' + args.join(' '));
`;
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(FAKE_CLAUDE, '@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n', "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function writeInitialStore() {
  writeFakeClaude();
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass270-project" }), "utf8");
  writeJson(path.join(MARKETPLACE_DIR, ".claude-plugin", "marketplace.json"), {
    name: MARKETPLACE_NAME,
    description: "PASS270 marketplace action focus fixture",
    owner: { name: "PASS270 Owner" },
    plugins: [{
      name: "pass270-catalog-plugin",
      version: "27.0.1",
      description: "PASS270 marketplace catalog action focus fixture.",
      category: "qa-tools",
      author: { name: "PASS270 QA" },
      source: { source: "git-subdir", url: "https://example.invalid/pass270.git", path: "plugins/pass270", ref: "v27.0.1" },
      tools: [{
        name: MARKET_TOOL_NAME,
        description: "PASS270 marketplace catalog tool",
        inputSchema: { type: "object", properties: { [MARKET_SCHEMA_TOKEN]: { type: "string" } } },
      }],
      permissions: { filesystem: ["Read"], shell: true },
      risk: { localCode: "PASS270 local plugin code risk", network: "PASS270 network risk" },
    }],
  });
  const project = { name: "pass270-project", path: PROJECT_DIR };
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
      id: "pass270-session",
      title: "PASS270 capability non-mutating action focus",
      project: project.name,
      projectPath: PROJECT_DIR,
      createdAt: "2026-07-08T03:10:00.000Z",
      updatedAt: "2026-07-08T03:10:00.000Z",
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

async function actionFocusState(win, rowSelector, actionSelector) {
  return win.webContents.executeJavaScript(`
    (function() {
      const row = document.querySelector(${JSON.stringify(rowSelector)});
      const action = document.querySelector(${JSON.stringify(actionSelector)});
      const focusedActions = Array.from(document.querySelectorAll('.capability-modal [data-capability-action-focused="true"]'));
      if (!row || !action) return null;
      return {
        rowText: row.textContent || '',
        rowFocused: row.getAttribute('data-capability-focused') || '',
        rowAria: row.getAttribute('aria-current') || '',
        actionText: action.textContent || '',
        actionFocused: action.getAttribute('data-capability-action-focused') || '',
        actionAria: action.getAttribute('aria-current') || '',
        kind: action.getAttribute('data-capability-kind') || '',
        action: action.getAttribute('data-capability-action') || '',
        id: action.getAttribute('data-capability-id') || '',
        focusedActionCount: focusedActions.length,
      };
    })();
  `);
}

async function openAndAssertActionFocused(win, spec) {
  assertStep(`${spec.name}_COMMAND_CLICKED`, await runPaletteCommand(win, spec.query, spec.commandId));
  assertStep(`${spec.name}_ACTION_FOCUSED_READY`, await waitFor(win, `
    (function() {
      const row = document.querySelector(${JSON.stringify(spec.rowSelector)});
      const action = document.querySelector(${JSON.stringify(spec.actionSelector)});
      return Boolean(
        row &&
        action &&
        row.getAttribute('data-capability-focused') === 'true' &&
        row.getAttribute('aria-current') === 'true' &&
        action.getAttribute('data-capability-action-focused') === 'true' &&
        action.getAttribute('aria-current') === 'true' &&
        action.getAttribute('data-capability-kind') === ${JSON.stringify(spec.kind)} &&
        action.getAttribute('data-capability-action') === ${JSON.stringify(spec.action)} &&
        action.getAttribute('data-capability-id') === ${JSON.stringify(spec.capabilityId)}
      );
    })();
  `, 12000));
  const state = await actionFocusState(win, spec.rowSelector, spec.actionSelector);
  assertStep(`${spec.name}_ACTION_FOCUS_TRACE`, Boolean(
    state &&
    state.rowFocused === "true" &&
    state.rowAria === "true" &&
    state.actionFocused === "true" &&
    state.actionAria === "true" &&
    state.kind === spec.kind &&
    state.action === spec.action &&
    state.id === spec.capabilityId &&
    state.focusedActionCount === 1 &&
    spec.requiredText.every((token) => `${state.rowText} ${state.actionText}`.includes(token))
  ));
  await closeCapabilitySurface(win);
}

writeInitialStore();
app.setPath("userData", USER_DATA_DIR);
require(path.join(REPO_DIR, "electron", "main.cjs"));

async function runTest() {
  await wait(1700);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS270_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS270_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS270_STATUS_READY", await waitFor(win, `
    (async function() {
      const status = await window.claudexDesktop.getClaudeStatus({ projectPath: ${JSON.stringify(PROJECT_DIR)} });
      return Boolean(
        status.pluginItems?.some((item) => item.id === ${JSON.stringify(INSTALLED_PLUGIN_ID)}) &&
        status.pluginItems?.some((item) => item.id === ${JSON.stringify(MARKET_PLUGIN_ID)}) &&
        status.mcpServers?.some((item) => item.name === ${JSON.stringify(MCP_SERVER_NAME)}) &&
        status.marketplaces?.some((item) => item.name === ${JSON.stringify(MARKETPLACE_NAME)}) &&
        status.marketplacePlugins?.some((item) => item.id === ${JSON.stringify(MARKET_PLUGIN_ID)})
      );
    })();
  `, 15000));

  await openAndAssertActionFocused(win, {
    name: "PASS270_PLUGIN_COPY",
    query: "focus copy pass270-installed-tool",
    commandId: "capability-plugin-action:copy:pass270-installed-plugin%40pass270-market",
    rowSelector: `.capability-modal [data-plugin-id="${INSTALLED_PLUGIN_ID}"]`,
    actionSelector: `.capability-modal [data-plugin-id="${INSTALLED_PLUGIN_ID}"] [data-plugin-action="copy-evidence"]`,
    kind: "plugin",
    action: "copy",
    capabilityId: INSTALLED_PLUGIN_ID,
    requiredText: ["pass270-installed-plugin", INSTALLED_TOOL_NAME],
  });

  await openAndAssertActionFocused(win, {
    name: "PASS270_MCP_COPY_RAW",
    query: "focus raw pass270-mcp",
    commandId: "capability-mcp-action:copy-raw:pass270-mcp",
    rowSelector: `.capability-modal [data-mcp-server-id="${MCP_SERVER_NAME}"]`,
    actionSelector: `.capability-modal [data-mcp-server-id="${MCP_SERVER_NAME}"] [data-mcp-server-action="copy-raw"]`,
    kind: "mcp",
    action: "copy-raw",
    capabilityId: MCP_SERVER_NAME,
    requiredText: [MCP_SERVER_NAME, MCP_TOOL_NAME],
  });

  await openAndAssertActionFocused(win, {
    name: "PASS270_MCP_OPEN_CLAUDE",
    query: "focus open claude pass270-mcp",
    commandId: "capability-mcp-action:open-claude:pass270-mcp",
    rowSelector: `.capability-modal [data-mcp-server-id="${MCP_SERVER_NAME}"]`,
    actionSelector: `.capability-modal [data-mcp-server-id="${MCP_SERVER_NAME}"] [data-mcp-server-action="open-claude"]`,
    kind: "mcp",
    action: "open-claude",
    capabilityId: MCP_SERVER_NAME,
    requiredText: [MCP_SERVER_NAME],
  });

  await openAndAssertActionFocused(win, {
    name: "PASS270_MARKETPLACE_SOURCE_COPY",
    query: "focus source copy pass270-market",
    commandId: "capability-marketplace-source-action:copy:pass270-market",
    rowSelector: `.capability-modal [data-marketplace-source-id="${MARKETPLACE_NAME}"]`,
    actionSelector: `.capability-modal [data-marketplace-source-id="${MARKETPLACE_NAME}"] [data-marketplace-source-action="copy-evidence"]`,
    kind: "marketplace-source",
    action: "copy",
    capabilityId: MARKETPLACE_NAME,
    requiredText: [MARKETPLACE_NAME],
  });

  await openAndAssertActionFocused(win, {
    name: "PASS270_MARKETPLACE_PLUGIN_COPY",
    query: `focus copy ${MARKET_SCHEMA_TOKEN}`,
    commandId: "capability-marketplace-plugin-action:copy:pass270-catalog-plugin%40pass270-market",
    rowSelector: `.capability-modal [data-marketplace-plugin-id="${MARKET_PLUGIN_ID}"]`,
    actionSelector: `.capability-modal [data-marketplace-plugin-id="${MARKET_PLUGIN_ID}"] [data-marketplace-plugin-action="copy-evidence"]`,
    kind: "marketplace-plugin",
    action: "copy",
    capabilityId: MARKET_PLUGIN_ID,
    requiredText: ["pass270-catalog-plugin", MARKET_TOOL_NAME],
  });

  await openAndAssertActionFocused(win, {
    name: "PASS270_MARKETPLACE_PLUGIN_OPEN_INSTALLED",
    query: `focus open installed ${MARKET_SCHEMA_TOKEN}`,
    commandId: "capability-marketplace-plugin-action:open-installed:pass270-catalog-plugin%40pass270-market",
    rowSelector: `.capability-modal [data-marketplace-plugin-id="${MARKET_PLUGIN_ID}"]`,
    actionSelector: `.capability-modal [data-marketplace-plugin-id="${MARKET_PLUGIN_ID}"] [data-marketplace-plugin-action="open-installed"]`,
    kind: "marketplace-plugin",
    action: "open-installed",
    capabilityId: MARKET_PLUGIN_ID,
    requiredText: ["pass270-catalog-plugin", MARKET_TOOL_NAME],
  });

  console.log("PASS270_CAPABILITY_NON_MUTATING_ACTION_FOCUS_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS270_FAILED", error?.stack || error);
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    const debug = await win.webContents.executeJavaScript(`
      (function() {
        return {
          commands: Array.from(document.querySelectorAll('.command-modal .command-list button')).slice(0, 40).map((item) => ({
            id: item.getAttribute('data-command-id'),
            text: item.textContent,
            attrs: Object.fromEntries(Array.from(item.attributes).map((attr) => [attr.name, attr.value])),
          })),
          actions: Array.from(document.querySelectorAll('.capability-modal [data-capability-action-focused], .capability-modal [data-plugin-action], .capability-modal [data-mcp-server-action], .capability-modal [data-marketplace-source-action], .capability-modal [data-marketplace-plugin-action]')).slice(0, 50).map((item) => ({
            text: item.textContent,
            attrs: Object.fromEntries(Array.from(item.attributes).map((attr) => [attr.name, attr.value])),
          })),
          body: document.body.textContent?.slice(0, 6000) || '',
        };
      })();
    `).catch((debugError) => ({ error: String(debugError?.stack || debugError) }));
    console.error("PASS270_DEBUG", JSON.stringify(debug, null, 2).slice(0, 24000));
  }
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS270_TIMEOUT");
  cleanup();
  app.exit(1);
}, 120000);
