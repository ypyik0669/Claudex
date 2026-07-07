const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass61-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass61-bin-"));
const PROJECT_FIXTURE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass61-project-"));
const COMMAND_LOG = path.join(USER_DATA_DIR, "claude-command-log.txt");

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

function readCommandLog() {
  try {
    return fs.readFileSync(COMMAND_LOG, "utf8");
  } catch (_error) {
    return "";
  }
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

const fakeClaudeScript = `
const fs = require('fs');
const args = process.argv.slice(2);
const commandLog = ${JSON.stringify(COMMAND_LOG)};
fs.appendFileSync(commandLog, args.join(' ') + '\\n', 'utf8');
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
if (args[0] === '--version') out('2.9.0 (Claude Code QA)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else if (args[0] === 'mcp' && args[1] === 'list') out('✓ pass61-mcp: connected');
else out('fake claude command: ' + args.join(' '));
`;

fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
const FAKE_CLAUDE_COMMAND = path.join(FAKE_BIN_DIR, "claude.cmd");
process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;

app.setPath("userData", USER_DATA_DIR);
fs.mkdirSync(USER_DATA_DIR, { recursive: true });
fs.writeFileSync(path.join(PROJECT_FIXTURE_DIR, "package.json"), JSON.stringify({ name: "pass61" }), "utf8");
writeJson(path.join(USER_DATA_DIR, "desktop-data.json"), {
  version: 1,
  settings: {
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
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
  activeProject: { name: "pass61-project", path: PROJECT_FIXTURE_DIR },
  projects: [{ name: "pass61-project", path: PROJECT_FIXTURE_DIR }],
  sessions: [
    {
      id: "default",
      title: "新聊天",
      project: "pass61-project",
      projectPath: PROJECT_FIXTURE_DIR,
      createdAt: "2026-07-05T00:00:00.000Z",
      updatedAt: "2026-07-05T00:00:00.000Z",
      messages: [],
    },
  ],
  commandRuns: [],
});

require(path.join(REPO_DIR, "electron", "main.cjs"));

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS61_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS61_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS61_OPEN_CAPABILITIES", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.nav-stack button')].find((candidate) => /插件/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS61_OPEN_MCP_TAB", await waitFor(win, "Boolean(document.querySelector('.plugin-manager-tabs'))", 10000) && await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.plugin-manager-tabs button')].find((candidate) => /MCP/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS61_MCP_STATUS_VISIBLE", await waitFor(win, `
    Boolean(/pass61-mcp/.test(document.querySelector('.plugin-manager-list')?.textContent || ''))
  `, 15000));
  assertStep("PASS61_STATUS_DID_NOT_PERSIST_COMMAND_RUNS", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      return !state.commandRuns || state.commandRuns.length === 0;
    })();
  `));

  const beforeAction = readCommandLog();
  assertStep("PASS61_CLICK_RECORD_MCP", await win.webContents.executeJavaScript(`
    (function() {
      const section = [...document.querySelectorAll('.structured-registry-section')]
        .find((item) => /MCP/.test(item.textContent || ''));
      const button = [...(section?.querySelectorAll('button') || [])]
        .find((candidate) => /记录/.test(candidate.textContent || '') || /证据/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS61_MCP_ACTION_RAN", await waitForLogGrowth(/mcp list/, beforeAction));
  assertStep("PASS61_MCP_ROW_EVIDENCE_VISIBLE", await waitFor(win, `
    (function() {
      const section = [...document.querySelectorAll('.structured-registry-section')]
        .find((item) => /MCP/.test(item.textContent || ''));
      const evidence = section?.querySelector('.row-cli-action-evidence.ok');
      const text = evidence?.textContent || '';
      return Boolean(evidence && /mcp list/.test(text) && /pass61-mcp/.test(text) && /退出码/.test(text));
    })();
  `, 10000));
  assertStep("PASS61_OPEN_OUTPUTS_FROM_MCP_ROW_EVIDENCE", await win.webContents.executeJavaScript(`
    (function() {
      const section = [...document.querySelectorAll('.structured-registry-section')]
        .find((item) => /MCP/.test(item.textContent || ''));
      const evidence = section?.querySelector('.row-cli-action-evidence.ok');
      const button = [...(evidence?.querySelectorAll('button') || [])]
        .find((candidate) => /打开输出/.test(candidate.textContent || candidate.getAttribute('aria-label') || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS61_OUTPUTS_PANEL_FROM_MCP_ROW_EVIDENCE", await waitFor(win, `
    Boolean(!document.querySelector('.plugin-manager-modal') &&
      document.querySelector('.run-timeline') &&
      /mcp list/.test(document.querySelector('.run-timeline')?.textContent || '') &&
      /Plugin\\/MCP CLI/.test(document.querySelector('.run-timeline')?.textContent || ''))
  `, 8000));
  assertStep("PASS61_SELECT_MCP_TIMELINE_EVENT", await win.webContents.executeJavaScript(`
    (async function() {
      const row = [...document.querySelectorAll('.run-timeline-row')]
        .find((candidate) => /mcp list/.test(candidate.textContent || ''));
      if (!row) return false;
      row.querySelector('summary')?.click();
      await new Promise((resolve) => setTimeout(resolve, 200));
      return Boolean(document.querySelector('.selected-run-evidence-panel'));
    })();
  `));
  assertStep("PASS61_SELECTED_MCP_EVIDENCE_PANEL_STRUCTURED", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.selected-run-evidence-panel');
      const text = panel?.textContent || '';
      return Boolean(
        panel &&
        /Plugin\\/MCP CLI/.test(text) &&
        /mcp list/.test(text) &&
        /pass61-mcp/.test(text) &&
        /标准输出/.test(text) &&
        /退出码/.test(text)
      );
    })();
  `, 8000));
  assertStep("PASS61_COPY_SELECTED_MCP_TIMELINE_EVIDENCE", await win.webContents.executeJavaScript(`
    (function() {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text) => { window.__pass61TimelineClipboard = String(text || ''); } },
      });
      const button = document.querySelector('.selected-run-evidence-panel [data-run-timeline-action="copy-evidence"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS61_SELECTED_MCP_TIMELINE_EVIDENCE_COPIED", await waitFor(win, `
    (function() {
      const text = window.__pass61TimelineClipboard || '';
      const panelText = document.querySelector('.selected-run-evidence-panel')?.textContent || '';
      return /Plugin\\/MCP CLI/.test(text) &&
        /Raw 类型: capability-(?:cli|command)/.test(text) &&
        /命令: claude mcp list/.test(text) &&
        /工作目录: /.test(text) &&
        /退出码: 0/.test(text) &&
        /标准输出\\n.*pass61-mcp/.test(text) &&
        /已复制/.test(panelText);
    })();
  `, 5000));
  assertStep("PASS61_MCP_COMMAND_PERSISTED", (() => {
    const parsed = JSON.parse(fs.readFileSync(path.join(USER_DATA_DIR, "desktop-data.json"), "utf8"));
    return parsed.commandRuns?.some((run) => run.kind === "capability" &&
      /mcp list/.test(run.command || "") &&
      run.code === 0 &&
      /pass61-mcp/.test(run.stdout || ""));
  })());

  console.log("PASS61_MCP_ACTION_EVIDENCE_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch((error) => {
  console.error("PASS61_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS61_TIMEOUT");
  cleanup();
  app.exit(1);
}, 80000);
