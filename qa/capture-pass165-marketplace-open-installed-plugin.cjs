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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass165-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass165-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass165-project-"));
const MARKETPLACE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass165-market-"));
const MARKETPLACE_MANIFEST_DIR = path.join(MARKETPLACE_DIR, ".claude-plugin");
const COMMAND_LOG = path.join(USER_DATA_DIR, "claude-command-log.txt");
const INSTALLED_FILE = path.join(USER_DATA_DIR, "pass165-installed.txt");
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
    name: "pass165-market",
    description: "PASS165 marketplace fixture",
    owner: { name: "PASS165 Owner" },
    plugins: [
      {
        name: "pass165-link-plugin",
        version: "16.5.0",
        description: "Marketplace install success should link to the installed plugin row.",
        category: "workflow",
        author: { name: "PASS165 QA" },
        source: { source: "git-subdir", url: "https://example.invalid/pass165.git", path: "plugins/link", ref: "v16.5.0" },
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
const installedFile = ${JSON.stringify(INSTALLED_FILE)};
function installed() { return fs.existsSync(installedFile); }
fs.appendFileSync(commandLog, args.join(' ') + '\\n', 'utf8');
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
if (args[0] === '--version') out('2.16.5 (Claude Code QA)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out(installed() ? [{
  id: 'pass165-link-plugin@pass165-market',
  name: 'pass165-link-plugin',
  marketplace: 'pass165-market',
  version: '16.5.0',
  scope: 'user',
  enabled: true,
  status: 'enabled',
  installPath: 'C:/qa/pass165-plugin',
  source: { source: 'git', url: 'https://example.invalid/pass165.git', path: 'plugins/link', ref: 'v16.5.0' },
  tools: ['pass165-read-tool'],
  permissions: { filesystem: 'read', bash: true }
}] : []);
else if (args[0] === 'plugin' && args[1] === 'list') out(installed() ? 'Installed plugins:\\n\\n  > pass165-link-plugin@pass165-market\\n    Version: 16.5.0\\n    Scope: user\\n    Status: ✓ enabled' : 'Installed plugins: none');
else if (args[0] === 'mcp' && args[1] === 'list') out('✓ pass165-mcp: connected');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([{ name: 'pass165-market', source: 'path', repo: marketplaceDir, installLocation: marketplaceDir, version: '2026.7.7', status: 'ready', permissions: ['Read', 'Bash'] }]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces:\\n\\n  > pass165-market\\n    Source: Path (' + marketplaceDir + ')');
else if (args[0] === 'plugin' && args[1] === 'install' && args[2] === 'pass165-link-plugin@pass165-market') {
  fs.writeFileSync(installedFile, '1', 'utf8');
  out('ok plugin install pass165-link-plugin@pass165-market');
}
else out('pass165 fake claude command: ' + args.join(' '));
`;
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeScript, "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
  return path.join(FAKE_BIN_DIR, "claude.cmd");
}

function writeInitialStore() {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass165-project" }), "utf8");
  const fakeClaude = writeFakeClaude();
  const project = { name: "pass165-project", path: PROJECT_DIR };
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
        id: "pass165-session",
        title: "Marketplace open installed plugin",
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

async function openMarketplace(win) {
  assertStep("PASS165_OPEN_CAPABILITIES", await win.webContents.executeJavaScript(`
    (function() {
      const button = Array.from(document.querySelectorAll('.nav-stack button'))
        .find((candidate) => /\\u63d2\\u4ef6/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS165_OPEN_MARKETPLACE", await waitFor(win, "Boolean(document.querySelector('.plugin-manager-tabs'))", 10000) && await win.webContents.executeJavaScript(`
    (function() {
      const button = Array.from(document.querySelectorAll('.plugin-manager-tabs button'))
        .find((candidate) => /\\u5e02\\u573a/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS165_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS165_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  await openMarketplace(win);
  assertStep("PASS165_MARKETPLACE_CARD_READY", await waitFor(win, `
    Boolean(document.querySelector('.marketplace-plugin-card[data-marketplace-plugin-id="pass165-link-plugin@pass165-market"]'))
  `, 15000));
  assertStep("PASS165_CLICK_INSTALL", await win.webContents.executeJavaScript(`
    (function() {
      const card = document.querySelector('.marketplace-plugin-card[data-marketplace-plugin-id="pass165-link-plugin@pass165-market"]');
      const button = card?.querySelector('.marketplace-card-actions button');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS165_CONFIRM_INSTALL_VISIBLE", await waitFor(win, "Boolean(document.querySelector('.plugin-cli-confirm'))", 5000));
  assertStep("PASS165_CONFIRM_INSTALL", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.plugin-cli-confirm .danger-action');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS165_INSTALL_RAN", await waitForLog(/plugin install pass165-link-plugin@pass165-market/));
  assertStep("PASS165_MARKETPLACE_CARD_LINK_READY", await waitFor(win, `
    (function() {
      const card = document.querySelector('.marketplace-plugin-card[data-marketplace-plugin-id="pass165-link-plugin@pass165-market"]');
      const text = card?.textContent || "";
      return Boolean(
        card?.classList.contains('installed') &&
        card?.classList.contains('focused-capability-row') &&
        card?.querySelector('.row-cli-action-evidence.ok') &&
        card?.querySelector('[data-marketplace-plugin-action="open-installed"]') &&
        /ok plugin install pass165-link-plugin@pass165-market/.test(text) &&
        /\\u6253\\u5f00\\u5df2\\u5b89\\u88c5/.test(text)
      );
    })();
  `, 15000));
  assertStep("PASS165_OPEN_INSTALLED_PLUGIN", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.marketplace-plugin-card[data-marketplace-plugin-id="pass165-link-plugin@pass165-market"] [data-marketplace-plugin-action="open-installed"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS165_INSTALLED_ROW_FOCUSED_WITH_EVIDENCE", await waitFor(win, `
    (function() {
      const input = document.querySelector('.capability-search input');
      const row = document.querySelector('.structured-plugin-row[data-plugin-id="pass165-link-plugin@pass165-market"]');
      const text = row?.textContent || "";
      return Boolean(
        input?.value === 'pass165-link-plugin@pass165-market' &&
        row?.classList.contains('focused-capability-row') &&
        row?.querySelector('.row-cli-action-evidence.ok') &&
        /16\\.5\\.0/.test(text) &&
        /pass165-read-tool/.test(text) &&
        /ok plugin install pass165-link-plugin@pass165-market/.test(text)
      );
    })();
  `, 15000));
  assertStep("PASS165_INSTALL_PERSISTED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      return Boolean(state.commandRuns?.some((run) =>
        run.kind === 'capability' &&
        /plugin install pass165-link-plugin@pass165-market/.test(run.command || '') &&
        run.code === 0 &&
        /ok plugin install pass165-link-plugin@pass165-market/.test(run.stdout || '')
      ));
    })();
  `, 10000));

  console.log("PASS165_MARKETPLACE_OPEN_INSTALLED_PLUGIN_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeMarketplaceFixture();
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS165_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS165_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
