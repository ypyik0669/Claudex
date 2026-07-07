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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass172-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass172-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass172-project-"));
const MARKETPLACE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass172-market-"));
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass172-project" }), "utf8");
  writeJson(path.join(MARKETPLACE_DIR, ".claude-plugin", "marketplace.json"), {
    name: "pass172-market",
    description: "PASS172 marketplace filter fixture",
    owner: { name: "PASS172 Owner" },
    plugins: [
      {
        name: "pass172-available-plugin",
        version: "17.2.0",
        description: "PASS172 available marketplace plugin.",
        category: "available",
        author: { name: "PASS172 Available QA" },
        permissions: ["Read"],
      },
      {
        name: "pass172-installed-plugin",
        version: "17.2.1",
        description: "PASS172 installed marketplace plugin.",
        category: "installed",
        author: { name: "PASS172 Installed QA" },
        permissions: ["Read", "Bash"],
      },
      {
        name: "pass172-risk-plugin",
        version: "17.2.2",
        description: "PASS172 risk marketplace plugin.",
        category: "risk",
        author: { name: "PASS172 Risk QA" },
        permissions: ["Read", "Bash"],
        risk: ["runs local plugin code", "network access"],
      },
    ],
  });

  const fakeClaudeScript = `
const args = process.argv.slice(2);
const marketplaceDir = ${JSON.stringify(MARKETPLACE_DIR)};
function out(value) {
  process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n');
}
if (args[0] === '--version') out('2.10.0 (Claude Code PASS172)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out({
  plugins: [
    {
      id: 'pass172-installed-plugin@pass172-market',
      name: 'pass172-installed-plugin',
      marketplace: 'pass172-market',
      version: '17.2.1',
      enabled: true,
      scope: 'user',
      tools: ['pass172-installed-tool']
    }
  ]
});
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins:\\n\\n  > pass172-installed-plugin@pass172-market\\n    Version: 17.2.1\\n    Scope: user\\n    Status: enabled');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([{ name: 'pass172-market', source: 'path', repo: marketplaceDir, installLocation: marketplaceDir, version: '2026.7.7', status: 'ready', permissions: ['Read', 'Bash'] }]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces:\\n\\n  > pass172-market\\n    Source: Path (' + marketplaceDir + ')');
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else out('pass172 fake claude command: ' + args.join(' '));
`;
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), '@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n', "utf8");
  const fakeClaude = path.join(FAKE_BIN_DIR, "claude.cmd");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;

  const project = { name: "pass172-project", path: PROJECT_DIR };
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
        id: "pass172-session",
        title: "pass172 marketplace filters",
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
    console.error("PASS172_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  try {
    assertStep("PASS172_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
    assertStep("PASS172_RISK_FILTER_COMMAND_SEARCHABLE", await waitForPaletteCommand(
      win,
      "marketplace risk filter",
      (command) => command.id === "marketplace-filter:risk" && /1\/3|1\s*\/\s*3/.test(command.text || ""),
    ));
    assertStep("PASS172_OPEN_RISK_FILTER_FROM_PALETTE", await runPaletteCommand(win, "marketplace risk filter", "marketplace-filter:risk"));
    assertStep("PASS172_RISK_FILTER_VISIBLE", await waitFor(win, `
      (function() {
        const cards = Array.from(document.querySelectorAll('.marketplace-plugin-card'));
        const text = document.querySelector('.plugin-manager-modal')?.textContent || '';
        return Boolean(
          /\\u5e02\\u573a/.test(document.querySelector('.plugin-manager-tabs button.active')?.textContent || '') &&
          document.querySelector('.marketplace-filter-control [data-marketplace-filter="risk"].active') &&
          cards.length === 1 &&
          cards[0]?.getAttribute('data-marketplace-plugin-id') === 'pass172-risk-plugin@pass172-market' &&
          /runs local plugin code/.test(text) &&
          !/pass172-available-plugin/.test(text) &&
          !/pass172-installed-plugin/.test(text)
        );
      })();
    `, 15000));

    assertStep("PASS172_OPEN_INSTALLED_FILTER_FROM_PALETTE", await runPaletteCommand(win, "marketplace installed filter", "marketplace-filter:installed"));
    assertStep("PASS172_INSTALLED_FILTER_VISIBLE", await waitFor(win, `
      (function() {
        const cards = Array.from(document.querySelectorAll('.marketplace-plugin-card'));
        return Boolean(
          document.querySelector('.marketplace-filter-control [data-marketplace-filter="installed"].active') &&
          cards.length === 1 &&
          cards[0]?.classList.contains('installed') &&
          cards[0]?.getAttribute('data-marketplace-plugin-id') === 'pass172-installed-plugin@pass172-market'
        );
      })();
    `, 5000));

    assertStep("PASS172_OPEN_AVAILABLE_FILTER_FROM_PALETTE", await runPaletteCommand(win, "marketplace available filter", "marketplace-filter:available"));
    assertStep("PASS172_AVAILABLE_FILTER_VISIBLE", await waitFor(win, `
      (function() {
        const ids = Array.from(document.querySelectorAll('.marketplace-plugin-card')).map((card) => card.getAttribute('data-marketplace-plugin-id'));
        return Boolean(
          document.querySelector('.marketplace-filter-control [data-marketplace-filter="available"].active') &&
          ids.length === 2 &&
          ids.includes('pass172-available-plugin@pass172-market') &&
          ids.includes('pass172-risk-plugin@pass172-market') &&
          !ids.includes('pass172-installed-plugin@pass172-market')
        );
      })();
    `, 5000));

    assertStep("PASS172_OPEN_ALL_FILTER_FROM_PALETTE", await runPaletteCommand(win, "marketplace all filter", "marketplace-filter:all"));
    assertStep("PASS172_ALL_FILTER_VISIBLE", await waitFor(win, `
      (function() {
        const ids = Array.from(document.querySelectorAll('.marketplace-plugin-card')).map((card) => card.getAttribute('data-marketplace-plugin-id'));
        return Boolean(
          document.querySelector('.marketplace-filter-control [data-marketplace-filter="all"].active') &&
          ids.length === 3 &&
          ids.includes('pass172-available-plugin@pass172-market') &&
          ids.includes('pass172-installed-plugin@pass172-market') &&
          ids.includes('pass172-risk-plugin@pass172-market')
        );
      })();
    `, 5000));

    console.log("PASS172_MARKETPLACE_CATALOG_FILTERS_DONE");
    cleanup();
    app.exit(0);
  } catch (error) {
    console.error("PASS172_FAILED", error?.stack || error);
    cleanup();
    app.exit(1);
  }
});

setTimeout(() => {
  console.error("PASS172_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
