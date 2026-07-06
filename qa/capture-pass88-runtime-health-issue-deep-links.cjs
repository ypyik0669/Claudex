const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass88-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass88-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass88-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");

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

function assertStep(name, ok) {
  console.log(name, ok);
  if (!ok) throw new Error(`${name} failed`);
}

function writeFakeClaude() {
  const fakeClaudeScript = `
const args = process.argv.slice(2);
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
if (args[0] === '--version') out('2.9.0 (Claude Code QA pass88)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) {
  process.stderr.write('pass88 plugin json failed\\n');
  process.exit(21);
}
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins:\\n\\n  > pass88-installed@qa\\n    Version: 1.0.0\\n    Scope: user\\n    Status: enabled');
else if (args[0] === 'mcp' && args[1] === 'list') {
  process.stderr.write('pass88 mcp failed\\n');
  process.exit(22);
}
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) {
  process.stderr.write('pass88 marketplace json failed\\n');
  process.exit(23);
}
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') {
  process.stderr.write('pass88 marketplace failed\\n');
  process.exit(24);
}
else out('fake claude command: ' + args.join(' '));
`;
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
  return path.join(FAKE_BIN_DIR, "claude.cmd");
}

function writeInitialStore(claudeCommand) {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass88-project" }), "utf8");
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
      claudeCode: { executionMode: "claude-code", claudeCommand, permissionMode: "plan" },
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
    activeProject: { name: "pass88-project", path: PROJECT_DIR },
    projects: [{ name: "pass88-project", path: PROJECT_DIR }],
    sessions: [
      {
        id: "default",
        title: "新聊天",
        project: "pass88-project",
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-06T00:00:00.000Z",
        updatedAt: "2026-07-06T00:00:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    runEvents: [],
    notices: [],
  });
}

async function openCapabilities(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const pluginPattern = new RegExp("\\\\u63d2\\\\u4ef6");
      const button = [...document.querySelectorAll('.nav-stack button')].find((candidate) => pluginPattern.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function closeSurface(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.surface-back') || document.querySelector('.settings-surface header .icon-only') || document.querySelector('.plugin-manager-modal header .icon-only');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function openSettings(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', ctrlKey: true, bubbles: true }));
      return true;
    })();
  `);
}

async function markSettingsDirty(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const select = document.querySelector('.settings-content select');
      if (!select) return false;
      select.value = select.value === 'zh' ? 'system' : 'zh';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })();
  `);
}

async function selectSettingsSection(win, id) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.settings-nav button[data-settings-section="${id}"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS88_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS88_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));

  assertStep("PASS88_OPEN_CAPABILITIES", await openCapabilities(win));
  assertStep("PASS88_CAPABILITY_RUNTIME_ISSUES_READY", await waitFor(win, `
    (function() {
      const card = document.querySelector('.capability-modal .runtime-health-card.error');
      const text = card?.textContent || '';
      return Boolean(card &&
        /pass88 plugin json failed/.test(text) &&
        /pass88 mcp failed/.test(text) &&
        /pass88 marketplace json failed/.test(text));
    })();
  `, 15000));
  assertStep("PASS88_CAPABILITY_ISSUE_ACTION_HOOKS", await win.webContents.executeJavaScript(`
    Boolean(
      document.querySelector('.capability-modal .runtime-health-issue[data-runtime-health-issue-target="mcp"] button[data-runtime-health-issue-action="open"]') &&
      document.querySelector('.capability-modal .runtime-health-issue[data-runtime-health-issue-target="marketplace"] button[data-runtime-health-issue-action="open"]')
    )
  `));
  assertStep("PASS88_CAPABILITY_CLICK_MCP_ISSUE", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.capability-modal .runtime-health-issue[data-runtime-health-issue-target="mcp"] button[data-runtime-health-issue-action="open"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS88_MCP_TAB_OPENED_FROM_ISSUE", await waitFor(win, `
    (function() {
      const active = document.querySelector('.plugin-manager-tabs button[aria-selected="true"]');
      return Boolean(active && /MCP/i.test(active.textContent || '') && document.querySelector('.structured-registry-section'));
    })();
  `, 8000));

  assertStep("PASS88_CLOSE_CAPABILITIES", await closeSurface(win));
  assertStep("PASS88_OPEN_SETTINGS_BACKED_MCP", await openSettings(win));
  assertStep("PASS88_SELECT_SETTINGS_MCP", await selectSettingsSection(win, "mcp"));
  assertStep("PASS88_SETTINGS_BACKED_ISSUES_READY", await waitFor(win, `
    Boolean(document.querySelector('.settings-backed-section .runtime-health-issue[data-runtime-health-issue-target="mcp"] button[data-runtime-health-issue-action="open"]'))
  `, 15000));
  assertStep("PASS88_SETTINGS_BACKED_CLICK_MCP_ISSUE", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.settings-backed-section .runtime-health-issue[data-runtime-health-issue-target="mcp"] button[data-runtime-health-issue-action="open"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS88_SETTINGS_BACKED_MCP_TAB_OPENED", await waitFor(win, `
    (function() {
      const active = document.querySelector('.plugin-manager-tabs button[aria-selected="true"]');
      return Boolean(!document.querySelector('.settings-workspace') && active && /MCP/i.test(active.textContent || '') && document.querySelector('.structured-registry-section'));
    })();
  `, 8000));

  assertStep("PASS88_CLOSE_BACKED_MCP", await closeSurface(win));
  assertStep("PASS88_OPEN_SETTINGS_CLEAN", await openSettings(win));
  assertStep("PASS88_SETTINGS_RUNTIME_ISSUES_READY", await waitFor(win, `
    Boolean(document.querySelector('.settings-runtime-section .runtime-health-issue[data-runtime-health-issue-target="marketplace"] button[data-runtime-health-issue-action="open"]'))
  `, 15000));
  assertStep("PASS88_SETTINGS_CLICK_MARKETPLACE_ISSUE", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.settings-runtime-section .runtime-health-issue[data-runtime-health-issue-target="marketplace"] button[data-runtime-health-issue-action="open"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS88_MARKETPLACE_OPENED_FROM_SETTINGS_ISSUE", await waitFor(win, `
    Boolean(!document.querySelector('.settings-workspace') && document.querySelector('.plugin-manager-modal .marketplace-workbench'))
  `, 8000));

  assertStep("PASS88_CLOSE_MARKETPLACE", await closeSurface(win));
  assertStep("PASS88_OPEN_SETTINGS_DIRTY", await openSettings(win));
  assertStep("PASS88_SETTINGS_DIRTY_RUNTIME_ISSUES_READY", await waitFor(win, `
    Boolean(document.querySelector('.settings-runtime-section .runtime-health-issue[data-runtime-health-issue-target="marketplace"] button[data-runtime-health-issue-action="open"]'))
  `, 15000));
  assertStep("PASS88_MARK_SETTINGS_DIRTY", await markSettingsDirty(win));
  assertStep("PASS88_DIRTY_CLICK_MARKETPLACE_ISSUE", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.settings-runtime-section .runtime-health-issue[data-runtime-health-issue-target="marketplace"] button[data-runtime-health-issue-action="open"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS88_DIRTY_GUARD_STAYS_FOR_ISSUE", await waitFor(win, `
    Boolean(document.querySelector('.settings-workspace') && document.querySelector('.dirty-confirm-banner') && !document.querySelector('.marketplace-workbench'))
  `, 5000));

  console.log("PASS88_RUNTIME_HEALTH_ISSUE_DEEP_LINKS_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore(writeFakeClaude());
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS88_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});
