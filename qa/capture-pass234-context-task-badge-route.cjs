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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass234-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass234-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass234-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const FAILED_AUTOMATION_ID = "pass234-failed-automation";
const SCHEDULED_AUTOMATION_ID = "pass234-scheduled-automation";
const FAILED_SUBAGENT_ID = "pass234-failed-subagent";
const RUNNING_SUBAGENT_ID = "pass234-running-subagent";

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
if (args[0] === '--version') out('2.34.0 (Claude Code PASS234)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out({ plugins: [] });
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out({ servers: [] });
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else out('pass234 fake claude command: ' + args.join(' '));
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass234-project" }), "utf8");
  const createdAt = "2026-07-08T02:34:00.000Z";
  const project = { name: "pass234-project", path: PROJECT_DIR };
  const failedRun = {
    id: "pass234-failed-automation-run",
    trigger: "manual",
    status: "failed",
    startedAt: createdAt,
    endedAt: "2026-07-08T02:34:04.000Z",
    durationMs: 4000,
    sessionId: "pass234-session",
    error: "PASS234 automation failed evidence",
    stdout: "PASS234 automation stdout",
    stderr: "PASS234 automation stderr",
    code: 2,
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
        id: "pass234-session",
        title: "PASS234 context task badge route",
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
        id: FAILED_AUTOMATION_ID,
        prompt: "PASS234 failed automation prompt",
        schedule: { type: "manual", runAt: "" },
        project,
        threadId: "pass234-session",
        enabled: false,
        status: "failed",
        createdAt,
        updatedAt: createdAt,
        lastRun: failedRun,
        history: [failedRun],
      },
      {
        id: SCHEDULED_AUTOMATION_ID,
        prompt: "PASS234 scheduled automation prompt",
        schedule: { type: "once", runAt: "2099-07-08T02:34:00.000Z" },
        project,
        threadId: "pass234-session",
        enabled: true,
        status: "scheduled",
        createdAt,
        updatedAt: createdAt,
        history: [],
      },
    ],
    subagentRuns: [
      {
        id: FAILED_SUBAGENT_ID,
        requestId: "pass234-failed-subagent-request",
        nickname: "PASS234 Failed Agent",
        task: "PASS234 failed subagent task",
        status: "error",
        sessionId: "pass234-session",
        project,
        cwd: PROJECT_DIR,
        command: FAKE_CLAUDE,
        args: ["-p", "PASS234 failed subagent task"],
        stderr: "PASS234 subagent stderr evidence",
        summary: "PASS234 subagent failed summary",
        code: 2,
        durationMs: 2200,
        artifacts: [{ type: "summary", label: "PASS234 failed artifact", content: "PASS234 failed artifact content" }],
        startedAt: createdAt,
        endedAt: "2026-07-08T02:34:02.000Z",
      },
      {
        id: RUNNING_SUBAGENT_ID,
        requestId: "pass234-running-subagent-request",
        nickname: "PASS234 Running Agent",
        task: "PASS234 running subagent task",
        status: "running",
        sessionId: "pass234-session",
        project,
        cwd: PROJECT_DIR,
        command: FAKE_CLAUDE,
        args: ["-p", "PASS234 running subagent task"],
        stdout: "PASS234 running stdout",
        artifacts: [],
        startedAt: createdAt,
      },
    ],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS234_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS234_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS234_CONTEXT_TASK_BADGE_VISIBLE", await waitFor(win, `
    (function() {
      const button = document.querySelector('.workspace-context-button[data-context-tab="subagents"]');
      const text = button?.getAttribute('title') || button?.getAttribute('aria-label') || button?.textContent || '';
      return Boolean(
        button &&
        button.getAttribute('data-status') === 'error' &&
        /2/.test(text) &&
        /自动化|子代理|失败/.test(text) &&
        button.querySelector('.context-tab-badge')
      );
    })();
  `, 12000));

  assertStep("PASS234_CLICK_CONTEXT_TASK_BUTTON", await win.webContents.executeJavaScript(`
    (async function() {
      const button = document.querySelector('.workspace-context-button[data-context-tab="subagents"]');
      if (!button) return false;
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 450));
      return true;
    })();
  `));

  assertStep("PASS234_CONTEXT_BUTTON_OPENS_FAILURE_RECOVERY", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.subagent-workbench');
      const failedFilter = document.querySelector('.task-center-filters [data-task-filter="failed"].active');
      const automation = document.querySelector('.automation-task-card.focused-task-card[data-automation-id="${FAILED_AUTOMATION_ID}"]');
      const scheduled = document.querySelector('.automation-task-card[data-automation-id="${SCHEDULED_AUTOMATION_ID}"]');
      const failedSubagent = document.querySelector('.subagent-run-card[data-subagent-run-id="${FAILED_SUBAGENT_ID}"]');
      const runningSubagent = document.querySelector('.subagent-run-card[data-subagent-run-id="${RUNNING_SUBAGENT_ID}"]');
      const automationRecovery = document.querySelector('[data-automation-recovery-surface="task-center"][data-automation-id="${FAILED_AUTOMATION_ID}"]');
      const subagentRecovery = document.querySelector('[data-subagent-recovery-surface="task-center"][data-subagent-run-id="${FAILED_SUBAGENT_ID}"]');
      const text = panel?.textContent || '';
      return Boolean(
        panel &&
        failedFilter &&
        automation &&
        automation.getAttribute('aria-current') === 'true' &&
        failedSubagent &&
        automationRecovery &&
        subagentRecovery &&
        /PASS234 automation failed evidence/.test(text) &&
        /PASS234 subagent failed summary/.test(text) &&
        !scheduled &&
        !runningSubagent &&
        !/PASS234 scheduled automation prompt/.test(text) &&
        !/PASS234 Running Agent/.test(text)
      );
    })();
  `, 12000));

  console.log("PASS234_CONTEXT_TASK_BADGE_ROUTE_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS234_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (function() {
          return {
            contextButton: document.querySelector('.workspace-context-button[data-context-tab="subagents"]')?.outerHTML || '',
            activeFilter: document.querySelector('.task-center-filters .active')?.getAttribute('data-task-filter') || '',
            focusedAutomation: document.querySelector('.automation-task-card.focused-task-card')?.getAttribute('data-automation-id') || '',
            focusedSubagent: document.querySelector('.subagent-run-card.focused-task-card')?.getAttribute('data-subagent-run-id') || '',
            automationCards: Array.from(document.querySelectorAll('.automation-task-card')).map((card) => card.getAttribute('data-automation-id')),
            subagentCards: Array.from(document.querySelectorAll('.subagent-run-card')).map((card) => card.getAttribute('data-subagent-run-id')),
            panel: document.querySelector('.bottom-work-panel')?.textContent || '',
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS234_DEBUG", JSON.stringify(debug, null, 2).slice(0, 12000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS234_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
