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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass197-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass197-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass197-project-"));
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
if (args[0] === '--version') out('2.9.0 (Claude Code QA pass197)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([{ name: 'pass197-plugin', version: '1.0.0', scope: 'user', enabled: true }]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins:\\n\\n  > pass197-plugin@qa\\n    Version: 1.0.0\\n    Scope: user\\n    Status: enabled');
else if (args[0] === 'mcp' && args[1] === 'list') out({ servers: [] });
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out({ plugins: [] });
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass197-project" }), "utf8");
  const project = { name: "pass197-project", path: PROJECT_DIR };
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
        id: "pass197-session",
        title: "Pass197 legacy notice fallback",
        project: project.name,
        projectPath: project.path,
        createdAt: "2026-07-08T00:20:00.000Z",
        updatedAt: "2026-07-08T00:20:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    runEvents: [],
    automations: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [
      {
        id: "pass197-legacy-runtime-health",
        level: "error",
        source: "runtime-health",
        title: "运行健康证据",
        detail: "pass197 legacy runtime health fallback",
        action: "runtime-health:plugins",
        projectPath: project.path,
        createdAt: "2026-07-08T00:20:00.000Z",
        lastSeenAt: "2026-07-08T00:20:00.000Z",
      },
    ],
  });
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
  if (!win) throw new Error("PASS197_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS197_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS197_NOTICE_HAS_NO_RUN_EVENT", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const notice = (state.notices || []).find((item) => item.id === 'pass197-legacy-runtime-health');
      return Boolean(notice && notice.action === 'runtime-health:plugins' && !notice.runEventId && /pass197 legacy/.test(notice.detail || ''));
    })();
  `, 8000));
  assertStep("PASS197_OPEN_NOTICE_PANEL", await openNoticePanel(win));
  assertStep("PASS197_NOTICE_ACTION_LABEL_FALLBACK", await waitFor(win, `
    (function() {
      const card = document.querySelector('.notice-card.error');
      const button = card?.querySelector('button[data-notice-action="open"]');
      const text = card?.textContent || '';
      return Boolean(card &&
        /pass197 legacy runtime health fallback/.test(text) &&
        button &&
        button.getAttribute('data-notice-action-target') === 'surface' &&
        /\\u6253\\u5f00\\u5bf9\\u5e94\\u5de5\\u4f5c\\u53f0/.test(button.textContent || '') &&
        !/\\u67e5\\u770b\\u8bc1\\u636e/.test(button.textContent || ''));
    })();
  `, 10000));
  assertStep("PASS197_CLICK_LEGACY_NOTICE_ACTION", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.notice-card.error button[data-notice-action="open"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS197_LEGACY_NOTICE_OPENS_PLUGIN_SURFACE", await waitFor(win, `
    (function() {
      const modal = document.querySelector('.capability-modal');
      const activeTab = document.querySelector('.plugin-manager-tabs button.active');
      const activeText = activeTab?.textContent || '';
      return Boolean(modal &&
        activeTab &&
        /\\u63d2\\u4ef6|plugin/i.test(activeText) &&
        (document.querySelector('.structured-registry-section[aria-label*="CLI"]') || document.querySelector('.plugin-manager-list')));
    })();
  `, 12000));

  console.log("PASS197_NOTICE_ACTION_LABEL_FALLBACK_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS197_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (function() {
          return {
            noticeText: document.querySelector('.notice-card')?.textContent || '',
            openText: document.querySelector('.notice-card button[data-notice-action="open"]')?.textContent || '',
            openTarget: document.querySelector('.notice-card button[data-notice-action="open"]')?.getAttribute('data-notice-action-target') || '',
            activeTab: document.querySelector('.plugin-manager-tabs button.active')?.textContent || '',
            body: document.body?.textContent?.slice(0, 4000) || '',
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS197_DEBUG", JSON.stringify(debug, null, 2).slice(0, 8000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS197_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
