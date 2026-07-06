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
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass160-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass160-bin-"));
const PROJECT_A_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass160-project-a-"));
const PROJECT_B_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass160-project-b-"));
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

function writeInitialStore() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_A_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_B_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_A_DIR, "package.json"), JSON.stringify({ name: "pass160-project-a" }), "utf8");
  fs.writeFileSync(path.join(PROJECT_B_DIR, "package.json"), JSON.stringify({ name: "pass160-project-b" }), "utf8");
  fs.writeFileSync(
    path.join(FAKE_BIN_DIR, "claude.cmd"),
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass160& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass160 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  const fakeClaude = path.join(FAKE_BIN_DIR, "claude.cmd");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;

  const createdAt = "2026-07-07T10:00:00.000Z";
  const projectA = { name: "pass160-project-a", path: PROJECT_A_DIR };
  const projectB = { name: "pass160-project-b", path: PROJECT_B_DIR };
  const doneRun = {
    id: "pass160-run",
    requestId: "pass160-request",
    nickname: "Pass160 Continue Evidence QA",
    task: "pass160 continue action evidence task",
    status: "done",
    sessionId: "session-a",
    project: projectA,
    cwd: PROJECT_A_DIR,
    command: fakeClaude,
    args: ["-p", "pass160 continue action evidence task", "--model", "claude-haiku-4-5-20251001"],
    stdout: JSON.stringify({ result: "pass160 continue action evidence stdout", session_id: "pass160-claude-session" }),
    stderr: "pass160 continue action evidence stderr",
    summary: "pass160 continue action evidence summary",
    code: 0,
    durationMs: 1600,
    startedAt: createdAt,
    endedAt: "2026-07-07T10:00:01.600Z",
    artifacts: [{ type: "summary", label: "Summary", content: "pass160 continue action evidence summary" }],
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
      claudeCode: { executionMode: "claude-code", claudeCommand: fakeClaude, permissionMode: "default" },
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
        title: "子代理：Pass160 Continue Evidence QA",
        detail: "pass160 continue action evidence summary",
        commandLine: [doneRun.command, ...doneRun.args].join(" "),
        cwd: PROJECT_A_DIR,
        code: 0,
        durationMs: 1600,
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
}

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
      const card = document.querySelector('.subagent-run-card[data-subagent-run-id="pass160-run"]');
      const button = Array.from(card?.querySelectorAll('button') || [])
        .find((item) => /\\u7eed\\u5199/.test(item.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function openPaletteAndQuery(win, query) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      return true;
    })();
  `);
}

async function clickContinueRunCommand(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = Array.from(document.querySelectorAll('.command-modal .command-list button'))
        .find((candidate) =>
          (candidate.getAttribute('data-command-id') || '') === 'run:pass160-request%3Acontinue' &&
          /pass160 continue action evidence summary/.test(candidate.textContent || '')
        );
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS160_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS160_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS160_OPEN_SUBAGENTS", await openSubagents(win));
  assertStep("PASS160_RUN_VISIBLE", await waitFor(win, `
    Boolean(
      document.querySelector('.subagent-run-card.done[data-subagent-run-id="pass160-run"]') &&
      /Pass160 Continue Evidence QA/.test(document.body.textContent || '') &&
      /pass160-project-a/.test(document.body.textContent || '')
    )
  `, 8000));
  assertStep("PASS160_CLICK_CONTINUE", await clickContinue(win));
  assertStep("PASS160_CONTINUE_ACTION_EVENT_PERSISTED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const run = state.subagentRuns?.find((item) => item.id === 'pass160-run');
      const sessionA = state.sessions?.find((item) => item.id === 'session-a');
      const event = state.runEvents?.find((item) => item.id === 'pass160-request:continue');
      return Boolean(
        state.activeProject?.path === ${JSON.stringify(PROJECT_A_DIR)} &&
        run?.continuedAt &&
        run.continuedSessionId === 'session-a' &&
        sessionA?.messages?.some((message) => message.source?.type === 'subagent' && message.source?.runId === 'pass160-run') &&
        event?.type === 'subagent-action' &&
        event.status === 'ok' &&
        /\\u7eed\\u5199/.test(event.title || '') &&
        /pass160 continue action evidence summary/.test((event.detail || '') + (event.stdout || '') + (event.stderr || '')) &&
        event.project?.path === ${JSON.stringify(PROJECT_A_DIR)} &&
        event.cwd === ${JSON.stringify(PROJECT_A_DIR)} &&
        event.sessionId === 'session-a'
      );
    })();
  `, 10000));

  assertStep("PASS160_OPEN_PALETTE_QUERY_CONTINUE_ACTION", await openPaletteAndQuery(win, "pass160 continue action evidence summary"));
  assertStep("PASS160_CONTINUE_ACTION_COMMAND_VISIBLE", await waitFor(win, `
    Boolean(Array.from(document.querySelectorAll('.command-modal .command-list button')).some((button) =>
      (button.getAttribute('data-command-id') || '') === 'run:pass160-request%3Acontinue' &&
      /pass160 continue action evidence summary/.test(button.textContent || '') &&
      /\\u5b50\\u4ee3\\u7406/.test(button.textContent || '') &&
      /\\u7eed\\u5199/.test(button.textContent || '')
    ))
  `, 5000));
  assertStep("PASS160_CLICK_CONTINUE_ACTION_COMMAND", await clickContinueRunCommand(win));
  assertStep("PASS160_CONTINUE_ACTION_TIMELINE_FOCUSED", await waitFor(win, `
    (function() {
      const active = document.querySelector('.workspace-context-button.active')?.textContent || '';
      const row = document.querySelector('.run-timeline-row.selected')?.textContent || '';
      const panel = document.querySelector('.selected-run-evidence-panel')?.textContent || '';
      const type = document.querySelector('.selected-run-evidence-panel [data-run-event-type="subagent-action"]')?.textContent || '';
      return /\\u8f93\\u51fa/.test(active) &&
        /\\u7eed\\u5199/.test(row) &&
        /pass160 continue action evidence summary/.test(panel) &&
        /pass160-project-a/.test(panel) &&
        /session-a/.test(panel) &&
        /subagent-action/.test(panel) &&
        /\\u5b50\\u4ee3\\u7406\\u64cd\\u4f5c/.test(type);
    })();
  `, 10000));

  console.log("PASS160_SUBAGENT_CONTINUE_ACTION_EVIDENCE_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS160_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS160_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
