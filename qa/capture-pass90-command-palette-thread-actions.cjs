const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
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
      const result = button ? { id: button.dataset.commandId || '', text: button.textContent || '' } : null;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return result;
    })();
  `);
}

async function runPaletteCommand(win, query, beforeClick = "") {
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
      const button = document.querySelector('.command-modal .command-list button');
      if (!button) return false;
      ${beforeClick}
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS90_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS90_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));

  const pinCommand = await firstPaletteCommand(win, "pin Pass90 A thread");
  assertStep("PASS90_PIN_COMMAND_SEARCHABLE", Boolean(pinCommand?.id === "thread-action:pin:pass90-a" && /Pass90 A thread/.test(pinCommand.text)));

  assertStep("PASS90_PIN_FROM_PALETTE", await runPaletteCommand(win, "pin Pass90 A thread"));
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

  assertStep("PASS90_RENAME_FROM_PALETTE", await runPaletteCommand(win, "rename Pass90 A thread", "window.prompt = () => 'Pass90 renamed thread';"));
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

  assertStep("PASS90_FORK_FROM_PALETTE", await runPaletteCommand(win, "fork Pass90 renamed thread"));
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

  assertStep("PASS90_ARCHIVE_FROM_PALETTE", await runPaletteCommand(win, "archive Pass90 renamed thread"));
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

  assertStep("PASS90_RESTORE_FROM_PALETTE", await runPaletteCommand(win, "restore Pass90 renamed thread"));
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

  assertStep("PASS90_DELETE_CANCEL_FROM_PALETTE", await runPaletteCommand(win, "delete Fork: Pass90 renamed thread", "window.confirm = () => false;"));
  assertStep("PASS90_DELETE_CANCEL_PRESERVES_THREAD", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const fork = state.sessions.find((item) => item.id !== 'pass90-a' && item.forkedFromId === 'pass90-a');
      return Boolean(fork && document.querySelector('.thread-item[data-thread-id="' + fork.id + '"]'));
    })();
  `, 10000));

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
      isIso(fork?.forkedAt));
  })());

  console.log("PASS90_COMMAND_PALETTE_THREAD_ACTIONS_DONE");
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
