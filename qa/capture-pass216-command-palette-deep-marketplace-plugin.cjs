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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass216-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass216-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass216-project-"));
const MARKETPLACE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass216-market-"));
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const TARGET_ID = "pass216-deep-plugin-31@pass216-market";

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_DIR, MARKETPLACE_DIR]) {
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

function writeMarketplaceFixture() {
  const plugins = Array.from({ length: 31 }, (_value, index) => {
    const number = index + 1;
    return {
      name: `pass216-deep-plugin-${String(number).padStart(2, "0")}`,
      version: `21.6.${number}`,
      description: number === 31
        ? "PASS216 deep marketplace plugin beyond the old command palette limit."
        : `PASS216 filler marketplace plugin ${number}`,
      category: number === 31 ? "agent-tools" : "fixture",
      author: { name: number === 31 ? "PASS216 Deep QA" : "PASS216 QA" },
      permissions: number === 31 ? ["Read", "Bash"] : ["Read"],
      risk: number === 31 ? ["runs local plugin code", "network access"] : [],
      source: { source: "local-fixture", path: `plugins/pass216-${number}`, ref: `v21.6.${number}` },
    };
  });
  writeJson(path.join(MARKETPLACE_DIR, ".claude-plugin", "marketplace.json"), {
    name: "pass216-market",
    description: "PASS216 marketplace deep catalog fixture",
    owner: { name: "PASS216 Owner" },
    plugins,
  });
}

function writeFakeClaude() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  const fakeScript = `
const args = process.argv.slice(2);
const marketplaceDir = ${JSON.stringify(MARKETPLACE_DIR)};
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
if (args[0] === '--version') out('2.10.6 (Claude Code PASS216)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out({ plugins: [] });
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out({ servers: [] });
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([{ name: 'pass216-market', source: 'path', repo: marketplaceDir, installLocation: marketplaceDir, version: '2026.7.7', status: 'ready', permissions: ['Read', 'Bash'] }]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces:\\n\\n  > pass216-market\\n    Source: Path (' + marketplaceDir + ')');
else if (args[0] === 'plugin' && args[1] === 'install') out({ installed: args[2], ok: true });
else out('pass216 fake claude command: ' + args.join(' '));
`;
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeScript, "utf8");
  fs.writeFileSync(FAKE_CLAUDE, '@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n', "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function writeInitialStore() {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass216-project" }), "utf8");
  writeMarketplaceFixture();
  writeFakeClaude();
  const project = { name: "pass216-project", path: PROJECT_DIR };
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
    sessions: [
      {
        id: "pass216-session",
        title: "PASS216 deep marketplace catalog",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-07T12:00:00.000Z",
        updatedAt: "2026-07-07T12:00:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    runEvents: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
    automations: [],
    subagentRuns: [],
  });
}

async function paletteCommands(win, query) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return null;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      const result = Array.from(document.querySelectorAll('.command-modal .command-list button'))
        .map((button) => ({ id: button.getAttribute('data-command-id') || '', text: button.textContent || '' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return result;
    })();
  `);
}

async function waitForPaletteCommand(win, query, predicate, timeoutMs = 12000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const commands = await paletteCommands(win, query);
    if (Array.isArray(commands) && commands.some((command) => predicate(command))) return true;
    await wait(180);
  }
  return false;
}

async function runPaletteCommand(win, query, expectedId) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      const button = Array.from(document.querySelectorAll('.command-modal .command-list button'))
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === ${JSON.stringify(expectedId)});
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS216_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  const expectedInstallCommandId = `marketplace-install:${encodeURIComponent(TARGET_ID).slice(0, 120)}`;

  assertStep("PASS216_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS216_STATUS_HAS_DEEP_MARKETPLACE_PLUGIN", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const status = await window.claudexDesktop.getClaudeStatus({ projectPath: state.activeProject?.path });
      return Boolean(status.marketplacePlugins?.length === 31 &&
        status.marketplacePlugins.some((item) => item.id === ${JSON.stringify(TARGET_ID)} && /network access/.test(item.risk || '')));
    })();
  `, 15000));

  assertStep("PASS216_DEEP_MARKETPLACE_INSTALL_COMMAND_SEARCHABLE", await waitForPaletteCommand(
    win,
    "install pass216 deep 31",
    (command) => command.id === expectedInstallCommandId && /pass216-deep-plugin-31/.test(command.text || ""),
  ));

  assertStep("PASS216_OPEN_DEEP_MARKETPLACE_INSTALL_COMMAND", await runPaletteCommand(win, "install pass216 deep 31", expectedInstallCommandId));
  assertStep("PASS216_DEEP_MARKETPLACE_CONFIRM_FOCUSED", await waitFor(win, `
    (function() {
      const activeTab = document.querySelector('.plugin-manager-tabs button.active')?.textContent || '';
      const confirm = document.querySelector('.plugin-cli-confirm');
      const confirmText = confirm?.textContent || '';
      const card = document.querySelector('[data-marketplace-plugin-id=${JSON.stringify(TARGET_ID)}]');
      const cardText = card?.textContent || '';
      return Boolean(
        /\\u5e02\\u573a/.test(activeTab) &&
        document.querySelector('.marketplace-filter-control [data-marketplace-filter="available"].active') &&
        card?.classList.contains('focused-capability-row') &&
        /pass216-deep-plugin-31/.test(cardText) &&
        /agent-tools/.test(cardText) &&
        /network access/.test(cardText) &&
        confirm &&
        /plugin install pass216-deep-plugin-31@pass216-market/.test(confirmText) &&
        /runs local plugin code/.test(confirmText) &&
        /network access/.test(confirmText) &&
        /Read/.test(confirmText) &&
        /Bash/.test(confirmText)
      );
    })();
  `, 15000));

  console.log("PASS216_COMMAND_PALETTE_DEEP_MARKETPLACE_PLUGIN_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS216_COMMAND_PALETTE_DEEP_MARKETPLACE_PLUGIN_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS216_COMMAND_PALETTE_DEEP_MARKETPLACE_PLUGIN_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
