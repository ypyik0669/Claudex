const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass167-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass167-project-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass167-bin-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const COMMAND_LOG = path.join(USER_DATA_DIR, "claude-command-log.txt");

function cleanup() {
  for (const dir of [USER_DATA_DIR, PROJECT_DIR, FAKE_BIN_DIR]) {
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
  const fakeScript = `
const fs = require('fs');
const args = process.argv.slice(2);
const commandLog = ${JSON.stringify(COMMAND_LOG)};
fs.appendFileSync(commandLog, args.join(' ') + '\\n', 'utf8');
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
if (args[0] === '--version') out('2.16.7 (Claude Code QA)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out({ plugins: [{ id: 'pass167-tool-rail-plugin@pass167-market', name: 'pass167-tool-rail-plugin', marketplace: 'pass167-market', version: '16.7.0', enabled: true, status: 'enabled' }] });
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins:\\n\\n  > pass167-tool-rail-plugin@pass167-market\\n    Status: ✓ enabled');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out({ mcpServers: [{ name: 'pass167-mcp', status: 'ok', transport: 'stdio', tools: ['pass167-tool'], source: 'node pass167-mcp.js' }] });
else if (args[0] === 'mcp' && args[1] === 'list') out('✓ pass167-mcp: connected · 1 tool');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else out('pass167 fake claude command: ' + args.join(' '));
`;
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeScript, "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
  return path.join(FAKE_BIN_DIR, "claude.cmd");
}

function writeInitialStore() {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass167-project" }), "utf8");
  execFileSync("git", ["init"], { cwd: PROJECT_DIR, stdio: "ignore" });
  fs.writeFileSync(path.join(PROJECT_DIR, "pass167-one.txt"), "pass167 one\n", "utf8");
  fs.writeFileSync(path.join(PROJECT_DIR, "pass167-two.txt"), "pass167 two\n", "utf8");
  const fakeClaude = writeFakeClaude();
  const project = { name: "pass167-project", path: PROJECT_DIR };
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
        id: "pass167-session",
        title: "Tool rail status deeplinks",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    runEvents: [],
    automations: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [
      {
        id: "pass167-browser-error",
        status: "error",
        url: "https://example.invalid/pass167",
        error: "pass167 browser failed",
        capturedAt: "2026-07-07T00:00:00.000Z",
      },
    ],
    notices: [
      {
        id: "pass167-notice",
        level: "error",
        source: "qa",
        title: "pass167 active notice",
        detail: "pass167 notice should surface on the rail",
        createdAt: "2026-07-07T00:00:00.000Z",
      },
    ],
  });
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS167_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS167_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS167_RAIL_STATUS_BADGES", await waitFor(win, `
    (function() {
      const grid = document.querySelector('.app-grid');
      const columns = getComputedStyle(grid).gridTemplateColumns.trim().split(/\\s+/);
      const workspace = document.querySelector('.rail-button[data-tool="workspace"]');
      const environment = document.querySelector('.rail-button[data-tool="environment"]');
      const capabilities = document.querySelector('.rail-button[data-tool="capabilities"]');
      const browser = document.querySelector('.rail-button[data-tool="browser"]');
      const notices = document.querySelector('.rail-button[data-tool="notices"]');
      return Boolean(
        grid?.classList.contains('right-panel-hidden') &&
        columns[columns.length - 1] === '44px' &&
        workspace?.dataset.toolRailStatus === 'warning' &&
        /\\d+/.test(workspace.querySelector('em')?.textContent || '') &&
        environment?.dataset.toolRailStatus === 'warning' &&
        capabilities?.dataset.toolRailStatus === 'ready' &&
        capabilities?.querySelector('em')?.textContent === '2' &&
        browser?.dataset.toolRailStatus === 'error' &&
        browser?.querySelector('em')?.textContent === '!' &&
        notices?.dataset.toolRailStatus === 'error' &&
        notices?.querySelector('em')?.textContent === '1'
      );
    })();
  `, 15000));
  assertStep("PASS167_WORKSPACE_RAIL_DEEPLINK", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.rail-button[data-tool="workspace"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS167_WORKSPACE_TOOL_OPEN", await waitFor(win, `
    Boolean(
      !document.querySelector('.app-grid')?.classList.contains('right-panel-hidden') &&
      document.querySelector('.tools-panel #workspace-tool-detail') &&
      document.querySelector('.tools-panel .tool-row.active[aria-controls="workspace-tool-detail"]')
    )
  `, 15000));
  assertStep("PASS167_CLOSE_TO_RAIL", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.panel-toggle button[aria-label="关闭"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS167_RAIL_RETURNED", await waitFor(win, "Boolean(document.querySelector('.app-grid.right-panel-hidden') && document.querySelector('.app-rail'))", 5000));
  assertStep("PASS167_ENVIRONMENT_RAIL_DEEPLINK", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.rail-button[data-tool="environment"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS167_ENVIRONMENT_PANEL_OPEN", await waitFor(win, `
    Boolean(
      document.querySelector('.app-grid.right-panel-hidden') &&
      document.querySelector('.bottom-work-panel') &&
      /pass167-project/.test(document.querySelector('.bottom-work-panel')?.textContent || '')
    )
  `, 10000));
  assertStep("PASS167_CAPABILITY_RAIL_DEEPLINK", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.rail-button[data-tool="capabilities"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS167_CAPABILITY_SURFACE_OPEN", await waitFor(win, `
    Boolean(
      document.querySelector('.plugin-manager-modal.surface-panel') &&
      document.querySelector('.structured-plugin-row[data-plugin-id="pass167-tool-rail-plugin@pass167-market"]')
    )
  `, 15000));
  assertStep("PASS167_STATUS_USED_REAL_CLI", /plugin list --json/.test(fs.readFileSync(COMMAND_LOG, "utf8")) && /mcp list --json/.test(fs.readFileSync(COMMAND_LOG, "utf8")));

  console.log("PASS167_TOOL_RAIL_STATUS_DEEPLINKS_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS167_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS167_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
