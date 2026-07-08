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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass285-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass285-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass285-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const FAILED_AUTOMATION_ID = "pass285-failed-automation";
const FAILED_RUN_ID = "pass285-failed-run";
const RUNNING_AUTOMATION_ID = "pass285-running-automation";
const SCHEDULED_AUTOMATION_ID = "pass285-scheduled-automation";

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
if (args[0] === '--version') out('2.85.0 (Claude Code PASS285)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out({ plugins: [] });
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out({ servers: [] });
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else out('pass285 fake claude command: ' + args.join(' '));
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass285-project" }), "utf8");
  const project = { name: "pass285-project", path: PROJECT_DIR };
  const failedRun = {
    id: FAILED_RUN_ID,
    trigger: "scheduled",
    status: "failed",
    startedAt: "2026-07-08T02:29:00.000Z",
    endedAt: "2026-07-08T02:29:04.000Z",
    durationMs: 4321,
    sessionId: "pass285-session",
    detail: "PASS285 failed automation detail from persisted history",
    error: "PASS285 automation failure from persisted store",
    summary: "PASS285 automation failed summary",
    stdout: "PASS285 automation stdout before failure",
    stderr: "PASS285 automation stderr evidence",
    code: 23,
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
        id: "pass285-session",
        title: "PASS285 tool rail automation action focus",
        project: project.name,
        projectPath: project.path,
        createdAt: "2026-07-08T02:29:00.000Z",
        updatedAt: "2026-07-08T02:29:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    runEvents: [],
    automations: [
      {
        id: FAILED_AUTOMATION_ID,
        prompt: "PASS285 failed automation prompt",
        schedule: { type: "once", runAt: "" },
        project,
        threadId: "pass285-session",
        enabled: false,
        status: "failed",
        createdAt: "2026-07-08T02:28:00.000Z",
        updatedAt: "2026-07-08T02:29:04.000Z",
        lastRun: failedRun,
        history: [failedRun],
      },
      {
        id: RUNNING_AUTOMATION_ID,
        prompt: "PASS285 running automation prompt",
        schedule: { type: "once", runAt: "" },
        project,
        threadId: "pass285-session",
        enabled: false,
        status: "running",
        createdAt: "2026-07-08T02:28:10.000Z",
        updatedAt: "2026-07-08T02:29:00.000Z",
        lastRun: {
          id: "pass285-running-run",
          trigger: "manual",
          status: "running",
          startedAt: "2026-07-08T02:29:30.000Z",
          durationMs: 0,
          sessionId: "pass285-session",
          detail: "PASS285 running automation detail",
          summary: "PASS285 running automation summary",
        },
        history: [],
      },
      {
        id: SCHEDULED_AUTOMATION_ID,
        prompt: "PASS285 scheduled automation prompt",
        schedule: { type: "once", runAt: "2099-07-08T02:29:00.000Z" },
        project,
        threadId: "pass285-session",
        enabled: true,
        status: "scheduled",
        createdAt: "2026-07-08T02:28:20.000Z",
        updatedAt: "2026-07-08T02:28:20.000Z",
        history: [],
      },
    ],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS285_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS285_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS285_RAIL_AUTOMATION_STATUS_VISIBLE", await waitFor(win, `
    (function() {
      const rail = document.querySelector('.tool-rail');
      const button = rail?.querySelector('[data-tool="automations"]');
      const text = button?.getAttribute('title') || button?.getAttribute('aria-label') || '';
      return Boolean(
        rail &&
        button &&
        button.getAttribute('data-tool-rail-status') === 'error' &&
        /自动化/.test(text) &&
        /失败/.test(text) &&
        /1/.test(text) &&
        /!/.test(button.textContent || '')
      );
    })();
  `, 12000));

  assertStep("PASS285_CLICK_RAIL_FOCUSES_FAILED_AUTOMATION", await win.webContents.executeJavaScript(`
    (async function() {
      const button = document.querySelector('.tool-rail [data-tool="automations"]');
      if (!button) return false;
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 450));
      return true;
    })();
  `));
  assertStep("PASS285_AUTOMATION_WORKBENCH_FAILED_FOCUSED", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.bottom-work-panel');
      const failed = document.querySelector('.automation-task-card.focused-task-card[data-automation-id="${FAILED_AUTOMATION_ID}"]');
      const running = document.querySelector('.automation-task-card[data-automation-id="${RUNNING_AUTOMATION_ID}"]');
      const scheduled = document.querySelector('.automation-task-card[data-automation-id="${SCHEDULED_AUTOMATION_ID}"]');
      const history = failed?.querySelector('.automation-task-history');
      const evidence = failed?.querySelector('.automation-run-evidence-details');
      const runNow = failed?.querySelector('[data-automation-recovery-action="run-now"]');
      const text = panel?.textContent || '';
      return Boolean(
        panel &&
        failed &&
        failed.getAttribute('aria-current') === 'true' &&
        history?.open &&
        evidence?.open &&
        runNow &&
        runNow.getAttribute('data-task-action-focused') === 'true' &&
        document.activeElement === runNow &&
        /PASS285 failed automation prompt/.test(text) &&
        /PASS285 automation failure from persisted store/.test(text) &&
        /PASS285 automation stderr evidence/.test(text) &&
        /失败/.test(text) &&
        !running &&
        !scheduled
      );
    })();
  `, 12000));
  assertStep("PASS285_RAIL_FOCUS_DID_NOT_MUTATE_AUTOMATION", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      const automation = (state.automations || []).find((item) => item.id === "${FAILED_AUTOMATION_ID}");
      return Boolean(
        (state.commandRuns || []).length === 0 &&
        (state.runEvents || []).length === 0 &&
        automation &&
        automation.status === "failed" &&
        Array.isArray(automation.history) &&
        automation.history.length === 1 &&
        automation.history[0]?.id === "${FAILED_RUN_ID}"
      );
    })();
  `));

  console.log("PASS285_TOOL_RAIL_AUTOMATION_ACTION_FOCUS_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS285_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (function() {
          return {
            rail: document.querySelector('.tool-rail')?.textContent || '',
            railButton: document.querySelector('.tool-rail [data-tool="automations"]')?.outerHTML || '',
            panel: document.querySelector('.bottom-work-panel')?.textContent || '',
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS285_DEBUG", JSON.stringify(debug, null, 2).slice(0, 12000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS285_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
