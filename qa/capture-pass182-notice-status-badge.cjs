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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass182-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass182-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass182-project-"));
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass182-project" }), "utf8");
  fs.writeFileSync(
    path.join(FAKE_BIN_DIR, "claude.cmd"),
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass182& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass182 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  const fakeClaude = path.join(FAKE_BIN_DIR, "claude.cmd");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;

  const createdAt = "2026-07-07T16:00:00.000Z";
  const project = { name: "pass182-project", path: PROJECT_DIR };

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
        id: "pass182-session",
        title: "Pass182 notice status badge",
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
    runEvents: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [
      {
        id: "pass182-error-notice",
        key: "pass182:error",
        level: "error",
        source: "workspace-command",
        title: "Pass182 error notice",
        detail: "pass182 real error notice evidence",
        action: "panel-output",
        project,
        sessionId: "pass182-session",
        createdAt,
        lastSeenAt: createdAt,
      },
      {
        id: "pass182-warning-notice",
        key: "pass182:warning",
        level: "warning",
        source: "mcp-runtime",
        title: "Pass182 warning notice",
        detail: "pass182 real warning notice evidence",
        action: "panel-notices",
        project,
        sessionId: "pass182-session",
        createdAt,
        lastSeenAt: createdAt,
      },
      {
        id: "pass182-dismissed-info",
        key: "pass182:dismissed-info",
        level: "info",
        source: "browser",
        title: "Pass182 dismissed info notice",
        detail: "dismissed notice must not count",
        project,
        sessionId: "pass182-session",
        createdAt,
        lastSeenAt: createdAt,
        dismissedAt: "2026-07-07T16:00:03.000Z",
      },
    ],
  });
}

async function clickTopNoticeButton(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.workspace-context-button[data-context-tab="notices"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function dismissNotice(win, titleText) {
  return win.webContents.executeJavaScript(`
    (function() {
      const card = Array.from(document.querySelectorAll('.notice-card'))
        .find((item) => (item.textContent || '').includes(${JSON.stringify(titleText)}) && !item.classList.contains('dismissed'));
      const button = card?.querySelector('[data-notice-action="dismiss"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS182_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS182_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS182_NOTICE_BADGE_BACKED_BY_STORE", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const active = (state.notices || []).filter((notice) => !notice.dismissedAt);
      const errors = active.filter((notice) => notice.level === 'error');
      const warnings = active.filter((notice) => notice.level === 'warning');
      const button = document.querySelector('.workspace-context-button[data-context-tab="notices"][data-status="error"]');
      const badge = button?.querySelector('.context-tab-badge');
      const aria = button?.getAttribute('aria-label') || '';
      const title = button?.getAttribute('title') || '';
      return Boolean(
        state.settings?.model === 'claude-haiku-4-5-20251001' &&
        active.length === 2 &&
        errors.length === 1 &&
        warnings.length === 1 &&
        button &&
        badge &&
        badge.textContent.trim() === '2' &&
        /\\u672a\\u5904\\u7406 2/.test(aria) &&
        /\\u9519\\u8bef 1/.test(aria) &&
        /\\u8b66\\u544a 1/.test(aria) &&
        /\\u672a\\u5904\\u7406 2/.test(title) &&
        /\\u9519\\u8bef 1/.test(title) &&
        /\\u8b66\\u544a 1/.test(title) &&
        button.getBoundingClientRect().width <= 40
      );
    })();
  `, 10000));

  assertStep("PASS182_CLICK_NOTICE_BADGE_BUTTON", await clickTopNoticeButton(win));
  assertStep("PASS182_NOTICE_PANEL_BADGE_VISIBLE", await waitFor(win, `
    (function() {
      const text = document.querySelector('.notice-center')?.textContent || '';
      const bottomBadge = document.querySelector('.bottom-panel-tabs button[data-bottom-tab="notices"][data-status="error"] .context-tab-badge');
      return Boolean(
        document.querySelector('.bottom-work-panel') &&
        document.querySelector('.workspace-context-button[data-context-tab="notices"].active.status-error') &&
        bottomBadge &&
        bottomBadge.textContent.trim() === '2' &&
        /2 \\u6761\\u672a\\u5904\\u7406/.test(text) &&
        /Pass182 error notice/.test(text) &&
        /Pass182 warning notice/.test(text) &&
        /Pass182 dismissed info notice/.test(text)
      );
    })();
  `, 8000));

  assertStep("PASS182_DISMISS_ERROR_NOTICE", await dismissNotice(win, "Pass182 error notice"));
  assertStep("PASS182_NOTICE_BADGE_DEGRADES_TO_WARNING", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const active = (state.notices || []).filter((notice) => !notice.dismissedAt);
      const errors = active.filter((notice) => notice.level === 'error');
      const warnings = active.filter((notice) => notice.level === 'warning');
      const top = document.querySelector('.workspace-context-button[data-context-tab="notices"][data-status="warning"]');
      const bottom = document.querySelector('.bottom-panel-tabs button[data-bottom-tab="notices"][data-status="warning"]');
      const topBadge = top?.querySelector('.context-tab-badge');
      const bottomBadge = bottom?.querySelector('.context-tab-badge');
      const text = document.querySelector('.notice-center')?.textContent || '';
      return Boolean(
        active.length === 1 &&
        errors.length === 0 &&
        warnings.length === 1 &&
        top &&
        bottom &&
        topBadge?.textContent.trim() === '1' &&
        bottomBadge?.textContent.trim() === '1' &&
        /\\u672a\\u5904\\u7406 1/.test(top.getAttribute('aria-label') || '') &&
        /\\u9519\\u8bef 0/.test(top.getAttribute('aria-label') || '') &&
        /\\u8b66\\u544a 1/.test(top.getAttribute('aria-label') || '') &&
        /1 \\u6761\\u672a\\u5904\\u7406/.test(text) &&
        /Pass182 warning notice/.test(text)
      );
    })();
  `, 8000));

  console.log("PASS182_NOTICE_STATUS_BADGE_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS182_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS182_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
