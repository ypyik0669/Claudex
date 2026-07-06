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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass133-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass133-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass133-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const ERROR_URL = "http://127.0.0.1:9/pass133-browser-error";
const READY_URL = "http://127.0.0.1/pass133-browser-ready";

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

function writeFakeClaude() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  const fake = path.join(FAKE_BIN_DIR, "claude.cmd");
  fs.writeFileSync(
    fake,
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass133& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins:& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces:& exit /b 0)",
      "if \"%1\"==\"mcp\" (echo No MCP servers configured& exit /b 0)",
      "echo pass133 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  return fake;
}

function writeInitialStore() {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass133-project" }), "utf8");
  const fakeClaude = writeFakeClaude();
  const project = { name: "pass133-project", path: PROJECT_DIR };
  writeJson(DATA_FILE, {
    version: 1,
    activeProject: project,
    projects: [project],
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
    sessions: [
      {
        id: "pass133-session",
        title: "Browser run timeline",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
        messages: [],
      },
    ],
    automations: [],
    subagentRuns: [],
    commandRuns: [],
    runEvents: [],
    sourceRefs: [],
    browserVisits: [
      {
        id: "pass133-browser-ready",
        url: READY_URL,
        finalUrl: `${READY_URL}/final`,
        title: "pass133 ready browser evidence",
        excerpt: "pass133 ready browser snapshot evidence",
        status: "ready",
        httpStatus: 200,
        project,
        startedAt: "2026-07-07T00:01:00.000Z",
        endedAt: "2026-07-07T00:01:02.000Z",
        lastEventAt: "2026-07-07T00:01:02.000Z",
        snapshotCapturedAt: "2026-07-07T00:01:02.000Z",
      },
      {
        id: "pass133-browser-error",
        url: ERROR_URL,
        finalUrl: ERROR_URL,
        status: "error",
        error: "ERR_CONNECTION_REFUSED",
        errorCode: -312,
        validatedUrl: ERROR_URL,
        isMainFrame: true,
        project,
        startedAt: "2026-07-07T00:02:00.000Z",
        endedAt: "2026-07-07T00:02:01.000Z",
        lastEventAt: "2026-07-07T00:02:01.000Z",
      },
    ],
    notices: [],
  });
}

async function openOutputsPanel(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.workspace-context-button, .bottom-panel-tabs button, button')]
        .find((item) => item.getAttribute('aria-label') === '\\u8f93\\u51fa' || /\\u8f93\\u51fa|Outputs/i.test(item.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS133_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS133_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS133_OPEN_OUTPUTS", await openOutputsPanel(win));
  assertStep("PASS133_BROWSER_TIMELINE_VISIBLE", await waitFor(win, `
    (function() {
      const rows = Array.from(document.querySelectorAll('.run-timeline-row'));
      const error = rows.find((row) => /pass133-browser-error/.test(row.textContent || ''));
      const ready = rows.find((row) => /pass133 ready browser evidence/.test(row.textContent || ''));
      return Boolean(
        document.querySelector('.run-timeline') &&
        error?.querySelector('[data-run-event-type="browser"]') &&
        ready?.querySelector('[data-run-event-type="browser"]') &&
        /ERR_CONNECTION_REFUSED/.test(error.textContent || '')
      );
    })();
  `, 10000));
  assertStep("PASS133_BROWSER_SELECTED_EVIDENCE", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.selected-run-evidence-panel.error');
      const text = panel?.textContent || '';
      return Boolean(
        panel &&
        /\\u6d4f\\u89c8\\u5668/.test(text) &&
        /pass133-browser-error/.test(text) &&
        /ERR_CONNECTION_REFUSED/.test(text) &&
        /\\u9519\\u8bef\\u7801/.test(text) &&
        /-312/.test(text) &&
        panel.querySelector('[data-run-recovery-action="retry-browser"]') &&
        panel.querySelector('[data-run-recovery-action="external-browser"]')
      );
    })();
  `, 10000));
  assertStep("PASS133_COPY_BROWSER_TIMELINE_EVIDENCE", await waitFor(win, `
    (async function() {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text) => { window.__pass133Clipboard = String(text || ''); } },
      });
      const panel = document.querySelector('.selected-run-evidence-panel.error');
      const copy = panel?.querySelector('[data-run-timeline-action="copy-evidence"]');
      if (!copy) return false;
      copy.click();
      await new Promise((resolve) => setTimeout(resolve, 250));
      const text = window.__pass133Clipboard || '';
      return /pass133-browser-error/.test(text) &&
        /ERR_CONNECTION_REFUSED/.test(text) &&
        /\\u9519\\u8bef\\u7801: -312/.test(text) &&
        /\\u4e3b\\u6846\\u67b6: true/.test(text);
    })();
  `, 10000));
  assertStep("PASS133_BROWSER_TIMELINE_RETRY_OPENS_TOOL", await waitFor(win, `
    (async function() {
      const panel = document.querySelector('.selected-run-evidence-panel.error');
      const retry = panel?.querySelector('[data-run-recovery-action="retry-browser"]');
      if (!retry) return false;
      retry.click();
      await new Promise((resolve) => setTimeout(resolve, 500));
      const grid = document.querySelector('.app-grid');
      const detail = document.querySelector('.tools-panel .browser-detail');
      const input = detail?.querySelector('.browser-toolbar input');
      const webview = detail?.querySelector('.browser-frame webview');
      return Boolean(
        grid && !grid.classList.contains('right-panel-hidden') &&
        detail &&
        input?.value === ${JSON.stringify(ERROR_URL)} &&
        (webview?.getAttribute('src') || '') === ${JSON.stringify(ERROR_URL)}
      );
    })();
  `, 12000));
  assertStep("PASS133_BROWSER_TIMELINE_EXTERNAL_BACKED_BY_STORE", await waitFor(win, `
    (async function() {
      const outputs = [...document.querySelectorAll('.workspace-context-button, .bottom-panel-tabs button, button')]
        .find((item) => item.getAttribute('aria-label') === '\\u8f93\\u51fa' || /\\u8f93\\u51fa|Outputs/i.test(item.textContent || ''));
      outputs?.click();
      await new Promise((resolve) => setTimeout(resolve, 250));
      const panel = document.querySelector('.selected-run-evidence-panel.error');
      const external = panel?.querySelector('[data-run-recovery-action="external-browser"]');
      if (!external || !window.claudexDesktop?.getState) return false;
      external.click();
      await new Promise((resolve) => setTimeout(resolve, 650));
      const state = await window.claudexDesktop.getState();
      return Boolean(state.browserVisits?.some((visit) =>
        visit.status === "external" &&
        visit.external === true &&
        visit.url === ${JSON.stringify(ERROR_URL)} &&
        visit.project?.path === ${JSON.stringify(PROJECT_DIR)}
      ));
    })();
  `, 10000));

  console.log("PASS133_BROWSER_RUN_TIMELINE_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS133_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS133_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
