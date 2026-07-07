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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass282-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass282-bin-"));
const PROJECT_A = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass282-project-a-"));
const PROJECT_B = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass282-project-b-"));
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

function commandIdSegment(value) {
  return encodeURIComponent(String(value || "").trim()).slice(0, 120) || "item";
}

function writeFakeClaude() {
  const fakeClaudeScript = `
const args = process.argv.slice(2);
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value) + '\\n'); }
if (args[0] === '--version') out('2.9.0 (pass282 fake)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else out({ type: 'result', result: 'pass282 fake response', session_id: 'pass282-session' });
`;
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
  return path.join(FAKE_BIN_DIR, "claude.cmd");
}

function writeInitialStore(claudeCommand) {
  fs.mkdirSync(PROJECT_A, { recursive: true });
  fs.mkdirSync(PROJECT_B, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_A, "package.json"), JSON.stringify({ name: "pass282-project-a" }), "utf8");
  fs.writeFileSync(path.join(PROJECT_B, "package.json"), JSON.stringify({ name: "pass282-project-b" }), "utf8");
  writeJson(DATA_FILE, {
    version: 1,
    activeProject: { name: "Pass282 Project A", path: PROJECT_A },
    projects: [
      { name: "Pass282 Project A", path: PROJECT_A },
      { name: "Pass282 Project B", path: PROJECT_B },
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
        id: "pass282-b-current",
        title: "Pass282 B current thread",
        project: "Pass282 Project B",
        projectPath: PROJECT_B,
        createdAt: "2026-07-08T00:00:00.000Z",
        updatedAt: "2026-07-08T00:05:00.000Z",
        messages: [{ role: "user", content: "pass282 project b current token", createdAt: "2026-07-08T00:00:00.000Z" }],
      },
      {
        id: "pass282-b-archived",
        title: "Pass282 B archived thread",
        project: "Pass282 Project B",
        projectPath: PROJECT_B,
        archived: true,
        archivedAt: "2026-07-08T00:04:00.000Z",
        createdAt: "2026-07-08T00:00:00.000Z",
        updatedAt: "2026-07-08T00:04:00.000Z",
        messages: [{ role: "user", content: "pass282 project b archived token", createdAt: "2026-07-08T00:00:00.000Z" }],
      },
      {
        id: "pass282-a-archived",
        title: "Pass282 A archived thread",
        project: "Pass282 Project A",
        projectPath: PROJECT_A,
        archived: true,
        archivedAt: "2026-07-08T00:03:00.000Z",
        createdAt: "2026-07-08T00:00:00.000Z",
        updatedAt: "2026-07-08T00:03:00.000Z",
        messages: [{ role: "user", content: "pass282 project a archived token", createdAt: "2026-07-08T00:00:00.000Z" }],
      },
      {
        id: "pass282-a-pinned",
        title: "Pass282 A pinned thread",
        project: "Pass282 Project A",
        projectPath: PROJECT_A,
        pinned: true,
        pinnedAt: "2026-07-08T00:02:00.000Z",
        createdAt: "2026-07-08T00:00:00.000Z",
        updatedAt: "2026-07-08T00:02:00.000Z",
        messages: [{ role: "user", content: "pass282 project a pinned token", createdAt: "2026-07-08T00:00:00.000Z" }],
      },
      {
        id: "pass282-a-current",
        title: "Pass282 A current thread",
        project: "Pass282 Project A",
        projectPath: PROJECT_A,
        createdAt: "2026-07-08T00:00:00.000Z",
        updatedAt: "2026-07-08T00:01:00.000Z",
        messages: [{ role: "user", content: "pass282 project a current token", createdAt: "2026-07-08T00:00:00.000Z" }],
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

async function inspectPaletteCommand(win, query, commandId) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return null;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 180));
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === ${JSON.stringify(commandId)});
      const result = button ? {
        id: button.getAttribute('data-command-id') || '',
        target: button.getAttribute('data-command-target') || '',
        projectPath: button.getAttribute('data-command-project-path') || '',
        threadScope: button.getAttribute('data-command-thread-scope') || '',
        scopeCount: button.getAttribute('data-command-thread-scope-count') || '',
        activeProjectPath: button.getAttribute('data-command-thread-active-project-path') || '',
        text: button.textContent || '',
      } : null;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return result;
    })();
  `);
}

async function runPaletteCommand(win, query, commandId) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 180));
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === ${JSON.stringify(commandId)});
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS282_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS282_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));

  const allTrace = await inspectPaletteCommand(win, "all project chats", "threads-all");
  assertStep("PASS282_GLOBAL_ALL_COMMAND_TRACE", Boolean(
    allTrace &&
    allTrace.target === "thread-scope" &&
    allTrace.threadScope === "all" &&
    allTrace.scopeCount === "3" &&
    allTrace.activeProjectPath === PROJECT_A
  ));

  assertStep("PASS282_OPEN_GLOBAL_ALL_SCOPE", await runPaletteCommand(win, "all project chats", "threads-all"));
  assertStep("PASS282_GLOBAL_ALL_SCOPE_FOCUSED_AND_FILTERED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const active = document.querySelector('.chat-scope-toggle button[data-thread-scope="all"].active');
      const summary = document.querySelector('.thread-scope-summary[data-thread-scope="all"]');
      const list = document.querySelector('.thread-list')?.textContent || '';
      return Boolean(
        state.activeProject?.path === ${JSON.stringify(PROJECT_A)} &&
        active &&
        active.dataset.threadScopeFocused === 'true' &&
        document.activeElement === active &&
        summary?.dataset.threadActiveProjectPath === ${JSON.stringify(PROJECT_A)} &&
        summary?.dataset.threadTotalCount === '3' &&
        /Pass282 A current thread/.test(list) &&
        /Pass282 A pinned thread/.test(list) &&
        /Pass282 B current thread/.test(list) &&
        !/Pass282 A archived thread|Pass282 B archived thread/.test(list)
      );
    })();
  `, 10000));

  const projectBArchivedCommandId = `project-threads-archived:${commandIdSegment(PROJECT_B)}`;
  const projectBArchivedTrace = await inspectPaletteCommand(win, "Pass282 Project B archived history", projectBArchivedCommandId);
  assertStep("PASS282_PROJECT_B_ARCHIVED_COMMAND_TRACE", Boolean(
    projectBArchivedTrace &&
    projectBArchivedTrace.target === "project-thread-scope" &&
    projectBArchivedTrace.projectPath === PROJECT_B &&
    projectBArchivedTrace.threadScope === "archived" &&
    projectBArchivedTrace.scopeCount === "1"
  ));

  assertStep("PASS282_OPEN_PROJECT_B_ARCHIVED_SCOPE", await runPaletteCommand(win, "Pass282 Project B archived history", projectBArchivedCommandId));
  const projectBArchivedOk = await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const active = document.querySelector('.chat-scope-toggle button[data-thread-scope="archived"].active');
      const summary = document.querySelector('.thread-scope-summary[data-thread-scope="archived"]');
      const row = document.querySelector('.thread-item[data-thread-id="pass282-b-archived"]');
      const list = document.querySelector('.thread-list')?.textContent || '';
      return Boolean(
        state.activeProject?.path === ${JSON.stringify(PROJECT_B)} &&
        active &&
        active.dataset.threadScopeFocused === 'true' &&
        document.activeElement === active &&
        summary?.dataset.threadActiveProjectPath === ${JSON.stringify(PROJECT_B)} &&
        summary?.dataset.threadTotalCount === '1' &&
        row?.dataset.threadProjectPath === ${JSON.stringify(PROJECT_B)} &&
        row?.dataset.threadArchived === 'true' &&
        /Pass282 B archived thread/.test(list) &&
        !/Pass282 A archived thread|Pass282 A current thread|Pass282 A pinned thread|Pass282 B current thread/.test(list)
      );
    })();
  `, 12000);
  if (!projectBArchivedOk) {
    console.log("PASS282_PROJECT_B_ARCHIVED_DEBUG", await win.webContents.executeJavaScript(`
      (async function() {
        const state = await window.claudexDesktop.getState();
        const active = document.querySelector('.chat-scope-toggle button.active');
        const summary = document.querySelector('.thread-scope-summary');
        const row = document.querySelector('.thread-item');
        return JSON.stringify({
          activeProjectPath: state.activeProject?.path || '',
          activeScope: active?.dataset.threadScope || '',
          focused: active?.dataset.threadScopeFocused || '',
          focusedElementScope: document.activeElement?.dataset?.threadScope || '',
          summaryScope: summary?.dataset.threadScope || '',
          summaryProjectPath: summary?.dataset.threadActiveProjectPath || '',
          summaryTotal: summary?.dataset.threadTotalCount || '',
          firstRowId: row?.dataset.threadId || '',
          firstRowProjectPath: row?.dataset.threadProjectPath || '',
          firstRowArchived: row?.dataset.threadArchived || '',
          list: document.querySelector('.thread-list')?.textContent || '',
        });
      })();
    `));
  }
  assertStep("PASS282_PROJECT_B_ARCHIVED_FOCUSED_AND_FILTERED", projectBArchivedOk);

  const projectACurrentCommandId = `project-threads-current:${commandIdSegment(PROJECT_A)}`;
  const projectACurrentTrace = await inspectPaletteCommand(win, "Pass282 Project A current history", projectACurrentCommandId);
  assertStep("PASS282_PROJECT_A_CURRENT_COMMAND_TRACE", Boolean(
    projectACurrentTrace &&
    projectACurrentTrace.target === "project-thread-scope" &&
    projectACurrentTrace.projectPath === PROJECT_A &&
    projectACurrentTrace.threadScope === "current" &&
    projectACurrentTrace.scopeCount === "2"
  ));

  assertStep("PASS282_OPEN_PROJECT_A_CURRENT_SCOPE", await runPaletteCommand(win, "Pass282 Project A current history", projectACurrentCommandId));
  assertStep("PASS282_PROJECT_A_CURRENT_FOCUSED_AND_FILTERED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const active = document.querySelector('.chat-scope-toggle button[data-thread-scope="current"].active');
      const summary = document.querySelector('.thread-scope-summary[data-thread-scope="current"]');
      const list = document.querySelector('.thread-list')?.textContent || '';
      return Boolean(
        state.activeProject?.path === ${JSON.stringify(PROJECT_A)} &&
        active &&
        active.dataset.threadScopeFocused === 'true' &&
        document.activeElement === active &&
        summary?.dataset.threadActiveProjectPath === ${JSON.stringify(PROJECT_A)} &&
        summary?.dataset.threadTotalCount === '2' &&
        /Pass282 A current thread/.test(list) &&
        /Pass282 A pinned thread/.test(list) &&
        !/Pass282 B current thread|Pass282 A archived thread|Pass282 B archived thread/.test(list)
      );
    })();
  `, 12000));

  assertStep("PASS282_SCOPE_DEEPLINKS_DO_NOT_MUTATE_RUNS_OR_SESSIONS", (() => {
    const parsed = readJson(DATA_FILE);
    return Boolean(
      parsed.activeProject?.path === PROJECT_A &&
      Array.isArray(parsed.sessions) &&
      parsed.sessions.length === 5 &&
      (!parsed.commandRuns || parsed.commandRuns.length === 0) &&
      (!parsed.runEvents || parsed.runEvents.length === 0)
    );
  })());

  console.log("PASS282_THREAD_PROJECT_SCOPE_DEEPLINK_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore(writeFakeClaude());
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS282_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS282_TIMEOUT");
  cleanup();
  app.exit(1);
}, 80000);
