const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass109-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass109-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass109-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const COMMAND_LOG = path.join(USER_DATA_DIR, "claude-command-log.txt");
const ARM_MCP_FAILURE = path.join(USER_DATA_DIR, "arm-mcp-failure.txt");
const MCP_FAILURE_COUNT = path.join(USER_DATA_DIR, "mcp-failure-count.txt");

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_DIR]) {
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

function readCommandLog() {
  try {
    return fs.readFileSync(COMMAND_LOG, "utf8");
  } catch (_error) {
    return "";
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

async function waitForLogGrowth(pattern, before, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const next = readCommandLog().slice(before.length);
    if (pattern.test(next)) return true;
    await wait(150);
  }
  return false;
}

function assertStep(name, ok) {
  console.log(name, ok);
  if (!ok) throw new Error(`${name} failed`);
}

function writeFakeClaude() {
  const fakeClaudeScript = `
const fs = require('fs');
const args = process.argv.slice(2);
const commandLog = ${JSON.stringify(COMMAND_LOG)};
const armMcpFailure = ${JSON.stringify(ARM_MCP_FAILURE)};
const mcpFailureCount = ${JSON.stringify(MCP_FAILURE_COUNT)};
function failureCount() { try { return Number(fs.readFileSync(mcpFailureCount, 'utf8')) || 0; } catch (_error) { return 0; } }
fs.appendFileSync(commandLog, args.join(' ') + '\\n', 'utf8');
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
if (args[0] === '--version') out('2.10.9 (Claude Code QA)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else if (args[0] === 'mcp' && args[1] === 'list') {
  if (fs.existsSync(armMcpFailure) && failureCount() === 0) {
    fs.writeFileSync(mcpFailureCount, '1', 'utf8');
    process.stderr.write('pass109 mcp list failed\\n');
    process.exit(29);
  }
  out('? pass109-filesystem: connected ? 5 tools\\n? pass109-cache: connected ? 2 tools');
}
else out('fake claude command: ' + args.join(' '));
`;
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
  return path.join(FAKE_BIN_DIR, "claude.cmd");
}

function writeInitialStore(claudeCommand) {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass109-project" }), "utf8");
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
      claudeCode: { executionMode: "claude-code", claudeCommand, permissionMode: "default" },
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
    activeProject: { name: "pass109-project", path: PROJECT_DIR },
    projects: [{ name: "pass109-project", path: PROJECT_DIR }],
    sessions: [
      {
        id: "default",
        title: "MCP retry recovery",
        project: "pass109-project",
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-06T00:00:00.000Z",
        updatedAt: "2026-07-06T00:00:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    automations: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

async function openMcpWorkbench(win) {
  assertStep("PASS109_OPEN_CAPABILITIES", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.nav-stack button')].find((candidate) => /\\u63d2\\u4ef6/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS109_OPEN_MCP_TAB", await waitFor(win, "Boolean(document.querySelector('.plugin-manager-tabs'))", 10000) && await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.plugin-manager-tabs button')].find((candidate) => /MCP/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS109_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS109_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  await openMcpWorkbench(win);
  assertStep("PASS109_MCP_ROWS_READY", await waitFor(win, `
    Boolean([...document.querySelectorAll('.structured-plugin-row')]
      .find((item) => /pass109-filesystem/.test(item.textContent || '')))
  `, 15000));

  assertStep("PASS109_MCP_RECORD_READY", await waitFor(win, `
    (function() {
      const button = [...document.querySelectorAll('.structured-registry-head-actions button')]
        .find((candidate) => /\\u8bb0\\u5f55/.test(candidate.textContent || ''));
      return Boolean(button && !button.disabled);
    })();
  `, 10000));
  fs.writeFileSync(ARM_MCP_FAILURE, "1", "utf8");
  const beforeFailure = readCommandLog();
  assertStep("PASS109_RECORD_MCP_STATUS", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.structured-registry-head-actions button')]
        .find((candidate) => /\\u8bb0\\u5f55/.test(candidate.textContent || ''));
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS109_MCP_FAILURE_RAN", await waitForLogGrowth(/mcp list/, beforeFailure, 12000));
  assertStep("PASS109_MCP_FAILURE_RETRY_VISIBLE", await waitFor(win, `
    (function() {
      const section = [...document.querySelectorAll('.structured-registry-section')]
        .find((item) => /MCP/.test(item.textContent || ''));
      const evidence = [...(section?.querySelectorAll('.row-cli-action-evidence.error') || [])]
        .find((item) => /mcp list/.test(item.textContent || ''));
      const text = evidence?.textContent || '';
      const retry = [...(evidence?.querySelectorAll('button') || [])]
        .find((button) => /\\u91cd\\u8bd5/.test(button.textContent || ''));
      return Boolean(
        evidence &&
        /mcp list/.test(text) &&
        /29/.test(text) &&
        /pass109 mcp list failed/.test(text) &&
        retry &&
        /pass109 mcp list failed/.test(document.querySelector('.plugin-cli-error')?.textContent || '')
      );
    })();
  `, 10000));

  const beforeRetry = readCommandLog();
  assertStep("PASS109_CLICK_RETRY", await win.webContents.executeJavaScript(`
    (function() {
      const section = [...document.querySelectorAll('.structured-registry-section')]
        .find((item) => /MCP/.test(item.textContent || ''));
      const evidence = [...(section?.querySelectorAll('.row-cli-action-evidence.error') || [])]
        .find((item) => /mcp list/.test(item.textContent || ''));
      const retry = [...(evidence?.querySelectorAll('button') || [])]
        .find((button) => /\\u91cd\\u8bd5/.test(button.textContent || ''));
      if (!retry) return false;
      retry.click();
      return true;
    })();
  `));
  assertStep("PASS109_RETRY_MCP_RAN", await waitForLogGrowth(/mcp list/, beforeRetry, 12000));
  assertStep("PASS109_MCP_RETRY_RECOVERED", await waitFor(win, `
    (function() {
      const section = [...document.querySelectorAll('.structured-registry-section')]
        .find((item) => /MCP/.test(item.textContent || ''));
      const evidence = [...(section?.querySelectorAll('.row-cli-action-evidence.ok') || [])]
        .find((item) => /mcp list/.test(item.textContent || ''));
      const text = section?.textContent || '';
      return Boolean(
        evidence &&
        /mcp list/.test(evidence.textContent || '') &&
        /pass109-filesystem/.test(text) &&
        /pass109-cache/.test(text) &&
        !/pass109 mcp list failed/.test(document.querySelector('.plugin-cli-error')?.textContent || '')
      );
    })();
  `, 15000));
  assertStep("PASS109_MCP_RETRY_PERSISTED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const runs = state.commandRuns?.filter((run) => run.kind === 'capability' && /mcp list/.test(run.command || '')) || [];
      return Boolean(
        runs.length >= 2 &&
        runs.some((run) => run.code === 29 && /pass109 mcp list failed/.test(run.stderr || '')) &&
        runs.some((run) => run.code === 0 && /pass109-filesystem/.test(run.stdout || ''))
      );
    })();
  `, 10000));

  console.log("PASS109_MCP_LIST_RETRY_RECOVERY_DONE");
  cleanup();
  app.exit(0);
}

const fakeClaudeCommand = writeFakeClaude();
app.setPath("userData", USER_DATA_DIR);
writeInitialStore(fakeClaudeCommand);
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS109_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS109_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
