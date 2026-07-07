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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass215-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass215-bin-"));
const PROJECT_A = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass215-project-a-"));
const PROJECT_B = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass215-project-b-"));
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
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
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(
    FAKE_CLAUDE,
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass215& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass215 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
}

function writeInitialStore() {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_A, { recursive: true });
  fs.mkdirSync(PROJECT_B, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_A, "package.json"), JSON.stringify({ name: "pass215-project-a" }), "utf8");
  fs.writeFileSync(path.join(PROJECT_B, "package.json"), JSON.stringify({ name: "pass215-project-b" }), "utf8");
  writeFakeClaude();

  const projectA = { name: "pass215 Project A", path: PROJECT_A };
  const projectB = { name: "pass215 Project B", path: PROJECT_B };
  const fillerSessions = Array.from({ length: 30 }, (_value, index) => ({
    id: `pass215-filler-${String(index + 1).padStart(2, "0")}`,
    title: `pass215 recent filler ${String(index + 1).padStart(2, "0")}`,
    project: projectA.name,
    projectPath: PROJECT_A,
    createdAt: `2026-07-06T00:${String(index + 1).padStart(2, "0")}:00.000Z`,
    updatedAt: `2026-07-06T00:${String(index + 1).padStart(2, "0")}:30.000Z`,
    messages: [{ role: "user", content: `pass215 filler ${index + 1}`, createdAt: `2026-07-06T00:${String(index + 1).padStart(2, "0")}:00.000Z` }],
  }));

  const target = {
    id: "pass215-target-old",
    title: "pass215 deep history target thread",
    project: projectB.name,
    projectPath: PROJECT_B,
    claudeSessionId: "pass215-target-claude-session",
    createdAt: "2026-07-05T23:00:00.000Z",
    updatedAt: "2026-07-05T23:00:30.000Z",
    messages: [
      { role: "user", content: "pass215 target old project b history", createdAt: "2026-07-05T23:00:00.000Z" },
      { role: "assistant", content: "pass215 target answer", createdAt: "2026-07-05T23:00:01.000Z" },
    ],
  };

  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(
      {
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
        activeProject: projectA,
        projects: [projectA, projectB],
        sessions: [...fillerSessions, target],
        commandRuns: [],
        runEvents: [],
        sourceRefs: [],
        browserVisits: [],
        notices: [],
        automations: [],
        subagentRuns: [],
      },
      null,
      2,
    ),
    "utf8",
  );
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
      await new Promise((resolve) => setTimeout(resolve, 200));
      const button = document.querySelector('.command-modal .command-list button');
      return button ? { id: button.dataset.commandId || '', text: button.textContent || '' } : null;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS215_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS215_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS215_INITIAL_RECENT_PROJECT_A_ONLY", await waitFor(win, `
    (function() {
      const list = document.querySelector('.thread-list')?.textContent || '';
      return /pass215 recent filler 01/.test(list) &&
        !/pass215 deep history target thread/.test(list);
    })();
  `, 10000));

  const command = await firstPaletteCommand(win, "pass215 deep history target thread");
  assertStep("PASS215_DEEP_HISTORY_THREAD_COMMAND_SEARCHABLE", Boolean(
    command?.id === "thread:pass215-target-old" &&
    /pass215 deep history target thread/.test(command.text) &&
    /pass215 Project B/.test(command.text)
  ));

  assertStep("PASS215_OPEN_DEEP_HISTORY_THREAD_COMMAND", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.command-modal .command-list button[data-command-id="thread:pass215-target-old"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));

  assertStep("PASS215_DEEP_HISTORY_THREAD_AND_PROJECT_SELECTED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const activeText = document.querySelector('.thread-list .thread-item.active')?.textContent || '';
      const scopeText = document.querySelector('.thread-scope-summary')?.textContent || '';
      const headerText = document.querySelector('.thread-header')?.textContent || '';
      return state.activeProject?.path === ${JSON.stringify(PROJECT_B)} &&
        /pass215 deep history target thread/.test(activeText) &&
        /pass215 deep history target thread/.test(headerText) &&
        /pass215 Project B/.test(scopeText) &&
        !/pass215 recent filler 01/.test(document.querySelector('.thread-list')?.textContent || '');
    })();
  `, 12000));

  assertStep("PASS215_DEEP_HISTORY_RESUME_EVENT_PERSISTED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      return Boolean(state.runEvents?.some((event) =>
        event.type === 'thread-action' &&
        event.sessionId === 'pass215-target-old' &&
        /action=resume/.test(event.stdout || '') &&
        /pass215 Project B/.test((event.detail || '') + (event.stdout || ''))
      ));
    })();
  `, 10000));

  console.log("PASS215_COMMAND_PALETTE_DEEP_HISTORY_THREAD_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS215_COMMAND_PALETTE_DEEP_HISTORY_THREAD_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS215_COMMAND_PALETTE_DEEP_HISTORY_THREAD_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
