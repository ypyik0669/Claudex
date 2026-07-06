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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass161-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass161-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass161-project-"));
const MARKETPLACE_REPO_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass161-market-repo-"));
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_DIR, MARKETPLACE_REPO_DIR]) {
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
  fs.mkdirSync(path.join(MARKETPLACE_REPO_DIR, ".claude-plugin"), { recursive: true });
  writeJson(path.join(MARKETPLACE_REPO_DIR, ".claude-plugin", "marketplace.json"), {
    name: "pass161-repo-market",
    description: "PASS161 repo-only marketplace fixture",
    owner: { name: "PASS161 Owner" },
    version: "repo-manifest-16.1",
    plugins: [
      {
        name: "pass161-repo-plugin",
        version: "16.1.0",
        description: "PASS161 plugin loaded from marketplace repo path without installLocation.",
        category: "repo-catalog",
        author: { name: "PASS161 QA" },
        source: {
          source: "git",
          url: "https://example.invalid/pass161.git",
          path: "plugins/pass161",
          ref: "v16.1.0",
        },
        permissions: {
          filesystem: "read",
          bash: true,
        },
        risk: ["runs local plugin code", "repo-only source"],
      },
    ],
  });
  const repoPath = MARKETPLACE_REPO_DIR.replace(/\\/g, "\\\\");
  fs.writeFileSync(
    FAKE_CLAUDE,
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass161& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo {\"plugins\":[]}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins: none& exit /b 0)",
      `if "%1"=="plugin" if "%2"=="marketplace" if "%3"=="list" if "%4"=="--json" (echo [{"name":"pass161-repo-market","source":"path","repo":"${repoPath}","version":"16.1-source","status":"ready"}]& exit /b 0)`,
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces:& echo   ^> pass161-repo-market& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass161 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
}

function writeInitialStore() {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass161-project" }), "utf8");
  writeFakeClaude();

  const project = { name: "pass161-project", path: PROJECT_DIR };
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
        id: "pass161-session",
        title: "pass161 repo marketplace catalog",
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

async function openPaletteAndQuery(win, query) {
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
      return true;
    })();
  `);
}

async function clickMarketplacePluginCommand(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = Array.from(document.querySelectorAll('.command-modal .command-list button'))
        .find((candidate) =>
          (candidate.getAttribute('data-command-id') || '').startsWith('capability-marketplace-plugin:') &&
          /pass161-repo-plugin/.test(candidate.textContent || '')
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
  if (!win) throw new Error("PASS161_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS161_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS161_OPEN_MARKETPLACE", await openMarketplace(win));
  assertStep("PASS161_REPO_ONLY_MARKETPLACE_PLUGIN_VISIBLE", await waitFor(win, `
    (function() {
      const expectedRoot = ${JSON.stringify(MARKETPLACE_REPO_DIR)};
      const source = document.querySelector('.marketplace-source-row[data-marketplace-source-id="pass161-repo-market"]');
      const plugin = document.querySelector('.marketplace-plugin-card[data-marketplace-plugin-id="pass161-repo-plugin@pass161-repo-market"]');
      const installMeta = plugin?.querySelector('dd[title*="claudex-pass161-market-repo-"]');
      const pluginText = plugin?.textContent || '';
      return Boolean(
        source &&
        plugin &&
        installMeta?.getAttribute('title') === expectedRoot &&
        /pass161-repo-plugin/.test(pluginText) &&
        /16\\.1\\.0/.test(pluginText) &&
        /repo-catalog/.test(pluginText) &&
        /PASS161 QA/.test(pluginText) &&
        /filesystem:read/.test(pluginText) &&
        /repo-only source/.test(pluginText)
      );
    })();
  `, 15000));
  assertStep("PASS161_MARKETPLACE_PLUGIN_COMMAND_VISIBLE", await openPaletteAndQuery(win, "pass161 repo-only source"));
  assertStep("PASS161_CLICK_MARKETPLACE_PLUGIN_COMMAND", await clickMarketplacePluginCommand(win));
  assertStep("PASS161_MARKETPLACE_PLUGIN_FOCUSED", await waitFor(win, `
    Boolean(
      document.querySelector('.marketplace-plugin-card.focused-capability-row[data-marketplace-plugin-id="pass161-repo-plugin@pass161-repo-market"]') &&
      /pass161-repo-plugin/.test(document.querySelector('.marketplace-plugin-card.focused-capability-row')?.textContent || '')
    )
  `, 10000));
  assertStep("PASS161_STATUS_DID_NOT_PERSIST_COMMAND_RUNS", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      return !state.commandRuns || state.commandRuns.length === 0;
    })();
  `));

  console.log("PASS161_MARKETPLACE_REPO_CATALOG_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS161_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS161_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
