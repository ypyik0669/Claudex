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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass240-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass240-bin-"));
const PROJECT_A_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass240-project-a-"));
const PROJECT_B_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass240-project-b-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const PASS240_PROMPT = "PASS240 start a new project B thread from empty composer";
const PASS240_REPLY = "PASS240 fake Claude reply from project B";

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
if (args[0] === '--version') out('2.40.0 (Claude Code PASS240)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out({ plugins: [] });
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out({ servers: [] });
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else if (args.includes('--output-format') && args.includes('stream-json')) {
  out({ type: 'assistant', message: { content: [{ type: 'text', text: 'PASS240 streaming partial' }] } });
  out({ type: 'result', result: ${JSON.stringify(PASS240_REPLY)}, session_id: 'pass240-claude-session' });
} else {
  out('pass240 fake claude command: ' + args.join(' '));
}
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
  fs.writeFileSync(path.join(PROJECT_A_DIR, "package.json"), JSON.stringify({ name: "pass240-project-a" }), "utf8");
  fs.writeFileSync(path.join(PROJECT_B_DIR, "package.json"), JSON.stringify({ name: "pass240-project-b" }), "utf8");
  const createdAt = "2026-07-08T03:40:00.000Z";
  const projectA = { name: "pass240-project-a", path: PROJECT_A_DIR };
  const projectB = { name: "pass240-project-b", path: PROJECT_B_DIR };
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
        id: "pass240-thread-a",
        title: "PASS240 Project A hidden thread",
        project: projectA.name,
        projectPath: projectA.path,
        createdAt,
        updatedAt: "2026-07-08T03:40:01.000Z",
        messages: [{ role: "user", content: "PASS240 project A hidden message must not leak", createdAt }],
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
  if (!win) throw new Error("PASS240_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS240_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS240_INITIAL_EMPTY_PROJECT", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const body = document.body.textContent || '';
      return Boolean(
        state.activeProject?.path === ${JSON.stringify(PROJECT_B_DIR)} &&
        document.querySelector('[data-thread-scope="current"].active') &&
        !document.querySelector('.thread-item') &&
        /没有选择聊天/.test(document.querySelector('.empty-state h1')?.textContent || '') &&
        !/${PASS240_PROMPT}/.test(body) &&
        !/PASS240 Project A hidden thread/.test(body)
      );
    })();
  `, 12000));

  assertStep("PASS240_SEND_FROM_EMPTY_COMPOSER", await win.webContents.executeJavaScript(`
    (async function() {
      const textarea = document.querySelector('.prompt-box textarea');
      const button = document.querySelector('.prompt-box .send-button');
      if (!textarea || !button) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(textarea, ${JSON.stringify(PASS240_PROMPT)});
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 180));
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 500));
      return true;
    })();
  `));

  assertStep("PASS240_EMPTY_COMPOSER_CREATED_PROJECT_THREAD", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const created = state.sessions?.find((session) =>
        session.projectPath === ${JSON.stringify(PROJECT_B_DIR)} &&
        (session.messages || []).some((message) => message.role === 'user' && message.content === ${JSON.stringify(PASS240_PROMPT)})
      );
      const body = document.body.textContent || '';
      const activeThread = document.querySelector('.thread-item.active');
      return Boolean(
        state.activeProject?.path === ${JSON.stringify(PROJECT_B_DIR)} &&
        created &&
        created.id &&
        created.claudeSessionId === 'pass240-claude-session' &&
        (created.messages || []).some((message) => message.role === 'assistant' && message.content === ${JSON.stringify(PASS240_REPLY)}) &&
        document.querySelector('[data-thread-scope="current"].active') &&
        activeThread?.getAttribute('data-thread-id') === created.id &&
        activeThread?.getAttribute('data-thread-project-path') === ${JSON.stringify(PROJECT_B_DIR)} &&
        /${PASS240_PROMPT}/.test(body) &&
        /${PASS240_REPLY}/.test(body) &&
        !/PASS240 Project A hidden thread/.test(body) &&
        !/PASS240 project A hidden message must not leak/.test(body)
      );
    })();
  `, 20000));

  console.log("PASS240_EMPTY_PROJECT_COMPOSER_CREATES_THREAD_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS240_FAILED", error?.stack || error);
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
              claudeSessionId: session.claudeSessionId,
              messages: session.messages,
            })),
            activeScope: document.querySelector('.chat-scope-toggle .active')?.getAttribute('data-thread-scope') || '',
            activeThread: document.querySelector('.thread-item.active')?.getAttribute('data-thread-id') || '',
            threadItems: Array.from(document.querySelectorAll('.thread-item')).map((item) => ({
              id: item.getAttribute('data-thread-id'),
              projectPath: item.getAttribute('data-thread-project-path'),
              active: item.classList.contains('active'),
              text: item.textContent,
            })),
            emptyTitle: document.querySelector('.empty-state h1')?.textContent || '',
            body: document.body.textContent,
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS240_DEBUG", JSON.stringify(debug, null, 2).slice(0, 12000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS240_TIMEOUT");
  cleanup();
  app.exit(1);
}, 120000);
