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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass138-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass138-project-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass138-bin-"));
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const RUN_ID = "pass138-run-evidence";
const NOTICE_ID = "pass138-actionable-notice";

function cleanup() {
  for (const dir of [USER_DATA_DIR, PROJECT_DIR, FAKE_BIN_DIR]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_error) {
      // best-effort cleanup
    }
  }
}

function writeFakeClaude() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(
    FAKE_CLAUDE,
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass138& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins: none& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces: none& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass138 ok %*",
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass138-project" }), "utf8");
  const project = { name: "pass138-project", path: PROJECT_DIR };
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify({
      version: 1,
      activeProject: project,
      projects: [project],
      sessions: [
        {
          id: "pass138-session",
          title: "Pass138 notice command palette",
          project: project.name,
          projectPath: PROJECT_DIR,
          createdAt: "2026-07-07T00:00:00.000Z",
          updatedAt: "2026-07-07T00:00:00.000Z",
          messages: [],
        },
      ],
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
      commandRuns: [
        {
          id: RUN_ID,
          requestId: RUN_ID,
          kind: "workspace",
          command: "node pass138-fail.js",
          commandLine: "node pass138-fail.js",
          cwd: PROJECT_DIR,
          project,
          code: 1,
          durationMs: 138,
          stdout: "pass138 stdout before failure",
          stderr: "pass138 stderr failure evidence",
          startedAt: "2026-07-07T00:00:01.000Z",
          endedAt: "2026-07-07T00:00:02.000Z",
        },
      ],
      runEvents: [
        {
          id: RUN_ID,
          type: "workspace-command",
          status: "error",
          title: "Pass138 command failure",
          detail: "pass138 notice target detail",
          commandLine: "node pass138-fail.js",
          cwd: PROJECT_DIR,
          project,
          sessionId: "pass138-session",
          code: 1,
          durationMs: 138,
          createdAt: "2026-07-07T00:00:02.000Z",
        },
      ],
      notices: [
        {
          id: NOTICE_ID,
          key: "pass138:notice",
          level: "error",
          source: "workspace-command",
          title: "Pass138 actionable notice",
          detail: "pass138 notice target detail",
          action: `run:${encodeURIComponent(RUN_ID)}`,
          project,
          sessionId: "pass138-session",
          count: 1,
          createdAt: "2026-07-07T00:00:03.000Z",
          lastSeenAt: "2026-07-07T00:00:03.000Z",
        },
      ],
      automations: [],
      subagentRuns: [],
      sourceRefs: [],
      browserVisits: [],
    }, null, 2),
    "utf8",
  );
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

async function openPaletteAndQuery(win, query) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS138_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS138_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS138_NOTICE_STATE_READY", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      return Boolean(
        (state.notices || []).some((notice) => notice.id === ${JSON.stringify(NOTICE_ID)} && /^run:/.test(notice.action || '')) &&
        (state.runEvents || []).some((event) => event.id === ${JSON.stringify(RUN_ID)}) &&
        (state.commandRuns || []).some((run) => run.id === ${JSON.stringify(RUN_ID)} && /pass138 stderr/.test(run.stderr || ''))
      );
    })();
  `, 10000));

  assertStep("PASS138_OPEN_PALETTE_QUERY_NOTICE", await openPaletteAndQuery(win, "Pass138 actionable notice"));
  assertStep("PASS138_NOTICE_COMMAND_VISIBLE", await waitFor(win, `
    Boolean([...document.querySelectorAll('.command-modal .command-list button')].some((button) =>
      (button.getAttribute('data-command-id') || '') === 'notice:${NOTICE_ID}' &&
      /Pass138 actionable notice/.test(button.textContent || '') &&
      /workspace-command/.test(button.textContent || '') &&
      /pass138 notice target detail/.test(button.textContent || '') &&
      /\\u901a\\u77e5/.test(button.textContent || '')
    ))
  `, 5000));

  assertStep("PASS138_CLICK_NOTICE_COMMAND", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === 'notice:${NOTICE_ID}');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));

  assertStep("PASS138_NOTICE_COMMAND_OPENS_RUN_EVIDENCE", await waitFor(win, `
    (function() {
      const active = document.querySelector('.workspace-context-button.active')?.textContent || '';
      const panel = document.querySelector('.selected-run-evidence-panel');
      const retry = panel?.querySelector('[data-run-recovery-action="retry-workspace"]');
      const selected = panel?.textContent || '';
      return /\\u8f93\\u51fa/.test(active) &&
        /Pass138 command failure/.test(selected) &&
        /pass138 notice target detail/.test(selected) &&
        /node pass138-fail\.js/.test(selected) &&
        /pass138 stdout before failure/.test(selected) &&
        /pass138 stderr failure evidence/.test(selected) &&
        retry &&
        retry.getAttribute('data-run-recovery-action-focused') === 'true' &&
        document.activeElement === retry;
    })();
  `, 10000));

  console.log("PASS138_COMMAND_PALETTE_NOTICE_DEEPLINK_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS138_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS138_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
