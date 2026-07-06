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
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass48-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass48-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass48-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const COMMAND_LOG = path.join(USER_DATA_DIR, "claude-command-log.txt");

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

function readCommandLog() {
  try {
    return fs.readFileSync(COMMAND_LOG, "utf8");
  } catch (_error) {
    return "";
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

async function waitForLog(pattern, timeoutMs = 12000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (pattern.test(readCommandLog())) return true;
    await wait(150);
  }
  return false;
}

async function waitForLogCount(pattern, expectedCount, timeoutMs = 12000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const matches = readCommandLog().match(pattern) || [];
    if (matches.length >= expectedCount) return true;
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
const fs = require('fs');
const args = process.argv.slice(2);
const commandLog = ${JSON.stringify(COMMAND_LOG)};
fs.appendFileSync(commandLog, args.join(' ') + '\\n', 'utf8');
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value) + '\\n'); }
if (args[0] === '-p') {
  process.stderr.write('pass48 scheduled automation failed\\n');
  process.exit(23);
} else if (args[0] === '--version') {
  out('2.9.0 (pass48 fake)');
} else {
  out({ result: 'pass48 generic ok', session_id: 'pass48-claude-session' });
}
`;
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
  return path.join(FAKE_BIN_DIR, "claude.cmd");
}

function writeInitialStore(claudeCommand) {
  const createdAt = new Date(Date.now() - 120000).toISOString();
  const runAt = new Date(Date.now() - 60000).toISOString();
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass48-project" }), "utf8");
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
      claudeCode: { executionMode: "claude-code", claudeCommand, permissionMode: "default" },
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
    activeProject: { name: "pass48-project", path: PROJECT_DIR },
    projects: [{ name: "pass48-project", path: PROJECT_DIR }],
    sessions: [
      {
        id: "default",
        title: "新聊天",
        project: "pass48-project",
        projectPath: PROJECT_DIR,
        createdAt,
        updatedAt: createdAt,
        messages: [],
      },
    ],
    automations: [
      {
        id: "pass48-automation",
        prompt: "pass48 scheduled prompt",
        schedule: { type: "once", runAt },
        project: { name: "pass48-project", path: PROJECT_DIR },
        threadId: "default",
        enabled: true,
        status: "scheduled",
        createdAt,
        updatedAt: createdAt,
        history: [],
      },
    ],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

async function openNoticesPanel(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = Array.from(document.querySelectorAll('.workspace-context-tabs .workspace-context-button'))[2];
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS48_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS48_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop?.onStateUpdate)", 15000));
  assertStep("PASS48_SCHEDULED_COMMAND_RAN", await waitForLog(/pass48 scheduled prompt/, 20000));
  assertStep("PASS48_FAILED_STATE", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const automation = state.automations?.find((item) => item.id === 'pass48-automation');
      const event = state.runEvents?.find((item) => item.id === automation?.lastRun?.id);
      return Boolean(
        automation?.lastRun?.status === 'failed' &&
        /pass48 scheduled automation failed/.test(automation.lastRun.error || '') &&
        event?.type === 'automation' &&
        event.status === 'error' &&
        /pass48 scheduled automation failed/.test(event.detail || '') &&
        state.notices?.some((notice) =>
          !notice.dismissedAt &&
          notice.source === 'automation' &&
          notice.action === 'automation:pass48-automation' &&
          /pass48 scheduled automation failed/.test((notice.title || '') + (notice.detail || ''))
        )
      );
    })();
  `, 12000));
  assertStep("PASS48_RENDERER_STATE_UPDATED", await waitFor(win, `
    /1/.test(Array.from(document.querySelectorAll('.workspace-context-button'))[2]?.querySelector('em')?.textContent || '')
  `, 8000));
  assertStep("PASS48_OPEN_NOTICE_PANEL", await openNoticesPanel(win));
  assertStep("PASS48_NOTICE_VISIBLE_WITHOUT_RELOAD", await waitFor(win, `
    Boolean(
      document.querySelector('.bottom-work-panel .notice-card.error button[data-notice-action="open"]') &&
      /pass48 scheduled automation failed/.test(document.body.textContent || '')
    )
  `, 8000));
  assertStep("PASS48_NOTICE_ACTION_OPEN_TASK_CENTER", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.bottom-work-panel .notice-card.error button[data-notice-action="open"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS48_TASK_CENTER_AUTOMATION_FOCUSED", await waitFor(win, `
    (function() {
      const card = document.querySelector('.automation-task-card.focused-task-card[data-automation-id="pass48-automation"]');
      return Boolean(
        document.querySelector('.bottom-work-panel .task-center-summary') &&
        card &&
        card.querySelector('.automation-task-history[open]') &&
        card.querySelector('.automation-run-evidence-details[open]') &&
        /pass48 scheduled prompt/.test(card.textContent || '') &&
        /pass48 scheduled automation failed/.test(card.textContent || '')
      );
    })()
  `, 8000));
  assertStep("PASS48_OPEN_AUTOMATION_TIMELINE_FROM_TASK_CENTER", await win.webContents.executeJavaScript(`
    (function() {
      const card = document.querySelector('.automation-task-card.focused-task-card[data-automation-id="pass48-automation"]');
      const button = Array.from(card?.querySelectorAll('button') || [])
        .find((candidate) => /timeline/i.test((candidate.title || '') + (candidate.textContent || '')));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS48_SELECTED_AUTOMATION_RECOVERY_VISIBLE", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.selected-run-evidence-panel.error');
      return Boolean(
        panel &&
        /pass48 scheduled prompt/.test(panel.textContent || '') &&
        /pass48 scheduled automation failed/.test(panel.textContent || '') &&
        panel.querySelector('[data-run-recovery-action="task-center"]') &&
        panel.querySelector('[data-run-recovery-action="run-automation"]') &&
        panel.querySelector('[data-run-recovery-action="terminal"]') &&
        panel.querySelector('[data-run-recovery-action="interactive-claude"]')
      );
    })()
  `, 8000));
  assertStep("PASS48_RUN_AUTOMATION_FROM_SELECTED_EVIDENCE", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.selected-run-evidence-panel [data-run-recovery-action="run-automation"]');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS48_SELECTED_RECOVERY_COMMAND_RAN", await waitForLogCount(/pass48 scheduled prompt/g, 2, 12000));
  assertStep("PASS48_SELECTED_RECOVERY_STORE_UPDATED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const automation = state.automations?.find((item) => item.id === 'pass48-automation');
      const failedRuns = automation?.history?.filter((entry) =>
        entry.status === 'failed' &&
        /pass48 scheduled automation failed/.test((entry.error || '') + (entry.stderr || ''))
      ) || [];
      return Boolean(
        failedRuns.length >= 2 &&
        automation?.lastRun?.status === 'failed' &&
        state.runEvents?.some((event) =>
          event.id === automation?.lastRun?.id &&
          event.type === 'automation' &&
          event.status === 'error'
        )
      );
    })();
  `, 12000));
  assertStep("PASS48_STORE_PERSISTED", (() => {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    const automation = parsed.automations?.find((item) => item.id === "pass48-automation");
    const event = parsed.runEvents?.find((item) => item.id === automation?.lastRun?.id);
    return automation?.lastRun?.status === "failed" &&
      event?.type === "automation" &&
      event.status === "error" &&
      /pass48 scheduled automation failed/.test(event.detail || "") &&
      parsed.notices?.some((notice) =>
        notice.source === "automation" &&
        notice.action === "automation:pass48-automation" &&
        /pass48 scheduled automation failed/.test(`${notice.title || ""} ${notice.detail || ""}`)
      );
  })());

  console.log("PASS48_SCHEDULED_AUTOMATION_NOTICE_DONE");
  cleanup();
  app.exit(0);
}

const fakeClaudeCommand = writeFakeClaude();
app.setPath("userData", USER_DATA_DIR);
writeInitialStore(fakeClaudeCommand);
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS48_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS48_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
