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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass301-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass301-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass301-project-"));
const OTHER_MARKETPLACE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass301-other-market-"));
const MARKETPLACE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass301-market-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const UPDATE_MARKER = path.join(USER_DATA_DIR, "pass301-marketplace-update-ran.txt");
const OTHER_MARKETPLACE_NAME = "pass301-alpha";
const MARKETPLACE_NAME = "pass301-market";

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_DIR, OTHER_MARKETPLACE_DIR, MARKETPLACE_DIR]) {
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

async function waitForMarker(timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (fs.existsSync(UPDATE_MARKER)) return true;
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
const fs = require('fs');
const otherMarketplaceDir = ${JSON.stringify(OTHER_MARKETPLACE_DIR)};
const marketplaceDir = ${JSON.stringify(MARKETPLACE_DIR)};
const updateMarker = ${JSON.stringify(UPDATE_MARKER)};
const args = process.argv.slice(2);
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
const marketplaceJson = [
  {
    name: '${OTHER_MARKETPLACE_NAME}',
    source: 'path',
    repo: otherMarketplaceDir,
    installLocation: otherMarketplaceDir,
    version: '2026.7.8-alpha',
    status: 'ready',
    permissions: ['Read']
  },
  {
    name: '${MARKETPLACE_NAME}',
    source: 'path',
    repo: marketplaceDir,
    installLocation: marketplaceDir,
    version: '2026.7.8-pass301',
    status: 'ready',
    permissions: ['Read', 'Bash']
  }
];
if (args[0] === '--version') out('3.01.0 (Claude Code PASS301)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out({ plugins: [] });
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out({ servers: [] });
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out(marketplaceJson);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces:\\n\\n  > ${OTHER_MARKETPLACE_NAME}\\n    Source: Path (' + otherMarketplaceDir + ')\\n\\n  > ${MARKETPLACE_NAME}\\n    Source: Path (' + marketplaceDir + ')');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'update') { fs.writeFileSync(updateMarker, args.join(' '), 'utf8'); out('PASS301 marketplace update complete'); }
else out('pass301 fake claude command: ' + args.join(' '));
`;
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(FAKE_CLAUDE, '@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n', "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function writeInitialStore() {
  writeFakeClaude();
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass301-project" }), "utf8");
  writeJson(path.join(OTHER_MARKETPLACE_DIR, ".claude-plugin", "marketplace.json"), {
    name: OTHER_MARKETPLACE_NAME,
    description: "PASS301 first marketplace fixture that must not receive command focus",
    owner: { name: "PASS301 Alpha Owner" },
    plugins: [],
  });
  writeJson(path.join(MARKETPLACE_DIR, ".claude-plugin", "marketplace.json"), {
    name: MARKETPLACE_NAME,
    description: "PASS301 marketplace source update command fixture",
    owner: { name: "PASS301 Owner" },
    plugins: [],
  });
  const project = { name: "pass301-project", path: PROJECT_DIR };
  writeJson(DATA_FILE, {
    version: 1,
    activeProject: project,
    projects: [project],
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
    sessions: [{
      id: "pass301-session",
      title: "PASS301 marketplace source update command",
      project: project.name,
      projectPath: PROJECT_DIR,
      createdAt: "2026-07-08T03:01:00.000Z",
      updatedAt: "2026-07-08T03:01:00.000Z",
      messages: [],
    }],
    commandRuns: [],
    runEvents: [],
    automations: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
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
  if (!win) throw new Error("PASS301_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  const commandId = `capability-marketplace-source-action:update:${encodeURIComponent(MARKETPLACE_NAME).slice(0, 120)}`;
  const sourceSelector = `.capability-modal [data-marketplace-source-id="${MARKETPLACE_NAME}"]`;
  const updateSelector = `${sourceSelector} [data-marketplace-source-action="update"]`;

  assertStep("PASS301_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS301_STATUS_READY", await waitFor(win, `
    (async function() {
      const status = await window.claudexDesktop.getClaudeStatus({ projectPath: ${JSON.stringify(PROJECT_DIR)} });
      return Boolean(
        status.marketplaces?.some((item) => item.name === ${JSON.stringify(OTHER_MARKETPLACE_NAME)} && /2026\\.7\\.8-alpha/.test(item.version || '')) &&
        status.marketplaces?.some((item) => item.name === ${JSON.stringify(MARKETPLACE_NAME)} && /2026\\.7\\.8-pass301/.test(item.version || ''))
      );
    })();
  `, 15000));

  assertStep("PASS301_UPDATE_MARKER_ABSENT_BEFORE_COMMAND", !fs.existsSync(UPDATE_MARKER));
  assertStep("PASS301_UPDATE_COMMAND_CLICKED", await runPaletteCommand(win, "update source pass301-market", commandId));
  assertStep("PASS301_SOURCE_UPDATE_ACTION_FOCUSED", await waitFor(win, `
    (function() {
      const activeTab = document.querySelector('.plugin-manager-tabs button.active')?.textContent || '';
      const row = document.querySelector(${JSON.stringify(sourceSelector)});
      const rowText = row?.textContent || '';
      const action = document.querySelector(${JSON.stringify(updateSelector)});
      return Boolean(
        /\\u5e02\\u573a/.test(activeTab) &&
        row &&
        row.getAttribute('data-capability-focused') === 'true' &&
        row.getAttribute('aria-current') === 'true' &&
        /pass301-market/.test(rowText) &&
        /2026\\.7\\.8-pass301/.test(rowText) &&
        action &&
        action.getAttribute('data-capability-action-focused') === 'true' &&
        action.getAttribute('aria-current') === 'true' &&
        action.getAttribute('data-capability-kind') === 'marketplace-source' &&
        action.getAttribute('data-capability-action') === 'update' &&
        action.getAttribute('data-capability-id') === ${JSON.stringify(MARKETPLACE_NAME)}
      );
    })();
  `, 15000));
  assertStep("PASS301_CONFIRM_VISIBLE_WITH_SOURCE_REVIEW", await waitFor(win, `
    (function() {
      const confirm = document.querySelector('.plugin-cli-confirm');
      const text = confirm?.textContent || '';
      return Boolean(
        confirm &&
        /plugin marketplace update/.test(text) &&
        /pass301-market/.test(text) &&
        !/pass301-alpha/.test(text) &&
        /2026\\.7\\.8-pass301/.test(text) &&
        /Read/.test(text) &&
        /Bash/.test(text)
      );
    })();
  `, 5000));
  assertStep("PASS301_UPDATE_NOT_RUN_BEFORE_CONFIRM", !fs.existsSync(UPDATE_MARKER));
  assertStep("PASS301_CONFIRM_ACTION_READY", await waitFor(win, `
    (function() {
      const button = document.querySelector('.plugin-cli-confirm .danger-action');
      return Boolean(button && !button.disabled);
    })();
  `, 10000));
  assertStep("PASS301_CONFIRM_CLICKED", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.plugin-cli-confirm .danger-action');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS301_UPDATE_RUN_AFTER_CONFIRM", await waitForMarker(10000));
  assertStep("PASS301_COMMAND_RUN_PERSISTED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      return Boolean((state.commandRuns || []).some((run) =>
        String(run.command || run.commandLine || '').includes('plugin marketplace update') &&
        run.capabilityContext?.kind === 'marketplace-source' &&
        run.capabilityContext?.id === ${JSON.stringify(MARKETPLACE_NAME)} &&
        run.capabilityContext?.action === 'update'
      ));
    })();
  `, 10000));

  console.log("PASS301_MARKETPLACE_SOURCE_UPDATE_COMMAND_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS301_FAILED", error?.stack || error);
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    const debug = await win.webContents.executeJavaScript(`
      (function() {
        return {
          commands: Array.from(document.querySelectorAll('.command-modal .command-list button')).slice(0, 40).map((item) => ({
            id: item.getAttribute('data-command-id'),
            text: item.textContent,
            attrs: Object.fromEntries(Array.from(item.attributes).map((attr) => [attr.name, attr.value])),
          })),
          actions: Array.from(document.querySelectorAll('.capability-modal [data-capability-action-focused], .capability-modal [data-marketplace-source-action]')).slice(0, 40).map((item) => ({
            text: item.textContent,
            attrs: Object.fromEntries(Array.from(item.attributes).map((attr) => [attr.name, attr.value])),
          })),
          confirm: document.querySelector('.plugin-cli-confirm')?.textContent || '',
          body: document.body.textContent?.slice(0, 6000) || '',
        };
      })();
    `).catch((debugError) => ({ error: String(debugError?.stack || debugError) }));
    console.error("PASS301_DEBUG", JSON.stringify(debug, null, 2).slice(0, 24000));
  }
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS301_TIMEOUT");
  cleanup();
  app.exit(1);
}, 120000);
