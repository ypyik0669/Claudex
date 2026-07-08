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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass173-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass173-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass173-project-"));
const MARKETPLACE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass173-market-"));
const INSTALL_MARKER = path.join(USER_DATA_DIR, "plugin-install-called.txt");
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

function writeInitialStore() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.mkdirSync(path.join(MARKETPLACE_DIR, ".claude-plugin"), { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass173-project" }), "utf8");
  writeJson(path.join(MARKETPLACE_DIR, ".claude-plugin", "marketplace.json"), {
    name: "pass173-market",
    description: "PASS173 marketplace install command fixture",
    owner: { name: "PASS173 Owner" },
    plugins: [
      {
        name: "pass173-risk-plugin",
        version: "17.3.0",
        description: "PASS173 install command risk plugin.",
        category: "agent-tools",
        author: { name: "PASS173 Risk QA" },
        permissions: ["Read", "Bash"],
        risk: ["runs local plugin code", "network access"],
      },
    ],
  });

  const fakeClaudeScript = `
const fs = require('fs');
const args = process.argv.slice(2);
const marketplaceDir = ${JSON.stringify(MARKETPLACE_DIR)};
const installMarker = ${JSON.stringify(INSTALL_MARKER)};
function out(value) {
  process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n');
}
if (args[0] === '--version') out('2.10.0 (Claude Code PASS173)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out({ plugins: [] });
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins:\\n\\n  No plugins installed');
else if (args[0] === 'plugin' && args[1] === 'install') {
  fs.writeFileSync(installMarker, args.slice(2).join(' '), 'utf8');
  out({ installed: args[2], ok: true });
}
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([{ name: 'pass173-market', source: 'path', repo: marketplaceDir, installLocation: marketplaceDir, version: '2026.7.7', status: 'ready', permissions: ['Read', 'Bash'] }]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces:\\n\\n  > pass173-market\\n    Source: Path (' + marketplaceDir + ')');
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else out('pass173 fake claude command: ' + args.join(' '));
`;
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), '@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n', "utf8");
  const fakeClaude = path.join(FAKE_BIN_DIR, "claude.cmd");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;

  const project = { name: "pass173-project", path: PROJECT_DIR };
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
    activeProject: project,
    projects: [project],
    sessions: [
      {
        id: "pass173-session",
        title: "pass173 marketplace install command",
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

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));

app.whenReady().then(async () => {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.error("PASS173_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  const expectedId = `marketplace-install:${encodeURIComponent("pass173-risk-plugin@pass173-market").slice(0, 120)}`;

  try {
    assertStep("PASS173_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
    assertStep("PASS173_INSTALL_COMMAND_SEARCHABLE", await waitForPaletteCommand(
      win,
      "install pass173 risk",
      (command) => command.id === expectedId && /pass173-risk-plugin/.test(command.text || ""),
    ));
    assertStep("PASS173_OPEN_INSTALL_COMMAND", await runPaletteCommand(win, "install pass173 risk", expectedId));
    assertStep("PASS173_INSTALL_ACTION_FOCUSED", await waitFor(win, `
      (function() {
        const activeTab = document.querySelector('.plugin-manager-tabs button.active')?.textContent || '';
        const card = document.querySelector('[data-marketplace-plugin-id="pass173-risk-plugin@pass173-market"]');
        const action = card?.querySelector('[data-marketplace-plugin-action="install"]');
        return Boolean(
          /\\u5e02\\u573a/.test(activeTab) &&
          document.querySelector('.marketplace-filter-control [data-marketplace-filter="available"].active') &&
          card?.classList.contains('focused-capability-row') &&
          action?.getAttribute('data-capability-action-focused') === 'true' &&
          action?.getAttribute('data-capability-action') === 'install' &&
          !document.querySelector('.plugin-cli-confirm')
        );
      })();
    `, 15000));
    assertStep("PASS173_INSTALL_NOT_RUN_BEFORE_CONFIRM", !fs.existsSync(INSTALL_MARKER));
    assertStep("PASS173_INSTALL_ACTION_READY", await waitFor(win, `
      (function() {
        const action = document.querySelector('[data-marketplace-plugin-id="pass173-risk-plugin@pass173-market"] [data-marketplace-plugin-action="install"]');
        return Boolean(action && !action.disabled);
      })();
    `, 10000));
    assertStep("PASS173_CLICK_INSTALL_ACTION", await win.webContents.executeJavaScript(`
      (function() {
        const action = document.querySelector('[data-marketplace-plugin-id="pass173-risk-plugin@pass173-market"] [data-marketplace-plugin-action="install"]');
        if (!action || action.disabled) return false;
        action.click();
        return true;
      })();
    `));
    assertStep("PASS173_INSTALL_CONFIRM_VISIBLE", await waitFor(win, `
      (function() {
        const confirm = document.querySelector('.plugin-cli-confirm');
        const confirmText = confirm?.textContent || '';
        return Boolean(
          confirm &&
          /plugin install pass173-risk-plugin@pass173-market/.test(confirmText) &&
          /runs local plugin code/.test(confirmText) &&
          /network access/.test(confirmText) &&
          /Read/.test(confirmText) &&
          /Bash/.test(confirmText)
        );
      })();
    `, 5000));
    assertStep("PASS173_INSTALL_STILL_NOT_RUN_BEFORE_CONFIRM", !fs.existsSync(INSTALL_MARKER));

    console.log("PASS173_MARKETPLACE_INSTALL_COMMAND_DONE");
    cleanup();
    app.exit(0);
  } catch (error) {
    console.error("PASS173_FAILED", error?.stack || error);
    cleanup();
    app.exit(1);
  }
});

setTimeout(() => {
  console.error("PASS173_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
