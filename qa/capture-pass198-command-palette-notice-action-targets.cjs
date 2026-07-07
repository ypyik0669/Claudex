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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass198-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass198-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass198-project-"));
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const RUN_ID = "pass198-runtime-health-run";
const TIMELINE_NOTICE_ID = "pass198-runtime-evidence-notice";
const LEGACY_NOTICE_ID = "pass198-legacy-plugin-notice";

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
if (args[0] === '--version') out('2.9.0 (Claude Code QA pass198)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([{ name: 'pass198-plugin', version: '1.0.0', scope: 'user', enabled: true }]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins:\\n\\n  > pass198-plugin@qa\\n    Version: 1.0.0\\n    Scope: user\\n    Status: enabled');
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass198-project" }), "utf8");
  const project = { name: "pass198-project", path: PROJECT_DIR };
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
        id: "pass198-session",
        title: "Pass198 command palette notice actions",
        project: project.name,
        projectPath: project.path,
        createdAt: "2026-07-08T00:30:00.000Z",
        updatedAt: "2026-07-08T00:30:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    runEvents: [
      {
        id: RUN_ID,
        type: "runtime-health",
        status: "error",
        title: "pass198 runtime health evidence",
        detail: "pass198 runtime evidence from local store",
        cwd: project.path,
        project,
        sessionId: "pass198-session",
        stdout: "pass198 runtime stdout evidence\npass198 plugin json failed\npass198 mcp failed\npass198 marketplace json failed",
        stderr: "",
        code: 3,
        durationMs: 198,
        createdAt: "2026-07-08T00:30:01.000Z",
      },
    ],
    notices: [
      {
        id: TIMELINE_NOTICE_ID,
        key: "pass198:timeline",
        level: "error",
        source: "runtime-health",
        title: "pass198 runtime evidence notice",
        detail: "pass198 runtime notice opens timeline evidence",
        action: "runtime-health:plugins",
        runEventId: RUN_ID,
        project,
        sessionId: "pass198-session",
        count: 1,
        createdAt: "2026-07-08T00:30:02.000Z",
        lastSeenAt: "2026-07-08T00:30:02.000Z",
      },
      {
        id: LEGACY_NOTICE_ID,
        key: "pass198:legacy",
        level: "warning",
        source: "runtime-health",
        title: "pass198 legacy plugin notice",
        detail: "pass198 legacy notice opens plugin surface",
        action: "runtime-health:plugins",
        project,
        sessionId: "pass198-session",
        count: 1,
        createdAt: "2026-07-08T00:30:03.000Z",
        lastSeenAt: "2026-07-08T00:30:03.000Z",
      },
    ],
    automations: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
  });
}

async function openPaletteAndQuery(win, query) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      return true;
    })();
  `);
}

async function clickCommand(win, id) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === ${JSON.stringify(`notice:${id}`)});
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS198_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS198_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS198_NOTICE_STATE_READY", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const timelineNotice = (state.notices || []).find((item) => item.id === ${JSON.stringify(TIMELINE_NOTICE_ID)});
      const legacyNotice = (state.notices || []).find((item) => item.id === ${JSON.stringify(LEGACY_NOTICE_ID)});
      const event = (state.runEvents || []).find((item) => item.id === ${JSON.stringify(RUN_ID)});
      return Boolean(timelineNotice?.runEventId === ${JSON.stringify(RUN_ID)} && legacyNotice && !legacyNotice.runEventId && event?.type === 'runtime-health');
    })();
  `, 10000));

  assertStep("PASS198_OPEN_PALETTE_TIMELINE_NOTICE", await openPaletteAndQuery(win, "pass198 runtime evidence notice"));
  assertStep("PASS198_TIMELINE_NOTICE_COMMAND_LABEL", await waitFor(win, `
    (function() {
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === 'notice:${TIMELINE_NOTICE_ID}');
      const text = button?.textContent || '';
      return Boolean(button &&
        button.getAttribute('data-command-target') === 'timeline' &&
        /pass198 runtime evidence notice/.test(text) &&
        /\\u67e5\\u770b\\u8bc1\\u636e/.test(text) &&
        !/\\u6253\\u5f00\\u5bf9\\u5e94\\u5de5\\u4f5c\\u53f0/.test(text));
    })();
  `, 8000));
  assertStep("PASS198_CLICK_TIMELINE_NOTICE_COMMAND", await clickCommand(win, TIMELINE_NOTICE_ID));
  assertStep("PASS198_TIMELINE_NOTICE_OPENS_EVIDENCE", await waitFor(win, `
    (function() {
      const active = document.querySelector('.bottom-panel-tabs button[data-bottom-tab="outputs"].active') ||
        document.querySelector('.workspace-context-button.active');
      const row = document.querySelector('.run-timeline-row.selected.error');
      const panel = document.querySelector('.selected-run-evidence-panel.error');
      const text = panel?.textContent || '';
      return Boolean(active &&
        /\\u8f93\\u51fa|Outputs/i.test(active.textContent || '') &&
        row &&
        panel &&
        /pass198 runtime health evidence/.test(text) &&
        /pass198 plugin json failed/.test(text) &&
        panel.querySelector('[data-run-event-type="runtime-health"]'));
    })();
  `, 10000));

  assertStep("PASS198_OPEN_PALETTE_LEGACY_NOTICE", await openPaletteAndQuery(win, "pass198 legacy plugin notice"));
  assertStep("PASS198_LEGACY_NOTICE_COMMAND_LABEL", await waitFor(win, `
    (function() {
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === 'notice:${LEGACY_NOTICE_ID}');
      const text = button?.textContent || '';
      return Boolean(button &&
        button.getAttribute('data-command-target') === 'surface' &&
        /pass198 legacy plugin notice/.test(text) &&
        /\\u6253\\u5f00\\u5bf9\\u5e94\\u5de5\\u4f5c\\u53f0/.test(text) &&
        !/\\u67e5\\u770b\\u8bc1\\u636e/.test(text));
    })();
  `, 8000));
  assertStep("PASS198_CLICK_LEGACY_NOTICE_COMMAND", await clickCommand(win, LEGACY_NOTICE_ID));
  assertStep("PASS198_LEGACY_NOTICE_OPENS_PLUGIN_SURFACE", await waitFor(win, `
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

  console.log("PASS198_COMMAND_PALETTE_NOTICE_ACTION_TARGETS_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS198_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (function() {
          return {
            commands: [...document.querySelectorAll('.command-modal .command-list button')].map((button) => ({
              id: button.getAttribute('data-command-id'),
              target: button.getAttribute('data-command-target'),
              text: button.textContent,
            })),
            activeBottom: document.querySelector('.bottom-panel-tabs button.active')?.textContent || document.querySelector('.workspace-context-button.active')?.textContent || '',
            selectedText: document.querySelector('.selected-run-evidence-panel')?.textContent || '',
            activeTab: document.querySelector('.plugin-manager-tabs button.active')?.textContent || '',
            body: document.body?.textContent?.slice(0, 4000) || '',
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS198_DEBUG", JSON.stringify(debug, null, 2).slice(0, 8000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS198_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
