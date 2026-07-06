const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass81-data-"));
const PROJECT_A = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass81-project-a-"));
const PROJECT_B = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass81-project-b-"));
const FAKE_CLAUDE = path.join(USER_DATA_DIR, "fake-claude.cmd");
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
  fs.mkdirSync(path.join(PROJECT_A, "src"), { recursive: true });
  fs.mkdirSync(path.join(PROJECT_B, "src"), { recursive: true });
  fs.writeFileSync(path.join(PROJECT_A, "package.json"), JSON.stringify({ name: "pass81-project-a" }), "utf8");
  fs.writeFileSync(path.join(PROJECT_B, "package.json"), JSON.stringify({ name: "pass81-project-b" }), "utf8");
  fs.writeFileSync(path.join(PROJECT_A, "src", "pass81-active.txt"), "pass81 active source\n", "utf8");
  fs.writeFileSync(path.join(PROJECT_B, "src", "pass81-other.txt"), "pass81 other source\n", "utf8");
  fs.writeFileSync(
    FAKE_CLAUDE,
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass81& exit /b 0)",
      "if \"%1\"==\"auth\" (echo Logged in as pass81@example.invalid& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins:& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces:& exit /b 0)",
      "if \"%1\"==\"mcp\" (echo No MCP servers configured& exit /b 0)",
      "echo ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );

  const activeProject = { name: "Project A", path: PROJECT_A };
  const otherProject = { name: "Project B", path: PROJECT_B };
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(
      {
        version: 1,
        activeProject,
        projects: [activeProject, otherProject],
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
        sessions: [
          {
            id: "pass81-session",
            title: "Pass81 evidence thread",
            project: activeProject.name,
            projectPath: activeProject.path,
            createdAt: "2026-07-06T00:00:00.000Z",
            updatedAt: "2026-07-06T00:00:00.000Z",
            messages: [],
          },
        ],
        automations: [],
        subagentRuns: [
          {
            id: "pass81-active-run",
            requestId: "pass81-active-request",
            sessionId: "pass81-session",
            nickname: "Env Evidence QA",
            task: "verify environment evidence",
            status: "done",
            summary: "pass81 active subagent evidence",
            command: FAKE_CLAUDE,
            args: ["-p", "pass81"],
            cwd: PROJECT_A,
            project: activeProject,
            createdAt: "2026-07-06T00:01:00.000Z",
            startedAt: "2026-07-06T00:01:01.000Z",
            endedAt: "2026-07-06T00:01:02.000Z",
          },
          {
            id: "pass81-archived-run",
            requestId: "pass81-archived-request",
            nickname: "Archived Env QA",
            task: "archived run should not summarize",
            status: "done",
            archivedAt: "2026-07-06T00:02:00.000Z",
            project: activeProject,
            createdAt: "2026-07-06T00:02:00.000Z",
          },
          {
            id: "pass81-other-run",
            requestId: "pass81-other-request",
            nickname: "Other Project QA",
            task: "other project run should not summarize",
            status: "error",
            project: otherProject,
            createdAt: "2026-07-06T00:03:00.000Z",
          },
        ],
        sourceRefs: [
          {
            path: "src/pass81-active.txt",
            name: "pass81-active.txt",
            size: 23,
            project: activeProject,
            lastOpenedAt: "2026-07-06T00:04:00.000Z",
          },
          {
            path: "src/pass81-other.txt",
            name: "pass81-other.txt",
            size: 22,
            project: otherProject,
            lastOpenedAt: "2026-07-06T00:05:00.000Z",
          },
        ],
        runEvents: [],
        commandRuns: [],
        browserVisits: [],
        notices: [],
      },
      null,
      2,
    ),
    "utf8",
  );
}

async function openRightPanelEnvironment(win) {
  assertStep("PASS81_OPEN_TOOL_PANEL", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.rail-toggle') || document.querySelector('.side-panel-button');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS81_TOOL_PANEL_VISIBLE", await waitFor(win, "Boolean(!document.querySelector('.app-grid')?.classList.contains('right-panel-hidden') && document.querySelector('.tools-panel'))", 8000));
  assertStep("PASS81_EXPAND_ENVIRONMENT", await win.webContents.executeJavaScript(`
    (function() {
      const details = document.querySelector('.environment-status-details');
      if (!details) return false;
      details.open = true;
      return true;
    })();
  `));
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));

app.whenReady().then(async () => {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.error("PASS81_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  try {
    assertStep("PASS81_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
    await openRightPanelEnvironment(win);

    assertStep("PASS81_ENVIRONMENT_EVIDENCE_REAL_STATE", await waitFor(win, `
      (function() {
        const details = Array.from(document.querySelectorAll('.environment-subsection'));
        details.forEach((item) => { item.open = true; });
        const text = document.querySelector('.environment-card')?.textContent || '';
        return /Env Evidence QA/.test(text) &&
          /pass81-active\\.txt/.test(text) &&
          !/Archived Env QA|Other Project QA|pass81-other\\.txt/.test(text) &&
          /1.*\\u5b50\\u4ee3\\u7406|1.*subagent/i.test(text) &&
          /1.*\\u6765\\u6e90|1.*source/i.test(text);
      })();
    `, 8000));

    assertStep("PASS81_SOURCE_DEEPLINK", await win.webContents.executeJavaScript(`
      (function() {
        const buttons = Array.from(document.querySelectorAll('.environment-subsection summary button'));
        const sourceButton = buttons.find((button) => /\\u6765\\u6e90/.test(button.textContent || ''));
        if (!sourceButton) return false;
        sourceButton.click();
        return true;
      })();
    `));
    assertStep("PASS81_SOURCES_PANEL_VISIBLE", await waitFor(win, `
      Boolean(
        document.querySelector('.bottom-work-panel .source-ref-card') &&
        /pass81-active\\.txt/.test(document.querySelector('.bottom-work-panel')?.textContent || '') &&
        !/pass81-other\\.txt/.test(document.querySelector('.environment-card')?.textContent || '')
      )
    `, 8000));

    assertStep("PASS81_SUBAGENT_DEEPLINK", await win.webContents.executeJavaScript(`
      (function() {
        const buttons = Array.from(document.querySelectorAll('.environment-subsection summary button'));
        const subagentButton = buttons.find((button) => /\\u5b50\\u4ee3\\u7406/.test(button.textContent || ''));
        if (!subagentButton) return false;
        subagentButton.click();
        return true;
      })();
    `));
    assertStep("PASS81_SUBAGENT_PANEL_VISIBLE", await waitFor(win, `
      Boolean(
        document.querySelector('.bottom-work-panel .subagent-workbench') &&
        /Env Evidence QA/.test(document.querySelector('.bottom-work-panel')?.textContent || '') &&
        /pass81 active subagent evidence/.test(document.querySelector('.bottom-work-panel')?.textContent || '')
      )
    `, 8000));

    console.log("PASS81_ENVIRONMENT_EVIDENCE_DONE");
    cleanup();
    app.exit(0);
  } catch (error) {
    console.error("PASS81_ENVIRONMENT_EVIDENCE_FAILED", error?.stack || error);
    cleanup();
    app.exit(1);
  }
});

setTimeout(() => {
  console.error("PASS81_ENVIRONMENT_EVIDENCE_TIMEOUT");
  cleanup();
  app.exit(1);
}, 80000);
