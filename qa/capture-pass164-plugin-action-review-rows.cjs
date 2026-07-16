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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass164-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass164-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass164-project-"));
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const COMMAND_LOG = path.join(USER_DATA_DIR, "claude-command-log.txt");
const DISABLED_FILE = path.join(USER_DATA_DIR, "pass164-disabled.txt");

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

function assertStep(name, ok) {
  console.log(name, ok);
  if (!ok) throw new Error(`${name} failed`);
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

async function waitForLog(pattern, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (pattern.test(readCommandLog())) return true;
    await wait(150);
  }
  return false;
}

function writeFakeClaude() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  const fakeScript = `
const fs = require('fs');
const args = process.argv.slice(2);
const commandLog = ${JSON.stringify(COMMAND_LOG)};
const disabledFile = ${JSON.stringify(DISABLED_FILE)};
function disabled() { return fs.existsSync(disabledFile); }
fs.appendFileSync(commandLog, args.join(' ') + '\\n', 'utf8');
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
if (args[0] === '--version') out('claude fake pass164');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out({
  plugins: [
    {
      id: 'pass164-review-plugin@pass164-market',
      name: 'pass164-review-plugin',
      marketplace: 'pass164-market',
      version: '16.4.0',
      scope: 'project',
      enabled: !disabled(),
      status: disabled() ? 'disabled' : 'enabled',
      source: { source: 'git', url: 'https://example.invalid/pass164.git', path: 'plugins/review', ref: 'v16.4.0' },
      installPath: 'C:/pass164/plugins/review',
      tools: ['pass164-read-tool', 'pass164-shell-tool'],
      permissions: { filesystem: 'read', bash: true }
    }
  ]
});
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins:\\n\\n  > pass164-review-plugin@pass164-market\\n    Version: 16.4.0\\n    Scope: project\\n    Status: ' + (disabled() ? 'disabled' : 'enabled'));
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else if (args[0] === 'plugin' && args[1] === 'disable' && args[2] === '--scope' && args[3] === 'project' && args[4] === 'pass164-review-plugin@pass164-market') {
  fs.writeFileSync(disabledFile, '1', 'utf8');
  out('ok plugin disable --scope project pass164-review-plugin@pass164-market');
}
else out('pass164 ok ' + args.join(' '));
`;
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeScript, "utf8");
  fs.writeFileSync(FAKE_CLAUDE, `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
}

function writeInitialStore() {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass164-project" }), "utf8");
  writeFakeClaude();

  const project = { name: "pass164-project", path: PROJECT_DIR };
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
        id: "pass164-session",
        title: "pass164 plugin action review rows",
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
    browserVisits: [],
    notices: [],
  });
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS164_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS164_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS164_OPEN_CAPABILITIES", await win.webContents.executeJavaScript(`
    (function() {
      const button = Array.from(document.querySelectorAll('.nav-stack button'))
        .find((candidate) => /\\u63d2\\u4ef6/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS164_PLUGIN_ROW_READY", await waitFor(win, `
    (function() {
      const row = document.querySelector('.structured-plugin-row[data-plugin-id="pass164-review-plugin@pass164-market"]');
      const action = row?.querySelector('[data-plugin-action="disable"]');
      return Boolean(
        document.querySelector('.plugin-manager-modal') &&
        row && action && !action.disabled &&
        /pass164-shell-tool/.test(document.querySelector('.plugin-manager-list')?.textContent || '')
      );
    })()
  `, 15000));

  const beforeDisable = readCommandLog();
  assertStep("PASS164_CLICK_DISABLE", await win.webContents.executeJavaScript(`
    (function() {
      const row = document.querySelector('.structured-plugin-row[data-plugin-id="pass164-review-plugin@pass164-market"]');
      const button = row?.querySelector('[data-plugin-action="disable"]');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS164_CONFIRM_REVIEW_ROWS_VISIBLE", await waitFor(win, `
    (function() {
      const confirm = document.querySelector('.plugin-cli-confirm');
      const text = confirm?.textContent || "";
      return Boolean(
        confirm &&
        /pass164-review-plugin@pass164-market/.test(text) &&
        /16\\.4\\.0/.test(text) &&
        /project/.test(text) &&
        /pass164-market/.test(text) &&
        /pass164\\.git/.test(text) &&
        /plugins\\/review/.test(text) &&
        /C:\\/pass164\\/plugins\\/review/.test(text) &&
        /pass164-shell-tool/.test(text) &&
        /filesystem:read/.test(text) &&
        /工作目录/.test(text) &&
        /plugin disable --scope project pass164-review-plugin@pass164-market/.test(text) &&
        /在 project 范围禁用插件/.test(text)
      );
    })();
  `, 5000));
  assertStep("PASS164_DISABLE_NOT_RUN_BEFORE_CONFIRM", !/plugin disable --scope project pass164-review-plugin@pass164-market/.test(readCommandLog().slice(beforeDisable.length)));
  assertStep("PASS164_CONFIRM_DISABLE", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.plugin-cli-confirm .danger-action');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS164_DISABLE_RAN", await waitForLog(/plugin disable --scope project pass164-review-plugin@pass164-market/));
  assertStep("PASS164_PLUGIN_STATUS_REFRESHED", await waitFor(win, `
    (function() {
      const row = document.querySelector('.structured-plugin-row[data-plugin-id="pass164-review-plugin@pass164-market"]');
      const text = row?.textContent || "";
      return Boolean(
        row?.classList.contains('focused-capability-row') &&
        row?.querySelector('.plugin-status-badge.disabled') &&
        row?.querySelector('.row-cli-action-evidence.ok') &&
        /ok plugin disable --scope project pass164-review-plugin@pass164-market/.test(text)
      );
    })();
  `, 15000));

  console.log("PASS164_PLUGIN_ACTION_REVIEW_ROWS_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS164_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS164_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
