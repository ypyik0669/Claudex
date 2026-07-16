const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass105-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass105-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass105-project-"));
const MARKETPLACE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass105-market-"));
const MARKETPLACE_MANIFEST_DIR = path.join(MARKETPLACE_DIR, ".claude-plugin");
const COMMAND_LOG = path.join(USER_DATA_DIR, "claude-command-log.txt");
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

function writeMarketplaceFixture() {
  fs.mkdirSync(MARKETPLACE_MANIFEST_DIR, { recursive: true });
  writeJson(path.join(MARKETPLACE_MANIFEST_DIR, "marketplace.json"), {
    name: "pass105-market",
    description: "PASS105 marketplace fixture",
    owner: { name: "PASS105 Owner" },
    plugins: [
      {
        name: "pass105-failing-plugin",
        version: "10.5.0",
        description: "A marketplace plugin that should expose inline install failure recovery.",
        category: "workflow",
        author: { name: "PASS105 QA" },
        source: { source: "git-subdir", url: "https://example.invalid/pass105.git", path: "plugins/failing", ref: "v10.5.0" },
        permissions: ["Read", "Bash"],
      },
    ],
  });
}

function writeFakeClaude() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  const fakeScript = `
const fs = require('fs');
const args = process.argv.slice(2);
const marketplaceDir = ${JSON.stringify(MARKETPLACE_DIR)};
const commandLog = ${JSON.stringify(COMMAND_LOG)};
fs.appendFileSync(commandLog, args.join(' ') + '\\n', 'utf8');
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
if (args[0] === '--version') out('2.10.5 (Claude Code QA)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'mcp' && args[1] === 'list') out('✓ pass105-mcp: connected');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([{ name: 'pass105-market', source: 'path', repo: marketplaceDir, installLocation: marketplaceDir, version: '2026.7.6', status: 'ready', permissions: ['Read', 'Bash'] }]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces:\\n\\n  > pass105-market\\n    Source: Path (' + marketplaceDir + ')');
else if (args[0] === 'plugin' && args[1] === 'install' && args[2] === '--scope' && args[3] === 'user' && args[4] === 'pass105-failing-plugin@pass105-market' && args.length === 5) { process.stderr.write('pass105 plugin install failed\\n'); process.exitCode = 42; }
else out('pass105 fake claude command: ' + args.join(' '));
`;
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeScript, "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
  return path.join(FAKE_BIN_DIR, "claude.cmd");
}

function writeInitialStore() {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass105-project" }), "utf8");
  const fakeClaude = writeFakeClaude();
  const project = { name: "pass105-project", path: PROJECT_DIR };
  writeJson(DATA_FILE, {
    version: 1,
    activeProject: project,
    projects: [project],
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
    sessions: [
      {
        id: "pass105-session",
        title: "Marketplace install failure recovery",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-06T00:00:00.000Z",
        updatedAt: "2026-07-06T00:00:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    automations: [],
    subagentRuns: [],
    browserVisits: [],
    notices: [],
  });
}

async function openMarketplace(win) {
  assertStep("PASS105_OPEN_CAPABILITIES", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.nav-stack button')].find((candidate) => /插件/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS105_OPEN_MARKETPLACE", await waitFor(win, "Boolean(document.querySelector('.plugin-manager-tabs'))", 10000) && await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.plugin-manager-tabs button')].find((candidate) => /市场/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS105_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS105_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  await openMarketplace(win);
  assertStep("PASS105_MARKETPLACE_CARD_READY", await waitFor(win, `
    Boolean([...document.querySelectorAll('.marketplace-plugin-card')]
      .find((item) => /pass105-failing-plugin/.test(item.textContent || '')))
  `, 15000));
  assertStep("PASS105_INSTALL_ACTION_READY", await waitFor(win, `
    (function() {
      const card = [...document.querySelectorAll('.marketplace-plugin-card')]
        .find((item) => /pass105-failing-plugin/.test(item.textContent || ''));
      const button = card?.querySelector('.marketplace-card-actions button');
      return Boolean(button && !button.disabled);
    })();
  `, 15000));
  assertStep("PASS105_CLICK_INSTALL", await win.webContents.executeJavaScript(`
    (function() {
      const card = [...document.querySelectorAll('.marketplace-plugin-card')]
        .find((item) => /pass105-failing-plugin/.test(item.textContent || ''));
      const button = card?.querySelector('.marketplace-card-actions button');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS105_CONFIRM_INSTALL_VISIBLE", await waitFor(win, "Boolean(document.querySelector('.plugin-cli-confirm'))", 5000));
  assertStep("PASS105_CONFIRM_INSTALL", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.plugin-cli-confirm .danger-action');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS105_INSTALL_RAN", await waitForLog(/plugin install --scope user pass105-failing-plugin@pass105-market/));
  assertStep("PASS105_MARKETPLACE_INSTALL_FAILURE_FOCUS", await waitFor(win, `
    (function() {
      const input = document.querySelector('.capability-search input');
      const card = [...document.querySelectorAll('.marketplace-plugin-card')]
        .find((item) => /pass105-failing-plugin/.test(item.textContent || ''));
      const text = card?.textContent || '';
      return Boolean(
        input?.value === 'pass105-failing-plugin' &&
        card?.classList.contains('focused-capability-row') &&
        card?.querySelector('.row-cli-action-evidence.error') &&
        /pass105 plugin install failed/.test(text) &&
        /42/.test(text) &&
        /重试/.test(text) &&
        /打开输出/.test(text) &&
        /pass105 plugin install failed/.test(document.querySelector('.plugin-cli-error')?.textContent || '')
      );
    })();
  `, 15000));
  assertStep("PASS105_FAILURE_PERSISTED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      return Boolean(
        state.commandRuns?.some((run) => run.kind === 'capability' &&
          /plugin install --scope user pass105-failing-plugin@pass105-market/.test(run.command || '') &&
          run.code === 42 &&
          /pass105 plugin install failed/.test(run.stderr || '')) &&
        state.notices?.some((notice) => notice.level === 'error' &&
          /pass105 plugin install failed/.test((notice.title || '') + (notice.detail || '')))
      );
    })();
  `, 10000));

  console.log("PASS105_MARKETPLACE_INSTALL_FAILURE_RECOVERY_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeMarketplaceFixture();
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS105_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS105_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
