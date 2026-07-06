const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass101-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass101-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass101-project-"));
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

function writeFakeClaude() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  const fake = path.join(FAKE_BIN_DIR, "claude.cmd");
  fs.writeFileSync(
    fake,
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass101& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins:& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces:& exit /b 0)",
      "if \"%1\"==\"mcp\" (echo No MCP servers configured& exit /b 0)",
      "echo pass101 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  return fake;
}

function writeInitialStore() {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass101-project" }), "utf8");
  const fakeClaude = writeFakeClaude();
  const project = { name: "pass101-project", path: PROJECT_DIR };
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
        id: "pass101-session",
        title: "Browser evidence metadata",
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
        id: "pass101-visit-ready",
        url: "http://127.0.0.1/pass101-requested",
        finalUrl: "http://127.0.0.1/pass101-final",
        title: "pass101 structured browser title",
        excerpt: "pass101 structured browser excerpt from stored webview snapshot",
        status: "ready",
        httpStatus: 200,
        project,
        startedAt: "2026-07-06T01:02:00.000Z",
        endedAt: "2026-07-06T01:02:03.000Z",
        lastEventAt: "2026-07-06T01:02:03.000Z",
        snapshotCapturedAt: "2026-07-06T01:02:03.000Z",
      },
      {
        id: "pass101-visit-error",
        url: "http://127.0.0.1:9/pass101-error",
        finalUrl: "http://127.0.0.1:9/pass101-error",
        status: "error",
        error: "ERR_CONNECTION_REFUSED",
        errorCode: -312,
        validatedUrl: "http://127.0.0.1:9/pass101-error",
        isMainFrame: true,
        project,
        startedAt: "2026-07-06T01:03:00.000Z",
        endedAt: "2026-07-06T01:03:01.000Z",
        lastEventAt: "2026-07-06T01:03:01.000Z",
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

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS101_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS101_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS101_OPEN_BOTTOM_BROWSER", await openBottomBrowserPanel(win));
  assertStep("PASS101_BOTTOM_BROWSER_METADATA", await waitFor(win, `
    (function() {
      const cards = Array.from(document.querySelectorAll('.bottom-work-panel .browser-evidence-card'));
      const ready = cards.find((card) => /pass101 structured browser title/.test(card.textContent || ''));
      const error = cards.find((card) => /ERR_CONNECTION_REFUSED/.test(card.textContent || ''));
      const readyText = ready?.textContent || '';
      const errorText = error?.textContent || '';
      return Boolean(
        ready?.querySelector('[data-browser-evidence-meta]') &&
        error?.querySelector('[data-browser-evidence-meta]') &&
        /最终 URL/.test(readyText) &&
        /http:\\/\\/127\\.0\\.0\\.1\\/pass101-final/.test(readyText) &&
        /标题/.test(readyText) &&
        /捕获时间/.test(readyText) &&
        /HTTP/.test(readyText) &&
        /200/.test(readyText) &&
        /错误码/.test(errorText) &&
        /-312/.test(errorText) &&
        /验证 URL/.test(errorText) &&
        /主框架/.test(errorText)
      );
    })();
  `, 10000));
  assertStep("PASS101_COPY_READY_EVIDENCE", await waitFor(win, `
    (async function() {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text) => {
            window.__pass101Clipboard = text;
          }
        }
      });
      const ready = Array.from(document.querySelectorAll('.bottom-work-panel .browser-evidence-card'))
        .find((card) => /pass101 structured browser title/.test(card.textContent || ''));
      const copy = ready?.querySelector('[data-browser-visit-action="copy"]');
      if (!copy) return false;
      copy.click();
      await new Promise((resolve) => setTimeout(resolve, 250));
      const text = window.__pass101Clipboard || '';
      return Boolean(
        /最终 URL: http:\\/\\/127\\.0\\.0\\.1\\/pass101-final/.test(text) &&
        /标题: pass101 structured browser title/.test(text) &&
        /捕获时间: 2026-07-06T01:02:03\\.000Z/.test(text) &&
        /HTTP: 200/.test(text) &&
        /摘录: pass101 structured browser excerpt/.test(text) &&
        /证据已复制/.test(copy.textContent || '')
      );
    })();
  `, 10000));
  assertStep("PASS101_BROWSER_TOOL_METADATA", await waitFor(win, `
    (async function() {
      const openSide = document.querySelector('.bottom-work-panel .bottom-panel-actions .plain-action');
      if (!openSide) return false;
      openSide.click();
      await new Promise((resolve) => setTimeout(resolve, 350));
      const panelText = document.querySelector('.tools-panel .browser-history-section')?.textContent || '';
      return Boolean(
        document.querySelector('.tools-panel .browser-history-section [data-browser-evidence-meta]') &&
        /最终 URL/.test(panelText) &&
        /pass101-final/.test(panelText) &&
        /错误码/.test(panelText)
      );
    })();
  `, 10000));

  console.log("PASS101_BROWSER_EVIDENCE_METADATA_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS101_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS101_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
