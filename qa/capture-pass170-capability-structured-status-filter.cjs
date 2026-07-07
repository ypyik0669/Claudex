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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass170-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass170-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass170-project-"));
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass170-project" }), "utf8");
  const fakeClaudeScript = `
const args = process.argv.slice(2);
function out(value) {
  process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n');
}
if (args[0] === '--version') out('2.10.0 (Claude Code PASS170)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out({
  plugins: [
    {
      id: 'pass170-enabled-plugin@qa-market',
      name: 'pass170-enabled-plugin',
      marketplace: 'qa-market',
      version: '17.0.0',
      scope: 'project',
      enabled: true,
      status: 'enabled',
      tools: ['pass170-enabled-tool'],
      permissions: ['Read']
    },
    {
      id: 'pass170-disabled-plugin@qa-market',
      name: 'pass170-disabled-plugin',
      marketplace: 'qa-market',
      version: '17.0.1',
      scope: 'user',
      enabled: false,
      status: 'disabled',
      tools: ['pass170-disabled-tool']
    },
    {
      id: 'pass170-error-plugin@qa-market',
      name: 'pass170-error-plugin',
      marketplace: 'qa-market',
      version: '17.0.2',
      scope: 'user',
      enabled: false,
      status: 'error',
      error: 'pass170 plugin load failed'
    }
  ]
});
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins:\\n  > pass170-enabled-plugin@qa-market\\n  > pass170-disabled-plugin@qa-market\\n  ! pass170-error-plugin@qa-market error');
else if (args[0] === 'mcp' && args[1] === 'list') out('pass170-mcp-ok: connected | 2 tools | stdio | C:\\\\mcp\\\\pass170-ok.cjs\\npass170-mcp-error: error | failed auth | stdio | C:\\\\mcp\\\\pass170-error.cjs');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out('');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else out('pass170 fake claude command: ' + args.join(' '));
`;
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), '@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n', "utf8");
  const fakeClaude = path.join(FAKE_BIN_DIR, "claude.cmd");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;

  const createdAt = "2026-07-07T12:00:00.000Z";
  const project = { name: "pass170-project", path: PROJECT_DIR };
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
        id: "pass170-session",
        title: "pass170 capability status filter",
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

async function openCapabilities(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.nav-stack button')]
        .find((candidate) => /\\u63d2\\u4ef6/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function selectCapabilityTab(win, labelPattern) {
  return win.webContents.executeJavaScript(`
    (function() {
      const pattern = new RegExp(${JSON.stringify(labelPattern)});
      const button = [...document.querySelectorAll('.plugin-manager-tabs button')]
        .find((candidate) => pattern.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function clickCapabilityFilter(win, filterId) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector(${JSON.stringify(`.capability-toolbar [data-capability-filter="${filterId}"]`)});
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
    console.error("PASS170_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  try {
    assertStep("PASS170_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
    assertStep("PASS170_OPEN_CAPABILITIES", await openCapabilities(win));
    assertStep("PASS170_STRUCTURED_PLUGIN_ROWS_READY", await waitFor(win, `
      (function() {
        const text = document.querySelector('.plugin-manager-modal')?.textContent || '';
        return Boolean(
          document.querySelector('.structured-plugin-row[data-plugin-id="pass170-enabled-plugin@qa-market"]') &&
          document.querySelector('.structured-plugin-row[data-plugin-id="pass170-disabled-plugin@qa-market"]') &&
          document.querySelector('.structured-plugin-row[data-plugin-id="pass170-error-plugin@qa-market"]') &&
          /pass170 plugin load failed/.test(text)
        );
      })();
    `, 15000));

    assertStep("PASS170_DISABLED_PLUGIN_FILTER", await clickCapabilityFilter(win, "disabled"));
    assertStep("PASS170_DISABLED_PLUGIN_ROWS_VISIBLE", await waitFor(win, `
      (function() {
        const text = document.querySelector('.plugin-manager-modal')?.textContent || '';
        return Boolean(
          document.querySelector('.capability-toolbar [data-capability-filter="disabled"].active') &&
          !document.querySelector('.structured-plugin-row[data-plugin-id="pass170-enabled-plugin@qa-market"]') &&
          document.querySelector('.structured-plugin-row[data-plugin-id="pass170-disabled-plugin@qa-market"]') &&
          document.querySelector('.structured-plugin-row[data-plugin-id="pass170-error-plugin@qa-market"]') &&
          /pass170 plugin load failed/.test(text)
        );
      })();
    `, 5000));

    assertStep("PASS170_ENABLED_PLUGIN_FILTER", await clickCapabilityFilter(win, "enabled"));
    assertStep("PASS170_ENABLED_PLUGIN_ROWS_VISIBLE", await waitFor(win, `
      Boolean(
        document.querySelector('.capability-toolbar [data-capability-filter="enabled"].active') &&
        document.querySelector('.structured-plugin-row[data-plugin-id="pass170-enabled-plugin@qa-market"]') &&
        !document.querySelector('.structured-plugin-row[data-plugin-id="pass170-disabled-plugin@qa-market"]') &&
        !document.querySelector('.structured-plugin-row[data-plugin-id="pass170-error-plugin@qa-market"]')
      )
    `, 5000));

    assertStep("PASS170_SELECT_MCP", await selectCapabilityTab(win, "MCP"));
    assertStep("PASS170_ENABLED_MCP_FILTER_VISIBLE", await waitFor(win, `
      Boolean(
        document.querySelector('.capability-toolbar [data-capability-filter="enabled"].active') &&
        document.querySelector('.structured-plugin-row[data-mcp-server-id="pass170-mcp-ok"]') &&
        !document.querySelector('.structured-plugin-row[data-mcp-server-id="pass170-mcp-error"]')
      )
    `, 5000));

    assertStep("PASS170_DISABLED_MCP_FILTER", await clickCapabilityFilter(win, "disabled"));
    assertStep("PASS170_DISABLED_MCP_FILTER_VISIBLE", await waitFor(win, `
      (function() {
        const text = document.querySelector('.plugin-manager-modal')?.textContent || '';
        return Boolean(
          document.querySelector('.capability-toolbar [data-capability-filter="disabled"].active') &&
          !document.querySelector('.structured-plugin-row[data-mcp-server-id="pass170-mcp-ok"]') &&
          document.querySelector('.structured-plugin-row[data-mcp-server-id="pass170-mcp-error"]') &&
          /failed auth/.test(text)
        );
      })();
    `, 5000));

    assertStep("PASS170_ALL_FILTER_RESTORES_ROWS", await clickCapabilityFilter(win, "all"));
    assertStep("PASS170_ALL_ROWS_VISIBLE", await waitFor(win, `
      Boolean(
        document.querySelector('.capability-toolbar [data-capability-filter="all"].active') &&
        document.querySelector('.structured-plugin-row[data-mcp-server-id="pass170-mcp-ok"]') &&
        document.querySelector('.structured-plugin-row[data-mcp-server-id="pass170-mcp-error"]')
      )
    `, 5000));

    console.log("PASS170_CAPABILITY_STRUCTURED_STATUS_FILTER_DONE");
    cleanup();
    app.exit(0);
  } catch (error) {
    console.error("PASS170_FAILED", error?.stack || error);
    cleanup();
    app.exit(1);
  }
});

setTimeout(() => {
  console.error("PASS170_TIMEOUT");
  cleanup();
  app.exit(1);
}, 80000);
