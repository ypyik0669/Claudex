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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass196-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass196-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass196-project-"));
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
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
  const fakeClaudeScript = `
const args = process.argv.slice(2);
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
if (args[0] === '--version') out('2.9.0 (Claude Code QA pass196)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) {
  process.stderr.write('pass196 plugin json failed\\n');
  process.exit(21);
}
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins:\\n\\n  > pass196-installed@qa\\n    Version: 1.0.0\\n    Scope: user\\n    Status: enabled');
else if (args[0] === 'mcp' && args[1] === 'list') {
  process.stderr.write('pass196 mcp failed\\n');
  process.exit(22);
}
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) {
  process.stderr.write('pass196 marketplace json failed\\n');
  process.exit(23);
}
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') {
  process.stderr.write('pass196 marketplace failed\\n');
  process.exit(24);
}
else out('fake claude command: ' + args.join(' '));
`;
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(FAKE_CLAUDE, `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function writeInitialStore() {
  writeFakeClaude();
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass196-project" }), "utf8");
  const project = { name: "pass196-project", path: PROJECT_DIR };
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
      claudeCode: { executionMode: "claude-code", claudeCommand: FAKE_CLAUDE, permissionMode: "plan" },
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
        id: "pass196-session",
        title: "Pass196 runtime health notice timeline",
        project: project.name,
        projectPath: project.path,
        createdAt: "2026-07-08T00:10:00.000Z",
        updatedAt: "2026-07-08T00:10:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    runEvents: [],
    notices: [],
    automations: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
  });
}

async function openCapabilities(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const pluginPattern = new RegExp("\\\\u63d2\\\\u4ef6");
      const button = [...document.querySelectorAll('.nav-stack button')]
        .find((candidate) => pluginPattern.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function closeSurface(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.surface-back') ||
        document.querySelector('.plugin-manager-modal header .icon-only') ||
        document.querySelector('.settings-surface header .icon-only');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function openNoticePanel(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      if (document.querySelector('.notice-center')) return true;
      const noticePattern = new RegExp("\\\\u901a\\\\u77e5");
      const button = [...document.querySelectorAll('.workspace-context-button')]
        .find((candidate) => noticePattern.test(candidate.textContent || candidate.getAttribute('aria-label') || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS196_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS196_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS196_OPEN_CAPABILITIES", await openCapabilities(win));
  assertStep("PASS196_RUNTIME_NOTICE_HAS_RUN_EVENT", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const notice = (state.notices || []).find((item) => item.source === 'runtime-health');
      const event = (state.runEvents || []).find((item) => item.id === notice?.runEventId);
      return Boolean(
        notice &&
        notice.action === 'runtime-health:plugins' &&
        /^runtime_health_/.test(notice.runEventId || '') &&
        /pass196 plugin json failed/.test(notice.detail || '') &&
        /pass196 marketplace json failed/.test(notice.detail || '') &&
        event &&
        event.type === 'runtime-health' &&
        event.status === 'error' &&
        /pass196 plugin json failed/.test(event.stdout || '') &&
        /pass196 marketplace json failed/.test(event.stdout || '')
      );
    })();
  `, 15000));
  assertStep("PASS196_CLOSE_CAPABILITIES", await closeSurface(win));
  assertStep("PASS196_OPEN_NOTICE_PANEL", await openNoticePanel(win));
  assertStep("PASS196_NOTICE_CARD_ACTIONABLE", await waitFor(win, `
    (function() {
      const card = document.querySelector('.notice-card');
      const text = card?.textContent || '';
      return Boolean(card &&
        /runtime-health/.test(text) &&
        /pass196 plugin json failed/.test(text) &&
        card.querySelector('button[data-notice-action="open"]'));
    })();
  `, 10000));
  assertStep("PASS196_CLICK_NOTICE_TIMELINE", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.notice-card button[data-notice-action="open"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS196_NOTICE_FOCUSES_RUNTIME_HEALTH_TIMELINE", await waitFor(win, `
    (function() {
      const active = document.querySelector('.bottom-panel-tabs button[data-bottom-tab="outputs"].active');
      const row = document.querySelector('.run-timeline-row.selected.error');
      const panel = document.querySelector('.selected-run-evidence-panel.error');
      const text = panel?.textContent || '';
      return Boolean(
        active &&
        row &&
        /runtime-health/.test(row.textContent || '') &&
        panel &&
        /pass196 plugin json failed/.test(text) &&
        /pass196 mcp failed/.test(text) &&
        /pass196 marketplace json failed/.test(text) &&
        panel.querySelector('[data-run-event-type="runtime-health"]')
      );
    })();
  `, 10000));

  console.log("PASS196_RUNTIME_HEALTH_NOTICE_TIMELINE_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS196_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (function() {
          const card = document.querySelector('.notice-card');
          const panel = document.querySelector('.selected-run-evidence-panel');
          return {
            noticeText: card?.textContent || '',
            activeBottom: document.querySelector('.bottom-panel-tabs button.active')?.getAttribute('data-bottom-tab') || '',
            selectedClass: panel?.className || '',
            selectedText: panel?.textContent || '',
            body: document.body?.textContent?.slice(0, 4000) || '',
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS196_DEBUG", JSON.stringify(debug, null, 2).slice(0, 8000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS196_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
