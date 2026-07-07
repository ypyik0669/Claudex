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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass191-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass191-project-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass191-bin-"));
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
      "if \"%1\"==\"--version\" (echo claude fake pass191& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass191 ok %*",
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
    url: `http://127.0.0.1/pass191-${suffix}`,
    finalUrl: `http://127.0.0.1/pass191-${suffix}`,
    title: `pass191 ${suffix} tool summary`,
    excerpt: `pass191 ${suffix} stored tool summary`,
    status,
    project: { name: "pass191-project", path: PROJECT_DIR },
    startedAt: `2026-07-07T23:2${extra.minute || 0}:00.000Z`,
    endedAt: status === "loading" ? "" : `2026-07-07T23:2${extra.minute || 0}:01.000Z`,
    lastEventAt: `2026-07-07T23:2${extra.minute || 0}:01.000Z`,
    snapshotCapturedAt: status === "ready" ? `2026-07-07T23:2${extra.minute || 0}:01.000Z` : "",
    ...extra,
  };
}

function writeInitialStore() {
  writeFakeClaude();
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass191-project" }, null, 2), "utf8");
  const project = { name: "pass191-project", path: PROJECT_DIR };
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
        id: "pass191-session",
        title: "Pass191 browser tool evidence summary",
        project: project.name,
        projectPath: project.path,
        createdAt: "2026-07-07T23:20:00.000Z",
        updatedAt: "2026-07-07T23:20:00.000Z",
        messages: [],
      },
    ],
    automations: [],
    subagentRuns: [],
    commandRuns: [],
    runEvents: [],
    sourceRefs: [],
    browserVisits: [
      browserVisit("pass191-error", "error", "error", { minute: 1, error: "PASS191_BROWSER_ERROR", errorCode: -312, validatedUrl: "http://127.0.0.1/pass191-error", isMainFrame: true }),
      browserVisit("pass191-loading", "loading", "loading", { minute: 2 }),
      browserVisit("pass191-ready", "ready", "ready", { minute: 3, httpStatus: 200 }),
      browserVisit("pass191-external", "external", "external", { minute: 4, external: true }),
    ],
    notices: [],
  });
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
  if (!win) throw new Error("PASS191_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS191_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS191_OPEN_BROWSER_TOOL_ERROR", await openBrowserTool(win));
  assertStep("PASS191_TOOL_SUMMARY_ERROR_ACTIONS", await waitFor(win, `
    (function() {
      const summary = document.querySelector('.tools-panel #browser-tool-detail [data-browser-evidence-summary="tool"][data-status="error"]');
      const text = summary?.textContent || '';
      const history = document.querySelector('.tools-panel #browser-tool-detail .browser-history-section')?.textContent || '';
      return Boolean(
        summary &&
        /\\u6d4f\\u89c8\\u8bb0\\u5f55 4/.test(text) &&
        /\\u5931\\u8d25 1/.test(text) &&
        /\\u52a0\\u8f7d\\u4e2d 1/.test(text) &&
        /PASS191_BROWSER_ERROR/.test(history) &&
        summary.querySelector('[data-browser-evidence-action="retry"]') &&
        summary.querySelector('[data-browser-evidence-action="external"]')
      );
    })();
  `, 10000));
  assertStep("PASS191_TOOL_SUMMARY_RETRY_PREVIEWS_ERROR", await win.webContents.executeJavaScript(`
    (function() {
      const retry = document.querySelector('.tools-panel #browser-tool-detail [data-browser-evidence-summary="tool"] [data-browser-evidence-action="retry"]');
      if (!retry) return false;
      retry.click();
      return true;
    })();
  `));
  assertStep("PASS191_TOOL_INPUT_UPDATED_FROM_SUMMARY", await waitFor(win, `
    (function() {
      const input = document.querySelector('.tools-panel #browser-tool-detail .browser-toolbar input');
      const row = document.querySelector('.tools-panel #browser-tool-detail .browser-status-row.loading');
      return Boolean(input && /pass191-error/.test(input.value || '') && row);
    })();
  `, 10000));

  assertStep("PASS191_RESOLVE_ERROR_TO_READY", await updateVisit(win, {
    id: "pass191-error",
    url: "http://127.0.0.1/pass191-error",
    finalUrl: "http://127.0.0.1/pass191-error",
    title: "pass191 resolved tool summary",
    excerpt: "pass191 resolved ready tool summary",
    status: "ready",
    httpStatus: 200,
  }));
  assertStep("PASS191_OPEN_BROWSER_TOOL_RUNNING", await openBrowserTool(win));
  assertStep("PASS191_TOOL_SUMMARY_RUNNING_ACTIONS", await waitFor(win, `
    (function() {
      const summary = document.querySelector('.tools-panel #browser-tool-detail [data-browser-evidence-summary="tool"][data-status="running"]');
      const text = summary?.textContent || '';
      return Boolean(
        summary &&
        /\\u6d4f\\u89c8\\u8bb0\\u5f55 4/.test(text) &&
        /\\u52a0\\u8f7d\\u4e2d 1/.test(text) &&
        /\\u5931\\u8d25 0/.test(text) &&
        summary.querySelector('[data-browser-evidence-action="open"]') &&
        summary.querySelector('[data-browser-evidence-action="external"]')
      );
    })();
  `, 10000));

  assertStep("PASS191_RESOLVE_LOADING_TO_READY", await updateVisit(win, {
    id: "pass191-loading",
    url: "http://127.0.0.1/pass191-loading",
    finalUrl: "http://127.0.0.1/pass191-loading",
    title: "pass191 loading resolved tool summary",
    excerpt: "pass191 loading resolved ready tool summary",
    status: "ready",
    httpStatus: 200,
  }));
  assertStep("PASS191_OPEN_BROWSER_TOOL_INFO", await openBrowserTool(win));
  assertStep("PASS191_TOOL_SUMMARY_INFO_NO_RECOVERY", await waitFor(win, `
    (function() {
      const summary = document.querySelector('.tools-panel #browser-tool-detail [data-browser-evidence-summary="tool"][data-status="info"]');
      const text = summary?.textContent || '';
      return Boolean(
        summary &&
        /\\u6d4f\\u89c8\\u8bb0\\u5f55 4/.test(text) &&
        /\\u5df2\\u52a0\\u8f7d 3/.test(text) &&
        /\\u52a0\\u8f7d\\u4e2d 0/.test(text) &&
        /\\u5931\\u8d25 0/.test(text) &&
        /\\u5916\\u90e8\\u6253\\u5f00 1/.test(text) &&
        !summary.querySelector('[data-browser-evidence-action="retry"]') &&
        !summary.querySelector('[data-browser-evidence-action="open"]') &&
        !summary.querySelector('[data-browser-evidence-action="external"]')
      );
    })();
  `, 10000));

  console.log("PASS191_BROWSER_TOOL_EVIDENCE_SUMMARY_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS191_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (function() {
          const summary = document.querySelector('.tools-panel #browser-tool-detail [data-browser-evidence-summary]');
          return {
            status: summary?.getAttribute('data-status') || '',
            scope: summary?.getAttribute('data-browser-evidence-summary') || '',
            text: summary?.textContent || '',
            title: summary?.getAttribute('title') || '',
            browserInput: document.querySelector('.tools-panel #browser-tool-detail .browser-toolbar input')?.value || '',
            body: document.body?.textContent?.slice(0, 4000) || '',
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS191_DEBUG", JSON.stringify(debug, null, 2).slice(0, 8000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS191_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
