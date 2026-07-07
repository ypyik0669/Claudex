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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass233-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass233-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass233-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const SCHEDULED_AUTOMATION_ID = "pass233-scheduled-automation";
const PAUSED_AUTOMATION_ID = "pass233-paused-automation";
const RUNNING_RUN_ID = "pass233-running-subagent";
const DONE_RUN_ID = "pass233-done-subagent";
const ARCHIVED_RUN_ID = "pass233-archived-subagent";

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_DIR]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_error) {
      // best-effort cleanup
    }
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
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

function writeFakeClaude() {
  const fakeClaudeScript = `
const args = process.argv.slice(2);
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value) + '\\n'); }
if (args[0] === '--version') out('2.33.0 (Claude Code PASS233)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out({ plugins: [] });
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out({ servers: [] });
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else out('pass233 fake claude command: ' + args.join(' '));
`;
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(FAKE_CLAUDE, `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function writeInitialStore() {
  writeFakeClaude();
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass233-project" }), "utf8");
  const createdAt = "2026-07-08T02:33:00.000Z";
  const project = { name: "pass233-project", path: PROJECT_DIR };
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
      systemPrompt: "QA",
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
        id: "pass233-session",
        title: "PASS233 notice task status deeplinks",
        project: project.name,
        projectPath: project.path,
        createdAt,
        updatedAt: createdAt,
        messages: [],
      },
    ],
    commandRuns: [],
    runEvents: [],
    automations: [
      {
        id: SCHEDULED_AUTOMATION_ID,
        prompt: "PASS233 scheduled automation prompt",
        schedule: { type: "once", runAt: "2099-07-08T02:33:00.000Z" },
        project,
        threadId: "pass233-session",
        enabled: true,
        status: "scheduled",
        createdAt,
        updatedAt: createdAt,
        history: [],
      },
      {
        id: PAUSED_AUTOMATION_ID,
        prompt: "PASS233 paused automation prompt",
        schedule: { type: "once", runAt: "2099-07-08T02:33:00.000Z" },
        project,
        threadId: "pass233-session",
        enabled: false,
        status: "paused",
        createdAt,
        updatedAt: createdAt,
        history: [],
      },
    ],
    subagentRuns: [
      {
        id: RUNNING_RUN_ID,
        requestId: "pass233-running-request",
        nickname: "PASS233 Running Agent",
        task: "PASS233 running subagent task",
        status: "running",
        sessionId: "pass233-session",
        project,
        cwd: PROJECT_DIR,
        command: FAKE_CLAUDE,
        args: ["-p", "PASS233 running subagent task"],
        stdout: "PASS233 running stdout",
        artifacts: [],
        startedAt: createdAt,
      },
      {
        id: DONE_RUN_ID,
        requestId: "pass233-done-request",
        nickname: "PASS233 Done Agent",
        task: "PASS233 done subagent task",
        status: "done",
        sessionId: "pass233-session",
        project,
        cwd: PROJECT_DIR,
        command: FAKE_CLAUDE,
        args: ["-p", "PASS233 done subagent task"],
        stdout: "PASS233 done stdout",
        summary: "PASS233 done summary",
        code: 0,
        durationMs: 1000,
        artifacts: [],
        startedAt: createdAt,
        endedAt: "2026-07-08T02:33:02.000Z",
      },
      {
        id: ARCHIVED_RUN_ID,
        requestId: "pass233-archived-request",
        nickname: "PASS233 Archived Agent",
        task: "PASS233 archived subagent task",
        status: "done",
        sessionId: "pass233-session",
        project,
        cwd: PROJECT_DIR,
        command: FAKE_CLAUDE,
        args: ["-p", "PASS233 archived subagent task"],
        stdout: "PASS233 archived stdout",
        summary: "PASS233 archived summary",
        code: 0,
        durationMs: 1200,
        archivedAt: "2026-07-08T02:33:30.000Z",
        artifacts: [{ type: "summary", label: "PASS233 archived artifact", content: "PASS233 archived artifact content" }],
        startedAt: createdAt,
        endedAt: "2026-07-08T02:33:03.000Z",
      },
    ],
    sourceRefs: [],
    browserVisits: [],
    notices: [
      {
        id: "pass233-notice-scheduled",
        key: "pass233:scheduled",
        level: "warning",
        source: "automation",
        title: "PASS233 scheduled automation notice",
        detail: "PASS233 scheduled automation should open active task filter",
        action: `automation:${SCHEDULED_AUTOMATION_ID}`,
        project,
        sessionId: "pass233-session",
        createdAt,
        lastSeenAt: createdAt,
      },
      {
        id: "pass233-notice-running-subagent",
        key: "pass233:running-subagent",
        level: "warning",
        source: "subagent",
        title: "PASS233 running subagent notice",
        detail: "PASS233 running subagent should open active task filter",
        action: `subagent:${RUNNING_RUN_ID}`,
        project,
        sessionId: "pass233-session",
        createdAt,
        lastSeenAt: createdAt,
      },
      {
        id: "pass233-notice-archived-subagent",
        key: "pass233:archived-subagent",
        level: "info",
        source: "subagent",
        title: "PASS233 archived subagent notice",
        detail: "PASS233 archived subagent should open archived task filter",
        action: `subagent:${ARCHIVED_RUN_ID}`,
        project,
        sessionId: "pass233-session",
        createdAt,
        lastSeenAt: createdAt,
      },
    ],
  });
}

async function runPaletteCommand(win, commandId, query) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));
      const button = document.querySelector(${JSON.stringify(`.command-modal .command-list button[data-command-id="${commandId}"]`)});
      if (!button) return false;
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 260));
      return true;
    })();
  `);
}

async function clickNoticeAction(win, titleText) {
  return win.webContents.executeJavaScript(`
    (function() {
      const card = Array.from(document.querySelectorAll('.notice-card'))
        .find((item) => (item.textContent || '').includes(${JSON.stringify(titleText)}));
      const button = card?.querySelector('[data-notice-action="open"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function openNoticeCenter(win) {
  return win.webContents.executeJavaScript(`
    (async function() {
      const button = document.querySelector('.tool-rail [data-tool="notices"]');
      if (!button) return false;
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 260));
      return Boolean(document.querySelector('.notice-center'));
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS233_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS233_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS233_STORE_HAS_NOTICE_ACTIONS", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      return Boolean(
        state.settings?.model === 'claude-haiku-4-5-20251001' &&
        state.notices?.some((notice) => notice.action === 'automation:${SCHEDULED_AUTOMATION_ID}') &&
        state.notices?.some((notice) => notice.action === 'subagent:${RUNNING_RUN_ID}') &&
        state.notices?.some((notice) => notice.action === 'subagent:${ARCHIVED_RUN_ID}')
      );
    })();
  `, 8000));

  assertStep("PASS233_OPEN_NOTICE_CENTER_FOR_SCHEDULED", await openNoticeCenter(win));
  assertStep("PASS233_CLICK_SCHEDULED_AUTOMATION_NOTICE", await waitFor(win, `
    /PASS233 scheduled automation notice/.test(document.querySelector('.notice-center')?.textContent || '')
  `, 5000) && await clickNoticeAction(win, "PASS233 scheduled automation notice"));
  assertStep("PASS233_SCHEDULED_NOTICE_USES_ACTIVE_FILTER", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.subagent-workbench');
      const activeFilter = document.querySelector('.task-center-filters [data-task-filter="active"].active');
      const scheduled = document.querySelector('.automation-task-card.focused-task-card[data-automation-id="${SCHEDULED_AUTOMATION_ID}"]');
      const paused = document.querySelector('.automation-task-card[data-automation-id="${PAUSED_AUTOMATION_ID}"]');
      const text = panel?.textContent || '';
      return Boolean(
        panel &&
        activeFilter &&
        scheduled &&
        scheduled.getAttribute('aria-current') === 'true' &&
        /PASS233 scheduled automation prompt/.test(text) &&
        !paused &&
        !/PASS233 paused automation prompt/.test(text)
      );
    })();
  `, 12000));

  assertStep("PASS233_OPEN_NOTICE_CENTER_FOR_RUNNING_SUBAGENT", await openNoticeCenter(win));
  assertStep("PASS233_CLICK_RUNNING_SUBAGENT_NOTICE", await waitFor(win, `
    /PASS233 running subagent notice/.test(document.querySelector('.notice-center')?.textContent || '')
  `, 5000) && await clickNoticeAction(win, "PASS233 running subagent notice"));
  assertStep("PASS233_RUNNING_SUBAGENT_NOTICE_USES_ACTIVE_FILTER", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.subagent-workbench');
      const activeFilter = document.querySelector('.task-center-filters [data-task-filter="active"].active');
      const running = document.querySelector('.subagent-run-card.focused-task-card[data-subagent-run-id="${RUNNING_RUN_ID}"]');
      const done = document.querySelector('.subagent-run-card[data-subagent-run-id="${DONE_RUN_ID}"]');
      const archived = document.querySelector('.subagent-run-card[data-subagent-run-id="${ARCHIVED_RUN_ID}"]');
      const text = panel?.textContent || '';
      return Boolean(
        panel &&
        activeFilter &&
        running &&
        running.getAttribute('aria-current') === 'true' &&
        /PASS233 Running Agent/.test(text) &&
        !done &&
        !archived &&
        !/PASS233 Done Agent/.test(text) &&
        !/PASS233 Archived Agent/.test(text)
      );
    })();
  `, 12000));

  assertStep("PASS233_OPEN_NOTICE_CENTER_FOR_ARCHIVED_SUBAGENT", await openNoticeCenter(win));
  assertStep("PASS233_CLICK_ARCHIVED_SUBAGENT_NOTICE", await waitFor(win, `
    /PASS233 archived subagent notice/.test(document.querySelector('.notice-center')?.textContent || '')
  `, 5000) && await clickNoticeAction(win, "PASS233 archived subagent notice"));
  assertStep("PASS233_ARCHIVED_SUBAGENT_NOTICE_USES_ARCHIVED_FILTER", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.subagent-workbench');
      const archivedFilter = document.querySelector('.task-center-filters [data-task-filter="archived"].active');
      const archived = document.querySelector('.subagent-run-card.focused-task-card.archived[data-subagent-run-id="${ARCHIVED_RUN_ID}"]');
      const running = document.querySelector('.subagent-run-card[data-subagent-run-id="${RUNNING_RUN_ID}"]');
      const artifacts = archived?.querySelector('.subagent-evidence-details + .subagent-evidence-details');
      const text = panel?.textContent || '';
      return Boolean(
        panel &&
        archivedFilter &&
        archived &&
        archived.getAttribute('aria-current') === 'true' &&
        artifacts?.open &&
        /PASS233 Archived Agent/.test(text) &&
        /PASS233 archived artifact content/.test(text) &&
        !running &&
        !/PASS233 Running Agent/.test(text)
      );
    })();
  `, 12000));

  console.log("PASS233_NOTICE_TASK_STATUS_DEEPLINKS_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS233_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (async function() {
          const state = await window.claudexDesktop?.getState?.().catch(() => null);
          return {
            noticeCenter: document.querySelector('.notice-center')?.textContent || '',
            activeFilter: document.querySelector('.task-center-filters .active')?.getAttribute('data-task-filter') || '',
            automationCards: Array.from(document.querySelectorAll('.automation-task-card')).map((card) => ({
              id: card.getAttribute('data-automation-id'),
              className: card.className,
              current: card.getAttribute('aria-current'),
              text: card.textContent,
            })),
            subagentCards: Array.from(document.querySelectorAll('.subagent-run-card')).map((card) => ({
              id: card.getAttribute('data-subagent-run-id'),
              className: card.className,
              current: card.getAttribute('aria-current'),
              text: card.textContent,
            })),
            notices: state?.notices?.map((notice) => ({ id: notice.id, title: notice.title, action: notice.action })),
            panel: document.querySelector('.bottom-work-panel')?.textContent || '',
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS233_DEBUG", JSON.stringify(debug, null, 2).slice(0, 12000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS233_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
