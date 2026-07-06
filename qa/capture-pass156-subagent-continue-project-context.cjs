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
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass156-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass156-bin-"));
const PROJECT_A_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass156-project-a-"));
const PROJECT_B_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass156-project-b-"));
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
if (args[0] === '--version') {
  out('2.9.0 (pass156 fake)');
} else if (args[0] === 'plugin' && args[1] === 'list' && args[2] === '--json') {
  out([]);
} else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args[3] === '--json') {
  out([]);
} else if (args[0] === 'mcp') {
  out('No MCP servers configured');
} else {
  out({ result: 'pass156 generic ok', session_id: 'pass156-generic-session' });
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
fs.writeFileSync(path.join(PROJECT_A_DIR, "package.json"), JSON.stringify({ name: "pass156-project-a" }), "utf8");
fs.writeFileSync(path.join(PROJECT_B_DIR, "package.json"), JSON.stringify({ name: "pass156-project-b" }), "utf8");

const createdAt = "2026-07-06T00:00:00.000Z";
const projectA = { name: "pass156-project-a", path: PROJECT_A_DIR };
const projectB = { name: "pass156-project-b", path: PROJECT_B_DIR };
const doneRun = {
  id: "pass156-run",
  requestId: "pass156-request",
  nickname: "Pass156 Continue QA",
  task: "pass156 continue should stay with project A",
  status: "done",
  sessionId: "session-a",
  project: projectA,
  cwd: PROJECT_A_DIR,
  command: FAKE_CLAUDE_COMMAND,
  args: ["-p", "pass156 continue should stay with project A", "--output-format", "json"],
  stdout: JSON.stringify({ result: "pass156 project A stdout", session_id: "pass156-claude-session" }),
  stderr: "pass156 project A stderr",
  summary: "pass156 project A summary",
  code: 0,
  durationMs: 1560,
  startedAt: createdAt,
  endedAt: "2026-07-06T00:00:01.560Z",
  artifacts: [{ type: "summary", label: "Summary", content: "pass156 project A summary" }],
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
      title: "Project A original session",
      project: projectA.name,
      projectPath: PROJECT_A_DIR,
      createdAt,
      updatedAt: createdAt,
      messages: [],
    },
  ],
  automations: [],
  subagentRuns: [doneRun],
  commandRuns: [],
  runEvents: [
    {
      id: doneRun.requestId,
      type: "subagent",
      status: "ok",
      title: "子代理：Pass156 Continue QA",
      detail: "pass156 project A summary",
      commandLine: [doneRun.command, ...doneRun.args].join(" "),
      cwd: PROJECT_A_DIR,
      code: 0,
      durationMs: 1560,
      stdout: doneRun.stdout,
      stderr: doneRun.stderr,
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
      const label = '\\u5b50\\u4ee3\\u7406';
      const button = Array.from(document.querySelectorAll('.workspace-context-button, .bottom-panel-tabs button, button'))
        .find((item) => item.getAttribute('aria-label') === label || (item.textContent || '').includes(label));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function clickContinue(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const card = document.querySelector('.subagent-run-card[data-subagent-run-id="pass156-run"]');
      if (!card) return false;
      const button = Array.from(card.querySelectorAll('button'))
        .find((item) => /\\u7eed\\u5199/.test(item.textContent || ''));
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
    console.error("PASS156_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  try {
    assertStep("PASS156_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
    assertStep("PASS156_INITIAL_ACTIVE_PROJECT_B", await waitFor(win, `
      (async function() {
        const state = await window.claudexDesktop.getState();
        return state.activeProject?.path === ${JSON.stringify(PROJECT_B_DIR)} &&
          state.sessions?.[0]?.id === 'session-b';
      })();
    `, 8000));
    assertStep("PASS156_OPEN_SUBAGENTS", await openSubagents(win));
    assertStep("PASS156_RUN_VISIBLE", await waitFor(win, `
      Boolean(
        document.querySelector('.subagent-run-card.done[data-subagent-run-id="pass156-run"]') &&
        /Pass156 Continue QA/.test(document.body.textContent || '') &&
        /pass156-project-a/.test(document.body.textContent || '')
      )
    `, 8000));
    assertStep("PASS156_CLICK_CONTINUE", await clickContinue(win));
    assertStep("PASS156_CONTINUE_USES_RUN_PROJECT", await waitFor(win, `
      (async function() {
        const state = await window.claudexDesktop.getState();
        const run = state.subagentRuns?.find((item) => item.id === 'pass156-run');
        const sessionA = state.sessions?.find((item) => item.id === 'session-a');
        const sessionB = state.sessions?.find((item) => item.id === 'session-b');
        const messageA = sessionA?.messages?.find((item) => item.source?.type === 'subagent' && item.source?.runId === 'pass156-run');
        const messageB = sessionB?.messages?.find((item) => item.source?.type === 'subagent' && item.source?.runId === 'pass156-run');
        return Boolean(
          state.activeProject?.path === ${JSON.stringify(PROJECT_A_DIR)} &&
          state.projects?.[0]?.path === ${JSON.stringify(PROJECT_A_DIR)} &&
          run?.continuedAt &&
          run.continuedSessionId === 'session-a' &&
          run.project?.path === ${JSON.stringify(PROJECT_A_DIR)} &&
          run.cwd === ${JSON.stringify(PROJECT_A_DIR)} &&
          messageA?.role === 'assistant' &&
          /pass156 project A summary/.test(messageA.content || '') &&
          /pass156 project A stderr/.test(messageA.content || '') &&
          !messageB
        );
      })();
    `, 10000));
    assertStep("PASS156_CONTINUED_UI_CONTEXT", await waitFor(win, `
      Boolean(
        /Project A original session/.test(document.body.textContent || '') &&
        /pass156 project A summary/.test(document.body.textContent || '') &&
        /\\u5df2\\u7eed\\u5199/.test(document.body.textContent || '')
      )
    `, 5000));

    console.log("PASS156_SUBAGENT_CONTINUE_PROJECT_CONTEXT_DONE");
    cleanup();
    app.exit(0);
  } catch (error) {
    console.error(error);
    cleanup();
    app.exit(1);
  }
});

setTimeout(() => {
  console.error("PASS156_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
