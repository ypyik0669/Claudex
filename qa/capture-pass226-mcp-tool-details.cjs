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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass226-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass226-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass226-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const TOOL_NAME = "pass226-search-files";
const TOOL_DESCRIPTION = "PASS226 search files tool description from MCP JSON";
const SCHEMA_TOKEN = "pass226_query_schema_token";

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_DIR]) {
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
  console.error("PASS226_CLIPBOARD_DEBUG", clipboard.readText());
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
const args = process.argv.slice(2);
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value) + '\\n'); }
const mcpJson = {
  servers: [
    {
      name: 'pass226-mcp',
      status: 'connected',
      transport: 'stdio',
      command: 'node pass226-mcp-server.cjs',
      detail: 'PASS226 structured MCP server from JSON',
      tools: [
        {
          name: '${TOOL_NAME}',
          description: '${TOOL_DESCRIPTION}',
          inputSchema: {
            type: 'object',
            properties: {
              '${SCHEMA_TOKEN}': { type: 'string', description: 'PASS226 query parameter' },
              limit: { type: 'number' }
            },
            required: ['${SCHEMA_TOKEN}']
          }
        },
        {
          name: 'pass226-open-file',
          description: 'PASS226 open file tool',
          inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }
        }
      ]
    }
  ]
};
if (args[0] === '--version') out('2.26.0 (Claude Code PASS226)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out({ plugins: [] });
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out(mcpJson);
else if (args[0] === 'mcp' && args[1] === 'list') out('pass226-mcp: connected | 2 tools | stdio | node pass226-mcp-server.cjs');
else out('pass226 fake claude command: ' + args.join(' '));
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass226-project" }), "utf8");
  const project = { name: "pass226-project", path: PROJECT_DIR };
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
        id: "pass226-session",
        title: "PASS226 MCP tool details",
        project: project.name,
        projectPath: project.path,
        createdAt: "2026-07-08T02:26:00.000Z",
        updatedAt: "2026-07-08T02:26:00.000Z",
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
      await new Promise((resolve) => setTimeout(resolve, 220));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return null;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));
      const result = [...document.querySelectorAll('.command-modal .command-list button')].map((button) => ({
        id: button.getAttribute('data-command-id') || '',
        target: button.getAttribute('data-command-target') || '',
        text: button.textContent || '',
      }));
      window.__pass226Commands = result;
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
      await new Promise((resolve) => setTimeout(resolve, 220));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === ${JSON.stringify(expectedId)});
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS226_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS226_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS226_STATUS_HAS_MCP_TOOL_DETAILS", await win.webContents.executeJavaScript(`
    (async function() {
      const status = await window.claudexDesktop.getClaudeStatus({ projectPath: ${JSON.stringify(PROJECT_DIR)} });
      window.__pass226Status = status;
      const server = status.mcpServers?.find((item) => item.name === 'pass226-mcp');
      const tool = server?.toolDetails?.find((item) => item.name === ${JSON.stringify(TOOL_NAME)});
      return Boolean(
        server?.tools === 2 &&
        /${TOOL_NAME}/.test(server.toolsSummary || '') &&
        tool &&
        tool.description === ${JSON.stringify(TOOL_DESCRIPTION)} &&
        /${SCHEMA_TOKEN}/.test(tool.schema || '')
      );
    })();
  `));

  assertStep("PASS226_MCP_COMMAND_SEARCHES_TOOL_SCHEMA", await waitForCommand(
    win,
    SCHEMA_TOKEN,
    "capability-mcp:pass226-mcp",
  ));
  assertStep("PASS226_MCP_COPY_COMMAND_SEARCHES_TOOL_DESCRIPTION", await waitForCommand(
    win,
    TOOL_DESCRIPTION,
    "capability-mcp-copy:pass226-mcp",
  ));
  clipboard.writeText("");
  assertStep("PASS226_COPY_MCP_EVIDENCE_FROM_PALETTE", await runPaletteCommand(
    win,
    TOOL_DESCRIPTION,
    "capability-mcp-copy:pass226-mcp",
  ));
  assertStep("PASS226_MCP_EVIDENCE_CLIPBOARD_HAS_TOOL_DETAILS", await waitForClipboard([
    /pass226-mcp/,
    new RegExp(TOOL_NAME),
    new RegExp(TOOL_DESCRIPTION),
    new RegExp(SCHEMA_TOKEN),
  ]));

  assertStep("PASS226_OPEN_MCP_SURFACE_FROM_PALETTE", await runPaletteCommand(
    win,
    SCHEMA_TOKEN,
    "capability-mcp:pass226-mcp",
  ));
  assertStep("PASS226_MCP_SURFACE_TOOL_DETAILS_VISIBLE", await waitFor(win, `
    (function() {
      const row = document.querySelector('.capability-modal [data-mcp-server-id="pass226-mcp"]');
      const details = row?.querySelector('.mcp-tool-details');
      if (details && !details.open) details.open = true;
      const text = row?.textContent || '';
      return Boolean(
        row?.classList.contains('focused-capability-row') &&
        details &&
        /${TOOL_NAME}/.test(text) &&
        /${TOOL_DESCRIPTION}/.test(text) &&
        /${SCHEMA_TOKEN}/.test(text) &&
        /2/.test(text)
      );
    })();
  `, 12000));
  assertStep("PASS226_MCP_SURFACE_COPY_BUTTON_HAS_TOOL_DETAILS", await win.webContents.executeJavaScript(`
    (async function() {
      const row = document.querySelector('.capability-modal [data-mcp-server-id="pass226-mcp"]');
      const button = row?.querySelector('[data-mcp-server-action="copy-evidence"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS226_MCP_SURFACE_CLIPBOARD_HAS_TOOL_DETAILS", await waitForClipboard([
    /pass226-mcp/,
    new RegExp(TOOL_NAME),
    new RegExp(TOOL_DESCRIPTION),
    new RegExp(SCHEMA_TOKEN),
  ]));

  console.log("PASS226_MCP_TOOL_DETAILS_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS226_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (async function() {
          return {
            commands: window.__pass226Commands || [],
            status: window.__pass226Status || null,
            modalText: document.querySelector('.capability-modal')?.textContent || '',
            rowText: document.querySelector('.capability-modal [data-mcp-server-id="pass226-mcp"]')?.textContent || '',
            clipboard: '',
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS226_DEBUG", JSON.stringify(debug, null, 2).slice(0, 12000));
      console.error("PASS226_CLIPBOARD", clipboard.readText());
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS226_TIMEOUT");
  console.error("PASS226_CLIPBOARD", clipboard.readText());
  cleanup();
  app.exit(1);
}, 100000);
