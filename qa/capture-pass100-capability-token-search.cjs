const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass100-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass100-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass100-project-"));
const MARKETPLACE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass100-market-"));

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

fs.mkdirSync(path.join(MARKETPLACE_DIR, ".claude-plugin"), { recursive: true });
writeJson(path.join(MARKETPLACE_DIR, ".claude-plugin", "marketplace.json"), {
  name: "pass100-market",
  description: "PASS100 marketplace fixture",
  owner: { name: "Pass100 Market Owner" },
  plugins: [
    {
      name: "pass100-token-catalog",
      version: "10.0.0",
      description: "catalog plugin with distributed searchable fields",
      category: "evidence",
      author: { name: "Pass100 Author" },
      source: { source: "git", url: "https://example.invalid/pass100.git", path: "plugins/catalog" },
      permissions: ["Read", "Bash"],
    },
    {
      name: "pass100-other-catalog",
      version: "10.0.1",
      description: "unrelated marketplace plugin",
      category: "misc",
    },
  ],
});

const fakeClaudeScript = `
const args = process.argv.slice(2);
const marketplaceDir = ${JSON.stringify(MARKETPLACE_DIR)};
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
if (args[0] === '--version') out('2.9.0 (Claude Code QA)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out({
  plugins: [
    {
      id: 'pass100-alpha-plugin@qa-market',
      name: 'pass100-alpha-plugin',
      marketplace: 'qa-market',
      version: '1.0.0',
      scope: 'project',
      enabled: true,
      source: { source: 'local-fixture', url: 'https://example.invalid/pass100-alpha.git', path: 'plugins/alpha' },
      tools: ['pass100-alpha-tool'],
      permissions: { bash: true, filesystem: 'read' }
    },
    {
      id: 'pass100-beta-plugin@qa-market',
      name: 'pass100-beta-plugin',
      marketplace: 'qa-market',
      version: '1.0.1',
      scope: 'user',
      enabled: true,
      tools: ['pass100-beta-tool']
    }
  ]
});
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins:\\n  > pass100-alpha-plugin@qa-market');
else if (args[0] === 'mcp' && args[1] === 'list') out('✓ pass100-mcp: connected | 7 tools | stdio | C:\\\\mcp\\\\pass100-server.cjs');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([{ name: 'pass100-market', source: 'path', repo: marketplaceDir, installLocation: marketplaceDir, version: '2026.7.6', status: 'ready', permissions: ['Read', 'Bash'] }]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces:\\n\\n  > pass100-market\\n    Source: Path (' + marketplaceDir + ')');
else out('fake claude command: ' + args.join(' '));
`;

fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
const FAKE_CLAUDE_COMMAND = path.join(FAKE_BIN_DIR, "claude.cmd");
process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;

app.setPath("userData", USER_DATA_DIR);
fs.mkdirSync(PROJECT_DIR, { recursive: true });
fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass100-project" }), "utf8");
writeJson(path.join(USER_DATA_DIR, "desktop-data.json"), {
  version: 1,
  settings: {
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
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
    apiKeys: {},
  },
  activeProject: { name: "pass100-project", path: PROJECT_DIR },
  projects: [{ name: "pass100-project", path: PROJECT_DIR }],
  sessions: [
    {
      id: "default",
      title: "\u65b0\u804a\u5929",
      project: "pass100-project",
      projectPath: PROJECT_DIR,
      createdAt: "2026-07-06T00:00:00.000Z",
      updatedAt: "2026-07-06T00:00:00.000Z",
      messages: [],
    },
  ],
  commandRuns: [],
  runEvents: [],
});

require(path.join(REPO_DIR, "electron", "main.cjs"));

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

async function setCapabilitySearch(win, value) {
  return win.webContents.executeJavaScript(`
    (function() {
      const input = document.querySelector('.capability-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })();
  `);
}

app.whenReady().then(async () => {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.error("PASS100_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  try {
    assertStep("PASS100_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
    assertStep("PASS100_OPEN_CAPABILITIES", await openCapabilities(win));
    assertStep("PASS100_CAPABILITIES_READY", await waitFor(win, "Boolean(document.querySelector('.plugin-manager-tabs') && document.querySelector('.capability-search input'))", 15000));
    assertStep("PASS100_PLUGIN_ROWS_READY", await waitFor(win, `
      (function() {
        const text = document.querySelector('.structured-registry-section')?.textContent || '';
        return /pass100-alpha-plugin@qa-market/.test(text) && /pass100-beta-plugin@qa-market/.test(text);
      })();
    `, 15000));

    assertStep("PASS100_PLUGIN_TOKEN_SEARCH", await setCapabilitySearch(win, "alpha filesystem") && await waitFor(win, `
      (function() {
        const rows = [...document.querySelectorAll('.structured-registry-section .structured-plugin-row')];
        return rows.length === 1 &&
          /pass100-alpha-plugin@qa-market/.test(rows[0].textContent || '') &&
          !/pass100-beta-plugin@qa-market/.test(rows[0].textContent || '');
      })();
    `, 5000));

    assertStep("PASS100_SELECT_MCP", await selectCapabilityTab(win, "MCP"));
    assertStep("PASS100_MCP_TOKEN_SEARCH", await setCapabilitySearch(win, "pass100 7 stdio") && await waitFor(win, `
      (function() {
        const rows = [...document.querySelectorAll('.structured-registry-section .structured-plugin-row')];
        return rows.length === 1 &&
          /pass100-mcp/.test(rows[0].textContent || '') &&
          /7/.test(rows[0].textContent || '') &&
          /stdio/.test(rows[0].textContent || '');
      })();
    `, 5000));

    assertStep("PASS100_SELECT_MARKETPLACE", await selectCapabilityTab(win, "\\u5e02\\u573a|Marketplace"));
    assertStep("PASS100_MARKETPLACE_PLUGIN_TOKEN_SEARCH", await setCapabilitySearch(win, "catalog author bash") && await waitFor(win, `
      (function() {
        const cards = [...document.querySelectorAll('.marketplace-plugin-card')];
        return cards.length === 1 &&
          /pass100-token-catalog/.test(cards[0].textContent || '') &&
          /Pass100 Author/.test(cards[0].textContent || '') &&
          /Bash/.test(cards[0].textContent || '');
      })();
    `, 5000));

    console.log("PASS100_CAPABILITY_TOKEN_SEARCH_DONE");
    cleanup();
    app.exit(0);
  } catch (error) {
    console.error("PASS100_FAILED", error?.stack || error);
    cleanup();
    app.exit(1);
  }
});

setTimeout(() => {
  console.error("PASS100_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
