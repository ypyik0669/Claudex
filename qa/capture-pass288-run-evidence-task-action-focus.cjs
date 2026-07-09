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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass288-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass288-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass288-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const FAILED_AUTOMATION_ID = "pass288-failed-automation";
const FAILED_AUTOMATION_RUN_ID = "pass288-failed-automation-run";
const FAILED_SUBAGENT_ID = "pass288-failed-subagent";
const FAILED_SUBAGENT_REQUEST_ID = "pass288-failed-request";

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
if (args[0] === '--version') out('2.88.0 (Claude Code PASS288)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out({ plugins: [] });
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out({ servers: [] });
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else out('pass288 fake claude command: ' + args.join(' '));
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass288-project" }), "utf8");
  const project = { name: "pass288-project", path: PROJECT_DIR };
  const failedAutomationRun = {
    id: FAILED_AUTOMATION_RUN_ID,
    trigger: "scheduled",
    status: "failed",
    startedAt: "2026-07-08T02:38:00.000Z",
    endedAt: "2026-07-08T02:38:04.000Z",
    durationMs: 4000,
    sessionId: "pass288-session",
    detail: "PASS288 automation failed detail",
    error: "PASS288 automation failed error",
    summary: "PASS288 automation failed summary",
    stdout: "PASS288 automation stdout evidence",
    stderr: "PASS288 automation stderr evidence",
    code: 88,
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
        id: "pass288-session",
        title: "PASS288 run evidence task action focus",
        project: project.name,
        projectPath: project.path,
        createdAt: "2026-07-08T02:38:00.000Z",
        updatedAt: "2026-07-08T02:38:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    runEvents: [],
    automations: [
      {
        id: FAILED_AUTOMATION_ID,
        prompt: "PASS288 failed automation prompt",
        schedule: { type: "once", runAt: "" },
        project,
        threadId: "pass288-session",
        enabled: false,
        status: "failed",
        createdAt: "2026-07-08T02:37:00.000Z",
        updatedAt: "2026-07-08T02:38:04.000Z",
        lastRun: failedAutomationRun,
        history: [failedAutomationRun],
      },
    ],
    subagentRuns: [
      {
        id: FAILED_SUBAGENT_ID,
        requestId: FAILED_SUBAGENT_REQUEST_ID,
        nickname: "PASS288 Failed Agent",
        task: "PASS288 failed subagent task",
        status: "error",
        sessionId: "pass288-session",
        project,
        cwd: PROJECT_DIR,
        command: FAKE_CLAUDE,
        args: ["-p", "PASS288 failed subagent task"],
        stderr: "PASS288 subagent stderr evidence",
        summary: "PASS288 subagent failed summary",
        code: 78,
        durationMs: 3000,
        startedAt: "2026-07-08T02:37:30.000Z",
        endedAt: "2026-07-08T02:37:33.000Z",
        artifacts: [
          { type: "summary", label: "PASS288 subagent artifact", content: "PASS288 subagent artifact evidence" },
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

async function clickSelectedRunTaskCenter(win) {
  return win.webContents.executeJavaScript(`
    (async function() {
      const button = document.querySelector('.selected-run-evidence-panel [data-run-recovery-action="task-center"]');
      if (!button) return false;
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 500));
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS288_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS288_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));

  assertStep(
    "PASS288_OPEN_FAILED_AUTOMATION_RUN_FROM_PALETTE",
    await runPaletteCommand(win, `automation-run:${FAILED_AUTOMATION_RUN_ID}`, "PASS288 automation stdout evidence"),
  );
  assertStep("PASS288_SELECTED_AUTOMATION_EVIDENCE_FOCUSES_RUN_ACTION", await waitFor(win, `
    (function() {
      const active = document.querySelector('.workspace-context-button.active')?.textContent || '';
      const panel = document.querySelector('.selected-run-evidence-panel');
      const taskCenter = panel?.querySelector('[data-run-recovery-action="task-center"]');
      const runAutomation = panel?.querySelector('[data-run-recovery-action="run-automation"]');
      const text = panel?.textContent || '';
      return Boolean(
        /\\u8f93\\u51fa/.test(active) &&
        panel &&
        taskCenter &&
        runAutomation &&
        runAutomation.getAttribute('data-run-recovery-action-focused') === 'true' &&
        document.activeElement === runAutomation &&
        /PASS288 failed automation prompt/.test(text) &&
        /PASS288 automation stdout evidence/.test(text) &&
        /PASS288 automation stderr evidence/.test(text)
      );
    })();
  `, 12000));
  assertStep("PASS288_CLICK_AUTOMATION_TASK_CENTER_ACTION", await clickSelectedRunTaskCenter(win));
  assertStep("PASS288_AUTOMATION_TASK_CENTER_FOCUSES_RUN_NOW", await waitFor(win, `
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
        /PASS288 failed automation prompt/.test(text) &&
        /PASS288 automation failed error/.test(text)
      );
    })();
  `, 12000));
  assertStep("PASS288_AUTOMATION_TASK_CENTER_ACTIVATES_AUTOMATION_RAIL", await waitFor(win, `
    (function() {
      const automationRail = document.querySelector('.rail-button[data-tool="automations"]');
      const subagentRail = document.querySelector('.rail-button[data-tool="subagents"]');
      return automationRail?.getAttribute('data-tool-active') === 'true' &&
        subagentRail?.getAttribute('data-tool-active') === 'false';
    })();
  `, 4000));
  assertStep("PASS288_OPEN_GENERIC_TASK_CENTER_FROM_PALETTE", await runPaletteCommand(win, "panel-task-center", "task center"));
  assertStep("PASS288_GENERIC_TASK_CENTER_ACTIVATES_SUBAGENT_RAIL", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.subagent-workbench');
      const automationRail = document.querySelector('.rail-button[data-tool="automations"]');
      const subagentRail = document.querySelector('.rail-button[data-tool="subagents"]');
      return panel &&
        automationRail?.getAttribute('data-tool-active') === 'false' &&
        subagentRail?.getAttribute('data-tool-active') === 'true';
    })();
  `, 4000));

  assertStep(
    "PASS288_OPEN_FAILED_SUBAGENT_RUN_FROM_PALETTE",
    await runPaletteCommand(win, `subagent-run:${FAILED_SUBAGENT_REQUEST_ID}`, "PASS288 subagent stderr evidence"),
  );
  assertStep("PASS288_SELECTED_SUBAGENT_EVIDENCE_FOCUSES_RETRY_ACTION", await waitFor(win, `
    (function() {
      const active = document.querySelector('.workspace-context-button.active')?.textContent || '';
      const panel = document.querySelector('.selected-run-evidence-panel');
      const taskCenter = panel?.querySelector('[data-run-recovery-action="task-center"]');
      const retry = panel?.querySelector('[data-run-recovery-action="retry-subagent"]');
      const text = panel?.textContent || '';
      return Boolean(
        /\\u8f93\\u51fa/.test(active) &&
        panel &&
        taskCenter &&
        retry &&
        retry.getAttribute('data-run-recovery-action-focused') === 'true' &&
        document.activeElement === retry &&
        /PASS288 Failed Agent/.test(text) &&
        /PASS288 subagent stderr evidence/.test(text) &&
        /PASS288 subagent artifact evidence/.test(text)
      );
    })();
  `, 12000));
  assertStep("PASS288_CLICK_SUBAGENT_TASK_CENTER_ACTION", await clickSelectedRunTaskCenter(win));
  assertStep("PASS288_SUBAGENT_TASK_CENTER_FOCUSES_RETRY", await waitFor(win, `
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
        /PASS288 Failed Agent/.test(text) &&
        /PASS288 subagent stderr evidence/.test(text) &&
        /PASS288 subagent artifact evidence/.test(text)
      );
    })();
  `, 12000));
  assertStep("PASS288_SUBAGENT_TASK_CENTER_ACTIVATES_SUBAGENT_RAIL", await waitFor(win, `
    (function() {
      const automationRail = document.querySelector('.rail-button[data-tool="automations"]');
      const subagentRail = document.querySelector('.rail-button[data-tool="subagents"]');
      return automationRail?.getAttribute('data-tool-active') === 'false' &&
        subagentRail?.getAttribute('data-tool-active') === 'true';
    })();
  `, 4000));

  assertStep("PASS288_EVIDENCE_TASK_CENTER_DID_NOT_MUTATE_TASKS", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      const automation = (state.automations || []).find((item) => item.id === "${FAILED_AUTOMATION_ID}");
      const subagent = (state.subagentRuns || []).find((item) => item.id === "${FAILED_SUBAGENT_ID}");
      return Boolean(
        (state.commandRuns || []).length === 0 &&
        (state.runEvents || []).length === 0 &&
        automation &&
        automation.status === "failed" &&
        automation.history?.length === 1 &&
        automation.history[0]?.id === "${FAILED_AUTOMATION_RUN_ID}" &&
        subagent &&
        subagent.status === "error" &&
        !subagent.continuedAt &&
        subagent.artifacts?.length === 1
      );
    })();
  `));

  console.log("PASS288_RUN_EVIDENCE_TASK_ACTION_FOCUS_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS288_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (function() {
          return {
            commandModal: document.querySelector('.command-modal')?.textContent || '',
            selectedRun: document.querySelector('.selected-run-evidence-panel')?.outerHTML || '',
            activeFilter: document.querySelector('.task-center-filters .active')?.getAttribute('data-task-filter') || '',
            taskPanel: document.querySelector('.subagent-workbench')?.textContent || '',
            activeElement: document.activeElement?.outerHTML || '',
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS288_DEBUG", JSON.stringify(debug, null, 2).slice(0, 14000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS288_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
