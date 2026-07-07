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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass163-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass163-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass163-project-"));
const MARKETPLACE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass163-market-"));
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const SCANNED_PLUGIN_DIR = path.join(MARKETPLACE_DIR, "plugins", "pass163-manifest-plugin");
const INSTALLED_PLUGIN_DIR = path.join(MARKETPLACE_DIR, "plugins", "pass163-installed-manifest");

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

function writeFakeClaude() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  writeJson(path.join(SCANNED_PLUGIN_DIR, ".claude-plugin", "plugin.json"), {
    name: "pass163-manifest-plugin",
    version: "16.3.0",
    description: "PASS163 plugin discovered from a package plugin.json without marketplace.json.",
    category: "manifest-scan",
    author: { name: "PASS163 QA" },
    homepage: "https://example.invalid/pass163-home",
    source: {
      source: "git",
      url: "https://example.invalid/pass163.git",
      path: "plugins/pass163",
      ref: "v16.3.0",
    },
    permissions: {
      filesystem: "read",
      bash: true,
    },
    risk: ["scanned plugin.json", "runs local code"],
  });
  writeJson(path.join(INSTALLED_PLUGIN_DIR, "plugin.json"), {
    id: "pass163-installed-manifest",
    version: "1.0.1",
    description: "PASS163 installed manifest plugin discovered from top-level plugin.json.",
    category: "installed-manifest",
    author: "PASS163 Installed QA",
    source: "file://pass163-installed-manifest",
    permissions: ["Read"],
  });

  const fakeClaudeScript = `
const args = process.argv.slice(2);
const marketplaceDir = ${JSON.stringify(MARKETPLACE_DIR)};
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
if (args[0] === '--version') out('claude fake pass163');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out({
  plugins: [
    { id: 'pass163-installed-manifest@pass163-manifest-market', name: 'pass163-installed-manifest', marketplace: 'pass163-manifest-market', version: '1.0.1', enabled: true, scope: 'user' }
  ]
});
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins:\\n\\n  > pass163-installed-manifest@pass163-manifest-market\\n    Version: 1.0.1\\n    Scope: user\\n    Status: enabled');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out({
  marketplaces: [
    { name: 'pass163-manifest-market', source: 'path', repo: marketplaceDir, status: 'ready', version: '16.3-source' }
  ]
});
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces:\\n\\n  > pass163-manifest-market\\n    Source: Path (' + marketplaceDir + ')');
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else out('pass163 ok ' + args.join(' '));
`;
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(FAKE_CLAUDE, `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
}

function writeInitialStore() {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass163-project" }), "utf8");
  writeFakeClaude();

  const project = { name: "pass163-project", path: PROJECT_DIR };
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
        id: "pass163-session",
        title: "pass163 marketplace plugin manifest catalog",
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
  return win.webContents.executeJavaScript(`
    (async function() {
      const nav = Array.from(document.querySelectorAll('.nav-stack button'))
        .find((candidate) => /\\u63d2\\u4ef6/.test(candidate.textContent || ''));
      if (!nav) return false;
      nav.click();
      await new Promise((resolve) => setTimeout(resolve, 700));
      const tab = Array.from(document.querySelectorAll('.plugin-manager-tabs button'))
        .find((candidate) => /\\u5e02\\u573a/.test(candidate.textContent || '') || /Marketplace/i.test(candidate.textContent || ''));
      if (!tab) return false;
      tab.click();
      return true;
    })();
  `);
}

async function runPaletteCommand(win, query) {
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
        .find((candidate) =>
          (candidate.getAttribute('data-command-id') || '').startsWith('capability-marketplace-plugin:') &&
          /pass163-manifest-plugin/.test(candidate.textContent || '')
        );
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS163_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS163_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS163_OPEN_MARKETPLACE", await openMarketplace(win));
  assertStep("PASS163_PLUGIN_MANIFEST_CATALOG_VISIBLE", await waitFor(win, `
    (function() {
      const scannedRoot = ${JSON.stringify(SCANNED_PLUGIN_DIR)};
      const scanned = document.querySelector('.marketplace-plugin-card[data-marketplace-plugin-id="pass163-manifest-plugin@pass163-manifest-market"]');
      const installed = document.querySelector('.marketplace-plugin-card[data-marketplace-plugin-id="pass163-installed-manifest@pass163-manifest-market"]');
      const scannedText = scanned?.textContent || "";
      const installedText = installed?.textContent || "";
      const installMeta = scanned?.querySelector('dd[title*="claudex-pass163-market-"]');
      return Boolean(
        scanned &&
        installed &&
        installed.classList.contains('installed') &&
        installMeta?.getAttribute('title') === scannedRoot &&
        /16\\.3\\.0/.test(scannedText) &&
        /manifest-scan/.test(scannedText) &&
        /PASS163 QA/.test(scannedText) &&
        /pass163\\.git/.test(scannedText) &&
        /filesystem:read/.test(scannedText) &&
        /scanned plugin\\.json/.test(scannedText) &&
        /1\\.0\\.1/.test(installedText) &&
        /PASS163 Installed QA/.test(installedText)
      );
    })();
  `, 15000));

  assertStep("PASS163_MARKETPLACE_PLUGIN_COMMAND_FOCUSES_MANIFEST", await runPaletteCommand(win, "pass163 scanned plugin.json filesystem"));
  assertStep("PASS163_MARKETPLACE_PLUGIN_FOCUSED", await waitFor(win, `
    Boolean(
      document.querySelector('.marketplace-plugin-card.focused-capability-row[data-marketplace-plugin-id="pass163-manifest-plugin@pass163-manifest-market"]') &&
      /pass163-manifest-plugin/.test(document.querySelector('.marketplace-plugin-card.focused-capability-row')?.textContent || '')
    )
  `, 10000));
  assertStep("PASS163_STATUS_DID_NOT_PERSIST_COMMAND_RUNS", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      return !state.commandRuns || state.commandRuns.length === 0;
    })();
  `));

  console.log("PASS163_MARKETPLACE_PLUGIN_MANIFEST_CATALOG_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS163_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS163_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
