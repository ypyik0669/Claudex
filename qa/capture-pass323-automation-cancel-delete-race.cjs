const fs = require("fs");
const http = require("http");
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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass323-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass323-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass323-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE_COMMAND = path.join(FAKE_BIN_DIR, process.platform === "win32" ? "claude.cmd" : "claude");
const STARTED_MARKER = path.join(PROJECT_DIR, "pass323-started.txt");
const GRANDCHILD_MARKER = path.join(PROJECT_DIR, "pass323-grandchild.txt");
const RELEASE_MARKER = path.join(PROJECT_DIR, "pass323-release.txt");
const LATE_ARTIFACT = path.join(PROJECT_DIR, "pass323-must-not-exist.txt");
const RETRY_MARKER = path.join(PROJECT_DIR, "pass323-allow-retry.txt");
const AUTOMATION_ID = "pass323-automation";
const RUN_ID = "pass323-automation-run";
const RETRY_RUN_ID = "pass323-automation-retry";
const API_RUN_ID = "pass323-automation-api-cancel";
const SECOND_PROMPT = "pass323 concurrent automation must survive";
const OLD_CLAUDE_SESSION_ID = "pass323-old-claude-session";
const NEW_CLAUDE_SESSION_ID = "pass323-newer-concurrent-claude-session";
let apiServer = null;
let apiRequestStarted = false;
let apiResponseClosed = false;

function cleanup() {
  try {
    apiServer?.closeAllConnections?.();
    apiServer?.close();
  } catch (_error) {
    // best-effort cleanup
  }
  for (const marker of [STARTED_MARKER, GRANDCHILD_MARKER]) {
    try {
      const pid = Number(fs.readFileSync(marker, "utf8"));
      if (processIsAlive(pid)) process.kill(pid, "SIGKILL");
    } catch (_error) {
      // best-effort process cleanup
    }
  }
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_DIR]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_error) {
      // best-effort cleanup
    }
  }
}

function startApiServer() {
  return new Promise((resolve, reject) => {
    apiServer = http.createServer((request, response) => {
      if (request.url !== "/api/chat") {
        response.writeHead(404).end();
        return;
      }
      apiRequestStarted = true;
      request.resume();
      response.on("close", () => {
        apiResponseClosed = true;
      });
      response.writeHead(200, {
        "Content-Type": "application/x-ndjson",
        Connection: "keep-alive",
      });
      response.write(`${JSON.stringify({ message: { content: "pass323-api-partial" }, done: false })}\n`);
    });
    apiServer.once("error", reject);
    apiServer.listen(0, "127.0.0.1", () => resolve(apiServer.address().port));
  });
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function writeFakeClaude() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
const script = `
const fs = require('fs');
const { spawn } = require('child_process');
const args = process.argv.slice(2);
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value) + '\\n'); }
if (args[0] === '--version') {
  out('claude fake pass323');
  process.exit(0);
}
if (args[0] === 'auth') {
  out({ loggedIn: true, apiProvider: 'qa', authMethod: 'api_key' });
  process.exit(0);
}
if (args[0] === '-p') {
  if (fs.existsSync(${JSON.stringify(RETRY_MARKER)})) {
    out({ result: 'pass323-retry-ok', session_id: 'pass323-retry-session' });
    process.exit(0);
  }
  fs.writeFileSync(${JSON.stringify(STARTED_MARKER)}, String(process.pid), 'utf8');
  const grandchild = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);"], {
    stdio: 'ignore',
    windowsHide: true,
  });
  fs.writeFileSync(${JSON.stringify(GRANDCHILD_MARKER)}, String(grandchild.pid), 'utf8');
  const releaseTimer = setInterval(() => {
    if (!fs.existsSync(${JSON.stringify(RELEASE_MARKER)})) return;
    clearInterval(releaseTimer);
    fs.writeFileSync(${JSON.stringify(LATE_ARTIFACT)}, 'the cancelled process was still alive', 'utf8');
    out({ result: 'pass323-late-success', session_id: 'pass323-late-session' });
  }, 50);
  return;
}
out({ result: 'pass323 generic ok', session_id: 'pass323-generic-session' });
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass323-project" }), "utf8");
  writeFakeClaude();
  const project = { name: "pass323-project", path: PROJECT_DIR };
  const createdAt = "2026-07-15T00:00:00.000Z";
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
      systemPrompt: "PASS323 QA",
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
        id: "pass323-session",
        title: "PASS323 automation cancellation",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt,
        updatedAt: createdAt,
        claudeSessionId: OLD_CLAUDE_SESSION_ID,
        messages: [],
      },
    ],
    automations: [
      {
        id: AUTOMATION_ID,
        prompt: "pass323 cancellable automation",
        enabled: false,
        status: "idle",
        project,
        threadId: "pass323-session",
        schedule: { type: "once", runAt: "" },
        history: [],
        createdAt,
        updatedAt: createdAt,
      },
    ],
    commandRuns: [],
    runEvents: [],
    notices: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
  });
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

function processIsAlive(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (_error) {
    return false;
  }
}

async function openTaskCenter(win) {
  const clicked = await win.webContents.executeJavaScript(`
    (function() {
      if (document.querySelector('.subagent-workbench')) return true;
      const button =
        document.querySelector('button[data-context-tab="subagents"]') ||
        document.querySelector('button[data-bottom-tab="subagents"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
  if (!clicked) return false;
  return waitFor(win, "Boolean(document.querySelector('.subagent-workbench'))", 5000);
}

async function openAutomation(win) {
  return win.webContents.executeJavaScript(`
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
}

async function debugState(win) {
  return win.webContents.executeJavaScript(`
    (async function() {
      return {
        body: (document.body?.textContent || '').slice(0, 12000),
        state: await window.claudexDesktop.getState().catch((error) => ({ error: String(error?.message || error) })),
        taskActions: Array.from(document.querySelectorAll('[data-automation-task-action]')).map((button) => ({
          action: button.getAttribute('data-automation-task-action'),
          disabled: button.disabled,
          text: button.textContent || '',
        })),
        scheduleActions: Array.from(document.querySelectorAll('[data-automation-schedule-action]')).map((button) => ({
          action: button.getAttribute('data-automation-schedule-action'),
          disabled: button.disabled,
          text: button.textContent || '',
        })),
      };
    })();
  `).catch((error) => ({ error: String(error?.message || error) }));
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS323_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS323_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS323_AUTOMATION_CANCEL_IPC", await win.webContents.executeJavaScript(`
    typeof window.claudexDesktop.cancelAutomation === 'function'
  `));

  assertStep("PASS323_START_RUNNING_AUTOMATION", await waitFor(win, `
    (async function() {
      if (!window.__pass323RunStarted) {
        window.__pass323RunStarted = true;
        window.claudexDesktop.runAutomationNow({
          automationId: ${JSON.stringify(AUTOMATION_ID)},
          requestId: ${JSON.stringify(RUN_ID)}
        }).catch((error) => { window.__pass323RunError = String(error?.message || error); });
      }
      const state = await window.claudexDesktop.getState();
      const automation = state.automations?.find((item) => item.id === ${JSON.stringify(AUTOMATION_ID)});
      return Boolean(
        automation?.status === 'running' &&
        automation.lastRun?.id === ${JSON.stringify(RUN_ID)} &&
        automation.lastRun.status === 'running' &&
        state.runEvents?.some((event) => event.id === ${JSON.stringify(RUN_ID)} && event.status === 'running')
      );
    })();
  `, 10000));
  assertStep("PASS323_FAKE_PROCESS_STARTED", await (async () => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 5000) {
      if (fs.existsSync(STARTED_MARKER)) return true;
      await wait(100);
    }
    return false;
  })());
  const cliPid = Number(fs.readFileSync(STARTED_MARKER, "utf8"));
  assertStep("PASS323_FAKE_PROCESS_PID_ALIVE", processIsAlive(cliPid));
  assertStep("PASS323_FAKE_GRANDCHILD_STARTED", await (async () => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 5000) {
      if (fs.existsSync(GRANDCHILD_MARKER)) return true;
      await wait(100);
    }
    return false;
  })());
  const grandchildPid = Number(fs.readFileSync(GRANDCHILD_MARKER, "utf8"));
  assertStep("PASS323_FAKE_GRANDCHILD_PID_ALIVE", processIsAlive(grandchildPid));

  const concurrentlyUpdatedStore = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  const concurrentlyUpdatedSession = concurrentlyUpdatedStore.sessions?.find((item) => item.id === "pass323-session");
  if (concurrentlyUpdatedSession) concurrentlyUpdatedSession.claudeSessionId = NEW_CLAUDE_SESSION_ID;
  writeJson(DATA_FILE, concurrentlyUpdatedStore);

  win.webContents.reload();
  assertStep("PASS323_RELOAD_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS323_OPEN_TASK_CENTER", await openTaskCenter(win));
  assertStep("PASS323_TASK_CENTER_STOP_AND_DELETE_GUARD", await waitFor(win, `
    (function() {
      const card = document.querySelector('.automation-task-card[data-automation-id="${AUTOMATION_ID}"]');
      const stop = card?.querySelector('[data-automation-task-action="cancel"]');
      const del = card?.querySelector('[data-automation-task-action="delete"]');
      return Boolean(card && stop && !stop.disabled && del?.disabled);
    })();
  `, 5000));

  assertStep("PASS323_MAIN_REJECTS_RUNNING_DELETE", await win.webContents.executeJavaScript(`
    (async function() {
      try {
        await window.claudexDesktop.deleteAutomation({ automationId: ${JSON.stringify(AUTOMATION_ID)} });
        return false;
      } catch (error) {
        return /AUTOMATION_RUNNING/.test(String(error?.message || error));
      }
    })();
  `));

  assertStep("PASS323_CREATE_CONCURRENT_AUTOMATION", await win.webContents.executeJavaScript(`
    (async function() {
      await window.claudexDesktop.createAutomation({
        prompt: ${JSON.stringify(SECOND_PROMPT)},
        projectPath: ${JSON.stringify(PROJECT_DIR)},
        threadId: 'pass323-session'
      });
      const state = await window.claudexDesktop.getState();
      return state.automations?.some((item) => item.prompt === ${JSON.stringify(SECOND_PROMPT)});
    })();
  `));

  assertStep("PASS323_OPEN_AUTOMATION", await openAutomation(win));
  assertStep("PASS323_SCHEDULE_STOP_AND_DELETE_GUARD", await waitFor(win, `
    (function() {
      const card = document.querySelector('.schedule-item[data-automation-id="${AUTOMATION_ID}"]');
      const stop = card?.querySelector('[data-automation-schedule-action="cancel"]');
      const del = card?.querySelector('[data-automation-schedule-action="delete"]');
      return Boolean(card && stop && !stop.disabled && del?.disabled);
    })();
  `, 5000));

  assertStep("PASS323_CANCEL_FROM_SCHEDULE", await waitFor(win, `
    (async function() {
      if (!window.__pass323CancelClicked) {
        const card = document.querySelector('.schedule-item[data-automation-id="${AUTOMATION_ID}"]');
        const stop = card?.querySelector('[data-automation-schedule-action="cancel"]');
        if (!stop) return false;
        window.__pass323CancelClicked = true;
        stop.click();
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
      const state = await window.claudexDesktop.getState();
      const automation = state.automations?.find((item) => item.id === ${JSON.stringify(AUTOMATION_ID)});
      const entry = automation?.history?.find((item) => item.id === ${JSON.stringify(RUN_ID)});
      const event = state.runEvents?.find((item) => item.id === ${JSON.stringify(RUN_ID)});
      return Boolean(
        automation?.status === 'cancelled' &&
        entry?.status === 'cancelled' &&
        entry.code === 130 &&
        entry.endedAt &&
        event?.status === 'cancelled' &&
        state.automations?.some((item) => item.prompt === ${JSON.stringify(SECOND_PROMPT)})
      );
    })();
  `, 10000));

  assertStep("PASS323_CANCEL_KILLED_PROCESS", await (async () => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 5000) {
      if (!processIsAlive(cliPid)) return true;
      await wait(100);
    }
    return false;
  })());
  assertStep("PASS323_CANCEL_KILLED_GRANDCHILD", await (async () => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 5000) {
      if (!processIsAlive(grandchildPid)) return true;
      await wait(100);
    }
    return false;
  })());
  fs.writeFileSync(RELEASE_MARKER, "release", "utf8");
  await wait(400);
  assertStep("PASS323_CANCEL_PREVENTED_LATE_ARTIFACT", !fs.existsSync(LATE_ARTIFACT));
  assertStep("PASS323_FRESH_STORE_MERGE_PERSISTED", (() => {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    const automation = parsed.automations?.find((item) => item.id === AUTOMATION_ID);
    const entry = automation?.history?.find((item) => item.id === RUN_ID);
    const event = parsed.runEvents?.find((item) => item.id === RUN_ID);
    const session = parsed.sessions?.find((item) => item.id === "pass323-session");
    return parsed.automations?.some((item) => item.prompt === SECOND_PROMPT) &&
      session?.claudeSessionId === NEW_CLAUDE_SESSION_ID &&
      automation?.status === "cancelled" &&
      entry?.status === "cancelled" &&
      entry.code === 130 &&
      Boolean(entry.endedAt) &&
      event?.status === "cancelled";
  })());

  assertStep("PASS323_REPEAT_CANCEL_RETURNS_TERMINAL_RUN", await win.webContents.executeJavaScript(`
    (async function() {
      const next = await window.claudexDesktop.cancelAutomation({
        automationId: ${JSON.stringify(AUTOMATION_ID)},
        runId: ${JSON.stringify(RUN_ID)}
      });
      return next?.automationRun?.id === ${JSON.stringify(RUN_ID)} && next.automationRun?.status === 'cancelled';
    })();
  `));

  win.webContents.reload();
  assertStep("PASS323_CANCEL_RELOAD_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS323_REOPEN_TASK_CENTER", await openTaskCenter(win));
  assertStep("PASS323_CANCELLED_UI_AND_UNLOCKED_ACTIONS", await waitFor(win, `
    (function() {
      const card = document.querySelector('.automation-task-card[data-automation-id="${AUTOMATION_ID}"]');
      const run = card?.querySelector('[data-automation-task-action="run-now"]');
      const stop = card?.querySelector('[data-automation-task-action="cancel"]');
      const del = card?.querySelector('[data-automation-task-action="delete"]');
      return Boolean(card?.classList.contains('cancelled') && run && !run.disabled && !stop && del && !del.disabled);
    })();
  `, 5000));

  assertStep("PASS323_TIMELINE_CANCELLED", await waitFor(win, `
    (async function() {
      if (!window.__pass323TimelineClicked) {
        const card = document.querySelector('.automation-task-card[data-automation-id="${AUTOMATION_ID}"]');
        const timeline = card?.querySelector('[data-automation-history-run-id="${RUN_ID}"] [data-automation-history-action="timeline"]');
        if (!timeline) return false;
        window.__pass323TimelineClicked = true;
        timeline.click();
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
      return Boolean(document.querySelector('.run-timeline-row.cancelled'));
    })();
  `, 5000));

  fs.writeFileSync(RETRY_MARKER, "retry", "utf8");
  assertStep("PASS323_LOCK_RELEASED_FOR_RETRY", await waitFor(win, `
    (async function() {
      if (!window.__pass323RetryStarted) {
        window.__pass323RetryStarted = true;
        await window.claudexDesktop.runAutomationNow({
          automationId: ${JSON.stringify(AUTOMATION_ID)},
          requestId: ${JSON.stringify(RETRY_RUN_ID)}
        });
      }
      const state = await window.claudexDesktop.getState();
      const automation = state.automations?.find((item) => item.id === ${JSON.stringify(AUTOMATION_ID)});
      return Boolean(
        automation?.history?.some((entry) => entry.id === ${JSON.stringify(RETRY_RUN_ID)} && entry.status === 'succeeded') &&
        automation.history?.some((entry) => entry.id === ${JSON.stringify(RUN_ID)} && entry.status === 'cancelled') &&
        state.automations?.some((item) => item.prompt === ${JSON.stringify(SECOND_PROMPT)})
      );
    })();
  `, 10000));

  const apiPort = await startApiServer();
  assertStep("PASS323_CONFIGURE_DIRECT_API", await win.webContents.executeJavaScript(`
    (async function() {
      const next = await window.claudexDesktop.saveSettings({
        provider: 'ollama',
        model: 'claude-haiku-4-5-20251001',
        baseUrl: ${JSON.stringify("http://127.0.0.1:")} + ${JSON.stringify(apiPort)},
        timeoutMs: 600000,
        claudeCode: { executionMode: 'api' }
      });
      return next.settings?.provider === 'ollama' && next.settings?.claudeCode?.executionMode === 'api';
    })();
  `));
  assertStep("PASS323_START_DIRECT_API_AUTOMATION", await waitFor(win, `
    (async function() {
      if (!window.__pass323ApiStarted) {
        window.__pass323ApiStarted = true;
        window.claudexDesktop.runAutomationNow({
          automationId: ${JSON.stringify(AUTOMATION_ID)},
          requestId: ${JSON.stringify(API_RUN_ID)}
        }).catch((error) => { window.__pass323ApiError = String(error?.message || error); });
      }
      const state = await window.claudexDesktop.getState();
      const automation = state.automations?.find((item) => item.id === ${JSON.stringify(AUTOMATION_ID)});
      return automation?.lastRun?.id === ${JSON.stringify(API_RUN_ID)} && automation.lastRun.status === 'running';
    })();
  `, 10000));
  assertStep("PASS323_DIRECT_API_REQUEST_STARTED", await (async () => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 5000) {
      if (apiRequestStarted) return true;
      await wait(100);
    }
    return false;
  })());
  const storeBeforeApiCancel = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  const apiAutomationBeforeCancel = storeBeforeApiCancel.automations?.find((item) => item.id === AUTOMATION_ID);
  const deletedSessionId = apiAutomationBeforeCancel?.history?.find((entry) => entry.id === API_RUN_ID)?.sessionId || "";
  storeBeforeApiCancel.sessions = (storeBeforeApiCancel.sessions || []).filter((session) => session.id !== deletedSessionId);
  writeJson(DATA_FILE, storeBeforeApiCancel);
  assertStep("PASS323_DELETE_SESSION_DURING_RUN", Boolean(
    deletedSessionId && !storeBeforeApiCancel.sessions.some((session) => session.id === deletedSessionId),
  ));
  assertStep("PASS323_CANCEL_DIRECT_API_AUTOMATION", await win.webContents.executeJavaScript(`
    (async function() {
      const next = await window.claudexDesktop.cancelAutomation({
        automationId: ${JSON.stringify(AUTOMATION_ID)},
        runId: ${JSON.stringify(API_RUN_ID)}
      });
      const automation = next.automations?.find((item) => item.id === ${JSON.stringify(AUTOMATION_ID)});
      const entry = automation?.history?.find((item) => item.id === ${JSON.stringify(API_RUN_ID)});
      const event = next.runEvents?.find((item) => item.id === ${JSON.stringify(API_RUN_ID)});
      return Boolean(
        entry?.status === 'cancelled' &&
        entry.code === 130 &&
        entry.endedAt &&
        event?.status === 'cancelled' &&
        !next.sessions?.some((session) => session.id === ${JSON.stringify(deletedSessionId)})
      );
    })();
  `));
  assertStep("PASS323_DIRECT_API_CONNECTION_CLOSED", await (async () => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 5000) {
      if (apiResponseClosed) return true;
      await wait(100);
    }
    return false;
  })());

  console.log("PASS323_AUTOMATION_CANCEL_DELETE_RACE_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS323_FAILED", error?.stack || error);
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    console.error("PASS323_DEBUG", JSON.stringify(await debugState(win), null, 2).slice(0, 24000));
  }
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS323_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
