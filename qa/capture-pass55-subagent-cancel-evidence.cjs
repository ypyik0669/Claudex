const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass55-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass55-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass55-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");

function cleanup() {
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

const fakeClaudeScript = `
const args = process.argv.slice(2);
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value) + '\\n'); }
if (args[0] === '--version') {
  out('2.9.0 (pass55 fake)');
} else {
  out({ result: 'pass55 generic ok', session_id: 'pass55-claude-session' });
}
`;

fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
const FAKE_CLAUDE_COMMAND = path.join(FAKE_BIN_DIR, "claude.cmd");
process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;

app.setPath("userData", USER_DATA_DIR);
fs.mkdirSync(PROJECT_DIR, { recursive: true });
fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass55-project" }), "utf8");

const createdAt = "2026-07-05T00:00:00.000Z";
const pass55Project = { name: "pass55-project", path: PROJECT_DIR };
const runningRun = {
  id: "pass55-subagent-run",
  requestId: "pass55-subagent-request",
  nickname: "Cancel Subagent",
  task: "pass55 cancellable subagent task",
  status: "running",
  sessionId: "default",
  project: pass55Project,
  cwd: PROJECT_DIR,
  command: FAKE_CLAUDE_COMMAND,
  args: ["-p", "pass55 cancellable subagent task", "--output-format", "json"],
  stdout: "",
  stderr: "pass55 subagent started",
  summary: "",
  code: null,
  durationMs: 0,
  startedAt: createdAt,
  endedAt: "",
  artifacts: [],
};

writeJson(DATA_FILE, {
  version: 1,
  settings: {
    provider: "anthropic",
    model: "claude-sonnet-4-5-20250929",
    baseUrl: "https://api.example.invalid",
    temperature: 0.2,
    timeoutMs: 600000,
    language: "zh",
    appearance: { fontSize: "compact", density: "compact" },
    claudeCode: { executionMode: "claude-code", claudeCommand: FAKE_CLAUDE_COMMAND, permissionMode: "default" },
    capabilities: {
      "project-context": true,
      "code-review": true,
      "implementation-plan": true,
      "terminal-helper": true,
      "mcp-runtime": true,
      "plugin-router": true,
      "marketplace-router": true,
    },
    customMarketplaces: [],
  },
  activeProject: pass55Project,
  projects: [pass55Project],
  sessions: [
    {
      id: "default",
      title: "新聊天",
      project: "pass55-project",
      projectPath: PROJECT_DIR,
      createdAt,
      updatedAt: createdAt,
      messages: [],
    },
  ],
  automations: [],
  subagentRuns: [runningRun],
  runEvents: [
    {
      id: "pass55-subagent-request",
      type: "subagent",
      status: "running",
      title: "子代理：Cancel Subagent",
      detail: "pass55-project · pass55 cancellable subagent task",
      project: pass55Project,
      sessionId: "default",
      createdAt,
    },
  ],
});

require(path.join(REPO_DIR, "electron", "main.cjs"));

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

async function openSubagents(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const label = '\\u5b50\\u4ee3\\u7406';
      const button = Array.from(document.querySelectorAll('.workspace-context-button, .bottom-panel-tabs button'))
        .find((item) => item.getAttribute('aria-label') === label || (item.textContent || '').includes(label));
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
    console.error("PASS55_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  try {
    assertStep("PASS55_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
    assertStep("PASS55_OPEN_SUBAGENTS", await openSubagents(win));
    assertStep("PASS55_RUNNING_FIXTURE_VISIBLE", await waitFor(win, `
      (async function() {
        const state = await window.claudexDesktop.getState();
        const run = state.subagentRuns?.[0];
        const event = state.runEvents?.find((item) => item.id === run?.requestId);
        return Boolean(
          run?.status === 'running' &&
          event?.type === 'subagent' &&
          event.status === 'running' &&
          document.querySelector('.subagent-run-card.running') &&
          /pass55 cancellable subagent task/.test(document.body.textContent || '') &&
          Array.from(document.querySelectorAll('.subagent-run-foot button')).some((button) => /\\u505c\\u6b62\\u5b50\\u4ee3\\u7406/.test(button.textContent || ''))
        );
      })();
    `, 10000));

    assertStep("PASS55_CANCEL_SUBAGENT", await waitFor(win, `
      (async function() {
        if (!window.__pass55CancelClicked) {
          window.__pass55CancelClicked = true;
          const cancel = Array.from(document.querySelectorAll('.subagent-run-foot button'))
            .find((button) => /\\u505c\\u6b62\\u5b50\\u4ee3\\u7406/.test(button.textContent || ''));
          if (!cancel) return false;
          cancel.click();
        }
        await new Promise((resolve) => setTimeout(resolve, 400));
        const state = await window.claudexDesktop.getState();
        const run = state.subagentRuns?.[0];
        const event = state.runEvents?.find((item) => item.id === run?.requestId);
        return Boolean(
          run?.status === 'cancelled' &&
          run.endedAt &&
          /\\u5df2\\u505c\\u6b62/.test(run.stderr || '') &&
          event?.type === 'subagent' &&
          event.status === 'cancelled' &&
          /\\u5df2\\u505c\\u6b62|pass55 cancellable subagent task/.test(event.detail || '') &&
          document.querySelector('.subagent-run-card.cancelled') &&
          /\\u5df2\\u505c\\u6b62/.test(document.body.textContent || '')
        );
      })();
    `, 10000));

    assertStep("PASS55_TIMELINE_CANCELLED", await waitFor(win, `
      (async function() {
        const open = Array.from(document.querySelectorAll('.subagent-run-foot button'))
          .find((button) => /timeline/.test(button.textContent || ''));
        if (!open) return false;
        open.click();
        await new Promise((resolve) => setTimeout(resolve, 250));
        return Boolean(document.querySelector('.run-timeline-row.cancelled') && /\\u5df2\\u505c\\u6b62|pass55 cancellable subagent task/.test(document.body.textContent || ''));
      })();
    `, 5000));

    assertStep("PASS55_STORE_PERSISTED", (() => {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      const run = parsed.subagentRuns?.[0];
      const event = parsed.runEvents?.find((item) => item.id === run?.requestId);
      return run?.status === "cancelled" &&
        run.endedAt &&
        /已停止/.test(run.stderr || "") &&
        event?.type === "subagent" &&
        event.status === "cancelled";
    })());

    win.webContents.reload();
    await wait(1200);
    assertStep("PASS55_RELOAD_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
    assertStep("PASS55_REOPEN_SUBAGENTS", await openSubagents(win));
    assertStep("PASS55_RELOAD_PERSISTED_UI", await waitFor(win, `
      Boolean(document.querySelector('.subagent-run-card.cancelled') && /pass55 cancellable subagent task/.test(document.body.textContent || '') && /\\u5df2\\u505c\\u6b62/.test(document.body.textContent || ''))
    `, 10000));

    console.log("PASS55_SUBAGENT_CANCEL_EVIDENCE_DONE");
    cleanup();
    app.exit(0);
  } catch (error) {
    console.error(error);
    cleanup();
    app.exit(1);
  }
});

setTimeout(() => {
  console.error("PASS55_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
