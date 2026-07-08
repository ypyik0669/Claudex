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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass283-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass283-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass283-project-"));
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

function commandIdSegment(value) {
  return encodeURIComponent(String(value || "").trim()).slice(0, 120) || "item";
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function writeFakeClaude() {
  const fakeClaudeScript = `
const args = process.argv.slice(2);
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
if (args[0] === '--version') out('2.83.0 (Claude Code QA pass283)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([{ name: 'pass283-plugin', version: '1.0.0', scope: 'user', enabled: true }]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins:\\n\\n  > pass283-plugin@qa\\n    Version: 1.0.0\\n    Scope: user\\n    Status: enabled');
else if (args[0] === 'mcp' && args[1] === 'list') {
  process.stderr.write('pass283 mcp list failed for notice focus\\n');
  process.exit(28);
}
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass283-project" }), "utf8");
  const project = { name: "pass283-project", path: PROJECT_DIR };
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
        id: "pass283-session",
        title: "Pass283 runtime notice action focus",
        project: project.name,
        projectPath: project.path,
        createdAt: "2026-07-08T05:00:00.000Z",
        updatedAt: "2026-07-08T05:00:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    runEvents: [
      {
        id: "pass283-runtime-health-event",
        type: "runtime-health",
        status: "error",
        title: "Pass283 runtime health evidence",
        detail: "pass283 runtime health event still available as evidence",
        cwd: project.path,
        stdout: "pass283 runtime health event stdout",
        code: 1,
        createdAt: "2026-07-08T05:00:00.000Z",
      },
    ],
    automations: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [
      {
        id: "pass283-runtime-health-mcp",
        level: "error",
        source: "runtime-health",
        title: "运行健康 MCP 入口",
        detail: "pass283 runtime health mcp notice with run event",
        action: "runtime-health:mcp",
        runEventId: "pass283-runtime-health-event",
        projectPath: project.path,
        createdAt: "2026-07-08T05:00:00.000Z",
        lastSeenAt: "2026-07-08T05:00:00.000Z",
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

async function closeCapabilitySurface(win) {
  await win.webContents.executeJavaScript(`
    (function() {
      document.querySelector('.capability-modal header .icon-only')?.click();
      return true;
    })();
  `);
  return waitFor(win, "!document.querySelector('.capability-modal')", 5000);
}

async function runPaletteCommand(win, query, expectedId) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 240));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 320));
      const button = document.querySelector(${JSON.stringify(`.command-modal .command-list button[data-command-id="${expectedId}"]`)});
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS283_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS283_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS283_RUNTIME_NOTICE_HAS_ACTION_AND_RUN_EVENT", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const notice = (state.notices || []).find((item) => item.id === 'pass283-runtime-health-mcp');
      const event = (state.runEvents || []).find((item) => item.id === notice?.runEventId);
      return Boolean(
        notice &&
        notice.action === 'runtime-health:mcp' &&
        notice.runEventId === 'pass283-runtime-health-event' &&
        /pass283 runtime health mcp notice/.test(notice.detail || '') &&
        event &&
        event.type === 'runtime-health'
      );
    })();
  `, 8000));
  assertStep("PASS283_OPEN_NOTICE_PANEL", await openNoticePanel(win));
  assertStep("PASS283_NOTICE_CARD_ACTION_TARGETS_REAL_RUNTIME_ACTION", await waitFor(win, `
    (function() {
      const card = document.querySelector('.notice-card.error');
      const button = card?.querySelector('button[data-notice-action="open"]');
      const text = card?.textContent || '';
      return Boolean(card &&
        /pass283 runtime health mcp notice/.test(text) &&
        button &&
        button.getAttribute('data-notice-action-target') === 'surface');
    })();
  `, 10000));
  assertStep("PASS283_CLICK_NOTICE_ACTION", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.notice-card.error button[data-notice-action="open"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS283_NOTICE_CENTER_FOCUSES_RUNTIME_HEALTH_ISSUE_ACTION", await waitFor(win, `
    (function() {
      const modal = document.querySelector('.capability-modal');
      const activeTab = document.querySelector('.plugin-manager-tabs button[aria-selected="true"], .plugin-manager-tabs button.active');
      const issue = document.querySelector('.capability-modal .runtime-health-issue[data-runtime-health-issue-target="mcp"]');
      const action = issue?.querySelector('button[data-runtime-health-issue-action="open"]');
      const focused = Array.from(document.querySelectorAll('.capability-modal [data-runtime-health-action-focused="true"]'));
      return Boolean(modal &&
        activeTab &&
        /MCP/i.test(activeTab.textContent || '') &&
        /pass283 mcp list failed/.test(issue?.textContent || '') &&
        issue.getAttribute('data-runtime-health-issue-focused') === 'true' &&
        action?.getAttribute('data-runtime-health-action-focused') === 'true' &&
        document.activeElement === action &&
        focused.length === 1);
    })();
  `, 15000));
  assertStep("PASS283_NOTICE_ACTION_DID_NOT_MUTATE_RUNS", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      const runEvents = state.runEvents || [];
      return Boolean(
        (state.commandRuns || []).length === 0 &&
        runEvents.some((event) => event.id === 'pass283-runtime-health-event') &&
        runEvents.every((event) => event.type === 'runtime-health')
      );
    })();
  `));
  assertStep("PASS283_CLOSE_NOTICE_FOCUS_SURFACE", await closeCapabilitySurface(win));
  assertStep(
    "PASS283_NOTICE_COMMAND_CLICKED",
    await runPaletteCommand(win, "pass283 runtime health mcp notice", `notice:${commandIdSegment("pass283-runtime-health-mcp")}`),
  );
  assertStep("PASS283_NOTICE_COMMAND_FOCUSES_RUNTIME_HEALTH_ISSUE_ACTION", await waitFor(win, `
    (function() {
      const modal = document.querySelector('.capability-modal');
      const activeTab = document.querySelector('.plugin-manager-tabs button[aria-selected="true"], .plugin-manager-tabs button.active');
      const issue = document.querySelector('.capability-modal .runtime-health-issue[data-runtime-health-issue-target="mcp"]');
      const action = issue?.querySelector('button[data-runtime-health-issue-action="open"]');
      return Boolean(modal &&
        activeTab &&
        /MCP/i.test(activeTab.textContent || '') &&
        issue?.getAttribute('data-runtime-health-issue-focused') === 'true' &&
        action?.getAttribute('data-runtime-health-action-focused') === 'true' &&
        document.activeElement === action);
    })();
  `, 15000));
  assertStep("PASS283_CLICK_FOCUSED_MCP_ACTION", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.capability-modal .runtime-health-issue[data-runtime-health-issue-target="mcp"] button[data-runtime-health-issue-action="open"]');
      if (!button || button.getAttribute('data-runtime-health-action-focused') !== 'true') return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS283_FOCUSED_ACTION_OPENS_MCP_WORKBENCH", await waitFor(win, `
    Boolean(document.querySelector('.plugin-manager-tabs button[aria-selected="true"], .plugin-manager-tabs button.active')?.textContent?.match(/MCP/i) &&
      document.querySelector('.structured-registry-section'))
  `, 8000));

  console.log("PASS283_RUNTIME_HEALTH_NOTICE_ACTION_FOCUS_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS283_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (function() {
          return {
            noticeText: document.querySelector('.notice-card')?.textContent || '',
            openTarget: document.querySelector('.notice-card button[data-notice-action="open"]')?.getAttribute('data-notice-action-target') || '',
            activeTab: document.querySelector('.plugin-manager-tabs button[aria-selected="true"], .plugin-manager-tabs button.active')?.textContent || '',
            focused: Array.from(document.querySelectorAll('[data-runtime-health-action-focused="true"], [data-runtime-health-issue-focused="true"]')).map((item) => ({
              text: item.textContent,
              attrs: Object.fromEntries(Array.from(item.attributes).map((attr) => [attr.name, attr.value])),
            })),
            runtimeActions: Array.from(document.querySelectorAll('.capability-modal [data-runtime-health-action], .capability-modal [data-runtime-health-issue-action], .capability-modal [data-runtime-health-issue-target]')).map((item) => ({
              text: item.textContent,
              attrs: Object.fromEntries(Array.from(item.attributes).map((attr) => [attr.name, attr.value])),
              active: item === document.activeElement,
            })),
            body: document.body?.textContent?.slice(0, 6000) || '',
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS283_DEBUG", JSON.stringify(debug, null, 2).slice(0, 12000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS283_TIMEOUT");
  cleanup();
  app.exit(1);
}, 120000);
