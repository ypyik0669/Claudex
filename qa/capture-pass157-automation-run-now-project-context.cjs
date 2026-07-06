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
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass157-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass157-bin-"));
const PROJECT_A_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass157-project-a-"));
const PROJECT_B_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass157-project-b-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_A_DIR, PROJECT_B_DIR]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_error) {
      // best-effort cleanup
    }
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

function assertStep(name, ok) {
  console.log(name, ok);
  if (!ok) throw new Error(`${name} failed`);
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

const fakeClaudeScript = `
const args = process.argv.slice(2);
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value) + '\\n'); }
if (args[0] === '-p') {
  process.stderr.write('pass157 automation stderr cwd=' + process.cwd() + '\\n');
  out({ result: 'pass157 automation ok: ' + args[1] + ' cwd=' + process.cwd(), session_id: 'pass157-claude-session' });
} else if (args[0] === '--version') {
  out('2.9.0 (pass157 fake)');
} else if (args[0] === 'plugin' && args[1] === 'list' && args[2] === '--json') {
  out([]);
} else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args[3] === '--json') {
  out([]);
} else if (args[0] === 'mcp') {
  out('No MCP servers configured');
} else {
  out({ result: 'pass157 generic ok', session_id: 'pass157-generic-session' });
}
`;

fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), "@echo off\r\nnode \"%~dp0fake-claude.cjs\" %*\r\n", "utf8");
const FAKE_CLAUDE_COMMAND = path.join(FAKE_BIN_DIR, "claude.cmd");
process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;

app.setPath("userData", USER_DATA_DIR);
fs.mkdirSync(PROJECT_A_DIR, { recursive: true });
fs.mkdirSync(PROJECT_B_DIR, { recursive: true });
fs.writeFileSync(path.join(PROJECT_A_DIR, "package.json"), JSON.stringify({ name: "pass157-project-a" }), "utf8");
fs.writeFileSync(path.join(PROJECT_B_DIR, "package.json"), JSON.stringify({ name: "pass157-project-b" }), "utf8");

const createdAt = "2026-07-07T00:00:00.000Z";
const projectA = { name: "pass157-project-a", path: PROJECT_A_DIR };
const projectB = { name: "pass157-project-b", path: PROJECT_B_DIR };
const failedRun = {
  id: "pass157-old-run",
  trigger: "manual",
  status: "failed",
  startedAt: createdAt,
  endedAt: "2026-07-07T00:00:01.000Z",
  durationMs: 1000,
  sessionId: "session-a",
  detail: "",
  error: "pass157 old failure",
  summary: "",
  stdout: "",
  stderr: "pass157 old stderr",
  code: 1,
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
    claudeCode: { executionMode: "claude-code", claudeCommand: FAKE_CLAUDE_COMMAND, permissionMode: "default" },
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
  activeProject: projectB,
  projects: [projectB, projectA],
  sessions: [
    {
      id: "session-b",
      title: "Project B active session",
      project: projectB.name,
      projectPath: PROJECT_B_DIR,
      createdAt,
      updatedAt: createdAt,
      messages: [],
    },
    {
      id: "session-a",
      title: "Project A automation session",
      project: projectA.name,
      projectPath: PROJECT_A_DIR,
      createdAt,
      updatedAt: createdAt,
      messages: [],
    },
  ],
  automations: [
    {
      id: "pass157-automation",
      prompt: "pass157 automation should run in project A",
      schedule: { type: "once", runAt: "" },
      project: projectA,
      threadId: "session-a",
      enabled: false,
      status: "failed",
      createdAt,
      updatedAt: createdAt,
      lastRun: failedRun,
      history: [failedRun],
    },
  ],
  subagentRuns: [],
  commandRuns: [],
  runEvents: [],
  sourceRefs: [],
  browserVisits: [],
  notices: [],
});

require(path.join(REPO_DIR, "electron", "main.cjs"));

async function openTaskCenter(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const label = '\\u5b50\\u4ee3\\u7406';
      const button = Array.from(document.querySelectorAll('.workspace-context-button, .bottom-panel-tabs button, button'))
        .find((item) => item.getAttribute('aria-label') === label || (item.textContent || '').includes(label));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function clickRunNow(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const card = document.querySelector('.automation-task-card[data-automation-id="pass157-automation"]');
      if (!card) return false;
      const button = Array.from(card.querySelectorAll('.automation-task-actions button'))
        .find((item) => /\\u7acb\\u5373\\u8fd0\\u884c/.test(item.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function clickTimeline(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const row = Array.from(document.querySelectorAll('.run-timeline-row summary'))
        .find((item) => /pass157 automation ok/.test(item.textContent || ''))
        || Array.from(document.querySelectorAll('.run-timeline-row summary'))
          .find((item) => /pass157 automation should run in project A/.test(item.textContent || '') && !/pass157 old failure/.test(item.textContent || ''));
      if (row) {
        row.click();
        return true;
      }
      const card = document.querySelector('.automation-task-card[data-automation-id="pass157-automation"]');
      if (!card) return false;
      const button = Array.from(card.querySelectorAll('button'))
        .find((item) => /Timeline|timeline|\\u65f6\\u95f4\\u7ebf/.test((item.title || '') + ' ' + (item.textContent || '')));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

app.whenReady().then(async () => {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.error("PASS157_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  try {
    assertStep("PASS157_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
    assertStep("PASS157_INITIAL_ACTIVE_PROJECT_B", await waitFor(win, `
      (async function() {
        const state = await window.claudexDesktop.getState();
        return state.activeProject?.path === ${JSON.stringify(PROJECT_B_DIR)} &&
          state.sessions?.[0]?.id === 'session-b';
      })();
    `, 8000));
    assertStep("PASS157_OPEN_TASK_CENTER", await openTaskCenter(win));
    assertStep("PASS157_AUTOMATION_CARD_VISIBLE", await waitFor(win, `
      Boolean(
        document.querySelector('.automation-task-card[data-automation-id="pass157-automation"]') &&
        /pass157 automation should run in project A/.test(document.body.textContent || '') &&
        /pass157-project-a/.test(document.body.textContent || '')
      )
    `, 8000));
    assertStep("PASS157_CLICK_RUN_NOW", await clickRunNow(win));
    assertStep("PASS157_RUN_NOW_USES_AUTOMATION_PROJECT", await waitFor(win, `
      (async function() {
        const state = await window.claudexDesktop.getState();
        const automation = state.automations?.find((item) => item.id === 'pass157-automation');
        const event = state.runEvents?.find((item) => item.id === automation?.lastRun?.id);
        const sessionA = state.sessions?.find((item) => item.id === 'session-a');
        const sessionB = state.sessions?.find((item) => item.id === 'session-b');
        window.__pass157Debug = {
          activeProjectPath: state.activeProject?.path,
          automationProjectPath: automation?.project?.path,
          lastRunStatus: automation?.lastRun?.status,
          lastRunSessionId: automation?.lastRun?.sessionId,
          lastRunStdout: automation?.lastRun?.stdout,
          lastRunStderr: automation?.lastRun?.stderr,
          eventProjectPath: event?.project?.path,
          eventCwd: event?.cwd,
          eventSessionId: event?.sessionId,
          eventDetail: event?.detail,
          sessionAMessages: (sessionA?.messages || []).map((message) => message.content),
          sessionBMessages: (sessionB?.messages || []).map((message) => message.content),
        };
        return Boolean(
          state.activeProject?.path === ${JSON.stringify(PROJECT_B_DIR)} &&
          automation?.project?.path === ${JSON.stringify(PROJECT_A_DIR)} &&
          automation.lastRun?.status === 'succeeded' &&
          automation.lastRun.sessionId === 'session-a' &&
          [automation.lastRun.detail, automation.lastRun.summary, automation.lastRun.stdout, automation.lastRun.stderr].join(' ').includes(${JSON.stringify(`cwd=${PROJECT_A_DIR}`)}) &&
          String(automation.lastRun.stderr || '').includes(${JSON.stringify(`cwd=${PROJECT_A_DIR}`)}) &&
          event?.type === 'automation' &&
          event.status === 'ok' &&
          event.project?.path === ${JSON.stringify(PROJECT_A_DIR)} &&
          event.cwd === ${JSON.stringify(PROJECT_A_DIR)} &&
          event.sessionId === 'session-a' &&
          sessionA?.messages?.some((message) => /pass157 automation should run in project A/.test(message.content || '')) &&
          sessionA?.messages?.some((message) => /pass157 automation ok/.test(message.content || '')) &&
          !(sessionB?.messages || []).some((message) => /pass157 automation should run in project A|pass157 automation ok/.test(message.content || ''))
        );
      })();
    `, 15000));
    assertStep("PASS157_OPEN_TIMELINE", await clickTimeline(win));
    assertStep("PASS157_TIMELINE_EVIDENCE_PROJECT_A", await waitFor(win, `
      (function() {
        const panel = document.querySelector('.selected-run-evidence-panel');
        const text = panel?.textContent || '';
        window.__pass157PanelText = text;
        return Boolean(
          panel &&
          /pass157 automation should run in project A/.test(text) &&
          /pass157 automation ok/.test(text) &&
          /pass157-project-a/.test(text) &&
          !String(text).includes(${JSON.stringify(PROJECT_B_DIR)})
        );
      })();
    `, 8000));

    console.log("PASS157_AUTOMATION_RUN_NOW_PROJECT_CONTEXT_DONE");
    cleanup();
    app.exit(0);
  } catch (error) {
    console.error(error);
    try {
      const debug = await win.webContents.executeJavaScript("window.__pass157Debug || null");
      console.error("PASS157_DEBUG", JSON.stringify(debug, null, 2));
      const panelText = await win.webContents.executeJavaScript("window.__pass157PanelText || ''");
      console.error("PASS157_PANEL", panelText);
    } catch (_debugError) {
      // best-effort diagnostics
    }
    cleanup();
    app.exit(1);
  }
});

setTimeout(() => {
  console.error("PASS157_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
