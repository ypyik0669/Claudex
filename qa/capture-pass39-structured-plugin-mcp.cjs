const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const PROJECT_PATH = path.join(__dirname, "..");
const QA_DIR = path.join(PROJECT_PATH, "qa");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass39-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass39-bin-"));
const MARKETPLACE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass39-market-"));
const MARKETPLACE_MANIFEST_DIR = path.join(MARKETPLACE_DIR, ".claude-plugin");
const PROJECT_FIXTURE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass39-project-"));

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, MARKETPLACE_DIR, PROJECT_FIXTURE_DIR]) {
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

fs.mkdirSync(MARKETPLACE_MANIFEST_DIR, { recursive: true });
writeJson(path.join(MARKETPLACE_MANIFEST_DIR, "marketplace.json"), {
  name: "qa-market",
  description: "QA marketplace fixture",
  owner: { name: "QA Owner" },
  plugins: [
    {
      name: "qa-structured-plugin",
      description: "A deterministic plugin used by Claudex QA to prove structured marketplace cards.",
      category: "testing",
      author: { name: "Claudex QA" },
      homepage: "https://example.invalid/qa-structured-plugin",
      source: { source: "git-subdir", url: "https://example.invalid/repo.git", path: "plugins/qa", ref: "v1" },
    },
    {
      name: "qa-installed-plugin",
      description: "Already installed plugin fixture.",
      category: "productivity",
      source: "./plugins/qa-installed-plugin",
    },
  ],
});

const fakeClaudeScript = `
const args = process.argv.slice(2);
const marketplaceDir = ${JSON.stringify(MARKETPLACE_DIR)};
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
if (args[0] === '--version') out('2.9.0 (Claude Code QA)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([
  { id: 'qa-installed-plugin@qa-market', version: '1.2.3', scope: 'user', enabled: true, installPath: 'C:/qa/plugin', installedAt: '2026-07-05T00:00:00.000Z', lastUpdated: '2026-07-05T01:00:00.000Z' },
  { id: 'qa-disabled-plugin@qa-market', version: '0.1.0', scope: 'project', enabled: false, installPath: 'C:/qa/disabled' }
]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins:\\n\\n  > qa-installed-plugin@qa-market\\n    Version: 1.2.3\\n    Scope: user\\n    Status: ✓ enabled\\n\\n  > qa-disabled-plugin@qa-market\\n    Version: 0.1.0\\n    Scope: project\\n    Status: × disabled');
else if (args[0] === 'mcp' && args[1] === 'list') out('✓ qa-mcp: connected\\n⏸ qa-pending: pending approval\\n✗ qa-broken: failed to start');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([{ name: 'qa-market', source: 'path', repo: marketplaceDir, installLocation: marketplaceDir }]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces:\\n\\n  > qa-market\\n    Source: Path (' + marketplaceDir + ')');
else if (args[0] === 'plugin' && ['install', 'enable', 'disable', 'update'].includes(args[1])) out('ok ' + args.join(' '));
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'update') out('updated qa-market');
else out('fake claude command: ' + args.join(' '));
`;
fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
const FAKE_CLAUDE_COMMAND = path.join(FAKE_BIN_DIR, "claude.cmd");
process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;

app.setPath("userData", USER_DATA_DIR);
fs.mkdirSync(USER_DATA_DIR, { recursive: true });
fs.writeFileSync(path.join(PROJECT_FIXTURE_DIR, "package.json"), JSON.stringify({ name: "pass39" }), "utf8");
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
      "code-review": true,
      "implementation-plan": true,
      "terminal-helper": true,
      "mcp-runtime": true,
      "plugin-router": true,
      "marketplace-router": true,
      "custom-marketplaces": true,
    },
    customMarketplaces: ["https://example.invalid/custom-marketplace.json"],
  },
  activeProject: { name: "pass39-project", path: PROJECT_FIXTURE_DIR },
  projects: [{ name: "pass39-project", path: PROJECT_FIXTURE_DIR }],
  sessions: [
    {
      id: "default",
      title: "新聊天",
      project: "pass39-project",
      projectPath: PROJECT_FIXTURE_DIR,
      createdAt: "2026-07-05T00:00:00.000Z",
      updatedAt: "2026-07-05T00:00:00.000Z",
      messages: [],
    },
  ],
});

require(path.join(PROJECT_PATH, "electron", "main.cjs"));

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

async function shot(win, name) {
  await win.webContents.executeJavaScript("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  await wait(250);
  const image = await win.webContents.capturePage();
  const outPath = path.join(QA_DIR, name);
  fs.writeFileSync(outPath, image.toPNG());
  console.log("CAPTURED", outPath);
}

function assertStep(name, ok) {
  console.log(name, ok);
  if (!ok) throw new Error(`${name} failed`);
}

app.whenReady().then(async () => {
  fs.mkdirSync(QA_DIR, { recursive: true });
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.error("PASS39_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS39_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid'))", 15000));
  assertStep("PASS39_OPEN_CAPABILITIES", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.nav-stack button')].find((candidate) => /插件/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS39_CLI_STRUCTURED_PLUGINS", await waitFor(win, `
    Boolean(
      document.querySelector('.plugin-manager-modal') &&
      document.querySelector('.structured-registry-section') &&
      /qa-installed-plugin@qa-market/.test(document.querySelector('.plugin-manager-list')?.textContent || '') &&
      /qa-disabled-plugin@qa-market/.test(document.querySelector('.plugin-manager-list')?.textContent || '') &&
      /CLI 已安装插件/.test(document.body.textContent || '')
    )
  `, 15000));

  assertStep("PASS39_MCP_STRUCTURED", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.plugin-manager-tabs button')].find((candidate) => /MCP/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS39_MCP_ROWS", await waitFor(win, `
    /qa-mcp/.test(document.querySelector('.plugin-manager-list')?.textContent || '') &&
    /qa-pending/.test(document.querySelector('.plugin-manager-list')?.textContent || '') &&
    /qa-broken/.test(document.querySelector('.plugin-manager-list')?.textContent || '')
  `, 8000));

  assertStep("PASS39_MARKETPLACE_STRUCTURED", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.plugin-manager-tabs button')].find((candidate) => /市场/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS39_MARKETPLACE_ROWS", await waitFor(win, `
    Boolean(
      document.querySelector('.marketplace-workbench') &&
      document.querySelector('.structured-source-row') &&
      document.querySelector('.marketplace-plugin-card') &&
      /qa-market/.test(document.querySelector('.marketplace-workbench')?.textContent || '') &&
      /qa-structured-plugin/.test(document.querySelector('.marketplace-workbench')?.textContent || '') &&
      /qa-installed-plugin/.test(document.querySelector('.marketplace-workbench')?.textContent || '') &&
      (document.querySelector('.marketplace-workbench')?.textContent || '').includes('https://example.invalid/custom-marketplace.json')
    )
  `, 10000));

  assertStep("PASS39_SEARCH_MARKETPLACE_CATALOG", await win.webContents.executeJavaScript(`
    (function() {
      const input = document.querySelector('.capability-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'structured');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const text = document.querySelector('.marketplace-workbench')?.textContent || '';
      return /qa-structured-plugin/.test(text) && !/qa-installed-plugin/.test(text);
    })();
  `));

  await shot(win, "pass39-structured-plugin-marketplace.png");
  console.log("PASS39_STRUCTURED_PLUGIN_MCP_DONE");
  cleanup();
  app.exit(0);
}).catch((error) => {
  console.error("PASS39_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS39_TIMEOUT");
  cleanup();
  app.exit(1);
}, 80000);
