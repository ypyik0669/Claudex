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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass260-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass260-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const SESSION_ID = "pass260-session";
const ENABLED_AUTOMATION_ID = "pass260-enabled";
const ENABLED_RUN_ID = "pass260-enabled-run";
const PAUSED_AUTOMATION_ID = "pass260-paused";
const PAUSED_RUN_ID = "pass260-paused-run";

const TRACE_ATTRS = {
  surface: "data-command-task-surface",
  kind: "data-command-task-kind",
  action: "data-command-task-action",
  id: "data-command-task-id",
  runId: "data-command-task-run-id",
  status: "data-command-task-status",
  filter: "data-command-task-filter",
  projectName: "data-command-task-project-name",
  projectPath: "data-command-task-project-path",
  hasEvidence: "data-command-task-has-evidence",
};

function cleanup() {
  for (const dir of [USER_DATA_DIR, PROJECT_DIR]) {
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

function writeInitialStore() {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass260-project" }), "utf8");
  const project = { name: "pass260-project", path: PROJECT_DIR };
  const enabledRun = {
    id: ENABLED_RUN_ID,
    trigger: "scheduled",
    status: "succeeded",
    startedAt: "2026-07-08T04:00:01.000Z",
    endedAt: "2026-07-08T04:00:05.000Z",
    durationMs: 2600,
    sessionId: SESSION_ID,
    code: 0,
    detail: "PASS260 enabled scheduled detail evidence",
    summary: "PASS260 enabled scheduled summary evidence",
    stdout: "PASS260 enabled scheduled stdout evidence",
    stderr: "",
  };
  const pausedRun = {
    id: PAUSED_RUN_ID,
    trigger: "scheduled",
    status: "failed",
    startedAt: "2026-07-08T04:10:01.000Z",
    endedAt: "2026-07-08T04:10:04.000Z",
    durationMs: 2601,
    sessionId: SESSION_ID,
    code: 5,
    detail: "PASS260 paused scheduled detail evidence",
    summary: "PASS260 paused scheduled summary evidence",
    stdout: "PASS260 paused scheduled stdout evidence",
    stderr: "PASS260 paused scheduled stderr evidence",
  };
  writeJson(DATA_FILE, {
    version: 1,
    activeProject: project,
    projects: [project],
    settings: {
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      baseUrl: "https://api.example.invalid",
      temperature: 0.2,
      timeoutMs: 600000,
      language: "zh",
      appearance: { fontSize: "compact", density: "compact" },
      claudeCode: { executionMode: "claude-code", claudeCommand: "claude", permissionMode: "default" },
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
    sessions: [
      {
        id: SESSION_ID,
        title: "PASS260 scheduled action deep links",
        project: project.name,
        projectPath: project.path,
        createdAt: "2026-07-08T03:59:00.000Z",
        updatedAt: "2026-07-08T03:59:00.000Z",
        messages: [],
      },
    ],
    automations: [
      {
        id: ENABLED_AUTOMATION_ID,
        prompt: "PASS260 enabled scheduled action deeplink prompt",
        schedule: { type: "once", runAt: "2026-07-08T05:00:00.000Z" },
        nextRun: "2026-07-08T05:00:00.000Z",
        project,
        threadId: SESSION_ID,
        enabled: true,
        status: "scheduled",
        createdAt: "2026-07-08T03:59:00.000Z",
        updatedAt: "2026-07-08T04:00:09.000Z",
        lastRun: enabledRun,
        history: [enabledRun],
      },
      {
        id: PAUSED_AUTOMATION_ID,
        prompt: "PASS260 paused scheduled resume deeplink prompt",
        schedule: { type: "daily", runAt: "2026-07-08T06:00:00.000Z" },
        nextRun: "2026-07-08T06:00:00.000Z",
        project,
        threadId: SESSION_ID,
        enabled: false,
        status: "scheduled",
        createdAt: "2026-07-08T04:09:00.000Z",
        updatedAt: "2026-07-08T04:10:09.000Z",
        lastRun: pausedRun,
        history: [pausedRun],
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

async function runPaletteCommand(win, query, commandId) {
  return win.webContents.executeJavaScript(`
    (async function() {
      const traceAttrs = ${JSON.stringify(TRACE_ATTRS)};
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return { found: false, reason: 'no-input' };
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 260));
      const button = document.querySelector(${JSON.stringify(`.command-modal .command-list button[data-command-id="${commandId}"]`)});
      if (!button) {
        return {
          found: false,
          reason: 'no-command',
          commands: Array.from(document.querySelectorAll('.command-modal .command-list button')).slice(0, 12).map((item) => ({ id: item.getAttribute('data-command-id'), text: item.textContent })),
        };
      }
      const trace = Object.fromEntries(Object.entries(traceAttrs).map(([key, attr]) => [key, button.getAttribute(attr) || '']));
      const result = { found: true, text: button.textContent || '', trace };
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 260));
      return result;
    })();
  `);
}

async function scheduledFocusState(win, automationId, action) {
  return win.webContents.executeJavaScript(`
    (function() {
      const item = document.querySelector(${JSON.stringify(`.scheduled-modal .schedule-item[data-automation-id="${automationId}"]`)});
      const button = item?.querySelector(${JSON.stringify(`[data-automation-schedule-action="${action}"]`)});
      const active = document.activeElement;
      return {
        modalOpen: Boolean(document.querySelector('.scheduled-modal')),
        itemFocused: item?.getAttribute('data-automation-focused') || '',
        focusAction: item?.getAttribute('data-automation-focus-action') || '',
        activeAction: active?.getAttribute('data-automation-schedule-action') || '',
        buttonSurface: button?.getAttribute('data-task-surface') || '',
        buttonAction: button?.getAttribute('data-task-action') || '',
        buttonId: button?.getAttribute('data-task-id') || '',
        text: item?.textContent || '',
      };
    })();
  `);
}

async function closeScheduledModal(win) {
  await win.webContents.executeJavaScript(`
    (function() {
      document.querySelector('.scheduled-modal header .icon-only')?.click();
      return true;
    })();
  `);
  await waitFor(win, "!document.querySelector('.scheduled-modal')", 5000);
}

async function assertScheduledAction(win, spec) {
  const command = await runPaletteCommand(win, spec.query, spec.commandId);
  assertStep(`${spec.name}_COMMAND_FOUND`, command.found);
  assertStep(`${spec.name}_COMMAND_TRACE`, Boolean(
    command.trace?.surface === "command-palette" &&
    command.trace?.kind === "automation" &&
    command.trace?.action === spec.action &&
    command.trace?.id === spec.automationId &&
    command.trace?.projectName === path.basename(PROJECT_DIR) &&
    command.trace?.projectPath === PROJECT_DIR &&
    command.trace?.hasEvidence === "true"
  ));
  assertStep(`${spec.name}_MODAL_FOCUS_READY`, await waitFor(win, `
    Boolean(
      document.querySelector('.scheduled-modal .schedule-item[data-automation-id="${spec.automationId}"][data-automation-focused="true"][data-automation-focus-action="${spec.action}"]') &&
      document.querySelector('.scheduled-modal .schedule-item[data-automation-id="${spec.automationId}"] [data-automation-schedule-action="${spec.action}"]')
    )
  `));
  const focus = await scheduledFocusState(win, spec.automationId, spec.action);
  assertStep(`${spec.name}_SCHEDULED_BUTTON_TRACE`, Boolean(
    focus.modalOpen &&
    focus.itemFocused === "true" &&
    focus.focusAction === spec.action &&
    focus.activeAction === spec.action &&
    focus.buttonSurface === "scheduled" &&
    focus.buttonAction === spec.action &&
    focus.buttonId === spec.automationId
  ));
  await closeScheduledModal(win);
}

writeInitialStore();
app.setPath("userData", USER_DATA_DIR);
require(path.join(REPO_DIR, "electron", "main.cjs"));

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS260_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS260_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS260_STORE_READY", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      return Boolean(
        state.automations?.some((item) => item.id === ${JSON.stringify(ENABLED_AUTOMATION_ID)} && item.enabled === true) &&
        state.automations?.some((item) => item.id === ${JSON.stringify(PAUSED_AUTOMATION_ID)} && item.enabled === false)
      );
    })();
  `));

  await assertScheduledAction(win, {
    name: "PASS260_RUN_NOW",
    query: "PASS260 enabled run now scheduled action",
    commandId: `automation-schedule:run-now:${ENABLED_AUTOMATION_ID}`,
    automationId: ENABLED_AUTOMATION_ID,
    action: "run-now",
  });
  await assertScheduledAction(win, {
    name: "PASS260_PAUSE",
    query: "PASS260 enabled pause scheduled action",
    commandId: `automation-schedule:pause:${ENABLED_AUTOMATION_ID}`,
    automationId: ENABLED_AUTOMATION_ID,
    action: "pause",
  });
  await assertScheduledAction(win, {
    name: "PASS260_RESUME",
    query: "PASS260 paused resume scheduled action",
    commandId: `automation-schedule:resume:${PAUSED_AUTOMATION_ID}`,
    automationId: PAUSED_AUTOMATION_ID,
    action: "resume",
  });
  await assertScheduledAction(win, {
    name: "PASS260_COPY_EVIDENCE",
    query: "PASS260 enabled copy evidence scheduled action",
    commandId: `automation-schedule:copy-evidence:${ENABLED_AUTOMATION_ID}`,
    automationId: ENABLED_AUTOMATION_ID,
    action: "copy-evidence",
  });
  await assertScheduledAction(win, {
    name: "PASS260_TIMELINE",
    query: "PASS260 enabled timeline scheduled action",
    commandId: `automation-schedule:timeline:${ENABLED_AUTOMATION_ID}`,
    automationId: ENABLED_AUTOMATION_ID,
    action: "timeline",
  });
  await assertScheduledAction(win, {
    name: "PASS260_DELETE",
    query: "PASS260 enabled delete scheduled action",
    commandId: `automation-schedule:delete:${ENABLED_AUTOMATION_ID}`,
    automationId: ENABLED_AUTOMATION_ID,
    action: "delete",
  });

  assertStep("PASS260_NO_ACTION_EXECUTED", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      const enabled = state.automations?.find((item) => item.id === ${JSON.stringify(ENABLED_AUTOMATION_ID)});
      const paused = state.automations?.find((item) => item.id === ${JSON.stringify(PAUSED_AUTOMATION_ID)});
      return Boolean(
        enabled && paused &&
        enabled.enabled === true &&
        paused.enabled === false &&
        enabled.history?.length === 1 &&
        paused.history?.length === 1
      );
    })();
  `));

  console.log("PASS260_COMMAND_PALETTE_SCHEDULED_ACTION_DEEPLINK_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS260_FAILED", error?.stack || error);
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    const debug = await win.webContents.executeJavaScript(`
      (function() {
        return {
          commandButtons: Array.from(document.querySelectorAll('.command-modal .command-list button')).slice(0, 30).map((item) => ({
            text: item.textContent,
            attrs: Object.fromEntries(Array.from(item.attributes).map((attr) => [attr.name, attr.value])),
          })),
          scheduledItems: Array.from(document.querySelectorAll('.scheduled-modal .schedule-item')).map((item) => ({
            text: item.textContent,
            attrs: Object.fromEntries(Array.from(item.attributes).map((attr) => [attr.name, attr.value])),
            actions: Array.from(item.querySelectorAll('[data-automation-schedule-action]')).map((button) => ({
              text: button.textContent,
              attrs: Object.fromEntries(Array.from(button.attributes).map((attr) => [attr.name, attr.value])),
            })),
          })),
          body: document.body.textContent?.slice(0, 3000) || '',
        };
      })();
    `).catch((debugError) => ({ error: String(debugError?.stack || debugError) }));
    console.error("PASS260_DEBUG", JSON.stringify(debug, null, 2).slice(0, 20000));
  }
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS260_TIMEOUT");
  cleanup();
  app.exit(1);
}, 120000);
