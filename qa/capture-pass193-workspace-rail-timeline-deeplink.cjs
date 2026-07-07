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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass193-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass193-project-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass193-bin-"));
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const RUN_ID = "pass193-workspace-failed-command";
const COMMAND_LINE = "node pass193-failed-command.js";

function cleanup() {
  for (const dir of [USER_DATA_DIR, PROJECT_DIR, FAKE_BIN_DIR]) {
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
      "if \"%1\"==\"--version\" (echo claude fake pass193& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass193 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function writeInitialStore() {
  writeFakeClaude();
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass193-project" }, null, 2), "utf8");
  const project = { name: "pass193-project", path: PROJECT_DIR };
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
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
            id: "pass193-session",
            title: "Pass193 workspace rail timeline deeplink",
            project: project.name,
            projectPath: project.path,
            createdAt: "2026-07-07T23:40:00.000Z",
            updatedAt: "2026-07-07T23:40:00.000Z",
            messages: [],
          },
        ],
        commandRuns: [
          {
            id: RUN_ID,
            requestId: RUN_ID,
            kind: "workspace",
            command: COMMAND_LINE,
            cwd: PROJECT_DIR,
            project,
            code: 1,
            stdout: "pass193 workspace stdout before failure",
            stderr: "pass193 workspace failed rail evidence",
            durationMs: 193,
            startedAt: "2026-07-07T23:40:00.000Z",
            endedAt: "2026-07-07T23:40:01.000Z",
          },
        ],
        runEvents: [
          {
            id: RUN_ID,
            type: "workspace-command",
            status: "error",
            title: `Run command: ${COMMAND_LINE}`,
            detail: "Exit code: 1",
            commandLine: COMMAND_LINE,
            cwd: PROJECT_DIR,
            code: 1,
            durationMs: 193,
            createdAt: "2026-07-07T23:40:01.000Z",
          },
        ],
        automations: [],
        subagentRuns: [],
        sourceRefs: [],
        browserVisits: [],
        notices: [],
      },
      null,
      2,
    ),
    "utf8",
  );
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS193_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS193_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS193_WORKSPACE_RAIL_ERROR", await waitFor(win, `
    Boolean(
      document.querySelector('.tool-rail button[data-tool="workspace"][data-tool-rail-status="error"]') &&
      document.querySelector('.app-grid.right-panel-hidden')
    )
  `, 10000));
  assertStep("PASS193_CLICK_WORKSPACE_RAIL", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.tool-rail button[data-tool="workspace"][data-tool-rail-status="error"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS193_RAIL_FOCUSES_WORKSPACE_TIMELINE", await waitFor(win, `
    (function() {
      const active = document.querySelector('.bottom-panel-tabs button[data-bottom-tab="outputs"].active');
      const row = document.querySelector('.run-timeline-row.selected.error');
      const panel = document.querySelector('.selected-run-evidence-panel.error');
      const retry = panel?.querySelector('[data-run-recovery-action="retry-workspace"]');
      const text = panel?.textContent || '';
      return Boolean(
        active &&
        row &&
        /pass193-failed-command\\.js/.test(row.textContent || '') &&
        panel &&
        /pass193 workspace failed rail evidence/.test(text) &&
        /${COMMAND_LINE}/.test(text) &&
        panel.querySelector('[data-run-event-type="workspace-command"]') &&
        retry &&
        retry.getAttribute('data-run-recovery-action-focused') === 'true' &&
        document.activeElement === retry &&
        panel.querySelector('[data-run-recovery-action="terminal"]')
      );
    })();
  `, 10000));

  console.log("PASS193_WORKSPACE_RAIL_TIMELINE_DEEPLINK_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS193_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (function() {
          const workspaceRail = document.querySelector('.tool-rail button[data-tool="workspace"]');
          const panel = document.querySelector('.selected-run-evidence-panel');
          return {
            workspaceRailStatus: workspaceRail?.getAttribute('data-tool-rail-status') || '',
            workspaceRailText: workspaceRail?.textContent || '',
            activeBottom: document.querySelector('.bottom-panel-tabs button.active')?.getAttribute('data-bottom-tab') || '',
            selectedClass: panel?.className || '',
            selectedText: panel?.textContent || '',
            body: document.body?.textContent?.slice(0, 4000) || '',
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS193_DEBUG", JSON.stringify(debug, null, 2).slice(0, 8000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS193_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
