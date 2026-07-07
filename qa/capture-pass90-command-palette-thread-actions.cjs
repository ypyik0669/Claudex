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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass90-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass90-bin-"));
const PROJECT_A = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass90-project-a-"));
const PROJECT_B = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass90-project-b-"));
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
if (args[0] === '--version') out('2.9.0 (pass90 fake)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else out({ type: 'result', result: 'pass90 fake response', session_id: 'pass90-session' });
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
  fs.writeFileSync(path.join(PROJECT_A, "package.json"), JSON.stringify({ name: "pass90-project-a" }), "utf8");
  fs.writeFileSync(path.join(PROJECT_B, "package.json"), JSON.stringify({ name: "pass90-project-b" }), "utf8");
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
        id: "pass90-b",
        title: "Pass90 B thread",
        project: "Project B",
        projectPath: PROJECT_B,
        createdAt: "2026-07-06T00:00:00.000Z",
        updatedAt: "2026-07-06T00:09:00.000Z",
        messages: [{ role: "user", content: "pass90 project b context", createdAt: "2026-07-06T00:00:00.000Z" }],
      },
      {
        id: "pass90-a",
        title: "Pass90 A thread",
        project: "Project A",
        projectPath: PROJECT_A,
        claudeSessionId: "pass90-source-session",
        createdAt: "2026-07-06T00:01:00.000Z",
        updatedAt: "2026-07-06T00:10:00.000Z",
        messages: [
          { role: "user", content: "pass90 project a context", createdAt: "2026-07-06T00:01:00.000Z" },
          { role: "assistant", content: "pass90 answer", createdAt: "2026-07-06T00:02:00.000Z" },
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

async function firstPaletteCommand(win, query) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return null;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 160));
      const button = document.querySelector('.command-modal .command-list button');
      const result = button ? {
        id: button.dataset.commandId || '',
        text: button.textContent || '',
        target: button.dataset.commandTarget || '',
        action: button.dataset.commandThreadAction || '',
        sessionId: button.dataset.commandThreadId || '',
      } : null;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return result;
    })();
  `);
}

async function runPaletteCommand(win, query, commandId = "") {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 160));
      const id = ${JSON.stringify(commandId)};
      const buttons = [...document.querySelectorAll('.command-modal .command-list button')];
      const button = id ? buttons.find((candidate) => (candidate.dataset.commandId || '') === id) : buttons[0];
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function clickThreadAction(win, sessionId, action, beforeClick = "") {
  return win.webContents.executeJavaScript(`
    (async function() {
      const button = document.querySelector('.thread-item[data-thread-id="${sessionId}"] [data-thread-action="${action}"]');
      if (!button) return false;
      ${beforeClick}
      button.click();
      return true;
    })();
  `);
}

function focusedThreadActionScript(sessionId, action, extraStateCheck = "true") {
  return `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const row = document.querySelector('.thread-item[data-thread-id="${sessionId}"]');
      const button = row?.querySelector('[data-thread-action="${action}"]');
      return Boolean(
        row &&
        button &&
        button.dataset.threadActionFocused === 'true' &&
        document.activeElement === button &&
        (${extraStateCheck})
      );
    })();
  `;
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS90_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS90_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));

  const pinCommand = await firstPaletteCommand(win, "pin Pass90 A thread");
  assertStep("PASS90_PIN_COMMAND_SEARCHABLE", Boolean(
    pinCommand?.id === "thread-action:pin:pass90-a" &&
    pinCommand.target === "thread-action" &&
    pinCommand.action === "pin" &&
    pinCommand.sessionId === "pass90-a" &&
    /Pass90 A thread/.test(pinCommand.text)
  ));

  assertStep("PASS90_PIN_PALETTE_FOCUSES_REAL_CONTROL", await runPaletteCommand(win, "pin Pass90 A thread", "thread-action:pin:pass90-a"));
  assertStep("PASS90_PIN_FOCUS_HAS_NO_MUTATION", await waitFor(win, focusedThreadActionScript(
    "pass90-a",
    "pin",
    "state.sessions.find((item) => item.id === 'pass90-a')?.pinned === false && !state.sessions.find((item) => item.id === 'pass90-a')?.pinnedAt && (!state.commandRuns || state.commandRuns.length === 0)"
  ), 10000));
  assertStep("PASS90_PIN_REAL_BUTTON_WRITES_LOCAL_STATE", await clickThreadAction(win, "pass90-a", "pin"));
  assertStep("PASS90_PIN_WRITES_LOCAL_STATE", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const session = state.sessions.find((item) => item.id === 'pass90-a');
      const row = document.querySelector('.thread-item[data-thread-id="pass90-a"]');
      return Boolean(session &&
        session.pinned === true &&
        ${isIso.toString()}(session.pinnedAt) &&
        row?.dataset.threadPinned === 'true');
    })();
  `, 10000));

  const renameCommand = await firstPaletteCommand(win, "rename Pass90 A thread");
  assertStep("PASS90_RENAME_COMMAND_SEARCHABLE", Boolean(renameCommand?.id === "thread-action:rename:pass90-a" && /Pass90 A thread/.test(renameCommand.text)));

  assertStep("PASS90_RENAME_PALETTE_FOCUSES_REAL_CONTROL", await runPaletteCommand(win, "rename Pass90 A thread", "thread-action:rename:pass90-a"));
  assertStep("PASS90_RENAME_FOCUS_HAS_NO_MUTATION", await waitFor(win, focusedThreadActionScript(
    "pass90-a",
    "rename",
    "state.sessions.find((item) => item.id === 'pass90-a')?.title === 'Pass90 A thread' && !state.sessions.find((item) => item.id === 'pass90-a')?.renamedAt"
  ), 10000));
  assertStep("PASS90_RENAME_REAL_BUTTON_WRITES_LOCAL_STATE", await clickThreadAction(win, "pass90-a", "rename", "window.prompt = () => 'Pass90 renamed thread';"));
  assertStep("PASS90_RENAME_WRITES_LOCAL_STATE", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const session = state.sessions.find((item) => item.id === 'pass90-a');
      const row = document.querySelector('.thread-item[data-thread-id="pass90-a"]');
      return Boolean(session &&
        session.title === 'Pass90 renamed thread' &&
        ${isIso.toString()}(session.renamedAt) &&
        /Pass90 renamed thread/.test(row?.textContent || ''));
    })();
  `, 10000));

  assertStep("PASS90_FORK_PALETTE_FOCUSES_REAL_CONTROL", await runPaletteCommand(win, "fork Pass90 renamed thread", "thread-action:fork:pass90-a"));
  assertStep("PASS90_FORK_FOCUS_HAS_NO_MUTATION", await waitFor(win, focusedThreadActionScript(
    "pass90-a",
    "fork",
    "!state.sessions.some((item) => item.id !== 'pass90-a' && item.forkedFromId === 'pass90-a')"
  ), 10000));
  assertStep("PASS90_FORK_REAL_BUTTON_WRITES_SOURCE_METADATA", await clickThreadAction(win, "pass90-a", "fork"));
  assertStep("PASS90_FORK_WRITES_SOURCE_METADATA", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const fork = state.sessions.find((item) => item.id !== 'pass90-a' && item.forkedFromId === 'pass90-a');
      const forkRow = fork ? document.querySelector('.thread-item[data-thread-id="' + fork.id + '"]') : null;
      return Boolean(fork &&
        /^Fork: Pass90 renamed thread/.test(fork.title || '') &&
        fork.projectPath === ${JSON.stringify(PROJECT_A)} &&
        !fork.claudeSessionId &&
        fork.forkedFromClaudeSessionId === 'pass90-source-session' &&
        ${isIso.toString()}(fork.forkedAt) &&
        forkRow);
    })();
  `, 10000));

  assertStep("PASS90_ARCHIVE_PALETTE_FOCUSES_REAL_CONTROL", await runPaletteCommand(win, "archive Pass90 renamed thread", "thread-action:archive:pass90-a"));
  assertStep("PASS90_ARCHIVE_FOCUS_HAS_NO_MUTATION", await waitFor(win, focusedThreadActionScript(
    "pass90-a",
    "archive",
    "state.sessions.find((item) => item.id === 'pass90-a')?.archived !== true && !state.sessions.find((item) => item.id === 'pass90-a')?.archivedAt"
  ), 10000));
  assertStep("PASS90_ARCHIVE_REAL_BUTTON_FILTERS_CURRENT_SCOPE", await clickThreadAction(win, "pass90-a", "archive"));
  assertStep("PASS90_ARCHIVE_FILTERS_CURRENT_SCOPE", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const session = state.sessions.find((item) => item.id === 'pass90-a');
      return Boolean(session &&
        session.archived === true &&
        ${isIso.toString()}(session.archivedAt) &&
        !document.querySelector('.thread-item[data-thread-id="pass90-a"]'));
    })();
  `, 10000));

  const restoreCommand = await firstPaletteCommand(win, "restore Pass90 renamed thread");
  assertStep("PASS90_RESTORE_COMMAND_SEARCHABLE", Boolean(restoreCommand?.id === "thread-action:restore:pass90-a" && /Pass90 renamed thread/.test(restoreCommand.text)));

  assertStep("PASS90_RESTORE_PALETTE_FOCUSES_REAL_CONTROL", await runPaletteCommand(win, "restore Pass90 renamed thread", "thread-action:restore:pass90-a"));
  assertStep("PASS90_RESTORE_FOCUS_HAS_NO_MUTATION", await waitFor(win, focusedThreadActionScript(
    "pass90-a",
    "restore",
    "state.sessions.find((item) => item.id === 'pass90-a')?.archived === true"
  ), 10000));
  assertStep("PASS90_RESTORE_REAL_BUTTON_CLEARS_ARCHIVED_STATE", await clickThreadAction(win, "pass90-a", "restore"));
  assertStep("PASS90_RESTORE_CLEARS_ARCHIVED_STATE", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const session = state.sessions.find((item) => item.id === 'pass90-a');
      const row = document.querySelector('.thread-item[data-thread-id="pass90-a"]');
      return Boolean(session &&
        session.archived === false &&
        !session.archivedAt &&
        row?.dataset.threadArchived === 'false');
    })();
  `, 10000));

  const forkId = await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      const fork = state.sessions.find((item) => item.id !== 'pass90-a' && item.forkedFromId === 'pass90-a');
      return fork?.id || '';
    })();
  `);
  assertStep("PASS90_FORK_ID_AVAILABLE", Boolean(forkId));

  assertStep("PASS90_DELETE_PALETTE_FOCUSES_REAL_CONTROL", await runPaletteCommand(win, "delete Fork: Pass90 renamed thread", `thread-action:delete:${encodeURIComponent(forkId)}`));
  assertStep("PASS90_DELETE_FOCUS_HAS_NO_MUTATION", await waitFor(win, focusedThreadActionScript(
    forkId,
    "delete",
    `state.sessions.some((item) => item.id === '${forkId}')`
  ), 10000));
  assertStep("PASS90_DELETE_REAL_BUTTON_CANCEL_PRESERVES_THREAD", await clickThreadAction(win, forkId, "delete", "window.confirm = () => false;"));
  assertStep("PASS90_DELETE_CANCEL_PRESERVES_THREAD", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      return Boolean(state.sessions.some((item) => item.id === ${JSON.stringify(forkId)}) && document.querySelector('.thread-item[data-thread-id="${forkId}"]'));
    })();
  `, 10000));

  assertStep("PASS90_RESUME_PALETTE_FOCUSES_REAL_CONTROL", await runPaletteCommand(win, "resume Pass90 renamed thread", "thread-action:resume:pass90-a"));
  assertStep("PASS90_RESUME_FOCUS_HAS_NO_COMMAND_RUN", await waitFor(win, focusedThreadActionScript(
    "pass90-a",
    "resume",
    "(!state.commandRuns || state.commandRuns.length === 0)"
  ), 10000));

  assertStep("PASS90_STORE_PERSISTED_THREAD_ACTIONS", (() => {
    const parsed = readJson(DATA_FILE);
    const renamed = parsed.sessions?.find((item) => item.id === "pass90-a");
    const fork = parsed.sessions?.find((item) => item.forkedFromId === "pass90-a");
    return Boolean(renamed?.title === "Pass90 renamed thread" &&
      renamed?.pinned === true &&
      isIso(renamed?.renamedAt) &&
      isIso(renamed?.pinnedAt) &&
      renamed?.archived === false &&
      !renamed?.archivedAt &&
      fork?.forkedFromId === "pass90-a" &&
      fork?.forkedFromClaudeSessionId === "pass90-source-session" &&
      !fork?.claudeSessionId &&
      isIso(fork?.forkedAt) &&
      (!parsed.commandRuns || parsed.commandRuns.length === 0));
  })());

  console.log("PASS90_COMMAND_PALETTE_THREAD_ACTION_FOCUS_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore(writeFakeClaude());
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS90_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS90_TIMEOUT");
  cleanup();
  app.exit(1);
}, 80000);
