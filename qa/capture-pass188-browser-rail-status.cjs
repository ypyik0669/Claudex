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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass188-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass188-project-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass188-bin-"));
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
      "if \"%1\"==\"--version\" (echo claude fake pass188& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass188 ok %*",
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
    url: `http://127.0.0.1/pass188-${suffix}`,
    finalUrl: `http://127.0.0.1/pass188-${suffix}`,
    title: `pass188 ${suffix} rail evidence`,
    excerpt: `pass188 ${suffix} stored rail evidence`,
    status,
    project: { name: "pass188-project", path: PROJECT_DIR },
    startedAt: `2026-07-07T22:0${extra.minute || 0}:00.000Z`,
    endedAt: status === "loading" ? "" : `2026-07-07T22:0${extra.minute || 0}:01.000Z`,
    lastEventAt: `2026-07-07T22:0${extra.minute || 0}:01.000Z`,
    snapshotCapturedAt: status === "ready" ? `2026-07-07T22:0${extra.minute || 0}:01.000Z` : "",
    ...extra,
  };
}

function writeInitialStore() {
  writeFakeClaude();
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass188-project" }, null, 2), "utf8");
  const project = { name: "pass188-project", path: PROJECT_DIR };
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
        id: "pass188-session",
        title: "Pass188 browser rail status",
        project: project.name,
        projectPath: project.path,
        createdAt: "2026-07-07T22:00:00.000Z",
        updatedAt: "2026-07-07T22:00:00.000Z",
        messages: [],
      },
    ],
    automations: [],
    subagentRuns: [],
    commandRuns: [],
    runEvents: [],
    sourceRefs: [],
    browserVisits: [
      browserVisit("pass188-error", "error", "error", { minute: 1, error: "PASS188_BROWSER_ERROR", errorCode: -312, validatedUrl: "http://127.0.0.1/pass188-error", isMainFrame: true }),
      browserVisit("pass188-loading", "loading", "loading", { minute: 2 }),
      browserVisit("pass188-ready", "ready", "ready", { minute: 3, httpStatus: 200 }),
      browserVisit("pass188-external", "external", "external", { minute: 4, external: true }),
    ],
    notices: [],
  });
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
  if (!win) throw new Error("PASS188_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS188_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS188_RAIL_VISIBLE", await waitFor(win, "Boolean(document.querySelector('.app-grid.right-panel-hidden') && document.querySelector('.rail-button[data-tool=\"browser\"]'))", 15000));
  assertStep("PASS188_BROWSER_RAIL_ERROR_PRIORITY", await waitFor(win, `
    (function() {
      const browser = document.querySelector('.rail-button[data-tool="browser"][data-tool-rail-status="error"]');
      const title = browser?.getAttribute('title') || '';
      const aria = browser?.getAttribute('aria-label') || '';
      return Boolean(
        browser &&
        browser.querySelector('em')?.textContent === '!' &&
        /\\u6d4f\\u89c8\\u8bb0\\u5f55 4/.test(title) &&
        /\\u5931\\u8d25 1/.test(title) &&
        /\\u52a0\\u8f7d\\u4e2d 1/.test(title) &&
        /\\u5916\\u90e8\\u6253\\u5f00 1/.test(title) &&
        /\\u6d4f\\u89c8\\u8bb0\\u5f55 4/.test(aria)
      );
    })();
  `, 10000));

  assertStep("PASS188_RESOLVE_ERROR_TO_READY", await updateVisit(win, {
    id: "pass188-error",
    url: "http://127.0.0.1/pass188-error",
    finalUrl: "http://127.0.0.1/pass188-error",
    title: "pass188 resolved rail evidence",
    excerpt: "pass188 resolved ready rail evidence",
    status: "ready",
    httpStatus: 200,
  }));
  assertStep("PASS188_BROWSER_RAIL_RUNNING_PRIORITY", await waitFor(win, `
    (function() {
      const browser = document.querySelector('.rail-button[data-tool="browser"][data-tool-rail-status="running"]');
      const title = browser?.getAttribute('title') || '';
      return Boolean(
        browser &&
        browser.querySelector('em')?.textContent === '1' &&
        /\\u6d4f\\u89c8\\u8bb0\\u5f55 4/.test(title) &&
        /\\u52a0\\u8f7d\\u4e2d 1/.test(title) &&
        /\\u5931\\u8d25 0/.test(title)
      );
    })();
  `, 10000));

  assertStep("PASS188_RESOLVE_LOADING_TO_READY", await updateVisit(win, {
    id: "pass188-loading",
    url: "http://127.0.0.1/pass188-loading",
    finalUrl: "http://127.0.0.1/pass188-loading",
    title: "pass188 loading resolved rail evidence",
    excerpt: "pass188 loading resolved ready rail evidence",
    status: "ready",
    httpStatus: 200,
  }));
  assertStep("PASS188_BROWSER_RAIL_READY_STATUS", await waitFor(win, `
    (function() {
      const browser = document.querySelector('.rail-button[data-tool="browser"][data-tool-rail-status="ready"]');
      const title = browser?.getAttribute('title') || '';
      const aria = browser?.getAttribute('aria-label') || '';
      return Boolean(
        browser &&
        browser.querySelector('em')?.textContent === '4' &&
        /\\u6d4f\\u89c8\\u8bb0\\u5f55 4/.test(title) &&
        /\\u5df2\\u52a0\\u8f7d 3/.test(title) &&
        /\\u52a0\\u8f7d\\u4e2d 0/.test(title) &&
        /\\u5931\\u8d25 0/.test(title) &&
        /\\u5916\\u90e8\\u6253\\u5f00 1/.test(aria)
      );
    })();
  `, 10000));

  console.log("PASS188_BROWSER_RAIL_STATUS_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS188_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (function() {
          const browser = document.querySelector('.rail-button[data-tool="browser"]');
          return {
            status: browser?.getAttribute('data-tool-rail-status') || '',
            title: browser?.getAttribute('title') || '',
            aria: browser?.getAttribute('aria-label') || '',
            badge: browser?.querySelector('em')?.textContent || '',
            body: document.body?.textContent?.slice(0, 4000) || '',
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS188_DEBUG", JSON.stringify(debug, null, 2).slice(0, 8000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS188_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
