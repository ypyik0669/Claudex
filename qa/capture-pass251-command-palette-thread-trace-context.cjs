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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass251-data-"));
const PROJECT_A = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass251-project-a-"));
const PROJECT_B = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass251-project-b-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");

function cleanup() {
  for (const dir of [USER_DATA_DIR, PROJECT_A, PROJECT_B]) {
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

function writeInitialStore() {
  fs.mkdirSync(PROJECT_A, { recursive: true });
  fs.mkdirSync(PROJECT_B, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_A, "package.json"), JSON.stringify({ name: "pass251-project-a" }), "utf8");
  fs.writeFileSync(path.join(PROJECT_B, "package.json"), JSON.stringify({ name: "pass251-project-b" }), "utf8");
  const projectA = { name: "PASS251 Project A", path: PROJECT_A };
  const projectB = { name: "PASS251 Project B", path: PROJECT_B };
  writeJson(DATA_FILE, {
    version: 1,
    activeProject: projectA,
    projects: [projectA, projectB],
    settings: {
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      baseUrl: "https://api.example.invalid",
      temperature: 0.2,
      timeoutMs: 600000,
      language: "zh",
      appearance: { fontSize: "compact", density: "compact" },
      claudeCode: { executionMode: "claude-code", claudeCommand: "claude", permissionMode: "default" },
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
        id: "pass251-a-current",
        title: "PASS251 current project command trace",
        project: projectA.name,
        projectPath: PROJECT_A,
        claudeSessionId: "pass251-claude-a",
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:10:00.000Z",
        messages: [{ role: "user", content: "pass251 current project message", createdAt: "2026-07-07T00:00:00.000Z" }],
      },
      {
        id: "pass251-b-pinned",
        title: "PASS251 cross project pinned command trace",
        project: projectB.name,
        projectPath: PROJECT_B,
        claudeSessionId: "pass251-claude-b",
        pinned: true,
        pinnedAt: "2026-07-07T00:05:00.000Z",
        createdAt: "2026-07-07T00:01:00.000Z",
        updatedAt: "2026-07-07T00:09:00.000Z",
        messages: [
          { role: "user", content: "pass251 project b user", createdAt: "2026-07-07T00:01:00.000Z" },
          { role: "assistant", content: "pass251 project b assistant", createdAt: "2026-07-07T00:02:00.000Z" },
        ],
      },
      {
        id: "pass251-b-archived",
        title: "PASS251 archived command trace",
        project: projectB.name,
        projectPath: PROJECT_B,
        archived: true,
        archivedAt: "2026-07-07T00:06:00.000Z",
        claudeSessionId: "pass251-claude-archived",
        createdAt: "2026-07-07T00:03:00.000Z",
        updatedAt: "2026-07-07T00:08:00.000Z",
        messages: [{ role: "user", content: "pass251 archived message", createdAt: "2026-07-07T00:03:00.000Z" }],
      },
    ],
    automations: [],
    subagentRuns: [],
    commandRuns: [],
    runEvents: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
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

async function paletteCommand(win, query, expectedId) {
  return win.webContents.executeJavaScript(`
    (async function() {
      if (!document.querySelector('.command-modal')) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 220));
      }
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return null;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 260));
      const selector = ${JSON.stringify(`.command-modal .command-list button[data-command-id="${expectedId}"]`)};
      const button = document.querySelector(selector);
      if (!button) return null;
      return {
        id: button.getAttribute('data-command-id') || '',
        target: button.getAttribute('data-command-target') || '',
        threadId: button.getAttribute('data-command-thread-id') || '',
        threadProject: button.getAttribute('data-command-thread-project') || '',
        threadProjectPath: button.getAttribute('data-command-thread-project-path') || '',
        threadScope: button.getAttribute('data-command-thread-scope') || '',
        threadAction: button.getAttribute('data-command-thread-action') || '',
        threadPinned: button.getAttribute('data-command-thread-pinned') || '',
        threadArchived: button.getAttribute('data-command-thread-archived') || '',
        threadMessageCount: button.getAttribute('data-command-thread-message-count') || '',
        threadClaudeSessionId: button.getAttribute('data-command-thread-claude-session-id') || '',
        text: button.textContent || '',
      };
    })();
  `);
}

writeInitialStore();
app.setPath("userData", USER_DATA_DIR);
require(path.join(REPO_DIR, "electron", "main.cjs"));

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS251_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS251_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS251_INITIAL_STATE", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      return state.settings?.model === 'claude-haiku-4-5-20251001' &&
        state.activeProject?.path === ${JSON.stringify(PROJECT_A)} &&
        Boolean(document.querySelector('.thread-item[data-thread-id="pass251-a-current"]')) &&
        !document.querySelector('.thread-item[data-thread-id="pass251-b-pinned"]');
    })();
  `, 10000));

  const thread = await paletteCommand(win, "PASS251 cross project pinned command trace", "thread:pass251-b-pinned");
  assertStep("PASS251_THREAD_COMMAND_TRACE", Boolean(thread &&
    thread.target === "thread" &&
    thread.threadId === "pass251-b-pinned" &&
    thread.threadProject === "PASS251 Project B" &&
    thread.threadProjectPath === PROJECT_B &&
    thread.threadScope === "current" &&
    thread.threadPinned === "true" &&
    thread.threadArchived === "false" &&
    thread.threadMessageCount === "2" &&
    thread.threadClaudeSessionId === "pass251-claude-b" &&
    /PASS251 cross project pinned command trace/.test(thread.text)));

  const unpin = await paletteCommand(win, "unpin PASS251 cross project pinned command trace", "thread-action:unpin:pass251-b-pinned");
  assertStep("PASS251_THREAD_ACTION_COMMAND_TRACE", Boolean(unpin &&
    unpin.target === "thread-action" &&
    unpin.threadAction === "unpin" &&
    unpin.threadId === "pass251-b-pinned" &&
    unpin.threadProjectPath === PROJECT_B &&
    unpin.threadScope === "current" &&
    unpin.threadPinned === "true" &&
    unpin.threadArchived === "false" &&
    unpin.threadMessageCount === "2" &&
    unpin.threadClaudeSessionId === "pass251-claude-b"));

  const restore = await paletteCommand(win, "restore PASS251 archived command trace", "thread-action:restore:pass251-b-archived");
  assertStep("PASS251_ARCHIVED_ACTION_COMMAND_TRACE", Boolean(restore &&
    restore.target === "thread-action" &&
    restore.threadAction === "restore" &&
    restore.threadId === "pass251-b-archived" &&
    restore.threadProjectPath === PROJECT_B &&
    restore.threadScope === "archived" &&
    restore.threadPinned === "false" &&
    restore.threadArchived === "true" &&
    restore.threadMessageCount === "1" &&
    restore.threadClaudeSessionId === "pass251-claude-archived"));

  assertStep("PASS251_THREAD_COMMAND_SWITCHES_PROJECT", await win.webContents.executeJavaScript(`
    (async function() {
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'PASS251 cross project pinned command trace');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 260));
      const button = document.querySelector('.command-modal .command-list button[data-command-id="thread:pass251-b-pinned"]');
      if (!button) return false;
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 900));
      const state = await window.claudexDesktop.getState();
      const row = document.querySelector('.thread-item.active[data-thread-id="pass251-b-pinned"]');
      return state.activeProject?.path === ${JSON.stringify(PROJECT_B)} &&
        row?.getAttribute('data-thread-project-path') === ${JSON.stringify(PROJECT_B)} &&
        row?.getAttribute('data-thread-claude-session-id') === 'pass251-claude-b';
    })();
  `));

  console.log("PASS251_COMMAND_PALETTE_THREAD_TRACE_CONTEXT_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS251_FAILED", error?.stack || error);
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    const debug = await win.webContents.executeJavaScript(`
      (function() {
        return {
          commands: Array.from(document.querySelectorAll('.command-modal .command-list button')).slice(0, 8).map((button) => ({
            text: button.textContent,
            attrs: Object.fromEntries(Array.from(button.attributes).map((attr) => [attr.name, attr.value])),
          })),
          activeProject: document.querySelector('.project-list button.active')?.getAttribute('data-project-path') || '',
          threads: Array.from(document.querySelectorAll('.thread-item')).map((row) => ({
            text: row.textContent,
            attrs: Object.fromEntries(Array.from(row.attributes).map((attr) => [attr.name, attr.value])),
          })),
        };
      })();
    `).catch((debugError) => ({ error: String(debugError?.stack || debugError) }));
    console.error("PASS251_DEBUG", JSON.stringify(debug, null, 2).slice(0, 16000));
  }
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS251_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
