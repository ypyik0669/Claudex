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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass325-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass325-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass325-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE_COMMAND = path.join(FAKE_BIN_DIR, process.platform === "win32" ? "claude.cmd" : "claude");
const STARTED_MARKER = path.join(PROJECT_DIR, "pass325-started.txt");
const PID_MARKER = path.join(PROJECT_DIR, "pass325-pid.txt");
const AUTOMATION_ID = "pass325-automation";
const OLD_FAILURE_ID = "pass325-old-failure";

function stopFakeProcess() {
  if (!fs.existsSync(PID_MARKER)) return;
  const pid = Number(fs.readFileSync(PID_MARKER, "utf8"));
  if (!Number.isInteger(pid) || pid <= 0) return;
  try {
    process.kill(pid);
  } catch (_error) {
    // The normal cancellation path has already stopped it.
  }
}

function cleanup() {
  stopFakeProcess();
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

function writeFakeClaude() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  const script = `
const fs = require('fs');
const args = process.argv.slice(2);
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value) + '\\n'); }
if (args[0] === '--version') {
  out('claude fake pass325');
  process.exit(0);
}
if (args[0] === 'auth') {
  out({ loggedIn: true, apiProvider: 'qa', authMethod: 'api_key' });
  process.exit(0);
}
if (args[0] === '-p') {
  fs.writeFileSync(${JSON.stringify(STARTED_MARKER)}, 'started', 'utf8');
  fs.writeFileSync(${JSON.stringify(PID_MARKER)}, String(process.pid), 'utf8');
  setTimeout(() => {
    out({ result: 'pass325-unexpected-late-success', session_id: 'pass325-late-session' });
  }, 20000);
  return;
}
out({ result: 'pass325 generic ok', session_id: 'pass325-generic-session' });
`;
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), script, "utf8");
  fs.writeFileSync(
    path.join(FAKE_BIN_DIR, "claude.cmd"),
    `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`,
    "utf8",
  );
  const posixShim = path.join(FAKE_BIN_DIR, "claude");
  fs.writeFileSync(posixShim, `#!/bin/sh\nexec node "$(dirname "$0")/fake-claude.cjs" "$@"\n`, "utf8");
  fs.chmodSync(posixShim, 0o755);
}

function writeInitialStore() {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass325-project" }), "utf8");
  writeFakeClaude();
  const project = { name: "pass325-project", path: PROJECT_DIR };
  const createdAt = "2026-07-15T00:00:00.000Z";
  const failedAt = "2026-07-15T00:01:00.000Z";
  const oldFailure = {
    id: OLD_FAILURE_ID,
    trigger: "manual",
    status: "failed",
    startedAt: failedAt,
    endedAt: "2026-07-15T00:01:01.000Z",
    durationMs: 1000,
    sessionId: "pass325-session",
    detail: "",
    error: "pass325 historic failure",
    summary: "pass325 historic failure",
    stdout: "",
    stderr: "pass325 historic stderr",
    code: 1,
    artifacts: [],
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
      systemPrompt: "PASS325 QA",
      claudeCode: {
        executionMode: "claude-code",
        claudeCommand: FAKE_CLAUDE_COMMAND,
        permissionMode: "default",
      },
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
        id: "pass325-session",
        title: "PASS325 automation UI stop",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt,
        updatedAt: failedAt,
        messages: [],
      },
    ],
    automations: [
      {
        id: AUTOMATION_ID,
        prompt: "pass325 cancellable automation",
        enabled: false,
        status: "failed",
        project,
        threadId: "pass325-session",
        schedule: { type: "once", runAt: "" },
        history: [oldFailure],
        lastRun: oldFailure,
        createdAt,
        updatedAt: failedAt,
      },
    ],
    commandRuns: [],
    runEvents: [
      {
        id: OLD_FAILURE_ID,
        type: "automation",
        status: "error",
        title: "Automation: pass325 historic failure",
        detail: "pass325 historic failure",
        cwd: PROJECT_DIR,
        stdout: "",
        stderr: oldFailure.stderr,
        project,
        sessionId: "pass325-session",
        code: 1,
        durationMs: 1000,
        createdAt: failedAt,
      },
    ],
    notices: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(win, script, timeoutMs = 10000, intervalMs = 100) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const ok = await win.webContents.executeJavaScript(script);
    if (ok) return true;
    await wait(intervalMs);
  }
  return false;
}

function assertStep(name, ok) {
  console.log(name, ok);
  if (!ok) throw new Error(`${name} failed`);
}

async function openTaskCenter(win) {
  const clicked = await win.webContents.executeJavaScript(`
    (function() {
      const button =
        document.querySelector('button[data-context-tab="subagents"]') ||
        document.querySelector('button[data-bottom-tab="subagents"]');
      if (button) button.click();
      return Boolean(button || document.querySelector('.subagent-workbench'));
    })();
  `);
  if (!clicked) return false;
  return waitFor(win, `
    Boolean(
      document.querySelector('.subagent-workbench') &&
      document.querySelector('button[data-bottom-tab="subagents"][aria-selected="true"]')
    )
  `, 5000);
}

async function openAutomation(win) {
  const clicked = await win.webContents.executeJavaScript(`
    (function() {
      if (document.querySelector('.scheduled-modal')) return true;
      const label = '\\u81ea\\u52a8\\u5316';
      const button = Array.from(document.querySelectorAll('button'))
        .find((item) => item.getAttribute('aria-label') === label || (item.textContent || '').includes(label));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
  if (!clicked) return false;
  return waitFor(win, "Boolean(document.querySelector('.scheduled-modal'))", 5000);
}

async function debugState(win) {
  return win.webContents.executeJavaScript(`
    (async function() {
      const card = document.querySelector('.automation-task-card[data-automation-id="${AUTOMATION_ID}"]');
      const scheduleItem = document.querySelector('.schedule-item[data-automation-id="${AUTOMATION_ID}"]');
      const state = await window.claudexDesktop.getState().catch((error) => ({ error: String(error?.message || error) }));
      return {
        automation: state.automations?.find((item) => item.id === ${JSON.stringify(AUTOMATION_ID)}) || state,
        card: card?.outerHTML?.slice(0, 12000) || '',
        scheduleItem: scheduleItem?.outerHTML?.slice(0, 12000) || '',
        failureSummary: document.querySelector('[data-task-center-failure-summary]')?.outerHTML?.slice(0, 4000) || '',
        toast: document.querySelector('.toast')?.textContent || '',
      };
    })();
  `).catch((error) => ({ error: String(error?.message || error) }));
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS325_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS325_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS325_OPEN_TASK_CENTER", await openTaskCenter(win));
  assertStep("PASS325_HISTORIC_FAILURE_FIXTURE_VISIBLE", await waitFor(win, `
    (function() {
      const card = document.querySelector('.automation-task-card[data-automation-id="${AUTOMATION_ID}"]');
      const failedFilter = document.querySelector('[data-task-filter="failed"] em');
      return Boolean(
        card?.querySelector('[data-automation-recovery-surface="task-center"]') &&
        document.querySelector('[data-task-center-failure-summary]') &&
        failedFilter?.textContent?.trim() === '1'
      );
    })();
  `, 5000));
  assertStep("PASS325_OPEN_SCHEDULED_MODAL", await openAutomation(win));

  assertStep("PASS325_RUN_NOW_UI_CLICK", await win.webContents.executeJavaScript(`
    (function() {
      const item = document.querySelector('.schedule-item[data-automation-id="${AUTOMATION_ID}"]');
      const run = item?.querySelector('[data-automation-schedule-action="run-now"]');
      if (!run || run.disabled) return false;
      run.click();
      return true;
    })();
  `));
  assertStep("PASS325_RUNNING_BROADCAST", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const automation = state.automations?.find((item) => item.id === ${JSON.stringify(AUTOMATION_ID)});
      return Boolean(automation?.status === 'running' && automation.lastRun?.status === 'running');
    })();
  `, 10000));
  assertStep("PASS325_FAKE_PROCESS_STARTED", await (async () => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 5000) {
      if (fs.existsSync(STARTED_MARKER)) return true;
      await wait(100);
    }
    return false;
  })());
  assertStep("PASS325_STOP_ENABLED_AFTER_RUNNING_BROADCAST", await waitFor(win, `
    (function() {
      const item = document.querySelector('.schedule-item[data-automation-id="${AUTOMATION_ID}"]');
      const stop = item?.querySelector('[data-automation-schedule-action="cancel"]');
      return Boolean(stop && !stop.disabled);
    })();
  `, 5000));

  assertStep("PASS325_STOP_UI_CLICK_HAS_STOPPING_STATE", await win.webContents.executeJavaScript(`
    (async function() {
      const item = document.querySelector('.schedule-item[data-automation-id="${AUTOMATION_ID}"]');
      const stop = item?.querySelector('[data-automation-schedule-action="cancel"]');
      if (!stop || stop.disabled) return false;
      return new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
          if (settled) return;
          settled = true;
          observer.disconnect();
          window.clearTimeout(timer);
          resolve(value);
        };
        const inspect = () => {
          const current = item.querySelector('[data-automation-schedule-action="cancel"]');
          if (current?.disabled && /\u6b63\u5728\u505c\u6b62/.test(current.textContent || '')) finish(true);
        };
        const observer = new MutationObserver(inspect);
        const timer = window.setTimeout(() => finish(false), 4000);
        observer.observe(item, { subtree: true, childList: true, attributes: true, characterData: true });
        stop.click();
        inspect();
      });
    })();
  `));

  assertStep("PASS325_CANCELLED_STATE", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const automation = state.automations?.find((item) => item.id === ${JSON.stringify(AUTOMATION_ID)});
      return Boolean(automation?.status === 'cancelled' && automation.lastRun?.status === 'cancelled');
    })();
  `, 10000));
  assertStep("PASS325_CLOSE_SCHEDULED_MODAL", await win.webContents.executeJavaScript(`
    (function() {
      const close = document.querySelector('.scheduled-modal header .icon-only');
      if (!close) return false;
      close.click();
      return true;
    })();
  `));
  assertStep("PASS325_REOPEN_TASK_CENTER", await waitFor(win, "!document.querySelector('.scheduled-modal')", 3000) && await openTaskCenter(win));
  assertStep("PASS325_SHOW_ALL_TASKS", await win.webContents.executeJavaScript(`
    (function() {
      const all = document.querySelector('[data-task-filter="all"]');
      if (!all) return false;
      all.click();
      return true;
    })();
  `) && await waitFor(win, `
    Boolean(document.querySelector('.automation-task-card[data-automation-id="${AUTOMATION_ID}"]'))
  `, 3000));

  assertStep("PASS325_CANCELLED_WITHOUT_FAILURE_POLLUTION", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const automation = state.automations?.find((item) => item.id === ${JSON.stringify(AUTOMATION_ID)});
      const cancelled = automation?.lastRun;
      const card = document.querySelector('.automation-task-card[data-automation-id="${AUTOMATION_ID}"]');
      const failedFilter = document.querySelector('[data-task-filter="failed"] em');
      return Boolean(
        automation?.status === 'cancelled' &&
        cancelled?.status === 'cancelled' &&
        cancelled.code === 130 &&
        cancelled.endedAt &&
        automation.history?.some((entry) => entry.id === ${JSON.stringify(OLD_FAILURE_ID)} && entry.status === 'failed') &&
        automation.history?.some((entry) => entry.id === cancelled.id && entry.status === 'cancelled') &&
        state.runEvents?.some((event) => event.id === cancelled.id && event.status === 'cancelled') &&
        card?.classList.contains('cancelled') &&
        card.querySelector('[data-automation-history-run-id="${OLD_FAILURE_ID}"]') &&
        card.querySelector('[data-automation-history-run-id="' + cancelled.id + '"]') &&
        !card.querySelector('[data-automation-recovery-surface="task-center"]') &&
        !document.querySelector('[data-task-center-failure-summary]') &&
        failedFilter?.textContent?.trim() === '0'
      );
    })();
  `, 10000));

  console.log("PASS325_AUTOMATION_UI_STOP_CLICK_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS325_FAILED", error?.stack || error);
  const win = BrowserWindow.getAllWindows()[0];
  if (win) console.error("PASS325_DEBUG", JSON.stringify(await debugState(win), null, 2).slice(0, 24000));
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS325_TIMEOUT");
  cleanup();
  app.exit(1);
}, 60000);
