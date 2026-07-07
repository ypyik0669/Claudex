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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass175-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass175-bin-"));
const PROJECT_A_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass175-project-a-"));
const PROJECT_B_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass175-project-b-"));
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
function out(value) {
  process.stdout.write(typeof value === "string" ? value + "\\n" : JSON.stringify(value) + "\\n");
}
if (args[0] === "-p") {
  process.stderr.write("pass175 fake stderr cwd=" + process.cwd() + "\\n");
  out({ result: "pass175 fake ok: " + args[1] + " cwd=" + process.cwd(), session_id: "pass175-claude-session" });
} else if (args[0] === "--version") {
  out("2.9.0 (pass175 fake)");
} else if (args[0] === "plugin" && args[1] === "list" && args[2] === "--json") {
  out([]);
} else if (args[0] === "plugin" && args[1] === "marketplace" && args[2] === "list" && args[3] === "--json") {
  out([]);
} else if (args[0] === "mcp") {
  out("No MCP servers configured");
} else {
  out({ result: "pass175 generic ok", session_id: "pass175-generic-session" });
}
`;

function writeInitialStore() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_A_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_B_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_A_DIR, "package.json"), JSON.stringify({ name: "pass175-project-a" }), "utf8");
  fs.writeFileSync(path.join(PROJECT_B_DIR, "package.json"), JSON.stringify({ name: "pass175-project-b" }), "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), "@echo off\r\nnode \"%~dp0fake-claude.cjs\" %*\r\n", "utf8");
  const fakeClaude = path.join(FAKE_BIN_DIR, "claude.cmd");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;

  const createdAt = "2026-07-07T10:00:00.000Z";
  const projectA = { name: "pass175-project-a", path: PROJECT_A_DIR };
  const projectB = { name: "pass175-project-b", path: PROJECT_B_DIR };
  const failedAutomationRun = {
    id: "pass175-old-automation-run",
    trigger: "manual",
    status: "failed",
    startedAt: createdAt,
    endedAt: "2026-07-07T10:00:01.000Z",
    durationMs: 1000,
    sessionId: "session-a",
    detail: "",
    error: "pass175 failed automation recovery command error",
    summary: "",
    stdout: "",
    stderr: "pass175 failed automation recovery command stderr",
    code: 1,
  };
  const failedSubagentRun = {
    id: "pass175-subagent-run",
    requestId: "pass175-subagent-request",
    nickname: "Pass175 Failed Subagent",
    task: "pass175 failed subagent recovery command task",
    status: "error",
    sessionId: "session-a",
    project: projectA,
    cwd: PROJECT_A_DIR,
    command: fakeClaude,
    args: ["-p", "pass175 failed subagent recovery command task", "--model", "claude-haiku-4-5-20251001"],
    stdout: "",
    stderr: "pass175 failed subagent recovery command stderr",
    summary: "pass175 failed subagent recovery command summary",
    code: 1,
    durationMs: 1200,
    startedAt: createdAt,
    endedAt: "2026-07-07T10:00:01.200Z",
    artifacts: [{ type: "summary", label: "Summary", content: "pass175 failed subagent recovery command summary" }],
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
        title: "Project A recovery session",
        project: projectA.name,
        projectPath: PROJECT_A_DIR,
        createdAt,
        updatedAt: createdAt,
        messages: [],
      },
    ],
    automations: [
      {
        id: "pass175-automation",
        prompt: "pass175 failed automation recovery command prompt",
        schedule: { type: "once", runAt: "" },
        project: projectA,
        threadId: "session-a",
        enabled: false,
        status: "failed",
        createdAt,
        updatedAt: createdAt,
        lastRun: failedAutomationRun,
        history: [failedAutomationRun],
      },
    ],
    subagentRuns: [failedSubagentRun],
    commandRuns: [],
    runEvents: [
      {
        id: "pass175-old-automation-run",
        type: "automation",
        status: "error",
        title: "pass175 failed automation recovery command prompt",
        detail: "pass175 failed automation recovery command error",
        cwd: PROJECT_A_DIR,
        project: projectA,
        sessionId: "session-a",
        stderr: "pass175 failed automation recovery command stderr",
        code: 1,
        createdAt,
      },
      {
        id: "pass175-subagent-request",
        type: "subagent",
        status: "error",
        title: "Pass175 Failed Subagent",
        detail: "pass175 failed subagent recovery command summary",
        commandLine: [failedSubagentRun.command, ...failedSubagentRun.args].join(" "),
        cwd: PROJECT_A_DIR,
        project: projectA,
        sessionId: "session-a",
        stderr: failedSubagentRun.stderr,
        code: 1,
        createdAt,
      },
    ],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
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

async function clickCommand(win, commandId) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.command-modal .command-list button[data-command-id=${JSON.stringify(commandId)}]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function installClipboardSpy(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text) => {
            window.__pass175ClipboardText = String(text || '');
          },
        },
      });
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS175_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS175_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS175_INITIAL_ACTIVE_PROJECT_B", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      return state.activeProject?.path === ${JSON.stringify(PROJECT_B_DIR)} &&
        state.automations?.some((item) => item.id === 'pass175-automation' && item.lastRun?.status === 'failed') &&
        state.subagentRuns?.some((item) => item.id === 'pass175-subagent-run' && item.status === 'error');
    })();
  `, 8000));

  assertStep("PASS175_OPEN_PALETTE_QUERY_AUTOMATION_RECOVERY", await openPaletteAndQuery(win, "pass175 failed automation recovery command"));
  assertStep("PASS175_AUTOMATION_RECOVERY_COMMANDS_VISIBLE", await waitFor(win, `
    (function() {
      const ids = Array.from(document.querySelectorAll('.command-modal .command-list button')).map((button) => button.getAttribute('data-command-id'));
      return ids.includes('automation-recovery:run-now:pass175-automation') &&
        ids.includes('automation-recovery:copy:pass175-old-automation-run') &&
        ids.includes('automation-recovery:timeline:pass175-old-automation-run');
    })();
  `, 5000));
  assertStep("PASS175_CLICK_AUTOMATION_RECOVERY_RUN_NOW", await clickCommand(win, "automation-recovery:run-now:pass175-automation"));
  assertStep("PASS175_AUTOMATION_RECOVERY_RUN_NOW_FOCUSED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const automation = state.automations?.find((item) => item.id === 'pass175-automation');
      const card = document.querySelector('.automation-task-card.focused-task-card[data-automation-id="pass175-automation"]');
      const button = card?.querySelector('[data-automation-recovery-action="run-now"]');
      return Boolean(
        automation?.lastRun?.status === 'failed' &&
        card &&
        button &&
        button.getAttribute('data-task-action-focused') === 'true' &&
        button.getAttribute('data-task-kind') === 'automation' &&
        button.getAttribute('data-task-action') === 'run-now' &&
        button.getAttribute('data-task-id') === 'pass175-automation' &&
        !button.disabled
      );
    })();
  `, 10000));
  assertStep("PASS175_CLICK_AUTOMATION_RECOVERY_RUN_NOW_BUTTON", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.automation-task-card[data-automation-id="pass175-automation"] [data-automation-recovery-action="run-now"]');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS175_AUTOMATION_RECOVERY_RUNS_IN_ORIGINAL_PROJECT", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const automation = state.automations?.find((item) => item.id === 'pass175-automation');
      const event = state.runEvents?.find((item) => item.id === automation?.lastRun?.id);
      const sessionA = state.sessions?.find((item) => item.id === 'session-a');
      return Boolean(
        state.activeProject?.path === ${JSON.stringify(PROJECT_B_DIR)} &&
        automation?.lastRun?.status === 'succeeded' &&
        automation.lastRun.sessionId === 'session-a' &&
        [automation.lastRun.detail, automation.lastRun.summary, automation.lastRun.stdout, automation.lastRun.stderr].join(' ').includes(${JSON.stringify(`cwd=${PROJECT_A_DIR}`)}) &&
        event?.type === 'automation' &&
        event.status === 'ok' &&
        event.project?.path === ${JSON.stringify(PROJECT_A_DIR)} &&
        event.cwd === ${JSON.stringify(PROJECT_A_DIR)} &&
        sessionA?.messages?.some((message) => /pass175 failed automation recovery command prompt/.test(message.content || '')) &&
        sessionA?.messages?.some((message) => /pass175 fake ok/.test(message.content || ''))
      );
    })();
  `, 15000));

  assertStep("PASS175_INSTALL_CLIPBOARD_SPY", await installClipboardSpy(win));
  assertStep("PASS175_OPEN_PALETTE_QUERY_SUBAGENT_RECOVERY", await openPaletteAndQuery(win, "pass175 failed subagent recovery command"));
  assertStep("PASS175_SUBAGENT_RECOVERY_COMMANDS_VISIBLE", await waitFor(win, `
    (function() {
      const ids = Array.from(document.querySelectorAll('.command-modal .command-list button')).map((button) => button.getAttribute('data-command-id'));
      return ids.includes('subagent-recovery:retry:pass175-subagent-run') &&
        ids.includes('subagent-recovery:continue:pass175-subagent-run') &&
        ids.includes('subagent-recovery:copy:pass175-subagent-run') &&
        ids.includes('subagent-recovery:timeline:pass175-subagent-request');
    })();
  `, 5000));
  assertStep("PASS175_CLICK_SUBAGENT_COPY_EVIDENCE", await clickCommand(win, "subagent-recovery:copy:pass175-subagent-run"));
  assertStep("PASS175_SUBAGENT_COPY_EVIDENCE_BACKED_BY_RUN", await waitFor(win, `
    (function() {
      const copied = window.__pass175ClipboardText || "";
      return /pass175 failed subagent recovery command task/.test(copied) &&
        /pass175 failed subagent recovery command stderr/.test(copied) &&
        /pass175-project-a/.test(copied) &&
        /pass175-subagent-run/.test(copied);
    })();
  `, 5000));

  assertStep("PASS175_OPEN_PALETTE_QUERY_SUBAGENT_CONTINUE", await openPaletteAndQuery(win, "continue pass175 failed subagent recovery command"));
  assertStep("PASS175_CLICK_SUBAGENT_CONTINUE", await clickCommand(win, "subagent-recovery:continue:pass175-subagent-run"));
  assertStep("PASS175_SUBAGENT_CONTINUE_COMMAND_FOCUSED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const original = (state.subagentRuns || []).find((item) => item.id === 'pass175-subagent-run');
      const card = document.querySelector('.subagent-run-card.focused-task-card[data-subagent-run-id="pass175-subagent-run"]');
      const button = card?.querySelector('[data-subagent-recovery-action="continue"]');
      return Boolean(
        original &&
        !original.continuedAt &&
        card &&
        button &&
        button.getAttribute('data-task-action-focused') === 'true' &&
        button.getAttribute('data-task-kind') === 'subagent' &&
        button.getAttribute('data-task-action') === 'continue' &&
        button.getAttribute('data-task-id') === 'pass175-subagent-run' &&
        !button.disabled
      );
    })();
  `, 10000));

  assertStep("PASS175_OPEN_PALETTE_QUERY_SUBAGENT_RETRY", await openPaletteAndQuery(win, "retry pass175 failed subagent recovery command"));
  assertStep("PASS175_CLICK_SUBAGENT_RETRY", await clickCommand(win, "subagent-recovery:retry:pass175-subagent-run"));
  assertStep("PASS175_SUBAGENT_RETRY_COMMAND_FOCUSED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const retried = (state.subagentRuns || []).find((item) =>
        item.id !== 'pass175-subagent-run' &&
        item.task === 'pass175 failed subagent recovery command task'
      );
      const card = document.querySelector('.subagent-run-card.focused-task-card[data-subagent-run-id="pass175-subagent-run"]');
      const button = card?.querySelector('[data-subagent-recovery-action="retry"]');
      return Boolean(
        !retried &&
        card &&
        button &&
        button.getAttribute('data-task-action-focused') === 'true' &&
        button.getAttribute('data-task-kind') === 'subagent' &&
        button.getAttribute('data-task-action') === 'retry' &&
        button.getAttribute('data-task-id') === 'pass175-subagent-run'
      );
    })();
  `, 10000));
  assertStep("PASS175_CLICK_SUBAGENT_RETRY_BUTTON", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.subagent-run-card[data-subagent-run-id="pass175-subagent-run"] [data-subagent-recovery-action="retry"]');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS175_SUBAGENT_RETRY_USES_ORIGINAL_PROJECT", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const retried = (state.subagentRuns || []).find((item) =>
        item.id !== 'pass175-subagent-run' &&
        item.task === 'pass175 failed subagent recovery command task' &&
        item.project?.path === ${JSON.stringify(PROJECT_A_DIR)}
      );
      const event = state.runEvents?.find((item) => item.id === retried?.requestId);
      window.__pass175RetryDebug = {
        activeProjectPath: state.activeProject?.path,
        runs: (state.subagentRuns || []).map((item) => ({
          id: item.id,
          requestId: item.requestId,
          task: item.task,
          status: item.status,
          sessionId: item.sessionId,
          projectPath: item.project?.path,
          cwd: item.cwd,
          stdout: item.stdout,
          stderr: item.stderr,
        })),
        event,
      };
      return Boolean(
        state.activeProject?.path === ${JSON.stringify(PROJECT_B_DIR)} &&
        retried?.status === 'done' &&
        retried.sessionId === 'session-a' &&
        [retried.summary, retried.stdout, retried.stderr].join(' ').includes(${JSON.stringify(`cwd=${PROJECT_A_DIR}`)}) &&
        event?.type === 'subagent' &&
        event.status === 'ok' &&
        event.project?.path === ${JSON.stringify(PROJECT_A_DIR)} &&
        event.cwd === ${JSON.stringify(PROJECT_A_DIR)} &&
        event.sessionId === 'session-a'
      );
    })();
  `, 15000));

  console.log("PASS175_TASK_RECOVERY_COMMAND_ACTIONS_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS175_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript("window.__pass175RetryDebug || null").catch(() => null);
      if (debug) console.error("PASS175_RETRY_DEBUG", JSON.stringify(debug, null, 2));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS175_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
