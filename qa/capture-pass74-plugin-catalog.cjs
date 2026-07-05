const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass74-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass74-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass74-project-"));

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

function writeFakeClaude() {
  const fakeClaudeScript = `
const args = process.argv.slice(2);
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
if (args[0] === '--version') out('2.9.0 (Claude Code QA)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out({
  plugins: [
    {
      id: 'pass74-json-plugin@qa-market',
      name: 'pass74-json-plugin',
      marketplace: 'qa-market',
      version: '2.4.6',
      scope: 'project',
      enabled: true,
      source: { source: 'local-fixture', url: 'https://example.invalid/pass74.git', path: 'plugins/json', ref: 'v2.4.6' },
      installPath: 'C:/pass74/plugins/json',
      tools: ['pass74-read-tool', 'pass74-bash-tool'],
      permissions: { filesystem: 'read', bash: true },
      description: 'Structured plugin fixture from object wrapped JSON.'
    },
    {
      id: 'pass74-error-plugin@qa-market',
      name: 'pass74-error-plugin',
      marketplace: 'qa-market',
      version: '0.0.9',
      scope: 'user',
      enabled: false,
      status: 'error',
      installPath: 'C:/pass74/plugins/error',
      allowedTools: ['pass74-webfetch-tool'],
      error: 'missing config token'
    }
  ]
});
else if (args[0] === 'plugin' && args[1] === 'list') out('RAW_PASS74_PLUGIN_LIST_SHOULD_BE_IN_DETAILS\\nInstalled plugins:\\n\\n  > pass74-json-plugin@qa-market\\n    Version: 2.4.6\\n    Scope: project\\n    Status: enabled');
else if (args[0] === 'mcp' && args[1] === 'list') out('✓ pass74-mcp: connected');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out({ marketplaces: [] });
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else out('fake claude command: ' + args.join(' '));
`;
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
  return path.join(FAKE_BIN_DIR, "claude.cmd");
}

function writeInitialStore(claudeCommand) {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass74-project" }), "utf8");
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
      claudeCode: { executionMode: "claude-code", claudeCommand, permissionMode: "default" },
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
    activeProject: { name: "pass74-project", path: PROJECT_DIR },
    projects: [{ name: "pass74-project", path: PROJECT_DIR }],
    sessions: [
      {
        id: "default",
        title: "新聊天",
        project: "pass74-project",
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-06T00:00:00.000Z",
        updatedAt: "2026-07-06T00:00:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    runEvents: [],
  });
}

async function setSearch(win, value) {
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

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS74_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS74_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS74_OPEN_CAPABILITIES", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.nav-stack button')].find((candidate) => /插件/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS74_PLUGIN_OBJECT_JSON_STRUCTURED", await waitFor(win, `
    (function() {
      const rows = [...document.querySelectorAll('.structured-registry-section .structured-plugin-row')];
      const good = rows.find((row) => /pass74-json-plugin@qa-market/.test(row.textContent || ''));
      const bad = rows.find((row) => /pass74-error-plugin@qa-market/.test(row.textContent || ''));
      const goodText = good?.textContent || '';
      const goodMeta = good?.querySelector('.structured-row-meta')?.textContent || '';
      const badText = bad?.textContent || '';
      const badMeta = bad?.querySelector('.structured-row-meta')?.textContent || '';
      return Boolean(good && bad) &&
        /已启用/.test(goodText) &&
        /版本/.test(goodMeta) && /2\\.4\\.6/.test(goodMeta) &&
        /范围/.test(goodMeta) && /project/.test(goodMeta) &&
        /来源/.test(goodMeta) && /local-fixture/.test(goodMeta) && /pass74\\.git/.test(goodMeta) &&
        /安装路径/.test(goodMeta) && /plugins[\\\\/]json/.test(goodMeta) &&
        /工具/.test(goodMeta) && /pass74-bash-tool/.test(goodMeta) &&
        /允许工具/.test(goodMeta) && /filesystem:read/.test(goodMeta) &&
        /已禁用/.test(badText) &&
        /错误/.test(badMeta) && /missing config token/.test(badMeta) &&
        /pass74-webfetch-tool/.test(badMeta);
    })();
  `, 15000));

  assertStep("PASS74_RAW_OUTPUT_COLLAPSED_DETAILS", await waitFor(win, `
    (function() {
      const details = document.querySelector('details.plugin-cli-output.raw-output-details');
      const pre = details?.querySelector('pre');
      return Boolean(details && pre && !details.open &&
        /RAW_PASS74_PLUGIN_LIST_SHOULD_BE_IN_DETAILS/.test(pre.textContent || '') &&
        pre.getClientRects().length === 0);
    })();
  `, 5000));

  assertStep("PASS74_SEARCH_PLUGIN_TOOL", await setSearch(win, "pass74-bash-tool") && await waitFor(win, `
    (function() {
      const rows = [...document.querySelectorAll('.structured-registry-section .structured-plugin-row')];
      return rows.length === 1 &&
        /pass74-json-plugin@qa-market/.test(rows[0].textContent || '') &&
        !/pass74-error-plugin@qa-market/.test(rows[0].textContent || '');
    })();
  `, 5000));

  assertStep("PASS74_SEARCH_PLUGIN_ERROR", await setSearch(win, "missing config token") && await waitFor(win, `
    (function() {
      const rows = [...document.querySelectorAll('.structured-registry-section .structured-plugin-row')];
      return rows.length === 1 &&
        /pass74-error-plugin@qa-market/.test(rows[0].textContent || '') &&
        !/pass74-json-plugin@qa-market/.test(rows[0].textContent || '');
    })();
  `, 5000));

  assertStep("PASS74_STATUS_DID_NOT_PERSIST_COMMAND_RUNS", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      return !state.commandRuns || state.commandRuns.length === 0;
    })();
  `));

  console.log("PASS74_PLUGIN_CATALOG_DONE");
  cleanup();
  app.exit(0);
}

const fakeClaudeCommand = writeFakeClaude();
app.setPath("userData", USER_DATA_DIR);
writeInitialStore(fakeClaudeCommand);
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS74_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS74_TIMEOUT");
  cleanup();
  app.exit(1);
}, 80000);
