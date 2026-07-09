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
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass89-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass89-bin-"));
const PROJECT_A = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass89-project-a-"));
const PROJECT_B = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass89-project-b-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_A, PROJECT_B]) {
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

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
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
if (args[0] === '--version') out('2.9.0 (pass89 fake)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else out({ type: 'result', result: 'pass89 fake response', session_id: 'pass89-session' });
`;
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
  return path.join(FAKE_BIN_DIR, "claude.cmd");
}

function isIso(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));
}

function writeInitialStore(claudeCommand) {
  fs.mkdirSync(PROJECT_A, { recursive: true });
  fs.mkdirSync(PROJECT_B, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_A, "package.json"), JSON.stringify({ name: "pass89-project-a" }), "utf8");
  fs.writeFileSync(path.join(PROJECT_B, "package.json"), JSON.stringify({ name: "pass89-project-b" }), "utf8");
  writeJson(DATA_FILE, {
    version: 1,
    activeProject: { name: "Project A", path: PROJECT_A },
    projects: [
      { name: "Project A", path: PROJECT_A },
      { name: "Project B", path: PROJECT_B },
    ],
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
    sessions: [
      {
        id: "pass89-b",
        title: "Pass89 B thread",
        project: "Project B",
        projectPath: PROJECT_B,
        createdAt: "2026-07-06T00:00:00.000Z",
        updatedAt: "2026-07-06T00:09:00.000Z",
        messages: [{ role: "user", content: "pass89 project b context", createdAt: "2026-07-06T00:00:00.000Z" }],
      },
      {
        id: "pass89-a",
        title: "Pass89 A thread",
        project: "Project A",
        projectPath: PROJECT_A,
        claudeSessionId: "pass89-source-session",
        createdAt: "2026-07-06T00:01:00.000Z",
        updatedAt: "2026-07-06T00:10:00.000Z",
        messages: [
          { role: "user", content: "pass89 project a context", createdAt: "2026-07-06T00:01:00.000Z" },
          { role: "assistant", content: "pass89 answer", createdAt: "2026-07-06T00:02:00.000Z" },
        ],
      },
    ],
    commandRuns: [],
    runEvents: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
    automations: [],
    subagentRuns: [],
  });
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS89_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS89_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));

  assertStep("PASS89_STABLE_THREAD_PROJECT_SCOPE_HOOKS", await win.webContents.executeJavaScript(`
    (function() {
      const row = document.querySelector('.thread-item[data-thread-id="pass89-a"]');
      const scope = document.querySelector('.chat-scope-toggle button[data-thread-scope="current"]');
      const all = document.querySelector('.chat-scope-toggle button[data-thread-scope="all"]');
      const archived = document.querySelector('.chat-scope-toggle button[data-thread-scope="archived"]');
      const project = Array.from(document.querySelectorAll('.project-list button[data-project-path]'))
        .find((button) => button.dataset.projectPath === ${JSON.stringify(PROJECT_A)});
      return Boolean(row &&
        row.dataset.threadProjectPath === ${JSON.stringify(PROJECT_A)} &&
        row.dataset.threadPinned === 'false' &&
        row.dataset.threadArchived === 'false' &&
        scope && all && archived && project);
    })();
  `));

  assertStep("PASS89_STABLE_THREAD_ACTION_HOOKS", await win.webContents.executeJavaScript(`
    (function() {
      const row = document.querySelector('.thread-item[data-thread-id="pass89-a"]');
      return ['rename', 'pin', 'fork', 'archive', 'delete', 'resume']
        .every((action) => row?.querySelector('[data-thread-action="' + action + '"]'));
    })();
  `));

  assertStep("PASS89_RENAME_WRITES_AUDIT_METADATA", await waitFor(win, `
    (async function() {
      if (!window.__pass89RenameClicked) {
        window.__pass89RenameClicked = true;
        window.prompt = () => 'Pass89 renamed thread';
        document.querySelector('.thread-item[data-thread-id="pass89-a"] [data-thread-action="rename"]')?.click();
      }
      await new Promise((resolve) => setTimeout(resolve, 450));
      const state = await window.claudexDesktop.getState();
      const session = state.sessions.find((item) => item.id === 'pass89-a');
      const row = document.querySelector('.thread-item[data-thread-id="pass89-a"]');
      return Boolean(session &&
        session.title === 'Pass89 renamed thread' &&
        ${isIso.toString()}(session.renamedAt) &&
        /Pass89 renamed thread/.test(row?.textContent || ''));
    })();
  `, 10000));

  assertStep("PASS89_PIN_WRITES_AUDIT_METADATA_AND_DATASET", await waitFor(win, `
    (async function() {
      if (!window.__pass89PinClicked) {
        window.__pass89PinClicked = true;
        document.querySelector('.thread-item[data-thread-id="pass89-a"] [data-thread-action="pin"]')?.click();
      }
      await new Promise((resolve) => setTimeout(resolve, 450));
      const state = await window.claudexDesktop.getState();
      const session = state.sessions.find((item) => item.id === 'pass89-a');
      const row = document.querySelector('.thread-item[data-thread-id="pass89-a"]');
      return Boolean(session &&
        session.pinned === true &&
        ${isIso.toString()}(session.pinnedAt) &&
        row?.dataset.threadPinned === 'true' &&
        row.classList.contains('pinned-thread'));
    })();
  `, 10000));

  assertStep("PASS89_FORK_WRITES_SOURCE_AUDIT_METADATA", await waitFor(win, `
    (async function() {
      if (!window.__pass89ForkClicked) {
        window.__pass89ForkClicked = true;
        document.querySelector('.thread-item[data-thread-id="pass89-a"] [data-thread-action="fork"]')?.click();
      }
      await new Promise((resolve) => setTimeout(resolve, 550));
      const state = await window.claudexDesktop.getState();
      const fork = state.sessions.find((item) => item.id !== 'pass89-a' && item.forkedFromId === 'pass89-a');
      const forkRow = fork ? document.querySelector('.thread-item[data-thread-id="' + fork.id + '"]') : null;
      return Boolean(fork &&
        /^Fork: Pass89 renamed thread/.test(fork.title || '') &&
        fork.projectPath === ${JSON.stringify(PROJECT_A)} &&
        fork.messages?.length === 2 &&
        !fork.claudeSessionId &&
        fork.forkedFromClaudeSessionId === 'pass89-source-session' &&
        ${isIso.toString()}(fork.forkedAt) &&
        forkRow &&
        forkRow.dataset.threadProjectPath === ${JSON.stringify(PROJECT_A)});
    })();
  `, 10000));

  assertStep("PASS89_ARCHIVE_WRITES_AUDIT_METADATA_AND_FILTERS", await waitFor(win, `
    (async function() {
      if (!window.__pass89ArchiveClicked) {
        window.__pass89ArchiveClicked = true;
        document.querySelector('.thread-item[data-thread-id="pass89-a"] [data-thread-action="archive"]')?.click();
      }
      await new Promise((resolve) => setTimeout(resolve, 550));
      const state = await window.claudexDesktop.getState();
      const session = state.sessions.find((item) => item.id === 'pass89-a');
      return Boolean(session &&
        session.archived === true &&
        ${isIso.toString()}(session.archivedAt) &&
        !document.querySelector('.thread-item[data-thread-id="pass89-a"]'));
    })();
  `, 10000));

  assertStep("PASS89_ARCHIVED_SCOPE_RESTORE_CLEARS_ARCHIVED_AT", await waitFor(win, `
    (async function() {
      if (!window.__pass89ArchivedScopeClicked) {
        window.__pass89ArchivedScopeClicked = true;
        document.querySelector('.chat-scope-toggle button[data-thread-scope="archived"]')?.click();
      }
      await new Promise((resolve) => setTimeout(resolve, 350));
      const archivedRow = document.querySelector('.thread-item[data-thread-id="pass89-a"][data-thread-archived="true"]');
      if (!archivedRow) return false;
      if (!window.__pass89RestoreClicked) {
        window.__pass89RestoreClicked = true;
        archivedRow.querySelector('[data-thread-action="restore"]')?.click();
      }
      await new Promise((resolve) => setTimeout(resolve, 550));
      const state = await window.claudexDesktop.getState();
      const session = state.sessions.find((item) => item.id === 'pass89-a');
      return Boolean(session &&
        session.archived === false &&
        !session.archivedAt &&
        document.querySelector('.chat-scope-toggle button[data-thread-scope="current"].active'));
    })();
  `, 12000));

  assertStep("PASS89_PROJECT_SWITCH_USES_PROJECT_DATA_HOOK", await waitFor(win, `
    (async function() {
      if (!window.__pass89ProjectBClicked) {
        window.__pass89ProjectBClicked = true;
        const button = Array.from(document.querySelectorAll('.project-list button[data-project-path]'))
          .find((candidate) => candidate.dataset.projectPath === ${JSON.stringify(PROJECT_B)});
        if (!button) return false;
        button.click();
      }
      await new Promise((resolve) => setTimeout(resolve, 550));
      const state = await window.claudexDesktop.getState();
      const list = document.querySelector('.thread-list')?.textContent || '';
      const row = document.querySelector('.thread-item[data-thread-id="pass89-b"]');
      return Boolean(state.activeProject?.path === ${JSON.stringify(PROJECT_B)} &&
        row &&
        row.dataset.threadProjectPath === ${JSON.stringify(PROJECT_B)} &&
        /Pass89 B thread/.test(list) &&
        !/Pass89 renamed thread/.test(list));
    })();
  `, 10000));

  assertStep("PASS89_STORE_PERSISTED_AUDIT_METADATA", (() => {
    const parsed = readJson(DATA_FILE);
    const renamed = parsed.sessions?.find((item) => item.id === "pass89-a");
    const fork = parsed.sessions?.find((item) => item.forkedFromId === "pass89-a");
    return Boolean(parsed.activeProject?.path === PROJECT_B &&
      renamed?.title === "Pass89 renamed thread" &&
      renamed?.pinned === true &&
      isIso(renamed?.renamedAt) &&
      isIso(renamed?.pinnedAt) &&
      !renamed?.archived &&
      !renamed?.archivedAt &&
      fork?.forkedFromId === "pass89-a" &&
      fork?.forkedFromClaudeSessionId === "pass89-source-session" &&
      !fork?.claudeSessionId &&
      isIso(fork?.forkedAt));
  })());

  console.log("PASS89_THREAD_LIFECYCLE_AUDIT_HOOKS_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore(writeFakeClaude());
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS89_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});
