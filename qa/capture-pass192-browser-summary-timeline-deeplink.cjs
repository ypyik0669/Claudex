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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass192-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass192-project-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass192-bin-"));
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");

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

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function writeFakeClaude() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(
    FAKE_CLAUDE,
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass192& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass192 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function browserVisit(id, status, suffix, extra = {}) {
  return {
    id,
    url: `http://127.0.0.1/pass192-${suffix}`,
    finalUrl: `http://127.0.0.1/pass192-${suffix}`,
    title: `pass192 ${suffix} timeline summary`,
    excerpt: `pass192 ${suffix} stored timeline summary`,
    status,
    project: { name: "pass192-project", path: PROJECT_DIR },
    startedAt: `2026-07-07T23:3${extra.minute || 0}:00.000Z`,
    endedAt: status === "loading" ? "" : `2026-07-07T23:3${extra.minute || 0}:01.000Z`,
    lastEventAt: `2026-07-07T23:3${extra.minute || 0}:01.000Z`,
    snapshotCapturedAt: status === "ready" ? `2026-07-07T23:3${extra.minute || 0}:01.000Z` : "",
    ...extra,
  };
}

function writeInitialStore() {
  writeFakeClaude();
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass192-project" }, null, 2), "utf8");
  const project = { name: "pass192-project", path: PROJECT_DIR };
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
        id: "pass192-session",
        title: "Pass192 browser summary timeline deeplink",
        project: project.name,
        projectPath: project.path,
        createdAt: "2026-07-07T23:30:00.000Z",
        updatedAt: "2026-07-07T23:30:00.000Z",
        messages: [],
      },
    ],
    automations: [],
    subagentRuns: [],
    commandRuns: [],
    runEvents: [],
    sourceRefs: [],
    browserVisits: [
      browserVisit("pass192-error", "error", "error", { minute: 1, error: "PASS192_BROWSER_ERROR", errorCode: -312, validatedUrl: "http://127.0.0.1/pass192-error", isMainFrame: true }),
      browserVisit("pass192-loading", "loading", "loading", { minute: 2 }),
      browserVisit("pass192-ready", "ready", "ready", { minute: 3, httpStatus: 200 }),
      browserVisit("pass192-external", "external", "external", { minute: 4, external: true }),
    ],
    notices: [],
  });
}

async function openBrowserBottomTab(win) {
  return win.webContents.executeJavaScript(`
    (async function() {
      if (!document.querySelector('.bottom-work-panel')) {
        const env = document.querySelector('.workspace-context-button[data-context-tab="environment"]');
        if (!env) return false;
        env.click();
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      const tab = document.querySelector('.bottom-panel-tabs button[data-bottom-tab="browser"]');
      if (!tab) return false;
      tab.click();
      await new Promise((resolve) => setTimeout(resolve, 250));
      return Boolean(document.querySelector('.bottom-work-panel'));
    })();
  `);
}

async function openBrowserTool(win) {
  return win.webContents.executeJavaScript(`
    (async function() {
      if (document.querySelector('.app-grid.right-panel-hidden')) {
        const toggle = document.querySelector('.rail-toggle');
        if (!toggle) return false;
        toggle.click();
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      const row = document.querySelector('.tools-panel .tool-row[aria-controls="browser-tool-detail"]');
      if (!row) return false;
      row.click();
      await new Promise((resolve) => setTimeout(resolve, 250));
      return Boolean(document.querySelector('.tools-panel #browser-tool-detail'));
    })();
  `);
}

async function reload(win) {
  win.webContents.reload();
  await wait(1800);
  return true;
}

async function updateVisit(win, payload) {
  const ok = await win.webContents.executeJavaScript(`
    (async function() {
      const next = await window.claudexDesktop.recordBrowserVisit(${JSON.stringify({ ...payload, projectPath: PROJECT_DIR })});
      return Boolean(next?.browserVisits?.some((visit) => visit.id === ${JSON.stringify(payload.id)} && visit.status === ${JSON.stringify(payload.status)}));
    })();
  `);
  if (!ok) return false;
  return reload(win);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS192_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS192_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS192_OPEN_BOTTOM_BROWSER", await openBrowserBottomTab(win));
  assertStep("PASS192_BOTTOM_SUMMARY_TIMELINE_ACTION", await waitFor(win, `
    Boolean(
      document.querySelector('.bottom-work-panel [data-browser-evidence-summary="bottom"][data-status="error"] [data-browser-evidence-action="timeline"]') &&
      /PASS192_BROWSER_ERROR/.test(document.querySelector('.bottom-work-panel')?.textContent || '')
    )
  `, 10000));
  assertStep("PASS192_CLICK_BOTTOM_TIMELINE", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.bottom-work-panel [data-browser-evidence-summary="bottom"] [data-browser-evidence-action="timeline"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS192_BOTTOM_TIMELINE_FOCUSES_ERROR_EVENT", await waitFor(win, `
    (function() {
      const active = document.querySelector('.bottom-panel-tabs button[data-bottom-tab="outputs"].active');
      const panel = document.querySelector('.selected-run-evidence-panel.error');
      const text = panel?.textContent || '';
      return Boolean(
        active &&
        panel &&
        /pass192 error timeline summary/.test(text) &&
        /PASS192_BROWSER_ERROR/.test(text) &&
        /pass192-error/.test(text) &&
        panel.querySelector('[data-run-event-type="browser"]') &&
        panel.querySelector('[data-run-recovery-action="retry-browser"]') &&
        panel.querySelector('[data-run-recovery-action="external-browser"]')
      );
    })();
  `, 10000));

  assertStep("PASS192_RESOLVE_ERROR_TO_READY", await updateVisit(win, {
    id: "pass192-error",
    url: "http://127.0.0.1/pass192-error",
    finalUrl: "http://127.0.0.1/pass192-error",
    title: "pass192 resolved timeline summary",
    excerpt: "pass192 resolved ready timeline summary",
    status: "ready",
    httpStatus: 200,
  }));
  assertStep("PASS192_OPEN_BROWSER_TOOL_RUNNING", await openBrowserTool(win));
  assertStep("PASS192_TOOL_SUMMARY_TIMELINE_ACTION", await waitFor(win, `
    Boolean(document.querySelector('.tools-panel #browser-tool-detail [data-browser-evidence-summary="tool"][data-status="running"] [data-browser-evidence-action="timeline"]'))
  `, 10000));
  assertStep("PASS192_CLICK_TOOL_TIMELINE", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.tools-panel #browser-tool-detail [data-browser-evidence-summary="tool"] [data-browser-evidence-action="timeline"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS192_TOOL_TIMELINE_FOCUSES_LOADING_EVENT", await waitFor(win, `
    (function() {
      const active = document.querySelector('.bottom-panel-tabs button[data-bottom-tab="outputs"].active');
      const panel = document.querySelector('.selected-run-evidence-panel.running');
      const text = panel?.textContent || '';
      return Boolean(
        active &&
        panel &&
        /pass192 loading timeline summary/.test(text) &&
        /pass192-loading/.test(text) &&
        panel.querySelector('[data-run-event-type="browser"]') &&
        panel.querySelector('[data-run-recovery-action="retry-browser"]') &&
        panel.querySelector('[data-run-recovery-action="external-browser"]')
      );
    })();
  `, 10000));

  assertStep("PASS192_RESOLVE_LOADING_TO_READY", await updateVisit(win, {
    id: "pass192-loading",
    url: "http://127.0.0.1/pass192-loading",
    finalUrl: "http://127.0.0.1/pass192-loading",
    title: "pass192 loading resolved timeline summary",
    excerpt: "pass192 loading resolved ready timeline summary",
    status: "ready",
    httpStatus: 200,
  }));
  assertStep("PASS192_OPEN_BROWSER_TOOL_INFO", await openBrowserTool(win));
  assertStep("PASS192_TOOL_INFO_TIMELINE_ACTION", await waitFor(win, `
    Boolean(document.querySelector('.tools-panel #browser-tool-detail [data-browser-evidence-summary="tool"][data-status="info"] [data-browser-evidence-action="timeline"]'))
  `, 10000));
  assertStep("PASS192_CLICK_INFO_TIMELINE", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.tools-panel #browser-tool-detail [data-browser-evidence-summary="tool"] [data-browser-evidence-action="timeline"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS192_INFO_TIMELINE_FOCUSES_OK_EVENT", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.selected-run-evidence-panel.ok');
      const text = panel?.textContent || '';
      return Boolean(
        document.querySelector('.bottom-panel-tabs button[data-bottom-tab="outputs"].active') &&
        panel &&
        /pass192 loading resolved timeline summary/.test(text) &&
        /pass192-loading/.test(text) &&
        panel.querySelector('[data-run-event-type="browser"]')
      );
    })();
  `, 10000));

  console.log("PASS192_BROWSER_SUMMARY_TIMELINE_DEEPLINK_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS192_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (function() {
          const summary = document.querySelector('[data-browser-evidence-summary]');
          const panel = document.querySelector('.selected-run-evidence-panel');
          return {
            summaryScope: summary?.getAttribute('data-browser-evidence-summary') || '',
            summaryStatus: summary?.getAttribute('data-status') || '',
            summaryText: summary?.textContent || '',
            activeBottom: document.querySelector('.bottom-panel-tabs button.active')?.getAttribute('data-bottom-tab') || '',
            selectedClass: panel?.className || '',
            selectedText: panel?.textContent || '',
            body: document.body?.textContent?.slice(0, 4000) || '',
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS192_DEBUG", JSON.stringify(debug, null, 2).slice(0, 8000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS192_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
