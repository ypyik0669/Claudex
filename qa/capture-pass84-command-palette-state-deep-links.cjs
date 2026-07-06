const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass84-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass84-bin-"));
const PROJECT_A = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass84-project-a-"));
const PROJECT_B = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass84-project-b-"));
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
      "if \"%1\"==\"--version\" (echo claude fake pass84& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins: none& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces: none& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass84 ok %*",
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
  fs.writeFileSync(path.join(PROJECT_A, "package.json"), JSON.stringify({ name: "pass84-project-a" }), "utf8");
  fs.writeFileSync(path.join(PROJECT_B, "package.json"), JSON.stringify({ name: "pass84-project-b" }), "utf8");
  writeFakeClaude();

  const projectA = { name: "pass84 Project A local", path: PROJECT_A };
  const projectB = { name: "pass84 Project B target", path: PROJECT_B };
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
        sessions: [
          {
            id: "pass84-a-thread",
            title: "pass84 current A thread",
            project: projectA.name,
            projectPath: PROJECT_A,
            createdAt: "2026-07-06T00:00:00.000Z",
            updatedAt: "2026-07-06T00:01:00.000Z",
            messages: [{ role: "user", content: "project a", createdAt: "2026-07-06T00:00:00.000Z" }],
          },
          {
            id: "pass84-b-thread",
            title: "pass84 hidden target thread",
            project: projectB.name,
            projectPath: PROJECT_B,
            claudeSessionId: "pass84-claude-session",
            pinned: true,
            createdAt: "2026-07-06T00:02:00.000Z",
            updatedAt: "2026-07-06T00:03:00.000Z",
            messages: [{ role: "user", content: "project b", createdAt: "2026-07-06T00:02:00.000Z" }],
          },
        ],
        commandRuns: [
          {
            id: "pass84-run-evidence",
            kind: "workspace",
            command: "node pass84-command.js",
            cwd: PROJECT_B,
            project: projectB,
            code: 0,
            durationMs: 184,
            stdout: "pass84 command stdout from local commandRuns",
            stderr: "",
            createdAt: "2026-07-06T00:04:00.000Z",
            endedAt: "2026-07-06T00:04:01.000Z",
          },
        ],
        runEvents: [
          {
            id: "pass84-run-evidence",
            type: "workspace-command",
            status: "ok",
            title: "pass84 timeline evidence command",
            detail: "pass84 timeline evidence detail",
            commandLine: "node pass84-command.js",
            cwd: PROJECT_B,
            code: 0,
            durationMs: 184,
            project: projectB,
            sessionId: "pass84-b-thread",
            createdAt: "2026-07-06T00:04:01.000Z",
          },
        ],
        automations: [],
        subagentRuns: [],
      },
      null,
      2,
    ),
    "utf8",
  );
}

async function runPaletteCommand(win, query) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 150));
      const button = document.querySelector('.command-modal .command-list button');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS84_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(600);

  assertStep("PASS84_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));

  assertStep("PASS84_DYNAMIC_THREAD_COMMAND_VISIBLE", await win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'pass84 hidden target thread');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 150));
      const button = document.querySelector('.command-modal .command-list button');
      const text = button?.textContent || '';
      const id = button?.getAttribute('data-command-id') || '';
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return Boolean(button && /pass84 hidden target thread/.test(text) && /pass84 Project B target/.test(text) && id.includes('thread:pass84-b-thread'));
    })();
  `));

  assertStep("PASS84_OPEN_THREAD_DEEP_LINK", await runPaletteCommand(win, "pass84 hidden target thread"));
  assertStep("PASS84_THREAD_AND_PROJECT_SELECTED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const activeText = document.querySelector('.thread-list .thread-item.active')?.textContent || '';
      const scopeText = document.querySelector('.thread-scope-summary')?.textContent || '';
      return state.activeProject?.path === ${JSON.stringify(PROJECT_B)} &&
        /pass84 hidden target thread/.test(activeText) &&
        /pass84 Project B target/.test(scopeText) &&
        !/pass84 current A thread/.test(document.querySelector('.thread-list')?.textContent || '');
    })();
  `, 10000));

  assertStep("PASS84_OPEN_PROJECT_DEEP_LINK", await runPaletteCommand(win, "pass84 Project A local"));
  assertStep("PASS84_PROJECT_A_SELECTED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const listText = document.querySelector('.thread-list')?.textContent || '';
      return state.activeProject?.path === ${JSON.stringify(PROJECT_A)} &&
        /pass84 current A thread/.test(listText) &&
        !/pass84 hidden target thread/.test(listText);
    })();
  `, 10000));

  assertStep("PASS84_OPEN_RUN_EVIDENCE_DEEP_LINK", await runPaletteCommand(win, "pass84 timeline evidence command"));
  assertStep("PASS84_RUN_EVIDENCE_SELECTED", await waitFor(win, `
    Boolean(
      document.querySelector('.bottom-work-panel .run-timeline-row.selected') &&
      /pass84 timeline evidence command/.test(document.querySelector('.selected-run-evidence-panel')?.textContent || '') &&
      /pass84 command stdout from local commandRuns/.test(document.querySelector('.selected-run-evidence-panel')?.textContent || '') &&
      /node pass84-command\.js/.test(document.querySelector('.selected-run-evidence-panel')?.textContent || '')
    )
  `, 10000));

  console.log("PASS84_COMMAND_PALETTE_STATE_DEEP_LINKS_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS84_COMMAND_PALETTE_STATE_DEEP_LINKS_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS84_COMMAND_PALETTE_STATE_DEEP_LINKS_TIMEOUT");
  cleanup();
  app.exit(1);
}, 80000);
