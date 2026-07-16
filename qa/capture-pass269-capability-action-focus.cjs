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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass269-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass269-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass269-project-"));
const MARKETPLACE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass269-market-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");

const INSTALLED_PLUGIN_ID = "pass269-installed-plugin@pass269-market";
const INSTALLED_TOOL_NAME = "pass269-installed-tool";
const MCP_SERVER_NAME = "pass269-mcp";
const MCP_TOOL_NAME = "pass269-mcp-tool";
const MARKETPLACE_NAME = "pass269-market";
const MARKET_PLUGIN_ID = "pass269-catalog-plugin@pass269-market";
const MARKET_TOOL_NAME = "pass269-catalog-tool";
const MARKET_SCHEMA_TOKEN = "pass269_market_schema_token";

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
    name: 'pass269-installed-plugin',
    marketplace: '${MARKETPLACE_NAME}',
    version: '26.9.0',
    scope: 'project',
    enabled: true,
    status: 'enabled',
    source: 'pass269 installed source',
    tools: [{ name: '${INSTALLED_TOOL_NAME}', description: 'PASS269 installed plugin tool description' }],
    permissions: ['Read', 'Bash']
  }]
};
const mcpJson = {
  servers: [{
    name: '${MCP_SERVER_NAME}',
    status: 'ok',
    transport: 'stdio',
    command: 'node pass269-mcp-server.cjs',
    detail: 'PASS269 structured MCP detail',
    source: 'pass269 mcp source',
    tools: [{ name: '${MCP_TOOL_NAME}', description: 'PASS269 MCP tool description' }]
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
if (args[0] === '--version') out('2.69.0 (Claude Code PASS269)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out(installedJson);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins:\\n\\n  > ${INSTALLED_PLUGIN_ID}');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out(mcpJson);
else if (args[0] === 'mcp' && args[1] === 'list') out('${MCP_SERVER_NAME}: ok | 1 tools | stdio');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out(marketplaceJson);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces:\\n\\n  > ${MARKETPLACE_NAME}\\n    Source: Path (' + marketplaceDir + ')');
else out('pass269 fake claude command: ' + args.join(' '));
`;
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(FAKE_CLAUDE, '@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n', "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function writeInitialStore() {
  writeFakeClaude();
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass269-project" }), "utf8");
  writeJson(path.join(MARKETPLACE_DIR, ".claude-plugin", "marketplace.json"), {
    name: MARKETPLACE_NAME,
    description: "PASS269 marketplace action focus fixture",
    owner: { name: "PASS269 Owner" },
    plugins: [{
      name: "pass269-catalog-plugin",
      version: "26.9.1",
      description: "PASS269 marketplace catalog action focus fixture.",
      category: "qa-tools",
      author: { name: "PASS269 QA" },
      source: { source: "git-subdir", url: "https://example.invalid/pass269.git", path: "plugins/pass269", ref: "v26.9.1" },
      tools: [{
        name: MARKET_TOOL_NAME,
        description: "PASS269 marketplace catalog tool",
        inputSchema: { type: "object", properties: { [MARKET_SCHEMA_TOKEN]: { type: "string" } } },
      }],
      permissions: { filesystem: ["Read"], shell: true },
      risk: { localCode: "PASS269 local plugin code risk", network: "PASS269 network risk" },
    }],
  });
  const project = { name: "pass269-project", path: PROJECT_DIR };
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
      id: "pass269-session",
      title: "PASS269 capability action focus",
      project: project.name,
      projectPath: PROJECT_DIR,
      createdAt: "2026-07-08T02:69:00.000Z",
      updatedAt: "2026-07-08T02:69:00.000Z",
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
  if (spec.extraCheck) {
    assertStep(`${spec.name}_EXTRA_CHECK`, await win.webContents.executeJavaScript(spec.extraCheck));
  }
  await closeCapabilitySurface(win);
}

writeInitialStore();
app.setPath("userData", USER_DATA_DIR);
require(path.join(REPO_DIR, "electron", "main.cjs"));

async function runTest() {
  await wait(1700);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS269_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS269_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS269_STATUS_READY", await waitFor(win, `
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

  await openAndAssertActionFocused(win, {
    name: "PASS269_PLUGIN_UPDATE",
    query: "update pass269-installed-plugin",
    commandId: "capability-plugin-action:update:pass269-installed-plugin%40pass269-market",
    rowSelector: `.capability-modal [data-plugin-id="${INSTALLED_PLUGIN_ID}"]`,
    actionSelector: `.capability-modal [data-plugin-id="${INSTALLED_PLUGIN_ID}"] [data-plugin-action="update"]`,
    kind: "plugin",
    action: "update",
    capabilityId: INSTALLED_PLUGIN_ID,
    requiredText: ["pass269-installed-plugin", INSTALLED_TOOL_NAME],
  });

  await openAndAssertActionFocused(win, {
    name: "PASS269_MCP_REFRESH",
    query: "refresh pass269-mcp",
    commandId: "capability-mcp-action:refresh:pass269-mcp",
    rowSelector: `.capability-modal [data-mcp-server-id="${MCP_SERVER_NAME}"]`,
    actionSelector: `.capability-modal [data-mcp-server-id="${MCP_SERVER_NAME}"] [data-mcp-server-action="refresh"]`,
    kind: "mcp",
    action: "refresh",
    capabilityId: MCP_SERVER_NAME,
    requiredText: [MCP_SERVER_NAME, MCP_TOOL_NAME],
  });

  await openAndAssertActionFocused(win, {
    name: "PASS269_MARKETPLACE_INSTALL",
    query: `install ${MARKET_SCHEMA_TOKEN}`,
    commandId: "marketplace-install:pass269-catalog-plugin%40pass269-market",
    rowSelector: `.capability-modal [data-marketplace-plugin-id="${MARKET_PLUGIN_ID}"]`,
    actionSelector: `.capability-modal [data-marketplace-plugin-id="${MARKET_PLUGIN_ID}"] [data-marketplace-plugin-action="install"]`,
    kind: "marketplace-plugin",
    action: "install",
    capabilityId: MARKET_PLUGIN_ID,
    requiredText: ["pass269-catalog-plugin", MARKET_TOOL_NAME, "PASS269 local plugin code risk"],
    extraCheck: `
      (async function() {
        const installCommand = ${JSON.stringify(`plugin install --scope user ${MARKET_PLUGIN_ID}`)};
        const hasInstallRun = async () => {
          const state = await window.claudexDesktop.getState();
          return Boolean((state.commandRuns || []).some((run) => String(run.command || run.commandLine || "").includes(installCommand)));
        };
        const startedAt = Date.now();
        while (Date.now() - startedAt < 5000) {
          const confirm = document.querySelector('.plugin-cli-confirm');
          if (confirm && (confirm.textContent || '').includes(installCommand)) {
            return !(await hasInstallRun());
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return false;
      })()
    `,
  });

  console.log("PASS269_CAPABILITY_ACTION_FOCUS_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS269_FAILED", error?.stack || error);
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    const debug = await win.webContents.executeJavaScript(`
      (function() {
        return {
          commands: Array.from(document.querySelectorAll('.command-modal .command-list button')).slice(0, 25).map((item) => ({
            id: item.getAttribute('data-command-id'),
            text: item.textContent,
            attrs: Object.fromEntries(Array.from(item.attributes).map((attr) => [attr.name, attr.value])),
          })),
          actions: Array.from(document.querySelectorAll('.capability-modal [data-capability-action-focused], .capability-modal [data-plugin-action], .capability-modal [data-mcp-server-action], .capability-modal [data-marketplace-plugin-action]')).slice(0, 30).map((item) => ({
            text: item.textContent,
            attrs: Object.fromEntries(Array.from(item.attributes).map((attr) => [attr.name, attr.value])),
          })),
          body: document.body.textContent?.slice(0, 5000) || '',
        };
      })();
    `).catch((debugError) => ({ error: String(debugError?.stack || debugError) }));
    console.error("PASS269_DEBUG", JSON.stringify(debug, null, 2).slice(0, 22000));
  }
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS269_TIMEOUT");
  cleanup();
  app.exit(1);
}, 120000);
