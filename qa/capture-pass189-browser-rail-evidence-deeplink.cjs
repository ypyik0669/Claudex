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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass189-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass189-project-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass189-bin-"));
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
      "if \"%1\"==\"--version\" (echo claude fake pass189& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass189 ok %*",
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
    url: `http://127.0.0.1/pass189-${suffix}`,
    finalUrl: `http://127.0.0.1/pass189-${suffix}`,
    title: `pass189 ${suffix} rail evidence`,
    excerpt: `pass189 ${suffix} stored rail evidence`,
    status,
    project: { name: "pass189-project", path: PROJECT_DIR },
    startedAt: `2026-07-07T23:0${extra.minute || 0}:00.000Z`,
    endedAt: status === "loading" ? "" : `2026-07-07T23:0${extra.minute || 0}:01.000Z`,
    lastEventAt: `2026-07-07T23:0${extra.minute || 0}:01.000Z`,
    snapshotCapturedAt: status === "ready" ? `2026-07-07T23:0${extra.minute || 0}:01.000Z` : "",
    ...extra,
  };
}

function writeInitialStore() {
  writeFakeClaude();
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass189-project" }, null, 2), "utf8");
  const project = { name: "pass189-project", path: PROJECT_DIR };
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
        id: "pass189-session",
        title: "Pass189 browser rail evidence deeplink",
        project: project.name,
        projectPath: project.path,
        createdAt: "2026-07-07T23:00:00.000Z",
        updatedAt: "2026-07-07T23:00:00.000Z",
        messages: [],
      },
    ],
    automations: [],
    subagentRuns: [],
    commandRuns: [],
    runEvents: [],
    sourceRefs: [],
    browserVisits: [
      browserVisit("pass189-error", "error", "error", { minute: 1, error: "PASS189_BROWSER_ERROR", errorCode: -312, validatedUrl: "http://127.0.0.1/pass189-error", isMainFrame: true }),
      browserVisit("pass189-loading", "loading", "loading", { minute: 2 }),
      browserVisit("pass189-ready", "ready", "ready", { minute: 3, httpStatus: 200 }),
      browserVisit("pass189-external", "external", "external", { minute: 4, external: true }),
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

async function clickBrowserRail(win, expectedStatus) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.rail-button[data-tool="browser"][data-tool-rail-status="${expectedStatus}"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS189_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS189_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS189_CLICK_ERROR_RAIL", await clickBrowserRail(win, "error"));
  assertStep("PASS189_ERROR_RAIL_FOCUSES_BROWSER_EVIDENCE", await waitFor(win, `
    (function() {
      const selected = document.querySelector('.bottom-work-panel .browser-evidence-card.selected[data-browser-visit-id="pass189-error"][data-browser-visit-status="error"]');
      const active = document.querySelector('.bottom-panel-tabs button[data-bottom-tab="browser"].active');
      return Boolean(
        document.querySelector('.app-grid.right-panel-hidden') &&
        active &&
        selected &&
        /PASS189_BROWSER_ERROR/.test(selected.textContent || '') &&
        selected.querySelector('[data-browser-visit-action="retry"]') &&
        selected.querySelector('[data-browser-visit-action="external"]')
      );
    })();
  `, 10000));

  assertStep("PASS189_RESOLVE_ERROR_TO_READY", await updateVisit(win, {
    id: "pass189-error",
    url: "http://127.0.0.1/pass189-error",
    finalUrl: "http://127.0.0.1/pass189-error",
    title: "pass189 resolved rail evidence",
    excerpt: "pass189 resolved ready rail evidence",
    status: "ready",
    httpStatus: 200,
  }));
  assertStep("PASS189_CLICK_RUNNING_RAIL", await clickBrowserRail(win, "running"));
  assertStep("PASS189_RUNNING_RAIL_FOCUSES_LOADING_EVIDENCE", await waitFor(win, `
    (function() {
      const selected = document.querySelector('.bottom-work-panel .browser-evidence-card.selected[data-browser-visit-id="pass189-loading"][data-browser-visit-status="loading"]');
      const active = document.querySelector('.bottom-panel-tabs button[data-bottom-tab="browser"].active');
      return Boolean(
        document.querySelector('.app-grid.right-panel-hidden') &&
        active &&
        selected &&
        /pass189 loading stored rail evidence/.test(selected.textContent || '') &&
        selected.querySelector('[data-browser-visit-action="open"]') &&
        selected.querySelector('[data-browser-visit-action="external"]')
      );
    })();
  `, 10000));

  assertStep("PASS189_RESOLVE_LOADING_TO_READY", await updateVisit(win, {
    id: "pass189-loading",
    url: "http://127.0.0.1/pass189-loading",
    finalUrl: "http://127.0.0.1/pass189-loading",
    title: "pass189 loading resolved rail evidence",
    excerpt: "pass189 loading resolved ready rail evidence",
    status: "ready",
    httpStatus: 200,
  }));
  assertStep("PASS189_CLICK_READY_RAIL", await clickBrowserRail(win, "ready"));
  assertStep("PASS189_READY_RAIL_OPENS_BROWSER_TOOL", await waitFor(win, `
    (function() {
      const grid = document.querySelector('.app-grid');
      const detail = document.querySelector('.tools-panel #browser-tool-detail');
      const activeTool = document.querySelector('.tools-panel .tool-row.active[aria-controls="browser-tool-detail"]');
      const history = detail?.querySelector('.browser-history-section')?.textContent || '';
      return Boolean(
        grid &&
        !grid.classList.contains('right-panel-hidden') &&
        detail &&
        activeTool &&
        /pass189 loading resolved rail evidence/.test(history) &&
        /pass189 external stored rail evidence/.test(history)
      );
    })();
  `, 10000));

  console.log("PASS189_BROWSER_RAIL_EVIDENCE_DEEPLINK_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS189_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (function() {
          const rail = document.querySelector('.rail-button[data-tool="browser"]');
          const selected = document.querySelector('.browser-evidence-card.selected');
          return {
            railStatus: rail?.getAttribute('data-tool-rail-status') || '',
            railTitle: rail?.getAttribute('title') || '',
            bottomActive: document.querySelector('.bottom-panel-tabs button.active')?.getAttribute('data-bottom-tab') || '',
            selectedId: selected?.getAttribute('data-browser-visit-id') || '',
            selectedStatus: selected?.getAttribute('data-browser-visit-status') || '',
            selectedText: selected?.textContent || '',
            rightHidden: document.querySelector('.app-grid')?.classList.contains('right-panel-hidden'),
            body: document.body?.textContent?.slice(0, 4000) || '',
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS189_DEBUG", JSON.stringify(debug, null, 2).slice(0, 8000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS189_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
