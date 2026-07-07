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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass171-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass171-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass171-project-"));
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

function writeInitialStore() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass171-project" }), "utf8");
  const fakeClaudeScript = `
const args = process.argv.slice(2);
function out(value) {
  process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n');
}
if (args[0] === '--version') out('2.10.0 (Claude Code pass171)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out({
  plugins: [
    {
      id: 'pass171-enabled-plugin@qa-market',
      name: 'pass171-enabled-plugin',
      marketplace: 'qa-market',
      version: '17.0.0',
      scope: 'project',
      enabled: true,
      status: 'enabled',
      tools: ['pass171-enabled-tool'],
      permissions: ['Read']
    },
    {
      id: 'pass171-disabled-plugin@qa-market',
      name: 'pass171-disabled-plugin',
      marketplace: 'qa-market',
      version: '17.0.1',
      scope: 'user',
      enabled: false,
      status: 'disabled',
      tools: ['pass171-disabled-tool']
    },
    {
      id: 'pass171-error-plugin@qa-market',
      name: 'pass171-error-plugin',
      marketplace: 'qa-market',
      version: '17.0.2',
      scope: 'user',
      enabled: false,
      status: 'error',
      error: 'pass171 plugin load failed'
    }
  ]
});
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins:\\n  > pass171-enabled-plugin@qa-market\\n  > pass171-disabled-plugin@qa-market\\n  ! pass171-error-plugin@qa-market error');
else if (args[0] === 'mcp' && args[1] === 'list') out('pass171-mcp-ok: connected | 2 tools | stdio | C:\\\\mcp\\\\pass171-ok.cjs\\npass171-mcp-error: error | failed auth | stdio | C:\\\\mcp\\\\pass171-error.cjs');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out('');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else out('pass171 fake claude command: ' + args.join(' '));
`;
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), '@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n', "utf8");
  const fakeClaude = path.join(FAKE_BIN_DIR, "claude.cmd");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;

  const createdAt = "2026-07-07T12:00:00.000Z";
  const project = { name: "pass171-project", path: PROJECT_DIR };
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
        id: "pass171-session",
        title: "pass171 capability status filter",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt,
        updatedAt: createdAt,
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
    console.error("PASS171_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  try {
    assertStep("PASS171_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
    assertStep("PASS171_DISABLED_PLUGIN_FILTER_COMMAND_SEARCHABLE", await waitForPaletteCommand(
      win,
      "disabled plugin capability",
      (command) => command.id === "capability-filter:plugins:disabled" && /2\/3|2\s*\/\s*3/.test(command.text || ""),
    ));
    assertStep("PASS171_OPEN_DISABLED_PLUGIN_FILTER_FROM_PALETTE", await runPaletteCommand(win, "disabled plugin capability", "capability-filter:plugins:disabled"));
    assertStep("PASS171_DISABLED_PLUGIN_FILTER_VISIBLE", await waitFor(win, `
      (function() {
        const text = document.querySelector('.plugin-manager-modal')?.textContent || '';
        return Boolean(
          /\\u63d2\\u4ef6/.test(document.querySelector('.plugin-manager-tabs button.active')?.textContent || '') &&
          document.querySelector('.capability-toolbar [data-capability-filter="disabled"].active') &&
          !document.querySelector('.structured-plugin-row[data-plugin-id="pass171-enabled-plugin@qa-market"]') &&
          document.querySelector('.structured-plugin-row[data-plugin-id="pass171-disabled-plugin@qa-market"]') &&
          document.querySelector('.structured-plugin-row[data-plugin-id="pass171-error-plugin@qa-market"]') &&
          /pass171 plugin load failed/.test(text)
        );
      })();
    `, 15000));

    assertStep("PASS171_ENABLED_PLUGIN_FILTER_COMMAND_SEARCHABLE", await waitForPaletteCommand(
      win,
      "enabled plugin capability",
      (command) => command.id === "capability-filter:plugins:enabled" && /1\/3|1\s*\/\s*3/.test(command.text || ""),
    ));
    assertStep("PASS171_OPEN_ENABLED_PLUGIN_FILTER_FROM_PALETTE", await runPaletteCommand(win, "enabled plugin capability", "capability-filter:plugins:enabled"));
    assertStep("PASS171_ENABLED_PLUGIN_FILTER_VISIBLE", await waitFor(win, `
      Boolean(
        /\\u63d2\\u4ef6/.test(document.querySelector('.plugin-manager-tabs button.active')?.textContent || '') &&
        document.querySelector('.capability-toolbar [data-capability-filter="enabled"].active') &&
        document.querySelector('.structured-plugin-row[data-plugin-id="pass171-enabled-plugin@qa-market"]') &&
        !document.querySelector('.structured-plugin-row[data-plugin-id="pass171-disabled-plugin@qa-market"]') &&
        !document.querySelector('.structured-plugin-row[data-plugin-id="pass171-error-plugin@qa-market"]')
      )
    `, 5000));

    assertStep("PASS171_ENABLED_MCP_FILTER_COMMAND_SEARCHABLE", await waitForPaletteCommand(
      win,
      "enabled mcp capability",
      (command) => command.id === "capability-filter:mcp:enabled" && /1\/2|1\s*\/\s*2/.test(command.text || ""),
    ));
    assertStep("PASS171_OPEN_ENABLED_MCP_FILTER_FROM_PALETTE", await runPaletteCommand(win, "enabled mcp capability", "capability-filter:mcp:enabled"));
    assertStep("PASS171_ENABLED_MCP_FILTER_VISIBLE", await waitFor(win, `
      Boolean(
        /MCP/.test(document.querySelector('.plugin-manager-tabs button.active')?.textContent || '') &&
        document.querySelector('.capability-toolbar [data-capability-filter="enabled"].active') &&
        document.querySelector('.structured-plugin-row[data-mcp-server-id="pass171-mcp-ok"]') &&
        !document.querySelector('.structured-plugin-row[data-mcp-server-id="pass171-mcp-error"]')
      )
    `, 5000));

    assertStep("PASS171_OPEN_DISABLED_MCP_FILTER_FROM_PALETTE", await runPaletteCommand(win, "disabled mcp capability", "capability-filter:mcp:disabled"));
    assertStep("PASS171_DISABLED_MCP_FILTER_VISIBLE", await waitFor(win, `
      (function() {
        const text = document.querySelector('.plugin-manager-modal')?.textContent || '';
        return Boolean(
          /MCP/.test(document.querySelector('.plugin-manager-tabs button.active')?.textContent || '') &&
          document.querySelector('.capability-toolbar [data-capability-filter="disabled"].active') &&
          !document.querySelector('.structured-plugin-row[data-mcp-server-id="pass171-mcp-ok"]') &&
          document.querySelector('.structured-plugin-row[data-mcp-server-id="pass171-mcp-error"]') &&
          /failed auth/.test(text)
        );
      })();
    `, 5000));

    assertStep("PASS171_OPEN_ALL_MCP_FILTER_FROM_PALETTE", await runPaletteCommand(win, "all mcp capability", "capability-filter:mcp:all"));
    assertStep("PASS171_ALL_MCP_FILTER_VISIBLE", await waitFor(win, `
      Boolean(
        /MCP/.test(document.querySelector('.plugin-manager-tabs button.active')?.textContent || '') &&
        document.querySelector('.capability-toolbar [data-capability-filter="all"].active') &&
        document.querySelector('.structured-plugin-row[data-mcp-server-id="pass171-mcp-ok"]') &&
        document.querySelector('.structured-plugin-row[data-mcp-server-id="pass171-mcp-error"]')
      )
    `, 5000));

    console.log("PASS171_COMMAND_PALETTE_CAPABILITY_FILTER_DONE");
    cleanup();
    app.exit(0);
  } catch (error) {
    console.error("PASS171_FAILED", error?.stack || error);
    cleanup();
    app.exit(1);
  }
});

setTimeout(() => {
  console.error("PASS171_TIMEOUT");
  cleanup();
  app.exit(1);
}, 80000);

