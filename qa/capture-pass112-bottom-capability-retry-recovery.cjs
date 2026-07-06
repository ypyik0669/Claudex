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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass112-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass112-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass112-project-"));
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
if (args[0] === '--version') out('2.11.2 (Claude Code QA)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else if (args[0] === 'mcp' && args[1] === 'list') {
  if (fs.existsSync(armMcpFailure) && failureCount() === 0) {
    fs.writeFileSync(mcpFailureCount, '1', 'utf8');
    process.stderr.write('pass112 mcp list failed\\n');
    process.exit(32);
  }
  out('? pass112-filesystem: connected ? 5 tools\\n? pass112-cache: connected ? 2 tools');
}
else out('pass112 fake claude command: ' + args.join(' '));
`;
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
  return path.join(FAKE_BIN_DIR, "claude.cmd");
}

function writeInitialStore(claudeCommand) {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass112-project" }), "utf8");
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
    activeProject: { name: "pass112-project", path: PROJECT_DIR },
    projects: [{ name: "pass112-project", path: PROJECT_DIR }],
    sessions: [
      {
        id: "default",
        title: "Bottom capability retry recovery",
        project: "pass112-project",
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
  assertStep("PASS112_OPEN_CAPABILITIES", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.nav-stack button')].find((candidate) => /\\u63d2\\u4ef6/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS112_OPEN_MCP_TAB", await waitFor(win, "Boolean(document.querySelector('.plugin-manager-tabs'))", 10000) && await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.plugin-manager-tabs button')].find((candidate) => /MCP/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
}

async function closeSurface(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.surface-back');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function openOutputsPanel(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      if (document.querySelector('.bottom-work-panel .capability-command-evidence-stack')) return true;
      const button = [...document.querySelectorAll('.workspace-context-tabs .workspace-context-button')]
        .find((candidate) => /\\u8f93\\u51fa/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS112_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS112_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  await openMcpWorkbench(win);
  assertStep("PASS112_MCP_ROWS_READY", await waitFor(win, `
    Boolean([...document.querySelectorAll('.structured-plugin-row')]
      .find((item) => /pass112-filesystem/.test(item.textContent || '')))
  `, 15000));

  fs.writeFileSync(ARM_MCP_FAILURE, "1", "utf8");
  const beforeFailure = readCommandLog();
  assertStep("PASS112_RECORD_MCP_STATUS", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.structured-registry-head-actions button')]
        .find((candidate) => /\\u8bb0\\u5f55/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS112_MCP_FAILURE_RAN", await waitForLogGrowth(/mcp list/, beforeFailure, 12000));
  assertStep("PASS112_CLOSE_CAPABILITY_SURFACE", await closeSurface(win));
  assertStep("PASS112_OPEN_OUTPUTS_PANEL_AFTER_FAILURE", await waitFor(win, "Boolean(document.querySelector('.workspace-context-tabs'))", 5000) && await openOutputsPanel(win));
  assertStep("PASS112_BOTTOM_FAILURE_RETRY_VISIBLE", await waitFor(win, `
    (function() {
      const stack = document.querySelector('.capability-command-evidence-stack');
      const card = stack?.querySelector('.command-output-card.error');
      const text = card?.textContent || '';
      const retry = [...(card?.querySelectorAll('button') || [])]
        .find((button) => /\\u91cd\\u8bd5/.test(button.textContent || ''));
      return Boolean(
        stack &&
        /Plugin\\/MCP CLI/.test(stack.textContent || '') &&
        card &&
        /mcp list/.test(text) &&
        /32/.test(text) &&
        /pass112 mcp list failed/.test(text) &&
        retry
      );
    })();
  `, 10000));

  assertStep("PASS112_SELECTED_FAILURE_RECOVERY_VISIBLE", await waitFor(win, `
    (async function() {
      const row = [...document.querySelectorAll('.run-timeline-row.error')]
        .find((candidate) => /mcp list/.test(candidate.textContent || ''));
      if (!row) return false;
      row.querySelector('summary')?.click();
      await new Promise((resolve) => setTimeout(resolve, 200));
      const panel = document.querySelector('.selected-run-evidence-panel.error');
      return Boolean(
        panel &&
        /mcp list/.test(panel.textContent || '') &&
        /pass112 mcp list failed/.test(panel.textContent || '') &&
        panel.querySelector('[data-run-recovery-action="retry-capability"]') &&
        panel.querySelector('[data-run-recovery-action="open-claude-panel"]')
      );
    })()
  `, 10000));

  assertStep("PASS112_CLICK_SELECTED_OPEN_CLAUDE_PANEL", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.selected-run-evidence-panel [data-run-recovery-action="open-claude-panel"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS112_SELECTED_OPEN_CLAUDE_PANEL_VISIBLE", await waitFor(win, `
    Boolean(
      document.querySelector('#claude-tool-detail') &&
      document.querySelector('.selected-run-evidence-panel.error') &&
      /pass112 mcp list failed/.test(document.querySelector('.selected-run-evidence-panel.error')?.textContent || '')
    )
  `, 10000));

  const beforeRetry = readCommandLog();
  assertStep("PASS112_CLICK_SELECTED_RETRY", await win.webContents.executeJavaScript(`
    (function() {
      const retry = document.querySelector('.selected-run-evidence-panel [data-run-recovery-action="retry-capability"]');
      if (!retry || retry.disabled) return false;
      retry.click();
      return true;
    })();
  `));
  assertStep("PASS112_RETRY_MCP_RAN", await waitForLogGrowth(/mcp list/, beforeRetry, 12000));
  assertStep("PASS112_BOTTOM_RETRY_RECOVERED", await waitFor(win, `
    (function() {
      const stack = document.querySelector('.capability-command-evidence-stack');
      const okCard = stack?.querySelector('.command-output-card.ok');
      const text = okCard?.textContent || '';
      return Boolean(
        okCard &&
        /mcp list/.test(text) &&
        /pass112-filesystem/.test(text) &&
        /pass112-cache/.test(text)
      );
    })();
  `, 15000));
  assertStep("PASS112_TIMELINE_BOTH_RUNS_VISIBLE", await waitFor(win, `
    (function() {
      const rows = [...document.querySelectorAll('.run-timeline-row')];
      return rows.some((row) => row.classList.contains('error') && /mcp list/.test(row.textContent || '')) &&
        rows.some((row) => row.classList.contains('ok') && /mcp list/.test(row.textContent || ''));
    })();
  `, 10000));
  assertStep("PASS112_RETRY_PERSISTED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const runs = state.commandRuns?.filter((run) => run.kind === 'capability' && /mcp list/.test(run.command || '')) || [];
      return Boolean(
        runs.length >= 2 &&
        runs.some((run) => run.code === 32 && /pass112 mcp list failed/.test(run.stderr || '')) &&
        runs.some((run) => run.code === 0 && /pass112-filesystem/.test(run.stdout || ''))
      );
    })();
  `, 10000));

  console.log("PASS112_BOTTOM_CAPABILITY_RETRY_RECOVERY_DONE");
  cleanup();
  app.exit(0);
}

const fakeClaudeCommand = writeFakeClaude();
app.setPath("userData", USER_DATA_DIR);
writeInitialStore(fakeClaudeCommand);
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS112_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS112_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
