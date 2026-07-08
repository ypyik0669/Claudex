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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass287-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass287-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass287-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const FAILED_AUTOMATION_ID = "pass287-failed-automation";
const FAILED_AUTOMATION_RUN_ID = "pass287-failed-automation-run";
const FAILED_SUBAGENT_ID = "pass287-failed-subagent";
const FAILED_SUBAGENT_REQUEST_ID = "pass287-failed-request";

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
if (args[0] === '--version') out('2.87.0 (Claude Code PASS287)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out({ plugins: [] });
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out({ servers: [] });
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else out('pass287 fake claude command: ' + args.join(' '));
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass287-project" }), "utf8");
  const project = { name: "pass287-project", path: PROJECT_DIR };
  const failedAutomationRun = {
    id: FAILED_AUTOMATION_RUN_ID,
    trigger: "scheduled",
    status: "failed",
    startedAt: "2026-07-08T02:37:00.000Z",
    endedAt: "2026-07-08T02:37:04.000Z",
    durationMs: 4000,
    sessionId: "pass287-session",
    detail: "PASS287 automation failed detail",
    error: "PASS287 automation failed error",
    summary: "PASS287 automation failed summary",
    stdout: "PASS287 automation stdout evidence",
    stderr: "PASS287 automation stderr evidence",
    code: 87,
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
        id: "pass287-session",
        title: "PASS287 command palette task action focus",
        project: project.name,
        projectPath: project.path,
        createdAt: "2026-07-08T02:37:00.000Z",
        updatedAt: "2026-07-08T02:37:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    runEvents: [],
    automations: [
      {
        id: FAILED_AUTOMATION_ID,
        prompt: "PASS287 failed automation prompt",
        schedule: { type: "once", runAt: "" },
        project,
        threadId: "pass287-session",
        enabled: false,
        status: "failed",
        createdAt: "2026-07-08T02:36:00.000Z",
        updatedAt: "2026-07-08T02:37:04.000Z",
        lastRun: failedAutomationRun,
        history: [failedAutomationRun],
      },
    ],
    subagentRuns: [
      {
        id: FAILED_SUBAGENT_ID,
        requestId: FAILED_SUBAGENT_REQUEST_ID,
        nickname: "PASS287 Failed Agent",
        task: "PASS287 failed subagent task",
        status: "error",
        sessionId: "pass287-session",
        project,
        cwd: PROJECT_DIR,
        command: FAKE_CLAUDE,
        args: ["-p", "PASS287 failed subagent task"],
        stderr: "PASS287 subagent stderr evidence",
        summary: "PASS287 subagent failed summary",
        code: 78,
        durationMs: 3000,
        startedAt: "2026-07-08T02:36:30.000Z",
        endedAt: "2026-07-08T02:36:33.000Z",
        artifacts: [
          { type: "summary", label: "PASS287 subagent artifact", content: "PASS287 subagent artifact evidence" },
        ],
      },
    ],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

async function runPaletteCommand(win, commandId, query) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 260));
      const button = document.querySelector(${JSON.stringify(`.command-modal .command-list button[data-command-id="${commandId}"]`)});
      if (!button) return false;
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 420));
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS287_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS287_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));

  assertStep(
    "PASS287_OPEN_FAILED_AUTOMATION_FROM_PALETTE",
    await runPaletteCommand(win, `automation:${FAILED_AUTOMATION_ID}`, "PASS287 failed automation prompt"),
  );
  assertStep("PASS287_FAILED_AUTOMATION_FOCUSES_RUN_NOW", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.subagent-workbench');
      const failedFilter = document.querySelector('.task-center-filters [data-task-filter="failed"].active');
      const failed = document.querySelector('.automation-task-card.focused-task-card[data-automation-id="${FAILED_AUTOMATION_ID}"]');
      const history = failed?.querySelector('.automation-task-history');
      const evidence = failed?.querySelector('.automation-run-evidence-details');
      const runNow = failed?.querySelector('[data-automation-recovery-action="run-now"]');
      const text = panel?.textContent || '';
      return Boolean(
        panel &&
        failedFilter &&
        failed &&
        failed.getAttribute('aria-current') === 'true' &&
        history?.open &&
        evidence?.open &&
        runNow &&
        runNow.getAttribute('data-task-action-focused') === 'true' &&
        document.activeElement === runNow &&
        /PASS287 failed automation prompt/.test(text) &&
        /PASS287 automation failed error/.test(text) &&
        /PASS287 automation stderr evidence/.test(text)
      );
    })();
  `, 12000));

  assertStep(
    "PASS287_OPEN_FAILED_SUBAGENT_FROM_PALETTE",
    await runPaletteCommand(win, `subagent:${FAILED_SUBAGENT_ID}`, "PASS287 Failed Agent"),
  );
  assertStep("PASS287_FAILED_SUBAGENT_FOCUSES_RETRY", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.subagent-workbench');
      const failedFilter = document.querySelector('.task-center-filters [data-task-filter="failed"].active');
      const failed = document.querySelector('.subagent-run-card.focused-task-card[data-subagent-run-id="${FAILED_SUBAGENT_ID}"]');
      const evidence = failed?.querySelector('.subagent-evidence-details');
      const artifacts = failed?.querySelector('.subagent-evidence-details + .subagent-evidence-details');
      const retry = failed?.querySelector('[data-subagent-recovery-action="retry"]');
      const text = panel?.textContent || '';
      return Boolean(
        panel &&
        failedFilter &&
        failed &&
        failed.getAttribute('aria-current') === 'true' &&
        evidence?.open &&
        artifacts?.open &&
        retry &&
        retry.getAttribute('data-task-action-focused') === 'true' &&
        document.activeElement === retry &&
        /PASS287 Failed Agent/.test(text) &&
        /PASS287 subagent stderr evidence/.test(text) &&
        /PASS287 subagent artifact evidence/.test(text)
      );
    })();
  `, 12000));

  assertStep("PASS287_COMMAND_PALETTE_FOCUS_DID_NOT_MUTATE_TASKS", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      const automation = (state.automations || []).find((item) => item.id === "${FAILED_AUTOMATION_ID}");
      const subagent = (state.subagentRuns || []).find((item) => item.id === "${FAILED_SUBAGENT_ID}");
      return Boolean(
        (state.commandRuns || []).length === 0 &&
        (state.runEvents || []).length === 0 &&
        automation &&
        automation.status === "failed" &&
        Array.isArray(automation.history) &&
        automation.history.length === 1 &&
        automation.history[0]?.id === "${FAILED_AUTOMATION_RUN_ID}" &&
        subagent &&
        subagent.status === "error" &&
        !subagent.continuedAt &&
        Array.isArray(subagent.artifacts) &&
        subagent.artifacts.length === 1
      );
    })();
  `));

  console.log("PASS287_COMMAND_PALETTE_TASK_ACTION_FOCUS_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS287_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (function() {
          return {
            commandModal: document.querySelector('.command-modal')?.textContent || '',
            activeFilter: document.querySelector('.task-center-filters .active')?.getAttribute('data-task-filter') || '',
            automation: document.querySelector('.automation-task-card.focused-task-card')?.outerHTML || '',
            subagent: document.querySelector('.subagent-run-card.focused-task-card')?.outerHTML || '',
            panel: document.querySelector('.bottom-work-panel')?.textContent || '',
            activeElement: document.activeElement?.outerHTML || '',
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS287_DEBUG", JSON.stringify(debug, null, 2).slice(0, 14000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS287_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
