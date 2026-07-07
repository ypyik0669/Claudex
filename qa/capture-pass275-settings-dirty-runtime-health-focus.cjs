const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

function findRepoDir() {
  const candidates = [process.env.CLAUDEX_REPO_DIR, process.cwd(), __dirname, path.join(__dirname, "..")].filter(Boolean);
  for (const candidate of candidates) {
    let current = path.resolve(candidate);
    while (current && current !== path.dirname(current)) {
      if (fs.existsSync(path.join(current, "package.json")) && fs.existsSync(path.join(current, "electron", "main.cjs"))) return current;
      current = path.dirname(current);
    }
  }
  throw new Error("Unable to locate Claudex repo root");
}

const REPO_DIR = findRepoDir();
process.chdir(REPO_DIR);

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass275-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass275-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass275-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_DIR]) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_error) { /* best-effort */ }
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

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
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  const fakeClaudeScript = `
const args = process.argv.slice(2);
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
if (args[0] === '--version') out('2.75.0 (Claude Code PASS275)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) { process.stderr.write('pass275 plugin json failed\\n'); process.exit(21); }
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins:\\n\\n  > pass275-installed@qa\\n    Version: 1.0.0\\n    Scope: user\\n    Status: enabled');
else if (args[0] === 'mcp' && args[1] === 'list') { process.stderr.write('pass275 mcp failed\\n'); process.exit(22); }
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) { process.stderr.write('pass275 marketplace json failed\\n'); process.exit(23); }
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') { process.stderr.write('pass275 marketplace failed\\n'); process.exit(24); }
else out('pass275 fake claude command: ' + args.join(' '));
`;
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(FAKE_CLAUDE, '@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n', "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function writeInitialStore() {
  writeFakeClaude();
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass275-project" }), "utf8");
  const project = { name: "pass275-project", path: PROJECT_DIR };
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
      claudeCode: { executionMode: "claude-code", claudeCommand: FAKE_CLAUDE, permissionMode: "plan" },
      capabilities: { "project-context": true, "terminal-helper": true, "mcp-runtime": true, "plugin-router": true, "marketplace-router": true },
      customMarketplaces: [],
      apiKeys: {},
    },
    activeProject: project,
    projects: [project],
    sessions: [{
      id: "pass275-session",
      title: "PASS275 settings dirty runtime focus",
      project: project.name,
      projectPath: project.path,
      createdAt: "2026-07-08T04:50:00.000Z",
      updatedAt: "2026-07-08T04:50:00.000Z",
      messages: [],
    }],
    commandRuns: [],
    runEvents: [],
    notices: [],
    automations: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
  });
}

async function runPaletteCommand(win, query, expectedId) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 240));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 320));
      const button = document.querySelector(${JSON.stringify(`.command-modal .command-list button[data-command-id="${expectedId}"]`)});
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

writeInitialStore();
app.setPath("userData", USER_DATA_DIR);
require(path.join(REPO_DIR, "electron", "main.cjs"));

async function runTest() {
  await wait(1700);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS275_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS275_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS275_STATUS_ISSUES_READY", await waitFor(win, `
    (async function() {
      const status = await window.claudexDesktop.getClaudeStatus({ projectPath: ${JSON.stringify(PROJECT_DIR)} });
      return Boolean(status.pluginCommand?.jsonCode === 21 && status.mcpCommand?.code === 22 && status.marketplaceCommand?.jsonCode === 23);
    })();
  `, 15000));

  assertStep("PASS275_OPEN_SETTINGS", await runPaletteCommand(win, "settings general", "settings-section:general"));
  assertStep("PASS275_SETTINGS_READY", await waitFor(win, "Boolean(document.querySelector('.settings-surface .runtime-health-card'))", 12000));
  assertStep("PASS275_MARK_SETTINGS_DIRTY", await win.webContents.executeJavaScript(`
    (function() {
      const select = Array.from(document.querySelectorAll('.settings-surface select')).find((item) =>
        Array.from(item.options || []).some((option) => option.value === 'bypassPermissions')
      );
      if (!select) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(select, 'bypassPermissions');
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return select.value === 'bypassPermissions';
    })();
  `));
  assertStep("PASS275_DIRTY_TRACE_READY", await waitFor(win, `
    (function() {
      const surface = document.querySelector('.settings-surface');
      const select = Array.from(document.querySelectorAll('.settings-surface select')).find((item) =>
        Array.from(item.options || []).some((option) => option.value === 'bypassPermissions')
      );
      return Boolean(surface?.getAttribute('data-settings-dirty') === 'true' && select?.value === 'bypassPermissions' && document.querySelector('.dirty-flag'));
    })();
  `, 5000));

  assertStep("PASS275_DIRTY_RUNTIME_COPY_COMMAND_CLICKED", await runPaletteCommand(win, "settings runtime health copy pass275", "settings-runtime-health-action:copy"));
  assertStep("PASS275_DIRTY_RUNTIME_COPY_FOCUSED", await waitFor(win, `
    (function() {
      const surface = document.querySelector('.settings-surface');
      const select = Array.from(document.querySelectorAll('.settings-surface select')).find((item) =>
        Array.from(item.options || []).some((option) => option.value === 'bypassPermissions')
      );
      const action = document.querySelector('.settings-surface .runtime-health-card button[data-runtime-health-action="copy"]');
      return Boolean(
        surface?.getAttribute('data-settings-dirty') === 'true' &&
        surface?.getAttribute('data-settings-active-section') === 'general' &&
        surface?.getAttribute('data-settings-runtime-health-focus-action') === 'copy' &&
        select?.value === 'bypassPermissions' &&
        action?.getAttribute('data-runtime-health-action-focused') === 'true' &&
        /pass275 mcp failed/.test(document.body.textContent || '')
      );
    })();
  `, 12000));

  assertStep("PASS275_DIRTY_RUNTIME_MARKETPLACE_COMMAND_CLICKED", await runPaletteCommand(win, "settings runtime health issue marketplace pass275", "settings-runtime-health-issue:marketplace"));
  assertStep("PASS275_DIRTY_RUNTIME_MARKETPLACE_FOCUSED", await waitFor(win, `
    (function() {
      const surface = document.querySelector('.settings-surface');
      const select = Array.from(document.querySelectorAll('.settings-surface select')).find((item) =>
        Array.from(item.options || []).some((option) => option.value === 'bypassPermissions')
      );
      const issue = document.querySelector('.settings-surface .runtime-health-issue[data-runtime-health-issue-target="marketplace"]');
      const action = issue?.querySelector('button[data-runtime-health-issue-action="open"]');
      return Boolean(
        surface?.getAttribute('data-settings-dirty') === 'true' &&
        surface?.getAttribute('data-settings-runtime-health-focus-action') === 'open-issue' &&
        surface?.getAttribute('data-settings-runtime-health-focus-target') === 'marketplace' &&
        surface?.getAttribute('data-settings-runtime-health-focus-command') === 'plugin marketplace list --json' &&
        select?.value === 'bypassPermissions' &&
        issue?.getAttribute('data-runtime-health-issue-focused') === 'true' &&
        action?.getAttribute('data-runtime-health-action-focused') === 'true'
      );
    })();
  `, 12000));

  console.log("PASS275_SETTINGS_DIRTY_RUNTIME_HEALTH_FOCUS_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS275_FAILED", error?.stack || error);
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    const debug = await win.webContents.executeJavaScript(`
      (function() {
        return {
          commands: Array.from(document.querySelectorAll('.command-modal .command-list button')).slice(0, 60).map((item) => ({ id: item.getAttribute('data-command-id'), text: item.textContent })),
          settings: Object.fromEntries(Array.from(document.querySelector('.settings-surface')?.attributes || []).map((attr) => [attr.name, attr.value])),
          selects: Array.from(document.querySelectorAll('.settings-surface select')).map((item) => ({ value: item.value, options: Array.from(item.options || []).map((option) => option.value).slice(0, 20) })),
          body: document.body.textContent?.slice(0, 9000) || '',
        };
      })();
    `).catch((debugError) => ({ error: String(debugError?.stack || debugError) }));
    console.error("PASS275_DEBUG", JSON.stringify(debug, null, 2).slice(0, 30000));
  }
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS275_TIMEOUT");
  cleanup();
  app.exit(1);
}, 120000);
