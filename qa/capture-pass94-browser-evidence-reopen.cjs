const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass94-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass94-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass94-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");

function cleanup(server) {
  try {
    server?.close();
  } catch (_error) {
    // best-effort cleanup
  }
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
      "if \"%1\"==\"--version\" (echo claude fake pass94& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins:& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces:& exit /b 0)",
      "if \"%1\"==\"mcp\" (echo No MCP servers configured& exit /b 0)",
      "echo pass94 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  return fake;
}

function writeInitialStore(goodUrl) {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass94-project" }), "utf8");
  const fakeClaude = writeFakeClaude();
  const project = { name: "pass94-project", path: PROJECT_DIR };
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
        id: "pass94-session",
        title: "Browser evidence reopen",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-06T00:00:00.000Z",
        updatedAt: "2026-07-06T00:00:00.000Z",
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
        id: "pass94-visit-ready",
        url: goodUrl,
        title: "pass94 saved browser visit",
        excerpt: "pass94 stored browser evidence from a previous webview load",
        status: "ready",
        project,
        startedAt: "2026-07-06T00:00:00.000Z",
        endedAt: "2026-07-06T00:00:01.000Z",
        lastEventAt: "2026-07-06T00:00:01.000Z",
        snapshotCapturedAt: "2026-07-06T00:00:01.000Z",
      },
    ],
    notices: [],
  });
}

async function openBottomBrowserPanel(win) {
  return win.webContents.executeJavaScript(`
    (async function() {
      if (!document.querySelector('.bottom-work-panel')) {
        const first = document.querySelector('.workspace-context-button');
        if (!first) return false;
        first.click();
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      const browserTab = Array.from(document.querySelectorAll('.bottom-panel-tabs button[role="tab"]'))
        .find((button) => /浏览器|Browser/i.test(button.textContent || ''));
      if (!browserTab) return false;
      browserTab.click();
      await new Promise((resolve) => setTimeout(resolve, 250));
      return Boolean(document.querySelector('.bottom-work-panel .browser-evidence-card.ready'));
    })();
  `);
}

async function clickReopenVisit(win) {
  return win.webContents.executeJavaScript(`
    (async function() {
      const card = Array.from(document.querySelectorAll('.bottom-work-panel .browser-evidence-card'))
        .find((item) => /pass94 saved browser visit|pass94 stored browser evidence/.test(item.textContent || ''));
      const button = card?.querySelector('[data-browser-visit-action="open"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest(server, goodUrl) {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS94_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS94_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS94_OPEN_BOTTOM_BROWSER", await openBottomBrowserPanel(win));
  assertStep("PASS94_REOPEN_ACTION_VISIBLE", await waitFor(win, `
    Boolean(
      document.querySelector('.bottom-work-panel .browser-evidence-card.ready [data-browser-visit-action="open"]') &&
      /pass94 stored browser evidence/.test(document.querySelector('.bottom-work-panel')?.textContent || '')
    )
  `, 5000));
  assertStep("PASS94_CLICK_REOPEN_VISIT", await clickReopenVisit(win));
  assertStep("PASS94_BROWSER_TOOL_REOPENED_VISIT", await waitFor(win, `
    (function() {
      const grid = document.querySelector('.app-grid');
      const detail = document.querySelector('.tools-panel .browser-detail');
      const input = detail?.querySelector('.browser-toolbar input');
      const webview = detail?.querySelector('.browser-frame webview');
      const currentUrl = webview?.getAttribute('src') || '';
      return Boolean(
        grid && !grid.classList.contains('right-panel-hidden') &&
        detail &&
        input?.value === ${JSON.stringify(goodUrl)} &&
        currentUrl === ${JSON.stringify(goodUrl)}
      );
    })();
  `, 12000));
  assertStep("PASS94_BROWSER_VISIT_REFRESHED_FROM_EVIDENCE", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const visit = state.browserVisits?.find((item) => item.url === ${JSON.stringify(goodUrl)} && item.status === 'ready');
      return Boolean(visit && /pass94 reopen live page/.test(visit.excerpt || '') && visit.project?.path === ${JSON.stringify(PROJECT_DIR)});
    })();
  `, 15000));

  console.log("PASS94_BROWSER_EVIDENCE_REOPEN_DONE");
  cleanup(server);
  app.exit(0);
}

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end("<!doctype html><title>pass94 reopened page</title><main><h1>pass94-ready</h1><p>pass94 reopen live page from restored browser evidence</p></main>");
});

server.listen(0, "127.0.0.1", () => {
  const { port } = server.address();
  const goodUrl = `http://127.0.0.1:${port}/pass94-ready`;
  app.setPath("userData", USER_DATA_DIR);
  writeInitialStore(goodUrl);
  require(path.join(REPO_DIR, "electron", "main.cjs"));
  app.whenReady().then(() => runTest(server, goodUrl)).catch((error) => {
    console.error("PASS94_FAILED", error?.stack || error);
    cleanup(server);
    app.exit(1);
  });
});

setTimeout(() => {
  console.error("PASS94_TIMEOUT");
  cleanup(server);
  app.exit(1);
}, 90000);
