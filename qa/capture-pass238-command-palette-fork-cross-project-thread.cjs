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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass238-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass238-bin-"));
const PROJECT_A_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass238-project-a-"));
const PROJECT_B_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass238-project-b-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const FORK_COMMAND_ID = "thread-action:fork:pass238-thread-a";

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
if (args[0] === '--version') out('2.38.0 (Claude Code PASS238)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out({ plugins: [] });
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out({ servers: [] });
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else out('pass238 fake claude command: ' + args.join(' '));
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
  fs.writeFileSync(path.join(PROJECT_A_DIR, "package.json"), JSON.stringify({ name: "pass238-project-a" }), "utf8");
  fs.writeFileSync(path.join(PROJECT_B_DIR, "package.json"), JSON.stringify({ name: "pass238-project-b" }), "utf8");
  const createdAt = "2026-07-08T03:38:00.000Z";
  const projectA = { name: "pass238-project-a", path: PROJECT_A_DIR };
  const projectB = { name: "pass238-project-b", path: PROJECT_B_DIR };
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
        id: "pass238-thread-b",
        title: "PASS238 Project B active thread",
        project: projectB.name,
        projectPath: projectB.path,
        createdAt,
        updatedAt: "2026-07-08T03:38:02.000Z",
        messages: [{ role: "user", content: "PASS238 project B current message", createdAt }],
      },
      {
        id: "pass238-thread-a",
        title: "PASS238 Project A source thread",
        project: projectA.name,
        projectPath: projectA.path,
        claudeSessionId: "pass238-source-claude-session",
        createdAt,
        updatedAt: "2026-07-08T03:38:01.000Z",
        messages: [
          { role: "user", content: "PASS238 project A source message", createdAt },
          { role: "assistant", content: "PASS238 project A source answer", createdAt: "2026-07-08T03:38:01.500Z" },
        ],
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

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS238_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS238_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS238_INITIAL_PROJECT_B_SCOPE", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      return Boolean(
        state.settings?.model === 'claude-haiku-4-5-20251001' &&
        state.activeProject?.path === ${JSON.stringify(PROJECT_B_DIR)} &&
        document.querySelector('[data-thread-scope="current"].active') &&
        document.querySelector('.thread-item.active[data-thread-id="pass238-thread-b"]') &&
        !document.querySelector('.thread-item[data-thread-id="pass238-thread-a"]')
      );
    })();
  `, 12000));

  assertStep("PASS238_OPEN_PALETTE_FORK_COMMAND", await win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'fork PASS238 Project A source thread');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 260));
      const button = document.querySelector(${JSON.stringify(`.command-modal .command-list button[data-command-id="${FORK_COMMAND_ID}"]`)});
      if (!button) return false;
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 900));
      return true;
    })();
  `));

  assertStep("PASS238_PALETTE_FORK_FOCUSES_REAL_BUTTON_ONLY", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const activeThread = document.querySelector('.thread-item.active');
      const forkButton = document.querySelector('.thread-item[data-thread-id="pass238-thread-a"] [data-thread-action="fork"]');
      const source = state.sessions?.find((session) => session.id === 'pass238-thread-a');
      const body = document.body.textContent || '';
      return Boolean(
        state.activeProject?.path === ${JSON.stringify(PROJECT_A_DIR)} &&
        source?.claudeSessionId === 'pass238-source-claude-session' &&
        !state.sessions?.some((session) => session.forkedFromId === 'pass238-thread-a') &&
        document.querySelector('[data-thread-scope="current"].active') &&
        activeThread?.getAttribute('data-thread-id') === 'pass238-thread-a' &&
        activeThread?.getAttribute('data-thread-project-path') === ${JSON.stringify(PROJECT_A_DIR)} &&
        forkButton?.getAttribute('data-thread-action-focused') === 'true' &&
        document.activeElement === forkButton &&
        !document.querySelector('.thread-item[data-thread-id="pass238-thread-b"]') &&
        /PASS238 project A source message/.test(body) &&
        /PASS238 project A source answer/.test(body) &&
        !(state.runEvents || []).some((event) => event.type === 'thread-action') &&
        !(state.commandRuns || []).length
      );
    })();
  `, 12000));

  assertStep("PASS238_REAL_FORK_BUTTON_MUTATES_THREAD", await win.webContents.executeJavaScript(`
    (async function() {
      const forkButton = document.querySelector('.thread-item[data-thread-id="pass238-thread-a"] [data-thread-action="fork"]');
      if (!forkButton) return false;
      forkButton.click();
      await new Promise((resolve) => setTimeout(resolve, 800));
      return true;
    })();
  `));

  assertStep("PASS238_FORK_SELECTS_NEW_PROJECT_THREAD", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const fork = state.sessions?.find((session) =>
        session.forkedFromId === 'pass238-thread-a' &&
        session.projectPath === ${JSON.stringify(PROJECT_A_DIR)}
      );
      const activeThread = document.querySelector('.thread-item.active');
      const event = state.runEvents?.find((item) =>
        item.type === 'thread-action' &&
        item.sessionId === 'pass238-thread-a' &&
        /action=fork/.test(item.stdout || '') &&
        fork?.id &&
        (item.stdout || '').includes(fork.id)
      );
      const body = document.body.textContent || '';
      return Boolean(
        state.activeProject?.path === ${JSON.stringify(PROJECT_A_DIR)} &&
        fork &&
        fork.archived === false &&
        fork.pinned === false &&
        fork.claudeSessionId === '' &&
        fork.forkedFromClaudeSessionId === 'pass238-source-claude-session' &&
        Array.isArray(fork.messages) &&
        fork.messages.length === 2 &&
        document.querySelector('[data-thread-scope="current"].active') &&
        activeThread?.getAttribute('data-thread-id') === fork.id &&
        activeThread?.getAttribute('data-thread-project-path') === ${JSON.stringify(PROJECT_A_DIR)} &&
        !document.querySelector('.thread-item[data-thread-id="pass238-thread-b"]') &&
        /Fork: PASS238 Project A source thread/.test(body) &&
        /PASS238 project A source message/.test(body) &&
        /PASS238 project A source answer/.test(body) &&
        event
      );
    })();
  `, 12000));

  console.log("PASS238_COMMAND_PALETTE_FORK_CROSS_PROJECT_THREAD_FOCUS_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS238_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (async function() {
          const state = await window.claudexDesktop?.getState?.().catch(() => null);
          return {
            activeProject: state?.activeProject,
            sessions: state?.sessions?.map((session) => ({
              id: session.id,
              title: session.title,
              projectPath: session.projectPath,
              forkedFromId: session.forkedFromId,
              forkedFromClaudeSessionId: session.forkedFromClaudeSessionId,
              claudeSessionId: session.claudeSessionId,
              archived: session.archived,
            })),
            activeScope: document.querySelector('.chat-scope-toggle .active')?.getAttribute('data-thread-scope') || '',
            activeThread: document.querySelector('.thread-item.active')?.getAttribute('data-thread-id') || '',
            threads: Array.from(document.querySelectorAll('.thread-item')).map((item) => ({
              id: item.getAttribute('data-thread-id'),
              projectPath: item.getAttribute('data-thread-project-path'),
              active: item.classList.contains('active'),
              text: item.textContent,
            })),
            commandModal: document.querySelector('.command-modal')?.textContent || '',
            body: document.body.textContent,
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS238_DEBUG", JSON.stringify(debug, null, 2).slice(0, 12000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS238_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
