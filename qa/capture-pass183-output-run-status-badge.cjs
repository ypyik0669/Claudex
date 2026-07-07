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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass183-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass183-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass183-project-"));
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

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function writeInitialStore() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass183-project" }), "utf8");
  fs.writeFileSync(
    path.join(FAKE_BIN_DIR, "claude.cmd"),
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass183& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass183 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  const fakeClaude = path.join(FAKE_BIN_DIR, "claude.cmd");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;

  const project = { name: "pass183-project", path: PROJECT_DIR };
  const createdAt = "2026-07-07T17:00:00.000Z";

  writeJson(DATA_FILE, {
    version: 1,
    settings: {
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      baseUrl: "https://api.example.invalid",
      temperature: 0.2,
      timeoutMs: 600000,
      language: "zh",
      appearance: { fontSize: "compact", density: "compact" },
      claudeCode: { executionMode: "claude-code", claudeCommand: fakeClaude, permissionMode: "default" },
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
        id: "pass183-session",
        title: "Pass183 output run status badge",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt,
        updatedAt: createdAt,
        messages: [],
      },
    ],
    automations: [],
    subagentRuns: [],
    commandRuns: [],
    runEvents: [
      {
        id: "pass183-running-run",
        type: "workspace-command",
        status: "running",
        title: "Pass183 running workspace command",
        detail: "pass183 running output evidence",
        commandLine: "node pass183-running.js",
        cwd: PROJECT_DIR,
        stdout: "pass183 running stdout",
        stderr: "",
        project,
        sessionId: "pass183-session",
        createdAt: "2026-07-07T17:00:03.000Z",
      },
      {
        id: "pass183-error-run",
        type: "workspace-command",
        status: "error",
        title: "Pass183 failed workspace command",
        detail: "pass183 failed output evidence",
        commandLine: "node pass183-failed.js",
        cwd: PROJECT_DIR,
        stdout: "pass183 failed stdout",
        stderr: "pass183 failed stderr",
        code: 2,
        project,
        sessionId: "pass183-session",
        createdAt: "2026-07-07T17:00:02.000Z",
      },
      {
        id: "pass183-ok-run",
        type: "workspace-command",
        status: "ok",
        title: "Pass183 completed workspace command",
        detail: "pass183 completed output evidence",
        commandLine: "node pass183-ok.js",
        cwd: PROJECT_DIR,
        stdout: "pass183 ok stdout",
        stderr: "",
        code: 0,
        durationMs: 900,
        project,
        sessionId: "pass183-session",
        createdAt: "2026-07-07T17:00:01.000Z",
      },
    ],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

async function clickTopOutputs(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.workspace-context-button[data-context-tab="outputs"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function markErrorRunOk(win) {
  return win.webContents.executeJavaScript(`
    (async function() {
      const next = await window.claudexDesktop.recordRunEvent({
        id: 'pass183-error-run',
        type: 'workspace-command',
        status: 'ok',
        title: 'Pass183 failed workspace command',
        detail: 'pass183 failed output evidence resolved',
        commandLine: 'node pass183-failed.js',
        cwd: ${JSON.stringify(PROJECT_DIR)},
        projectPath: ${JSON.stringify(PROJECT_DIR)},
        stdout: 'pass183 failed stdout resolved',
        stderr: '',
        code: 0,
        durationMs: 1200,
        sessionId: 'pass183-session'
      });
      return Boolean(next?.runEvents?.some((event) => event.id === 'pass183-error-run' && event.status === 'ok'));
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS183_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS183_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS183_OUTPUT_BADGE_BACKED_BY_RUN_EVENTS", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const runs = state.runEvents || [];
      const running = runs.filter((event) => event.status === 'running');
      const errors = runs.filter((event) => event.status === 'error');
      const button = document.querySelector('.workspace-context-button[data-context-tab="outputs"][data-status="error"]');
      const badge = button?.querySelector('.context-tab-badge');
      const aria = button?.getAttribute('aria-label') || '';
      const title = button?.getAttribute('title') || '';
      return Boolean(
        state.settings?.model === 'claude-haiku-4-5-20251001' &&
        runs.length === 3 &&
        running.length === 1 &&
        errors.length === 1 &&
        button &&
        badge &&
        badge.textContent.trim() === '1' &&
        /\\u8fd0\\u884c 1/.test(aria) &&
        /\\u5931\\u8d25 1/.test(aria) &&
        /\\u6700\\u8fd1 3/.test(aria) &&
        /\\u8fd0\\u884c 1/.test(title) &&
        /\\u5931\\u8d25 1/.test(title) &&
        /\\u6700\\u8fd1 3/.test(title) &&
        button.getBoundingClientRect().width <= 40
      );
    })();
  `, 10000));

  assertStep("PASS183_CLICK_OUTPUT_BADGE_BUTTON", await clickTopOutputs(win));
  assertStep("PASS183_OUTPUT_PANEL_STATUS_VISIBLE", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.bottom-work-panel');
      const text = panel?.textContent || '';
      const bottomBadge = document.querySelector('.bottom-panel-tabs button[data-bottom-tab="outputs"][data-status="error"] .context-tab-badge');
      return Boolean(
        panel &&
        document.querySelector('.workspace-context-button[data-context-tab="outputs"].active.status-error') &&
        bottomBadge &&
        bottomBadge.textContent.trim() === '1' &&
        document.querySelector('.run-timeline-row.running') &&
        document.querySelector('.run-timeline-row.error') &&
        document.querySelector('.run-timeline-row.ok') &&
        /Pass183 running workspace command/.test(text) &&
        /Pass183 failed workspace command/.test(text) &&
        /Pass183 completed workspace command/.test(text)
      );
    })();
  `, 8000));

  assertStep("PASS183_UPDATE_ERROR_RUN_TO_OK", await markErrorRunOk(win));
  assertStep("PASS183_OUTPUT_BADGE_DEGRADES_TO_RUNNING", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const runs = state.runEvents || [];
      const running = runs.filter((event) => event.status === 'running');
      const errors = runs.filter((event) => event.status === 'error');
      const top = document.querySelector('.workspace-context-button[data-context-tab="outputs"][data-status="running"]');
      const bottom = document.querySelector('.bottom-panel-tabs button[data-bottom-tab="outputs"][data-status="running"]');
      const topBadge = top?.querySelector('.context-tab-badge');
      const bottomBadge = bottom?.querySelector('.context-tab-badge');
      const aria = top?.getAttribute('aria-label') || '';
      return Boolean(
        runs.length === 3 &&
        running.length === 1 &&
        errors.length === 0 &&
        top &&
        bottom &&
        topBadge?.textContent.trim() === '1' &&
        bottomBadge?.textContent.trim() === '1' &&
        /\\u8fd0\\u884c 1/.test(aria) &&
        /\\u5931\\u8d25 0/.test(aria) &&
        /\\u6700\\u8fd1 3/.test(aria) &&
        !document.querySelector('.run-timeline-row.error')
      );
    })();
  `, 8000));

  console.log("PASS183_OUTPUT_RUN_STATUS_BADGE_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS183_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS183_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
