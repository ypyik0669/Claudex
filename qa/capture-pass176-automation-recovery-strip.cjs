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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass176-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass176-bin-"));
const PROJECT_A_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass176-project-a-"));
const PROJECT_B_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass176-project-b-"));
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
  process.stderr.write("pass176 automation stderr cwd=" + process.cwd() + "\\n");
  out({ result: "pass176 automation recovered: " + args[1] + " cwd=" + process.cwd(), session_id: "pass176-claude-session" });
} else if (args[0] === "--version") {
  out("2.9.0 (pass176 fake)");
} else if (args[0] === "plugin" && args[1] === "list" && args[2] === "--json") {
  out([]);
} else if (args[0] === "plugin" && args[1] === "marketplace" && args[2] === "list" && args[3] === "--json") {
  out([]);
} else if (args[0] === "mcp") {
  out("No MCP servers configured");
} else {
  out({ result: "pass176 generic ok", session_id: "pass176-generic-session" });
}
`;

function writeInitialStore() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_A_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_B_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_A_DIR, "package.json"), JSON.stringify({ name: "pass176-project-a" }), "utf8");
  fs.writeFileSync(path.join(PROJECT_B_DIR, "package.json"), JSON.stringify({ name: "pass176-project-b" }), "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), "@echo off\r\nnode \"%~dp0fake-claude.cjs\" %*\r\n", "utf8");
  const fakeClaude = path.join(FAKE_BIN_DIR, "claude.cmd");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;

  const createdAt = "2026-07-07T10:00:00.000Z";
  const projectA = { name: "pass176-project-a", path: PROJECT_A_DIR };
  const projectB = { name: "pass176-project-b", path: PROJECT_B_DIR };
  const failedRun = {
    id: "pass176-failed-run",
    trigger: "manual",
    status: "failed",
    startedAt: createdAt,
    endedAt: "2026-07-07T10:00:01.000Z",
    durationMs: 1000,
    sessionId: "session-a",
    detail: "",
    error: "pass176 recovery strip old failure",
    summary: "",
    stdout: "",
    stderr: "pass176 recovery strip old stderr",
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
        id: "pass176-automation",
        prompt: "pass176 recovery strip automation prompt",
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
    runEvents: [
      {
        id: "pass176-failed-run",
        type: "automation",
        status: "error",
        title: "pass176 recovery strip automation prompt",
        detail: "pass176 recovery strip old failure",
        cwd: PROJECT_A_DIR,
        project: projectA,
        sessionId: "session-a",
        stderr: "pass176 recovery strip old stderr",
        code: 1,
        createdAt,
      },
    ],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

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

async function openAutomationModal(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const label = '\\u81ea\\u52a8\\u5316';
      const button = Array.from(document.querySelectorAll('button'))
        .find((item) => item.getAttribute('aria-label') === label || (item.textContent || '').includes(label));
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
            window.__pass176ClipboardText = String(text || '');
          },
        },
      });
      return true;
    })();
  `);
}

async function clickScheduledRecoveryAction(win, action) {
  return win.webContents.executeJavaScript(`
    (function() {
      const strip = document.querySelector('[data-automation-recovery-surface="scheduled"][data-automation-id="pass176-automation"]');
      const button = strip?.querySelector('[data-automation-recovery-action=${JSON.stringify(action)}]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS176_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS176_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS176_INITIAL_FAILED_AUTOMATION", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const automation = state.automations?.find((item) => item.id === 'pass176-automation');
      return Boolean(
        state.activeProject?.path === ${JSON.stringify(PROJECT_B_DIR)} &&
        automation?.status === 'failed' &&
        automation.lastRun?.status === 'failed'
      );
    })();
  `, 8000));

  assertStep("PASS176_OPEN_TASK_CENTER", await openTaskCenter(win));
  assertStep("PASS176_TASK_CENTER_RECOVERY_STRIP_VISIBLE", await waitFor(win, `
    (function() {
      const strip = document.querySelector('[data-automation-recovery-surface="task-center"][data-automation-id="pass176-automation"]');
      const text = strip?.textContent || '';
      return Boolean(
        strip &&
        /pass176 recovery strip old failure/.test(text) &&
        strip.querySelector('[data-automation-recovery-action="run-now"]') &&
        strip.querySelector('[data-automation-recovery-action="copy-evidence"]') &&
        strip.querySelector('[data-automation-recovery-action="timeline"]')
      );
    })();
  `, 8000));

  assertStep("PASS176_OPEN_AUTOMATION_MODAL", await openAutomationModal(win));
  assertStep("PASS176_SCHEDULED_RECOVERY_STRIP_VISIBLE", await waitFor(win, `
    (function() {
      const strip = document.querySelector('[data-automation-recovery-surface="scheduled"][data-automation-id="pass176-automation"]');
      const text = strip?.textContent || '';
      return Boolean(
        document.querySelector('.scheduled-modal') &&
        strip &&
        /pass176 recovery strip old failure/.test(text) &&
        /pass176-project-a/.test(text) &&
        strip.querySelector('[data-automation-recovery-action="run-now"]') &&
        strip.querySelector('[data-automation-recovery-action="copy-evidence"]') &&
        strip.querySelector('[data-automation-recovery-action="timeline"]')
      );
    })();
  `, 8000));

  assertStep("PASS176_INSTALL_CLIPBOARD_SPY", await installClipboardSpy(win));
  assertStep("PASS176_COPY_SCHEDULED_RECOVERY_EVIDENCE", await clickScheduledRecoveryAction(win, "copy-evidence"));
  assertStep("PASS176_SCHEDULED_RECOVERY_COPY_BACKED_BY_LAST_RUN", await waitFor(win, `
    (function() {
      const copied = window.__pass176ClipboardText || "";
      return /pass176 recovery strip automation prompt/.test(copied) &&
        /pass176 recovery strip old failure/.test(copied) &&
        /pass176 recovery strip old stderr/.test(copied) &&
        /pass176-failed-run/.test(copied) &&
        /pass176-project-a/.test(copied);
    })();
  `, 5000));

  assertStep("PASS176_OPEN_FAILED_TIMELINE_FROM_RECOVERY_STRIP", await clickScheduledRecoveryAction(win, "timeline"));
  assertStep("PASS176_FAILED_TIMELINE_FOCUSED", await waitFor(win, `
    (function() {
      const active = document.querySelector('.workspace-context-button.active')?.textContent || '';
      const row = document.querySelector('.run-timeline-row.selected')?.textContent || '';
      const evidencePanel = document.querySelector('.selected-run-evidence-panel');
      const runNow = evidencePanel?.querySelector('[data-run-recovery-action="run-automation"]');
      const panel = evidencePanel?.textContent || '';
      return /\\u8f93\\u51fa/.test(active) &&
        /pass176 recovery strip automation prompt/.test(row) &&
        /pass176 recovery strip old failure/.test(panel) &&
        /pass176-project-a/.test(panel) &&
        /session-a/.test(panel) &&
        runNow &&
        runNow.getAttribute('data-run-recovery-action-focused') === 'true' &&
        document.activeElement === runNow;
    })();
  `, 8000));

  assertStep("PASS176_REOPEN_AUTOMATION_MODAL", await openAutomationModal(win));
  assertStep("PASS176_CLICK_RECOVERY_RUN_NOW", await clickScheduledRecoveryAction(win, "run-now"));
  assertStep("PASS176_RECOVERY_RUN_NOW_USES_ORIGINAL_PROJECT", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const automation = state.automations?.find((item) => item.id === 'pass176-automation');
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
        sessionA?.messages?.some((message) => /pass176 recovery strip automation prompt/.test(message.content || '')) &&
        sessionA?.messages?.some((message) => /pass176 automation recovered/.test(message.content || ''))
      );
    })();
  `, 15000));

  console.log("PASS176_AUTOMATION_RECOVERY_STRIP_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS176_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS176_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
