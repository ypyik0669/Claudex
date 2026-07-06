const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass85-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass85-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass85-project-"));
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_DIR]) {
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

function writeInitialStore() {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass85-project" }), "utf8");
  fs.writeFileSync(
    FAKE_CLAUDE,
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass85& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins: none& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces: none& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass85 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );

  const project = { name: "pass85-project", path: PROJECT_DIR };
  const startedAt = "2026-07-06T00:00:00.000Z";
  const failedRun = {
    id: "pass85-automation-run",
    trigger: "manual",
    status: "failed",
    startedAt,
    endedAt: "2026-07-06T00:01:00.000Z",
    durationMs: 60000,
    sessionId: "pass85-session",
    code: 1,
    error: "pass85 automation stderr evidence",
    stdout: "pass85 automation stdout evidence",
    stderr: "pass85 automation stderr evidence",
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
        activeProject: project,
        projects: [project],
        sessions: [
          {
            id: "pass85-session",
            title: "pass85 work thread",
            project: project.name,
            projectPath: PROJECT_DIR,
            createdAt: startedAt,
            updatedAt: startedAt,
            messages: [{ role: "user", content: "pass85 thread", createdAt: startedAt }],
          },
        ],
        automations: [
          {
            id: "pass85-automation",
            prompt: "pass85 focused automation task",
            schedule: { type: "once", runAt: "" },
            project,
            threadId: "pass85-session",
            enabled: false,
            status: "failed",
            createdAt: startedAt,
            updatedAt: startedAt,
            lastRun: failedRun,
            history: [failedRun],
          },
          {
            id: "pass85-other-automation",
            prompt: "pass85 other automation task",
            schedule: { type: "once", runAt: "2026-07-07T00:00:00.000Z" },
            project,
            threadId: "pass85-session",
            enabled: true,
            status: "scheduled",
            createdAt: startedAt,
            updatedAt: startedAt,
            history: [],
          },
        ],
        subagentRuns: [
          {
            id: "pass85-archived-subagent",
            requestId: "pass85-archived-request",
            nickname: "Pass85 Archived Agent",
            task: "pass85 archived subagent task",
            status: "error",
            sessionId: "pass85-session",
            project,
            cwd: PROJECT_DIR,
            summary: "pass85 archived subagent evidence",
            stderr: "pass85 archived stderr evidence",
            code: 2,
            durationMs: 420,
            startedAt,
            endedAt: "2026-07-06T00:02:00.000Z",
            archivedAt: "2026-07-06T00:03:00.000Z",
            artifacts: [{ type: "summary", label: "pass85 archived artifact" }],
          },
        ],
        runEvents: [],
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
  if (!win) throw new Error("PASS85_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(600);

  assertStep("PASS85_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));

  assertStep("PASS85_AUTOMATION_COMMAND_SEARCHABLE", await win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'pass85 focused automation task');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 150));
      const button = document.querySelector('.command-modal .command-list button');
      const text = button?.textContent || '';
      const id = button?.getAttribute('data-command-id') || '';
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return Boolean(button && id.includes('automation:pass85-automation') && /pass85 focused automation task/.test(text) && /pass85-project/.test(text));
    })();
  `));

  assertStep("PASS85_OPEN_AUTOMATION_TASK_CENTER_FOCUS", await runPaletteCommand(win, "pass85 focused automation task"));
  assertStep("PASS85_AUTOMATION_CARD_FOCUSED", await waitFor(win, `
    Boolean(
      document.querySelector('.bottom-work-panel .subagent-workbench') &&
      document.querySelector('.automation-task-card.focused-task-card[data-automation-id="pass85-automation"]') &&
      /pass85 focused automation task/.test(document.querySelector('.automation-task-card.focused-task-card')?.textContent || '') &&
      /pass85 automation stderr evidence/.test(document.querySelector('.automation-task-card.focused-task-card')?.textContent || '')
    )
  `, 10000));

  assertStep("PASS85_SUBAGENT_COMMAND_SEARCHABLE", await win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'pass85 archived subagent task');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 150));
      const button = document.querySelector('.command-modal .command-list button');
      const text = button?.textContent || '';
      const id = button?.getAttribute('data-command-id') || '';
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return Boolean(button && id.includes('subagent:pass85-archived-subagent') && /Pass85 Archived Agent/.test(text) && /pass85 archived subagent task/.test(text));
    })();
  `));

  assertStep("PASS85_OPEN_ARCHIVED_SUBAGENT_FOCUS", await runPaletteCommand(win, "pass85 archived subagent task"));
  assertStep("PASS85_ARCHIVED_SUBAGENT_CARD_FOCUSED", await waitFor(win, `
    Boolean(
      document.querySelector('.bottom-work-panel .subagent-workbench') &&
      document.querySelector('.subagent-run-card.archived.focused-task-card[data-subagent-run-id="pass85-archived-subagent"]') &&
      /pass85 archived subagent evidence/.test(document.querySelector('.subagent-run-card.focused-task-card')?.textContent || '') &&
      /pass85 archived stderr evidence/.test(document.querySelector('.subagent-run-card.focused-task-card')?.textContent || '')
    )
  `, 10000));

  console.log("PASS85_COMMAND_PALETTE_TASK_DEEP_LINKS_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS85_COMMAND_PALETTE_TASK_DEEP_LINKS_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS85_COMMAND_PALETTE_TASK_DEEP_LINKS_TIMEOUT");
  cleanup();
  app.exit(1);
}, 80000);
