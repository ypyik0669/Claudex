const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass96-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass96-bin-"));
const PROJECT_A_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass96-project-a-"));
const PROJECT_B_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass96-project-b-"));
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
const prompt = String(args[1] || '');
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value) + '\\n'); }
if (args[0] === '-p') {
  out({ result: 'pass96-retry-ok: ' + prompt + ' cwd=' + process.cwd(), session_id: 'pass96-retry-claude-session' });
} else if (args[0] === '--version') {
  out('2.9.0 (pass96 fake)');
} else if (args[0] === 'plugin' && args[1] === 'list' && args[2] === '--json') {
  out([]);
} else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args[3] === '--json') {
  out([]);
} else if (args[0] === 'mcp') {
  out('No MCP servers configured');
} else {
  out({ result: 'pass96 generic ok', session_id: 'pass96-generic-session' });
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
fs.writeFileSync(path.join(PROJECT_A_DIR, "package.json"), JSON.stringify({ name: "pass96-project-a" }), "utf8");
fs.writeFileSync(path.join(PROJECT_B_DIR, "package.json"), JSON.stringify({ name: "pass96-project-b" }), "utf8");

const createdAt = "2026-07-06T00:00:00.000Z";
const projectA = { name: "pass96-project-a", path: PROJECT_A_DIR };
const projectB = { name: "pass96-project-b", path: PROJECT_B_DIR };
const failedRun = {
  id: "pass96-error-run",
  requestId: "pass96-error-request",
  nickname: "Pass96 Retry QA",
  task: "pass96 retry should use project A",
  status: "error",
  sessionId: "session-a",
  project: projectA,
  cwd: PROJECT_A_DIR,
  command: FAKE_CLAUDE_COMMAND,
  args: ["-p", "pass96 retry should use project A", "--output-format", "json"],
  stdout: JSON.stringify({ is_error: true, result: "pass96 old failure", session_id: "pass96-old-session" }),
  stderr: "pass96 old failure stderr",
  summary: "pass96 old failure",
  code: 2,
  durationMs: 2222,
  startedAt: createdAt,
  endedAt: "2026-07-06T00:00:02.222Z",
  artifacts: [{ type: "summary", label: "Summary", content: "pass96 old failure" }],
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
  projects: [projectA, projectB],
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
      title: "Project A original session",
      project: projectA.name,
      projectPath: PROJECT_A_DIR,
      createdAt,
      updatedAt: createdAt,
      messages: [],
    },
  ],
  automations: [],
  subagentRuns: [failedRun],
  runEvents: [
    {
      id: failedRun.requestId,
      type: "subagent",
      status: "error",
      title: "子代理：Pass96 Retry QA",
      detail: "pass96 old failure",
      commandLine: [failedRun.command, ...failedRun.args].join(" "),
      cwd: PROJECT_A_DIR,
      code: 2,
      durationMs: 2222,
      stdout: failedRun.stdout,
      stderr: failedRun.stderr,
      project: projectA,
      sessionId: "session-a",
      createdAt,
    },
  ],
  sourceRefs: [],
  browserVisits: [],
  notices: [],
});

require(path.join(REPO_DIR, "electron", "main.cjs"));

async function openSubagents(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = Array.from(document.querySelectorAll('.workspace-context-button, button'))
        .find((item) => /子代理|Subagent|任务/.test(item.textContent || '') || item.getAttribute('aria-label') === '子代理');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function clickRetry(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const card = document.querySelector('.subagent-run-card[data-subagent-run-id="pass96-error-run"]');
      if (!card) return false;
      const retry = Array.from(card.querySelectorAll('button'))
        .find((button) => /重试子代理/.test(button.textContent || ''));
      if (!retry) return false;
      retry.click();
      return true;
    })();
  `);
}

app.whenReady().then(async () => {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.error("PASS96_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  try {
    assertStep("PASS96_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
    assertStep("PASS96_OPEN_SUBAGENTS", await openSubagents(win));
    assertStep("PASS96_FAILED_RUN_VISIBLE", await waitFor(win, `
      Boolean(
        document.querySelector('.subagent-run-card.error[data-subagent-run-id="pass96-error-run"]') &&
        /Pass96 Retry QA/.test(document.body.textContent || '') &&
        /pass96-project-a/.test(document.body.textContent || '')
      )
    `, 8000));
    assertStep("PASS96_CLICK_RETRY", await clickRetry(win));
    assertStep("PASS96_RETRY_USES_ORIGINAL_CONTEXT", await waitFor(win, `
      (async function() {
        const state = await window.claudexDesktop.getState();
        const retry = (state.subagentRuns || []).find((run) =>
          run.id !== 'pass96-error-run' &&
          run.nickname === 'Pass96 Retry QA' &&
          /pass96 retry should use project A/.test(run.task || '')
        );
        const event = state.runEvents?.find((item) => item.id === retry?.requestId);
        return Boolean(
          retry &&
          retry.status === 'done' &&
          retry.project?.path === ${JSON.stringify(PROJECT_A_DIR)} &&
          retry.cwd === ${JSON.stringify(PROJECT_A_DIR)} &&
          retry.sessionId === 'session-a' &&
          String(retry.summary || retry.stdout || '').includes(${JSON.stringify(`cwd=${PROJECT_A_DIR}`)}) &&
          event?.type === 'subagent' &&
          event.status === 'ok' &&
          event.project?.path === ${JSON.stringify(PROJECT_A_DIR)} &&
          event.cwd === ${JSON.stringify(PROJECT_A_DIR)} &&
          event.sessionId === 'session-a' &&
          !state.subagentRuns.some((run) => run.id !== 'pass96-error-run' && run.project?.path === ${JSON.stringify(PROJECT_B_DIR)})
        );
      })();
    `, 15000));
    assertStep("PASS96_RETRY_UI_AND_TIMELINE_CONTEXT", await waitFor(win, `
      Boolean(
        document.querySelector('.subagent-run-card.done') &&
        /pass96-retry-ok/.test(document.body.textContent || '') &&
        /pass96-project-a/.test(document.body.textContent || '') &&
        !String(document.body.textContent || '').includes(${JSON.stringify(`cwd=${PROJECT_B_DIR}`)})
      )
    `, 5000));

    console.log("PASS96_SUBAGENT_RETRY_CONTEXT_DONE");
    cleanup();
    app.exit(0);
  } catch (error) {
    console.error(error);
    cleanup();
    app.exit(1);
  }
});

setTimeout(() => {
  console.error("PASS96_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
