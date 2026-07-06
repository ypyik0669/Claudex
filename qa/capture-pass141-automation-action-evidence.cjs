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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass141-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass141-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FUTURE_RUN_AT = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

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

function writeInitialStore() {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass141-project" }), "utf8");
  const project = { name: "pass141-project", path: PROJECT_DIR };
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
    activeProject: project,
    projects: [project],
    sessions: [
      {
        id: "pass141-session",
        title: "Pass141 automation action evidence",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    runEvents: [],
    automations: [
      {
        id: "pass141-automation",
        prompt: "pass141 automation action evidence task",
        schedule: { type: "once", runAt: FUTURE_RUN_AT },
        project,
        threadId: "pass141-session",
        enabled: true,
        status: "scheduled",
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
        lastRun: null,
        history: [],
      },
    ],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
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

async function openTaskCenter(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const buttons = [...document.querySelectorAll('.workspace-context-button, .bottom-panel-tabs button')];
      const button = buttons.find((candidate) => /\\u5b50\\u4ee3\\u7406|Subagent|\\u4efb\\u52a1/.test(candidate.textContent || '') || candidate.getAttribute('aria-label') === '\\u5b50\\u4ee3\\u7406');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function openOutputs(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const buttons = [...document.querySelectorAll('.workspace-context-button, .bottom-panel-tabs button')];
      const button = buttons.find((candidate) => /\\u8f93\\u51fa/.test(candidate.textContent || '') || /\\u8f93\\u51fa/.test(candidate.getAttribute('aria-label') || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function clickAutomationButton(win, patternSource) {
  return win.webContents.executeJavaScript(`
    (function() {
      const pattern = new RegExp(${JSON.stringify(patternSource)});
      const card = document.querySelector('.automation-task-card[data-automation-id="pass141-automation"]');
      const button = [...(card?.querySelectorAll('button') || [])]
        .find((candidate) => pattern.test(candidate.textContent || '') || pattern.test(candidate.title || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS141_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS141_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS141_CREATE_ACTION_EVENT", await win.webContents.executeJavaScript(`
    (async function() {
      const next = await window.claudexDesktop.createAutomation({
        prompt: 'pass141 created automation evidence task',
        runAt: ${JSON.stringify(FUTURE_RUN_AT)},
        scheduleType: 'once',
        projectPath: ${JSON.stringify(PROJECT_DIR)},
        threadId: 'pass141-session',
      });
      const event = next.runEvents?.find((item) => item.type === 'automation-action' && /\\u521b\\u5efa/.test(item.title || '') && /pass141 created automation evidence task/.test((item.title || '') + (item.stdout || '')));
      return Boolean(event && event.status === 'ok' && event.project?.path === ${JSON.stringify(PROJECT_DIR)});
    })();
  `));

  assertStep("PASS141_OPEN_TASK_CENTER", await openTaskCenter(win));
  assertStep("PASS141_AUTOMATION_CARD_READY", await waitFor(win, `
    Boolean(
      document.querySelector('.automation-task-card[data-automation-id="pass141-automation"]') &&
      /pass141 automation action evidence task/.test(document.querySelector('.automation-task-card[data-automation-id="pass141-automation"]')?.textContent || '') &&
      /\\u6682\\u505c/.test(document.querySelector('.automation-task-card[data-automation-id="pass141-automation"]')?.textContent || '')
    )
  `, 12000));

  assertStep("PASS141_CLICK_PAUSE", await clickAutomationButton(win, "\\u6682\\u505c"));
  assertStep("PASS141_PAUSE_EVENT_PERSISTED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const automation = state.automations?.find((item) => item.id === 'pass141-automation');
      const event = state.runEvents?.find((item) =>
        item.type === 'automation-action' &&
        /\\u6682\\u505c/.test(item.title || '') &&
        /pass141 automation action evidence task/.test((item.title || '') + (item.stdout || ''))
      );
      return Boolean(automation?.enabled === false && automation.status === 'paused' && event?.status === 'ok');
    })();
  `, 10000));

  assertStep("PASS141_CLICK_RESUME", await clickAutomationButton(win, "\\u6062\\u590d"));
  assertStep("PASS141_RESUME_EVENT_PERSISTED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const automation = state.automations?.find((item) => item.id === 'pass141-automation');
      const event = state.runEvents?.find((item) =>
        item.type === 'automation-action' &&
        /\\u6062\\u590d/.test(item.title || '') &&
        /pass141 automation action evidence task/.test((item.title || '') + (item.stdout || ''))
      );
      return Boolean(automation?.enabled === true && automation.status === 'scheduled' && event?.status === 'ok');
    })();
  `, 10000));

  assertStep("PASS141_CLICK_DELETE", await clickAutomationButton(win, "\\u5220\\u9664"));
  assertStep("PASS141_DELETE_EVENT_PERSISTED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const automationGone = !state.automations?.some((item) => item.id === 'pass141-automation');
      const event = state.runEvents?.find((item) =>
        item.type === 'automation-action' &&
        /\\u5220\\u9664/.test(item.title || '') &&
        /pass141 automation action evidence task/.test((item.title || '') + (item.stdout || ''))
      );
      return Boolean(automationGone && event?.status === 'ok' && event.project?.path === ${JSON.stringify(PROJECT_DIR)});
    })();
  `, 10000));

  assertStep("PASS141_OPEN_OUTPUTS", await openOutputs(win));
  assertStep("PASS141_TIMELINE_ACTION_ROWS_VISIBLE", await waitFor(win, `
    (function() {
      const text = document.querySelector('.bottom-work-panel')?.textContent || '';
      return /automation-action/.test(text) &&
        /pass141 automation action evidence task/.test(text) &&
        /\\u6682\\u505c/.test(text) &&
        /\\u6062\\u590d/.test(text) &&
        /\\u5220\\u9664/.test(text);
    })();
  `, 10000));

  assertStep("PASS141_DELETE_TIMELINE_EVIDENCE_SELECTABLE", await waitFor(win, `
    (async function() {
      const row = [...document.querySelectorAll('.run-timeline-row.ok')]
        .find((candidate) => /\\u5220\\u9664/.test(candidate.textContent || '') && /pass141 automation action evidence task/.test(candidate.textContent || ''));
      if (!row) return false;
      row.querySelector('summary')?.click();
      await new Promise((resolve) => setTimeout(resolve, 250));
      const panel = document.querySelector('.selected-run-evidence-panel')?.textContent || '';
      return /automation-action/.test(panel) &&
        /pass141 automation action evidence task/.test(panel) &&
        /pass141-project/.test(panel) &&
        /${PROJECT_DIR.replace(/\\/g, "\\\\")}/.test(panel);
    })();
  `, 10000));

  console.log("PASS141_AUTOMATION_ACTION_EVIDENCE_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS141_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS141_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
