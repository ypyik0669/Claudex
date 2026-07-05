const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const PROJECT_PATH = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass65-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass65-bin-"));
const PROJECT_FIXTURE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass65-project-"));
const MARKETPLACE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass65-market-"));
const MARKETPLACE_MANIFEST_DIR = path.join(MARKETPLACE_DIR, ".claude-plugin");
const COMMAND_LOG = path.join(USER_DATA_DIR, "claude-command-log.txt");

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_FIXTURE_DIR, MARKETPLACE_DIR]) {
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

async function waitForLog(pattern, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (pattern.test(readCommandLog())) return true;
    await wait(150);
  }
  return false;
}

function assertStep(name, ok) {
  console.log(name, ok);
  if (!ok) throw new Error(`${name} failed`);
}

fs.mkdirSync(MARKETPLACE_MANIFEST_DIR, { recursive: true });
writeJson(path.join(MARKETPLACE_MANIFEST_DIR, "marketplace.json"), {
  name: "pass65-market",
  description: "PASS65 marketplace fixture",
  owner: { name: "PASS65 Owner" },
  plugins: [
    {
      name: "pass65-audited-plugin",
      version: "9.8.7",
      description: "A plugin with explicit source and risk metadata for install review.",
      category: "security",
      author: { name: "PASS65 QA" },
      homepage: "https://example.invalid/pass65-home",
      source: { source: "git-subdir", url: "https://example.invalid/pass65.git", path: "plugins/audited", ref: "v9.8.7" },
      permissions: ["Read", "Bash"],
    },
  ],
});

const fakeClaudeScript = `
const fs = require('fs');
const args = process.argv.slice(2);
const marketplaceDir = ${JSON.stringify(MARKETPLACE_DIR)};
const commandLog = ${JSON.stringify(COMMAND_LOG)};
fs.appendFileSync(commandLog, args.join(' ') + '\\n', 'utf8');
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
if (args[0] === '--version') out('2.9.0 (Claude Code QA)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'mcp' && args[1] === 'list') out('✓ pass65-mcp: connected');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([{ name: 'pass65-market', source: 'path', repo: marketplaceDir, installLocation: marketplaceDir }]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces:\\n\\n  > pass65-market\\n    Source: Path (' + marketplaceDir + ')');
else if (args[0] === 'plugin' && args[1] === 'install') out('ok ' + args.join(' '));
else out('fake claude command: ' + args.join(' '));
`;

fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
const FAKE_CLAUDE_COMMAND = path.join(FAKE_BIN_DIR, "claude.cmd");
process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;

app.setPath("userData", USER_DATA_DIR);
fs.mkdirSync(USER_DATA_DIR, { recursive: true });
fs.writeFileSync(path.join(PROJECT_FIXTURE_DIR, "package.json"), JSON.stringify({ name: "pass65" }), "utf8");
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
  activeProject: { name: "pass65-project", path: PROJECT_FIXTURE_DIR },
  projects: [{ name: "pass65-project", path: PROJECT_FIXTURE_DIR }],
  sessions: [
    {
      id: "default",
      title: "新聊天",
      project: "pass65-project",
      projectPath: PROJECT_FIXTURE_DIR,
      createdAt: "2026-07-06T00:00:00.000Z",
      updatedAt: "2026-07-06T00:00:00.000Z",
      messages: [],
    },
  ],
  commandRuns: [],
});

require(path.join(PROJECT_PATH, "electron", "main.cjs"));

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS65_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS65_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS65_OPEN_CAPABILITIES", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.nav-stack button')].find((candidate) => /插件/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS65_OPEN_MARKETPLACE", await waitFor(win, "Boolean(document.querySelector('.plugin-manager-tabs'))", 10000) && await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.plugin-manager-tabs button')].find((candidate) => /市场/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS65_MARKETPLACE_CARD_AUDIT_META", await waitFor(win, `
    (function() {
      const card = [...document.querySelectorAll('.marketplace-plugin-card')]
        .find((item) => /pass65-audited-plugin/.test(item.textContent || ''));
      const text = card?.textContent || '';
      return Boolean(card && /9\.8\.7/.test(text) && /PASS65 QA/.test(text) && text.includes('https://example.invalid/pass65.git'));
    })();
  `, 15000));

  const beforeInstall = readCommandLog();
  assertStep("PASS65_CLICK_INSTALL", await win.webContents.executeJavaScript(`
    (function() {
      const card = [...document.querySelectorAll('.marketplace-plugin-card')]
        .find((item) => /pass65-audited-plugin/.test(item.textContent || ''));
      const button = card?.querySelector('.marketplace-card-actions button');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS65_INSTALL_CONFIRM_VISIBLE", await waitFor(win, "Boolean(document.querySelector('.plugin-cli-confirm'))", 5000));
  assertStep("PASS65_CONFIRM_AUDIT_DETAILS", await win.webContents.executeJavaScript(`
    (function() {
      const confirm = document.querySelector('.plugin-cli-confirm');
      const text = confirm?.textContent || '';
      return Boolean(confirm && /pass65-audited-plugin/.test(text) && /版本/.test(text) && /9\.8\.7/.test(text) &&
        /来源/.test(text) && text.includes('https://example.invalid/pass65.git') &&
        /风险/.test(text) && /本地插件代码/.test(text) && /PASS65 QA/.test(text));
    })();
  `));
  assertStep("PASS65_INSTALL_NOT_RUN_BEFORE_CONFIRM", !/plugin install pass65-audited-plugin/.test(readCommandLog().slice(beforeInstall.length)));
  assertStep("PASS65_CONFIRM_INSTALL", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.plugin-cli-confirm .danger-action');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS65_INSTALL_RAN_AFTER_CONFIRM", await waitForLog(/plugin install pass65-audited-plugin/));
  assertStep("PASS65_INSTALL_COMMAND_PERSISTED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      return state.commandRuns?.some((run) => run.kind === "capability" &&
        /plugin install pass65-audited-plugin/.test(run.command || "") &&
        run.code === 0 &&
        /ok plugin install pass65-audited-plugin/.test(run.stdout || ""));
    })();
  `, 10000));

  console.log("PASS65_MARKETPLACE_INSTALL_REVIEW_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch((error) => {
  console.error("PASS65_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS65_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
