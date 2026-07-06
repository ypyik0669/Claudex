const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass95-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass95-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass95-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const DAY_MS = 24 * 60 * 60 * 1000;

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

const fakeClaudeScript = `
const fs = require('fs');
const args = process.argv.slice(2);
const marker = process.env.PASS95_RUN_MARKER;
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value) + '\\n'); }
if (args[0] === '-p') {
  if (marker) {
    const current = fs.existsSync(marker) ? Number(fs.readFileSync(marker, 'utf8') || '0') : 0;
    fs.writeFileSync(marker, String(current + 1), 'utf8');
  }
  out({ result: 'pass95-recurring-ok: ' + args[1], session_id: 'pass95-claude-session' });
} else if (args[0] === '--version') {
  out('2.9.0 (pass95 fake)');
} else if (args[0] === 'plugin' && args[1] === 'list' && args[2] === '--json') {
  out([]);
} else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args[3] === '--json') {
  out([]);
} else if (args[0] === 'mcp') {
  out('No MCP servers configured');
} else {
  out({ result: 'pass95 generic ok', session_id: 'pass95-claude-session' });
}
`;

function writeFakeClaude() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), "@echo off\r\nnode \"%~dp0fake-claude.cjs\" %*\r\n", "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
  process.env.PASS95_RUN_MARKER = path.join(USER_DATA_DIR, "pass95-run-count.txt");
  return path.join(FAKE_BIN_DIR, "claude.cmd");
}

function writeInitialStore(runAt, historicRunAt) {
  const fakeClaude = writeFakeClaude();
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass95-project" }), "utf8");
  const project = { name: "pass95-project", path: PROJECT_DIR };
  const historicEntry = {
    id: "pass95-old-run",
    trigger: "scheduled",
    status: "succeeded",
    startedAt: historicRunAt,
    endedAt: new Date(new Date(historicRunAt).getTime() + 1000).toISOString(),
    durationMs: 1000,
    sessionId: "pass95-thread",
    detail: "pass95 previous scheduled run",
    error: "",
    summary: "pass95 previous scheduled run",
    stdout: "",
    stderr: "",
    code: 0,
  };
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
        id: "pass95-thread",
        title: "pass95 recurring automation thread",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-06T00:00:00.000Z",
        updatedAt: "2026-07-06T00:00:00.000Z",
        messages: [],
      },
    ],
    automations: [
      {
        id: "pass95-daily",
        prompt: "pass95 recurring daily prompt",
        schedule: { type: "daily", runAt },
        project,
        threadId: "pass95-thread",
        enabled: true,
        status: "scheduled",
        createdAt: "2026-07-06T00:00:00.000Z",
        updatedAt: "2026-07-06T00:00:00.000Z",
        history: [],
      },
      {
        id: "pass95-daily-history",
        prompt: "pass95 recurring missed prompt",
        schedule: { type: "daily", runAt: historicRunAt },
        project,
        threadId: "pass95-thread",
        enabled: true,
        status: "scheduled",
        createdAt: "2026-07-06T00:00:00.000Z",
        updatedAt: "2026-07-06T00:00:00.000Z",
        lastRun: historicEntry,
        history: [historicEntry],
      },
    ],
    subagentRuns: [],
    commandRuns: [],
    runEvents: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

async function openAutomation(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = Array.from(document.querySelectorAll('button'))
        .find((item) => item.getAttribute('aria-label') === '自动化' || /自动化/.test(item.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

app.setPath("userData", USER_DATA_DIR);
const missedRunAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
const historicRunAt = new Date(Date.now() - 3 * DAY_MS).toISOString();
writeInitialStore(missedRunAt, historicRunAt);
require(path.join(REPO_DIR, "electron", "main.cjs"));

app.whenReady().then(async () => {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.error("PASS95_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  try {
    assertStep("PASS95_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
    assertStep("PASS95_OPEN_AUTOMATION", await openAutomation(win));
    assertStep("PASS95_DAILY_UI_VISIBLE", await waitFor(win, `
      Boolean(
        document.querySelector('.scheduled-modal') &&
        /pass95 recurring daily prompt/.test(document.body.textContent || '') &&
        /pass95 recurring missed prompt/.test(document.body.textContent || '') &&
        /每天/.test(document.body.textContent || '')
      )
    `, 5000));

    assertStep("PASS95_SCHEDULED_RUN_RECOVERED", await waitFor(win, `
      (async function() {
        const state = await window.claudexDesktop.getState();
        const automation = state.automations?.find((item) => item.id === 'pass95-daily');
        const historicAutomation = state.automations?.find((item) => item.id === 'pass95-daily-history');
        const session = state.sessions?.find((item) => item.id === 'pass95-thread');
        const event = state.runEvents?.find((item) => item.id === automation?.lastRun?.id);
        const historicEvent = state.runEvents?.find((item) => item.id === historicAutomation?.lastRun?.id);
        return Boolean(
          automation?.schedule?.type === 'daily' &&
          automation.enabled === true &&
          automation.status === 'scheduled' &&
          automation.lastRun?.trigger === 'scheduled' &&
          automation.lastRun?.status === 'succeeded' &&
          automation.nextRun &&
          new Date(automation.nextRun).getTime() > Date.now() &&
          event?.type === 'automation' &&
          event.status === 'ok' &&
          /pass95-recurring-ok/.test(event.detail || '') &&
          historicAutomation?.schedule?.type === 'daily' &&
          historicAutomation.enabled === true &&
          historicAutomation.status === 'scheduled' &&
          historicAutomation.lastRun?.id !== 'pass95-old-run' &&
          historicAutomation.history?.filter((entry) => entry.trigger === 'scheduled').length === 2 &&
          historicAutomation.nextRun &&
          new Date(historicAutomation.nextRun).getTime() > Date.now() &&
          historicEvent?.type === 'automation' &&
          historicEvent.status === 'ok' &&
          /pass95-recurring-ok/.test(historicEvent.detail || '') &&
          session?.messages?.some((message) => /pass95 recurring daily prompt/.test(message.content || '')) &&
          session?.messages?.some((message) => /pass95 recurring missed prompt/.test(message.content || '')) &&
          session?.messages?.some((message) => /pass95-recurring-ok/.test(message.content || ''))
        );
      })();
    `, 12000));

    assertStep("PASS95_NO_REPEAT_STORM", await waitFor(win, `
      (async function() {
        await new Promise((resolve) => setTimeout(resolve, 1800));
        const state = await window.claudexDesktop.getState();
        const automation = state.automations?.find((item) => item.id === 'pass95-daily');
        const historicAutomation = state.automations?.find((item) => item.id === 'pass95-daily-history');
        return Boolean(
          automation?.history?.filter((entry) => entry.trigger === 'scheduled').length === 1 &&
          historicAutomation?.history?.filter((entry) => entry.trigger === 'scheduled').length === 2 &&
          automation.nextRun &&
          new Date(automation.nextRun).getTime() > Date.now() &&
          historicAutomation.nextRun &&
          new Date(historicAutomation.nextRun).getTime() > Date.now()
        );
      })();
    `, 4000));

    assertStep("PASS95_RUN_COUNT_EXPECTED", (() => {
      const marker = process.env.PASS95_RUN_MARKER;
      return fs.existsSync(marker) && fs.readFileSync(marker, "utf8") === "2";
    })());

    console.log("PASS95_AUTOMATION_RECURRING_RECOVERY_DONE");
    cleanup();
    app.exit(0);
  } catch (error) {
    console.error(error);
    cleanup();
    app.exit(1);
  }
});

setTimeout(() => {
  console.error("PASS95_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
