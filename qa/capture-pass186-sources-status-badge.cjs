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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass186-data-"));
const ACTIVE_PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass186-active-"));
const OTHER_PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass186-other-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass186-bin-"));
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const ACTIVE_SOURCE_A = "src/pass186-active-a.txt";
const ACTIVE_SOURCE_B = "docs/pass186-active-b.md";
const OTHER_SOURCE = "src/pass186-other.txt";

function cleanup() {
  for (const dir of [USER_DATA_DIR, ACTIVE_PROJECT_DIR, OTHER_PROJECT_DIR, FAKE_BIN_DIR]) {
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
      "if \"%1\"==\"--version\" (echo claude fake pass186& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass186 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function writeProjectFiles() {
  fs.mkdirSync(path.join(ACTIVE_PROJECT_DIR, "src"), { recursive: true });
  fs.mkdirSync(path.join(ACTIVE_PROJECT_DIR, "docs"), { recursive: true });
  fs.mkdirSync(path.join(OTHER_PROJECT_DIR, "src"), { recursive: true });
  fs.writeFileSync(path.join(ACTIVE_PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass186-active-project" }, null, 2), "utf8");
  fs.writeFileSync(path.join(OTHER_PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass186-other-project" }, null, 2), "utf8");
  fs.writeFileSync(path.join(ACTIVE_PROJECT_DIR, ACTIVE_SOURCE_A), "pass186 active source A evidence\n", "utf8");
  fs.writeFileSync(path.join(ACTIVE_PROJECT_DIR, ACTIVE_SOURCE_B), "# pass186 active source B evidence\n", "utf8");
  fs.writeFileSync(path.join(OTHER_PROJECT_DIR, OTHER_SOURCE), "pass186 other project source evidence\n", "utf8");
}

function writeInitialStore() {
  writeFakeClaude();
  writeProjectFiles();
  const createdAt = "2026-07-07T20:00:00.000Z";
  const activeProject = { name: "pass186-active-project", path: ACTIVE_PROJECT_DIR };
  const otherProject = { name: "pass186-other-project", path: OTHER_PROJECT_DIR };
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
    activeProject,
    projects: [activeProject, otherProject],
    sessions: [
      {
        id: "pass186-session",
        title: "Pass186 sources status badge",
        project: activeProject.name,
        projectPath: activeProject.path,
        createdAt,
        updatedAt: createdAt,
        messages: [],
      },
    ],
    automations: [],
    subagentRuns: [],
    commandRuns: [],
    runEvents: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

async function clickSources(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.workspace-context-button[data-context-tab="sources"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function readSourceFilesAndReload(win) {
  const ok = await win.webContents.executeJavaScript(`
    (async function() {
      const reads = [
        await window.claudexDesktop.readWorkspaceFile({ projectPath: ${JSON.stringify(ACTIVE_PROJECT_DIR)}, relativePath: ${JSON.stringify(ACTIVE_SOURCE_A)} }),
        await window.claudexDesktop.readWorkspaceFile({ projectPath: ${JSON.stringify(ACTIVE_PROJECT_DIR)}, relativePath: ${JSON.stringify(ACTIVE_SOURCE_B)} }),
        await window.claudexDesktop.readWorkspaceFile({ projectPath: ${JSON.stringify(OTHER_PROJECT_DIR)}, relativePath: ${JSON.stringify(OTHER_SOURCE)} }),
      ];
      const state = await window.claudexDesktop.getState();
      return Boolean(
        reads.every((item) => item?.sourceRef?.path) &&
        state.sourceRefs?.length === 3 &&
        state.sourceRefs.some((source) => source.path === ${JSON.stringify(ACTIVE_SOURCE_A)} && source.project?.path === ${JSON.stringify(ACTIVE_PROJECT_DIR)}) &&
        state.sourceRefs.some((source) => source.path === ${JSON.stringify(ACTIVE_SOURCE_B)} && source.project?.path === ${JSON.stringify(ACTIVE_PROJECT_DIR)}) &&
        state.sourceRefs.some((source) => source.path === ${JSON.stringify(OTHER_SOURCE)} && source.project?.path === ${JSON.stringify(OTHER_PROJECT_DIR)})
      );
    })();
  `);
  if (!ok) return false;
  win.webContents.reload();
  await wait(1800);
  return true;
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS186_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS186_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS186_SOURCES_START_EMPTY", await waitFor(win, `
    (function() {
      const button = document.querySelector('.workspace-context-button[data-context-tab="sources"]');
      return Boolean(
        button &&
        button.getAttribute('data-status') === '' &&
        !button.querySelector('.context-tab-badge') &&
        /\u6765\u6e90/.test(button.textContent || '') &&
        button.getBoundingClientRect().width <= 40
      );
    })();
  `, 8000));

  assertStep("PASS186_READ_WORKSPACE_FILES_RECORD_SOURCES", await readSourceFilesAndReload(win));
  assertStep("PASS186_RELOADED_WITH_SOURCE_REFS", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS186_SOURCES_BADGE_BACKED_BY_SOURCE_REFS", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const button = document.querySelector('.workspace-context-button[data-context-tab="sources"][data-status="info"]');
      const badge = button?.querySelector('.context-tab-badge');
      const aria = button?.getAttribute('aria-label') || '';
      const title = button?.getAttribute('title') || '';
      return Boolean(
        state.sourceRefs?.length === 3 &&
        button &&
        badge &&
        badge.textContent.trim() === '3' &&
        /\u6765\u6e90 3/.test(aria) &&
        /\u5f53\u524d\u9879\u76ee 2/.test(aria) &&
        /\u5176\u4ed6\u9879\u76ee 1/.test(aria) &&
        /\u6700\u8fd1/.test(aria) &&
        /\u6765\u6e90 3/.test(title) &&
        button.getBoundingClientRect().width <= 40
      );
    })();
  `, 10000));

  assertStep("PASS186_CLICK_SOURCES_INFO", await clickSources(win));
  assertStep("PASS186_SOURCES_PANEL_SHOWS_BADGE_AND_REAL_REFS", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.bottom-work-panel');
      const text = panel?.textContent || '';
      const bottomBadge = document.querySelector('.bottom-panel-tabs button[data-bottom-tab="sources"][data-status="info"] .context-tab-badge');
      const cards = [...document.querySelectorAll('.source-ref-card')];
      return Boolean(
        panel &&
        document.querySelector('.workspace-context-button[data-context-tab="sources"].active.status-info') &&
        bottomBadge &&
        bottomBadge.textContent.trim() === '3' &&
        cards.length === 3 &&
        /pass186-active-a\.txt/.test(text) &&
        /pass186-active-b\.md/.test(text) &&
        /pass186-other\.txt/.test(text) &&
        /\u6765\u81ea\u771f\u5b9e Workspace \u6587\u4ef6\u8bfb\u53d6\u8bb0\u5f55/.test(text) &&
        cards.every((card) => card.querySelector('[data-source-open-workspace]'))
      );
    })();
  `, 8000));

  console.log("PASS186_SOURCES_STATUS_BADGE_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS186_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (function() {
          const sourcesButton = document.querySelector('.workspace-context-button[data-context-tab="sources"]');
          const bottomTab = document.querySelector('.bottom-panel-tabs button[data-bottom-tab="sources"]');
          return {
            sourcesStatus: sourcesButton?.getAttribute('data-status') || '',
            sourcesActive: sourcesButton?.className || '',
            sourcesAria: sourcesButton?.getAttribute('aria-label') || '',
            sourcesTitle: sourcesButton?.getAttribute('title') || '',
            badge: sourcesButton?.querySelector('.context-tab-badge')?.textContent || '',
            bottomStatus: bottomTab?.getAttribute('data-status') || '',
            bottomText: document.querySelector('.bottom-work-panel')?.textContent || '',
            bodyText: document.body?.textContent?.slice(0, 4000) || '',
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS186_DEBUG", JSON.stringify(debug, null, 2).slice(0, 8000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS186_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
