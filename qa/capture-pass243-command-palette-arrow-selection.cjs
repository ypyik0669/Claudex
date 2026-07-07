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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass243-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass243-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass243-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");

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
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value) + '\\n'); }
if (args[0] === '--version') out('2.43.0 (Claude Code PASS243)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out({ plugins: [] });
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out({ servers: [] });
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else out('pass243 fake claude command: ' + args.join(' '));
`;
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(FAKE_CLAUDE, `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function writeInitialStore() {
  writeFakeClaude();
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass243-project" }), "utf8");
  const createdAt = "2026-07-08T04:50:00.000Z";
  const project = { name: "pass243-project", path: PROJECT_DIR };
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
      systemPrompt: "QA",
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
        id: "pass243-thread",
        title: "PASS243 active thread",
        project: project.name,
        projectPath: project.path,
        createdAt,
        updatedAt: "2026-07-08T04:50:01.000Z",
        archived: false,
        messages: [{ role: "user", content: "PASS243 command palette keyboard thread", createdAt }],
      },
    ],
    commandRuns: [],
    runEvents: [],
    automations: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [
      {
        id: "pass243-notice",
        level: "error",
        source: "qa",
        title: "PASS243 notice center target",
        detail: "PASS243 notice detail",
        createdAt,
      },
    ],
  });
}

async function debugState(win) {
  return win.webContents.executeJavaScript(`
    (async function() {
      return {
        commandOpen: Boolean(document.querySelector('.command-modal')),
        commandIds: Array.from(document.querySelectorAll('.command-modal [data-command-id]')).map((item) => ({
          id: item.getAttribute('data-command-id'),
          active: item.getAttribute('data-command-active'),
          selected: item.getAttribute('aria-selected'),
          className: item.className,
        })).slice(0, 12),
        activeId: document.querySelector('.command-modal [data-command-active="true"]')?.getAttribute('data-command-id') || '',
        activeScope: document.querySelector('.chat-scope-toggle .active')?.getAttribute('data-thread-scope') || '',
        bottomActive: document.querySelector('.bottom-panel-tabs [aria-selected="true"]')?.getAttribute('data-bottom-tab') || '',
        body: document.body.textContent,
      };
    })();
  `).catch((error) => ({ error: String(error?.message || error) }));
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS243_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS243_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));

  assertStep("PASS243_OPEN_COMMAND_PALETTE", await win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 350));
      return Boolean(document.querySelector('.command-modal .command-search input'));
    })();
  `));

  assertStep("PASS243_FILTER_THREAD_SCOPE_COMMANDS", await win.webContents.executeJavaScript(`
    (async function() {
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'threads-');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 180));
      const ids = Array.from(document.querySelectorAll('.command-modal [data-command-id]')).map((item) => item.getAttribute('data-command-id'));
      return ids[0] === 'threads-current' && ids[1] === 'threads-all';
    })();
  `));

  assertStep("PASS243_ARROW_SELECTS_SECOND_COMMAND", await win.webContents.executeJavaScript(`
    (async function() {
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 180));
      const active = document.querySelector('.command-modal [data-command-active="true"]');
      return Boolean(
        active?.getAttribute('data-command-id') === 'threads-all' &&
        active?.getAttribute('aria-selected') === 'true' &&
        active.classList.contains('active')
      );
    })();
  `));

  assertStep("PASS243_ENTER_RUNS_SELECTED_COMMAND", await waitFor(win, `
    (async function() {
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 350));
      return Boolean(
        !document.querySelector('.command-modal') &&
        document.querySelector('[data-thread-scope="all"].active')
      );
    })();
  `, 12000));

  console.log("PASS243_COMMAND_PALETTE_ARROW_SELECTION_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS243_FAILED", error?.stack || error);
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    const debug = await debugState(win);
    console.error("PASS243_DEBUG", JSON.stringify(debug, null, 2).slice(0, 12000));
  }
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS243_TIMEOUT");
  cleanup();
  app.exit(1);
}, 120000);
