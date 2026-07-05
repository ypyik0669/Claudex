const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass56-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass56-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass56-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const COMMAND_LOG = path.join(USER_DATA_DIR, "claude-command-log.txt");
const MARKETPLACE_LIST_COUNT = path.join(USER_DATA_DIR, "marketplace-list-count.txt");

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

async function waitForMarketplaceListCount(expectedCount, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const count = Number(fs.readFileSync(MARKETPLACE_LIST_COUNT, "utf8") || "0");
      if (count >= expectedCount) return true;
    } catch (_error) {
      // count file is created by the fake Claude command on demand
    }
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
const marketplaceListCount = ${JSON.stringify(MARKETPLACE_LIST_COUNT)};
fs.appendFileSync(commandLog, args.join(' ') + '\\n', 'utf8');
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
if (args[0] === '--version') out('2.9.0 (Claude Code QA)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([
  { id: 'qa-installed-plugin@qa-market', version: '1.0.0', scope: 'user', enabled: true, installPath: 'C:/qa/plugin' }
]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins:\\n\\n  > qa-installed-plugin@qa-market\\n    Version: 1.0.0\\n    Scope: user\\n    Status: ✓ enabled');
else if (args[0] === 'mcp' && args[1] === 'list') out('✓ qa-mcp: connected');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') {
  const current = fs.existsSync(marketplaceListCount) ? Number(fs.readFileSync(marketplaceListCount, 'utf8') || '0') : 0;
  fs.writeFileSync(marketplaceListCount, String(current + 1), 'utf8');
  if (current === 0) out('Configured marketplaces:\\n\\n  > pass56-market\\n    Source: QA fixture');
  else {
    process.stderr.write('pass56 marketplace failed\\n');
    process.exit(23);
  }
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass56-project" }), "utf8");
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
    activeProject: { name: "pass56-project", path: PROJECT_DIR },
    projects: [{ name: "pass56-project", path: PROJECT_DIR }],
    sessions: [
      {
        id: "default",
        title: "新聊天",
        project: "pass56-project",
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-05T00:00:00.000Z",
        updatedAt: "2026-07-05T00:00:00.000Z",
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

async function openOutputsPanel(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      if (document.querySelector('.bottom-work-panel .run-timeline') || document.querySelector('.bottom-work-panel .capability-command-evidence-stack')) return true;
      const button = Array.from(document.querySelectorAll('.workspace-context-tabs .workspace-context-button'))[1];
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function openNoticesPanel(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = Array.from(document.querySelectorAll('.workspace-context-tabs .workspace-context-button'))[2];
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS56_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS56_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS56_OPEN_CAPABILITIES", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.nav-stack button')].find((candidate) => /插件/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS56_MARKETPLACE_TAB", await waitFor(win, `
    (function() {
      const button = [...document.querySelectorAll('.plugin-manager-tabs button')].find((candidate) => /市场/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return Boolean(document.querySelector('.marketplace-workbench'));
    })();
  `, 15000));
  assertStep("PASS56_FETCH_READY", await waitFor(win, `
    (function() {
      const buttons = [...document.querySelectorAll('.marketplace-actions button')];
      const fetchButton = buttons.find((candidate) => /获取市场列表/.test(candidate.textContent || ''));
      return Boolean(fetchButton && !fetchButton.disabled);
    })();
  `, 12000));
  assertStep("PASS56_CLICK_FETCH", await win.webContents.executeJavaScript(`
    (function() {
      const buttons = [...document.querySelectorAll('.marketplace-actions button')];
      const fetchButton = buttons.find((candidate) => /获取市场列表/.test(candidate.textContent || ''));
      if (!fetchButton || fetchButton.disabled) return false;
      fetchButton.click();
      return true;
    })();
  `));
  assertStep("PASS56_MARKETPLACE_COMMAND_RAN", await waitForMarketplaceListCount(2));
  assertStep("PASS56_PLUGIN_ERROR_VISIBLE", await waitFor(win, "Boolean(document.querySelector('.plugin-cli-error') && /pass56 marketplace failed/.test(document.body.textContent || ''))", 10000));
  assertStep("PASS56_FAILURE_EVIDENCE_VISIBLE", await waitFor(win, `
    (function() {
      const card = document.querySelector('.plugin-cli-action-evidence.error');
      const text = card?.textContent || '';
      return Boolean(card && /plugin marketplace list/.test(text) && /23/.test(text) && /pass56 marketplace failed/.test(text));
    })();
  `, 10000));
  assertStep("PASS56_MARKETPLACE_ROW_FAILURE_SUMMARY_VISIBLE", await waitFor(win, `
    (function() {
      const sourceCard = document.querySelector('.marketplace-workbench .marketplace-card');
      const summary = sourceCard?.querySelector('.row-cli-action-evidence.error .row-cli-action-message');
      const text = summary?.textContent || '';
      return Boolean(summary && /pass56 marketplace failed/.test(text));
    })();
  `, 10000));
  assertStep("PASS56_NOTICE_RECORDED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      return Boolean(state.notices?.some((notice) => !notice.dismissedAt && notice.level === 'error' && /pass56 marketplace failed/.test((notice.title || '') + (notice.detail || ''))));
    })();
  `, 10000));
  assertStep("PASS56_CAPABILITY_COMMAND_PERSISTED", (() => {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return parsed.commandRuns?.some((run) => run.kind === "capability" &&
      /plugin marketplace list/.test(run.command || "") &&
      run.code === 23 &&
      /pass56 marketplace failed/.test(run.stderr || ""));
  })());
  assertStep("PASS56_RUN_EVENT_PERSISTED", (() => {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return parsed.runEvents?.some((event) => event.type === "capability-cli" &&
      event.status === "error" &&
      /plugin marketplace list/.test(event.commandLine || event.title || "") &&
      /pass56 marketplace failed/.test(`${event.detail || ""} ${event.stderr || ""}`));
  })());
  assertStep("PASS56_BACK_TO_APP", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.surface-back');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS56_APP_RETURNED", await waitFor(win, "Boolean(document.querySelector('.workspace-context-tabs'))", 5000));
  assertStep("PASS56_OPEN_OUTPUTS_PANEL", await openOutputsPanel(win));
  assertStep("PASS56_TIMELINE_HAS_FAILURE", await waitFor(win, `
    Boolean(document.querySelector('.run-timeline') &&
      /plugin marketplace list/.test(document.querySelector('.run-timeline')?.textContent || '') &&
      /退出码: 23/.test(document.querySelector('.run-timeline')?.textContent || ''))
  `, 8000));
  assertStep("PASS56_BOTTOM_EVIDENCE_HAS_FAILURE_OUTPUT", await waitFor(win, `
    Boolean(document.querySelector('.capability-command-evidence-stack') &&
      /plugin marketplace list/.test(document.querySelector('.capability-command-evidence-stack')?.textContent || '') &&
      /pass56 marketplace failed/.test(document.querySelector('.capability-command-evidence-stack')?.textContent || ''))
  `, 8000));
  assertStep("PASS56_OPEN_NOTICE_PANEL", await openNoticesPanel(win));
  assertStep("PASS56_NOTICE_VISIBLE", await waitFor(win, "Boolean(document.querySelector('.bottom-work-panel .notice-card.error') && /pass56 marketplace failed/.test(document.body.textContent || ''))", 8000));

  console.log("PASS56_MARKETPLACE_FETCH_FAILURE_EVIDENCE_DONE");
  cleanup();
  app.exit(0);
}

const fakeClaudeCommand = writeFakeClaude();
app.setPath("userData", USER_DATA_DIR);
writeInitialStore(fakeClaudeCommand);
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS56_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS56_TIMEOUT");
  cleanup();
  app.exit(1);
}, 80000);
