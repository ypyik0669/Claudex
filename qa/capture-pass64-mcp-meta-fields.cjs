const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const PROJECT_PATH = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass64-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass64-bin-"));
const PROJECT_FIXTURE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass64-project-"));

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_FIXTURE_DIR]) {
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

async function wait(ms) {
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

const fakeClaudeScript = `
const args = process.argv.slice(2);
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
if (args[0] === '--version') out('2.9.0 (Claude Code QA)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else if (args[0] === 'mcp' && args[1] === 'list') out('✓ filesystem: connected · 4 tools · stdio · C:\\\\mcp\\\\filesystem-server.cjs\\n✗ database: error missing token · 0 tools · http://localhost:3333/sse');
else out('fake claude command: ' + args.join(' '));
`;

fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
const FAKE_CLAUDE_COMMAND = path.join(FAKE_BIN_DIR, "claude.cmd");
process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;

app.setPath("userData", USER_DATA_DIR);
fs.mkdirSync(USER_DATA_DIR, { recursive: true });
fs.writeFileSync(path.join(PROJECT_FIXTURE_DIR, "package.json"), JSON.stringify({ name: "pass64" }), "utf8");
writeJson(path.join(USER_DATA_DIR, "desktop-data.json"), {
  version: 1,
  settings: {
    provider: "anthropic",
    model: "claude-sonnet-4-5-20250929",
    baseUrl: "https://api.example.invalid",
    temperature: 0.2,
    timeoutMs: 600000,
    language: "zh",
    appearance: { fontSize: "compact", density: "compact" },
    claudeCode: { executionMode: "claude-code", claudeCommand: FAKE_CLAUDE_COMMAND, permissionMode: "default" },
    capabilities: {
      "project-context": true,
      "terminal-helper": true,
      "mcp-runtime": true,
      "plugin-router": true,
      "marketplace-router": true,
    },
    customMarketplaces: [],
  },
  activeProject: { name: "pass64-project", path: PROJECT_FIXTURE_DIR },
  projects: [{ name: "pass64-project", path: PROJECT_FIXTURE_DIR }],
  sessions: [
    {
      id: "default",
      title: "新聊天",
      project: "pass64-project",
      projectPath: PROJECT_FIXTURE_DIR,
      createdAt: "2026-07-05T00:00:00.000Z",
      updatedAt: "2026-07-05T00:00:00.000Z",
      messages: [],
    },
  ],
  commandRuns: [],
});

require(path.join(PROJECT_PATH, "electron", "main.cjs"));

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS64_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS64_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS64_OPEN_CAPABILITIES", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.nav-stack button')].find((candidate) => /插件/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS64_OPEN_MCP_TAB", await waitFor(win, "Boolean(document.querySelector('.plugin-manager-tabs'))", 10000) && await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.plugin-manager-tabs button')].find((candidate) => /MCP/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS64_MCP_META_FIELDS_VISIBLE", await waitFor(win, `
    (function() {
      const rows = [...document.querySelectorAll('.structured-plugin-row')];
      const filesystem = rows.find((item) => /filesystem/.test(item.textContent || ''));
      const database = rows.find((item) => /database/.test(item.textContent || ''));
      const fsMeta = filesystem?.querySelector('.structured-row-meta')?.textContent || '';
      const dbMeta = database?.querySelector('.structured-row-meta')?.textContent || '';
      return /工具/.test(fsMeta) && /4/.test(fsMeta) && /传输/.test(fsMeta) && /stdio/.test(fsMeta) &&
        /来源/.test(fsMeta) && /filesystem-server\.cjs/.test(fsMeta) &&
        /工具/.test(dbMeta) && /0/.test(dbMeta) && /传输/.test(dbMeta) && /http/.test(dbMeta) &&
        /来源/.test(dbMeta) && dbMeta.includes('localhost:3333/sse') &&
        /错误/.test(dbMeta) && /missing token/.test(dbMeta);
    })();
  `, 15000));
  assertStep("PASS64_MCP_META_SEARCHABLE", await win.webContents.executeJavaScript(`
    (function() {
      const input = document.querySelector('.capability-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, 'missing token');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })();
  `) && await waitFor(win, `
    (function() {
      const rows = [...document.querySelectorAll('.structured-plugin-row')];
      return rows.some((item) => /database/.test(item.textContent || '')) &&
        !rows.some((item) => /filesystem/.test(item.textContent || ''));
    })();
  `, 5000));
  assertStep("PASS64_STATUS_DID_NOT_PERSIST_COMMAND_RUNS", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      return !state.commandRuns || state.commandRuns.length === 0;
    })();
  `));

  console.log("PASS64_MCP_META_FIELDS_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch((error) => {
  console.error("PASS64_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS64_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
