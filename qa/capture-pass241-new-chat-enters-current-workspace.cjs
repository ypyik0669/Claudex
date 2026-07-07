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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass241-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass241-bin-"));
const PROJECT_A_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass241-project-a-"));
const PROJECT_B_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass241-project-b-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_A_DIR, PROJECT_B_DIR]) {
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
if (args[0] === '--version') out('2.41.0 (Claude Code PASS241)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out({ plugins: [] });
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out({ servers: [] });
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else out('pass241 fake claude command: ' + args.join(' '));
`;
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(FAKE_CLAUDE, `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function writeInitialStore() {
  writeFakeClaude();
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_A_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_B_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_A_DIR, "package.json"), JSON.stringify({ name: "pass241-project-a" }), "utf8");
  fs.writeFileSync(path.join(PROJECT_B_DIR, "package.json"), JSON.stringify({ name: "pass241-project-b" }), "utf8");
  const createdAt = "2026-07-08T04:10:00.000Z";
  const projectA = { name: "pass241-project-a", path: PROJECT_A_DIR };
  const projectB = { name: "pass241-project-b", path: PROJECT_B_DIR };
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
    activeProject: projectB,
    projects: [projectB, projectA],
    sessions: [
      {
        id: "pass241-archived-b",
        title: "PASS241 archived B thread",
        project: projectB.name,
        projectPath: projectB.path,
        createdAt,
        updatedAt: "2026-07-08T04:10:01.000Z",
        archived: true,
        archivedAt: "2026-07-08T04:10:02.000Z",
        messages: [{ role: "user", content: "PASS241 archived B message must leave the workspace", createdAt }],
      },
      {
        id: "pass241-thread-a",
        title: "PASS241 project A thread",
        project: projectA.name,
        projectPath: projectA.path,
        createdAt,
        updatedAt: "2026-07-08T04:10:03.000Z",
        archived: false,
        messages: [{ role: "user", content: "PASS241 project A message must not leak", createdAt }],
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

async function debugState(win) {
  return win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop?.getState?.().catch(() => null);
      return {
        activeProject: state?.activeProject,
        sessions: state?.sessions?.map((session) => ({
          id: session.id,
          title: session.title,
          projectPath: session.projectPath,
          archived: Boolean(session.archived),
          messageCount: (session.messages || []).length,
        })),
        activeScope: document.querySelector('.chat-scope-toggle .active')?.getAttribute('data-thread-scope') || '',
        settingsOpen: Boolean(document.querySelector('.settings-surface')),
        activeThread: document.querySelector('.thread-item.active')?.getAttribute('data-thread-id') || '',
        threadItems: Array.from(document.querySelectorAll('.thread-item')).map((item) => ({
          id: item.getAttribute('data-thread-id'),
          projectPath: item.getAttribute('data-thread-project-path'),
          archived: item.getAttribute('data-thread-archived'),
          messageCount: item.getAttribute('data-thread-message-count'),
          active: item.classList.contains('active'),
          text: item.textContent,
        })),
        emptyTitle: document.querySelector('.empty-state h1')?.textContent || '',
        body: document.body.textContent,
      };
    })();
  `).catch((error) => ({ error: String(error?.message || error) }));
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS241_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS241_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));

  assertStep("PASS241_OPEN_ARCHIVED_SCOPE", await win.webContents.executeJavaScript(`
    (async function() {
      document.querySelector('[data-thread-scope="archived"]')?.click();
      await new Promise((resolve) => setTimeout(resolve, 350));
      const activeThread = document.querySelector('.thread-item.active');
      return Boolean(
        document.querySelector('[data-thread-scope="archived"].active') &&
        activeThread?.getAttribute('data-thread-id') === 'pass241-archived-b' &&
        activeThread?.getAttribute('data-thread-archived') === 'true'
      );
    })();
  `));

  assertStep("PASS241_OPEN_SETTINGS_SURFACE", await win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 350));
      return Boolean(document.querySelector('.settings-surface'));
    })();
  `));

  assertStep("PASS241_CLICK_NEW_CHAT_FROM_SETTINGS", await win.webContents.executeJavaScript(`
    (async function() {
      document.querySelector('.nav-primary')?.click();
      await new Promise((resolve) => setTimeout(resolve, 500));
      return true;
    })();
  `));

  assertStep("PASS241_NEW_CHAT_ENTERS_CURRENT_WORKSPACE", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const draft = state.sessions?.find((session) =>
        session.projectPath === ${JSON.stringify(PROJECT_B_DIR)} &&
        !session.archived &&
        (session.messages || []).length === 0 &&
        session.title === '新聊天'
      );
      const activeThread = document.querySelector('.thread-item.active');
      const body = document.body.textContent || '';
      return Boolean(
        state.activeProject?.path === ${JSON.stringify(PROJECT_B_DIR)} &&
        draft &&
        document.querySelector('[data-thread-scope="current"].active') &&
        !document.querySelector('.settings-surface') &&
        activeThread?.getAttribute('data-thread-id') === draft.id &&
        activeThread?.getAttribute('data-thread-project-path') === ${JSON.stringify(PROJECT_B_DIR)} &&
        activeThread?.getAttribute('data-thread-archived') === 'false' &&
        activeThread?.getAttribute('data-thread-message-count') === '0' &&
        /今天要做什么/.test(document.querySelector('.empty-state h1')?.textContent || '') &&
        !/PASS241 archived B message must leave the workspace/.test(body) &&
        !/PASS241 project A message must not leak/.test(body)
      );
    })();
  `, 12000));

  console.log("PASS241_NEW_CHAT_ENTERS_CURRENT_WORKSPACE_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS241_FAILED", error?.stack || error);
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    const debug = await debugState(win);
    console.error("PASS241_DEBUG", JSON.stringify(debug, null, 2).slice(0, 12000));
  }
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS241_TIMEOUT");
  cleanup();
  app.exit(1);
}, 120000);
