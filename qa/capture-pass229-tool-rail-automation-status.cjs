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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass229-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass229-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass229-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const FAILED_AUTOMATION_ID = "pass229-failed-automation";
const FAILED_RUN_ID = "pass229-failed-run";
const RUNNING_AUTOMATION_ID = "pass229-running-automation";
const SCHEDULED_AUTOMATION_ID = "pass229-scheduled-automation";

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
if (args[0] === '--version') out('2.29.0 (Claude Code PASS229)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out({ plugins: [] });
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out({ servers: [] });
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else out('pass229 fake claude command: ' + args.join(' '));
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass229-project" }), "utf8");
  const project = { name: "pass229-project", path: PROJECT_DIR };
  const failedRun = {
    id: FAILED_RUN_ID,
    trigger: "scheduled",
    status: "failed",
    startedAt: "2026-07-08T02:29:00.000Z",
    endedAt: "2026-07-08T02:29:04.000Z",
    durationMs: 4321,
    sessionId: "pass229-session",
    detail: "PASS229 failed automation detail from persisted history",
    error: "PASS229 automation failure from persisted store",
    summary: "PASS229 automation failed summary",
    stdout: "PASS229 automation stdout before failure",
    stderr: "PASS229 automation stderr evidence",
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
        id: "pass229-session",
        title: "PASS229 tool rail automation status",
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
        prompt: "PASS229 failed automation prompt",
        schedule: { type: "once", runAt: "" },
        project,
        threadId: "pass229-session",
        enabled: false,
        status: "failed",
        createdAt: "2026-07-08T02:28:00.000Z",
        updatedAt: "2026-07-08T02:29:04.000Z",
        lastRun: failedRun,
        history: [failedRun],
      },
      {
        id: RUNNING_AUTOMATION_ID,
        prompt: "PASS229 idle automation prompt",
        schedule: { type: "once", runAt: "" },
        project,
        threadId: "pass229-session",
        enabled: false,
        status: "idle",
        createdAt: "2026-07-08T02:28:10.000Z",
        updatedAt: "2026-07-08T02:29:00.000Z",
        lastRun: null,
        history: [],
      },
      {
        id: SCHEDULED_AUTOMATION_ID,
        prompt: "PASS229 scheduled automation prompt",
        schedule: { type: "once", runAt: "2099-07-08T02:29:00.000Z" },
        project,
        threadId: "pass229-session",
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
  if (!win) throw new Error("PASS229_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS229_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS229_RAIL_AUTOMATION_STATUS_VISIBLE", await waitFor(win, `
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

  assertStep("PASS229_CLICK_RAIL_FOCUSES_FAILED_AUTOMATION", await win.webContents.executeJavaScript(`
    (async function() {
      const button = document.querySelector('.tool-rail [data-tool="automations"]');
      if (!button) return false;
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 450));
      return true;
    })();
  `));
  assertStep("PASS229_AUTOMATION_WORKBENCH_FAILED_FOCUSED", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.bottom-work-panel');
      const failed = document.querySelector('.automation-task-card.focused-task-card[data-automation-id="${FAILED_AUTOMATION_ID}"]');
      const running = document.querySelector('.automation-task-card[data-automation-id="${RUNNING_AUTOMATION_ID}"]');
      const scheduled = document.querySelector('.automation-task-card[data-automation-id="${SCHEDULED_AUTOMATION_ID}"]');
      const history = failed?.querySelector('.automation-task-history');
      const evidence = failed?.querySelector('.automation-run-evidence-details');
      const text = panel?.textContent || '';
      return Boolean(
        panel &&
        failed &&
        failed.getAttribute('aria-current') === 'true' &&
        history?.open &&
        evidence?.open &&
        /PASS229 failed automation prompt/.test(text) &&
        /PASS229 automation failure from persisted store/.test(text) &&
        /PASS229 automation stderr evidence/.test(text) &&
        /失败/.test(text) &&
        !running &&
        !scheduled
      );
    })();
  `, 12000));

  console.log("PASS229_TOOL_RAIL_AUTOMATION_STATUS_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS229_FAILED", error?.stack || error);
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
      console.error("PASS229_DEBUG", JSON.stringify(debug, null, 2).slice(0, 12000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS229_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
