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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass174-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass174-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass174-project-"));
const MARKETPLACE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass174-market-"));
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

function writeInitialStore() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.mkdirSync(path.join(MARKETPLACE_DIR, ".claude-plugin"), { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass174-project" }), "utf8");
  writeJson(path.join(MARKETPLACE_DIR, ".claude-plugin", "marketplace.json"), {
    name: "pass174-market",
    description: "PASS174 marketplace fixture",
    owner: { name: "PASS174 Owner" },
    plugins: [
      {
        name: "pass174-catalog-plugin",
        version: "17.4.1",
        description: "PASS174 catalog plugin shown in Claude panel.",
        category: "qa-tools",
        author: { name: "PASS174 QA" },
        permissions: ["Read", "Bash"],
        risk: ["network access"],
      },
    ],
  });

  const fakeClaudeScript = `
const args = process.argv.slice(2);
const marketplaceDir = ${JSON.stringify(MARKETPLACE_DIR)};
function out(value) {
  process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n');
}
if (args[0] === '--version') out('2.10.0 (Claude Code PASS174)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out({
  plugins: [
    {
      id: 'pass174-panel-plugin@qa-market',
      name: 'pass174-panel-plugin',
      marketplace: 'qa-market',
      version: '17.4.0',
      scope: 'project',
      enabled: true,
      source: { source: 'local-fixture', path: 'plugins/pass174', ref: 'pass174-ref' },
      tools: ['pass174-panel-tool'],
      permissions: ['Read', 'Bash'],
      error: 'pass174 config token missing'
    }
  ]
});
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins:\\n\\n  > pass174-panel-plugin@qa-market\\n    Version: 17.4.0\\n    Scope: project\\n    Status: error\\n    Error: pass174 config token missing');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out({
  servers: [
    {
      name: 'pass174-mcp',
      status: 'connected',
      tools: ['pass174-mcp-tool'],
      transport: 'stdio',
      source: 'C:/mcp/pass174-server.cjs',
      detail: 'PASS174 MCP server'
    }
  ]
});
else if (args[0] === 'mcp' && args[1] === 'list') out('pass174-mcp: connected | 1 tools | stdio | C:/mcp/pass174-server.cjs');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([{ name: 'pass174-market', source: 'path', repo: marketplaceDir, installLocation: marketplaceDir, version: '2026.7.7', status: 'ready', permissions: ['Read', 'Bash'] }]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces:\\n\\n  > pass174-market\\n    Source: Path (' + marketplaceDir + ')');
else out('pass174 fake claude command: ' + args.join(' '));
`;
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), '@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n', "utf8");
  const fakeClaude = path.join(FAKE_BIN_DIR, "claude.cmd");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;

  const project = { name: "pass174-project", path: PROJECT_DIR };
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
      claudeCode: { executionMode: "claude-code", claudeCommand: fakeClaude, permissionMode: "default" },
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
        id: "pass174-session",
        title: "pass174 Claude panel capability evidence",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-07T12:00:00.000Z",
        updatedAt: "2026-07-07T12:00:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    runEvents: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

async function runPaletteCommand(win, expectedId) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(expectedId)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      const button = Array.from(document.querySelectorAll('.command-modal .command-list button'))
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === ${JSON.stringify(expectedId)});
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function clickCopyAction(win, selector) {
  return win.webContents.executeJavaScript(`
    (async function() {
      const button = document.querySelector(${JSON.stringify(selector)});
      if (!button) return false;
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 180));
      return /\\u5df2\\u590d\\u5236|copied/i.test(button.textContent || '');
    })();
  `);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));

app.whenReady().then(async () => {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.error("PASS174_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  try {
    assertStep("PASS174_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
    assertStep("PASS174_OPEN_CLAUDE_TOOL", await runPaletteCommand(win, "tool-claude"));
    assertStep("PASS174_PANEL_CAPABILITY_METADATA_VISIBLE", await waitFor(win, `
      (function() {
        const panel = document.querySelector('#claude-tool-detail');
        const plugin = Array.from(panel?.querySelectorAll('.plugin-status-item') || [])
          .find((row) => /pass174-panel-plugin@qa-market/.test(row.textContent || ''));
        const mcp = panel?.querySelector('.claude-panel-mcp-row');
        const source = panel?.querySelector('.claude-panel-marketplace-row');
        const catalog = panel?.querySelector('.claude-panel-marketplace-plugin');
        const pluginText = plugin?.textContent || '';
        const mcpText = mcp?.textContent || '';
        const sourceText = source?.textContent || '';
        const catalogText = catalog?.textContent || '';
        return Boolean(
          plugin &&
          /17\\.4\\.0/.test(pluginText) &&
          /local-fixture/.test(pluginText) &&
          /pass174-panel-tool/.test(pluginText) &&
          /Read/.test(pluginText) &&
          /Bash/.test(pluginText) &&
          /pass174 config token missing/.test(pluginText) &&
          plugin.querySelector('[data-claude-panel-plugin-action="copy-evidence"]') &&
          mcp && /pass174-mcp/.test(mcpText) && /pass174-mcp-tool/.test(mcpText) && /stdio/.test(mcpText) &&
          mcp.querySelector('[data-claude-panel-mcp-action="copy-evidence"]') &&
          source && /pass174-market/.test(sourceText) && /2026\\.7\\.7/.test(sourceText) &&
          source.querySelector('[data-claude-panel-marketplace-source-action="copy-evidence"]') &&
          catalog && /pass174-catalog-plugin/.test(catalogText) && /network access/.test(catalogText) &&
          catalog.querySelector('[data-claude-panel-marketplace-plugin-action="copy-evidence"]')
        );
      })();
    `, 15000));
    assertStep("PASS174_COPY_PLUGIN_EVIDENCE", await clickCopyAction(win, '[data-claude-panel-plugin-action="copy-evidence"]'));
    assertStep("PASS174_COPY_MCP_EVIDENCE", await clickCopyAction(win, '[data-claude-panel-mcp-action="copy-evidence"]'));
    assertStep("PASS174_COPY_MARKETPLACE_SOURCE_EVIDENCE", await clickCopyAction(win, '[data-claude-panel-marketplace-source-action="copy-evidence"]'));
    assertStep("PASS174_COPY_MARKETPLACE_PLUGIN_EVIDENCE", await clickCopyAction(win, '[data-claude-panel-marketplace-plugin-action="copy-evidence"]'));
    assertStep("PASS174_STATUS_REFRESH_DID_NOT_PERSIST_COMMAND_RUNS", await win.webContents.executeJavaScript(`
      (async function() {
        const state = await window.claudexDesktop.getState();
        return Array.isArray(state.commandRuns) && state.commandRuns.length === 0;
      })();
    `));

    console.log("PASS174_CLAUDE_PANEL_CAPABILITY_EVIDENCE_DONE");
    cleanup();
    app.exit(0);
  } catch (error) {
    console.error("PASS174_FAILED", error?.stack || error);
    cleanup();
    app.exit(1);
  }
});

setTimeout(() => {
  console.error("PASS174_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
