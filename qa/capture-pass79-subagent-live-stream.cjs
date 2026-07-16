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
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass79-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass79-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass79-project-"));
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
const prompt = String(args[1] || '');
function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value) + '\\n'); }
(async function main() {
  if (args[0] === '-p' && /pass79 live/.test(prompt)) {
    process.stdout.write('pass79-live-stdout-1\\n');
    process.stderr.write('pass79-live-stderr-1\\n');
    await wait(3200);
    out({ result: 'pass79-live-final summary', session_id: 'pass79-live-session' });
  } else if (args[0] === '--version') {
    out('2.9.0 (pass79 fake)');
  } else {
    out({ result: 'pass79 generic ok', session_id: 'pass79-generic-session' });
  }
})().catch((error) => {
  process.stderr.write(String(error && error.stack || error) + '\\n');
  process.exitCode = 1;
});
`;

fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
const FAKE_CLAUDE_COMMAND = path.join(FAKE_BIN_DIR, "claude.cmd");
process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;

app.setPath("userData", USER_DATA_DIR);
fs.mkdirSync(PROJECT_DIR, { recursive: true });
fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass79-project" }), "utf8");

const createdAt = "2026-07-06T00:00:00.000Z";
const pass79Project = { name: "pass79-project", path: PROJECT_DIR };

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
  },
  activeProject: pass79Project,
  projects: [pass79Project],
  sessions: [
    {
      id: "default",
      title: "\u65b0\u804a\u5929",
      project: "pass79-project",
      projectPath: PROJECT_DIR,
      createdAt,
      updatedAt: createdAt,
      messages: [],
    },
  ],
  automations: [],
  subagentRuns: [],
  runEvents: [],
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

function persistedState() {
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

app.whenReady().then(async () => {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.error("PASS79_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  try {
    assertStep("PASS79_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
    assertStep("PASS79_OPEN_SUBAGENTS", await openSubagents(win));
    assertStep("PASS79_WORKBENCH_READY", await waitFor(win, "Boolean(document.querySelector('.subagent-workbench') && document.querySelector('.subagent-form textarea'))", 10000));

    assertStep("PASS79_START_LIVE_SUBAGENT", await win.webContents.executeJavaScript(`
      (function() {
        const textarea = document.querySelector('.subagent-form textarea');
        const nickname = document.querySelector('.subagent-form input');
        const submit = document.querySelector('.subagent-form .primary-action');
        if (!textarea || !nickname || !submit) return false;
        Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(textarea, 'pass79 live stream evidence');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(nickname, 'Live Stream QA');
        nickname.dispatchEvent(new Event('input', { bubbles: true }));
        submit.click();
        return true;
      })();
    `));

    assertStep("PASS79_RUNNING_PARTIAL_UI_AND_STORE", await waitFor(win, `
      (async function() {
        const state = await window.claudexDesktop.getState();
        const run = state.subagentRuns?.find((item) => item.nickname === 'Live Stream QA');
        const event = state.runEvents?.find((item) => item.id === run?.requestId);
        const body = document.body.textContent || '';
        return Boolean(
          run?.status === 'running' &&
          /pass79-live-stdout-1/.test(run.stdout || '') &&
          /pass79-live-stderr-1/.test(run.stderr || '') &&
          event?.status === 'running' &&
          run.runtimeRecoveryPending === true && !run.runtimeOwner && !run.runtimePid && !run.runtimeCommand && !run.runtimeExecutable && !run.runtimeStartedAt &&
          event.runtimeRecoveryPending === true && !event.runtimeOwner && !event.runtimePid && !event.runtimeCommand && !event.runtimeExecutable && !event.runtimeStartedAt &&
          /pass79-live-stdout-1/.test(event.stdout || '') &&
          /pass79-live-stderr-1/.test(event.stderr || '') &&
          document.querySelector('.subagent-run-card.running') &&
          /pass79-live-stdout-1/.test(body) &&
          /pass79-live-stderr-1/.test(body)
        );
      })();
    `, 1800));

    assertStep("PASS79_OPEN_RUNNING_TIMELINE", await win.webContents.executeJavaScript(`
      (function() {
        const card = document.querySelector('.subagent-run-card.running');
        const button = Array.from(card?.querySelectorAll('.subagent-run-foot button') || [])
          .find((item) => /timeline/i.test(item.textContent || ''));
        if (!button) return false;
        button.click();
        return true;
      })();
    `));
    assertStep("PASS79_RUNNING_TIMELINE_PARTIAL", await waitFor(win, `
      (function() {
        const row = document.querySelector('.run-timeline-row.running');
        row?.querySelector('summary')?.click();
        const panel = document.querySelector('.selected-run-evidence-panel.running');
        const text = panel?.textContent || '';
        return Boolean(
          panel &&
          /Live Stream QA/.test(text) &&
          /pass79-live-stdout-1/.test(text) &&
          /pass79-live-stderr-1/.test(text) &&
          /claude\\.cmd/.test(text)
        );
      })();
    `, 5000));

    assertStep("PASS79_FINAL_STATE", await waitFor(win, `
      (async function() {
        const state = await window.claudexDesktop.getState();
        const run = state.subagentRuns?.find((item) => item.nickname === 'Live Stream QA');
        const event = state.runEvents?.find((item) => item.id === run?.requestId);
        const body = document.body.textContent || '';
        return Boolean(
          run?.status === 'done' &&
          run.code === 0 &&
          run.sessionId === 'default' &&
          /pass79-live-final summary/.test(run.summary || '') &&
          /pass79-live-stdout-1/.test(run.stdout || '') &&
          /pass79-live-stderr-1/.test(run.stderr || '') &&
          run.artifacts?.length >= 3 &&
          !run.runtimeOwner && !run.runtimePid && !run.runtimeCommand && !run.runtimeStartedAt &&
          event?.status === 'ok' &&
          !event.runtimeOwner && !event.runtimePid && !event.runtimeCommand && !event.runtimeStartedAt &&
          /pass79-live-final summary/.test(event.detail || '') &&
          /pass79-live-final summary/.test(body)
        );
      })();
    `, 8000));

    assertStep("PASS79_STORE_PERSISTED_FINAL_OUTPUT", (() => {
      const parsed = persistedState();
      const run = parsed.subagentRuns?.find((item) => item.nickname === "Live Stream QA");
      const event = parsed.runEvents?.find((item) => item.id === run?.requestId);
      return run?.status === "done" &&
        run.code === 0 &&
        /pass79-live-final summary/.test(run.summary || "") &&
        /pass79-live-stdout-1/.test(run.stdout || "") &&
        /pass79-live-stderr-1/.test(run.stderr || "") &&
        run.artifacts?.length >= 3 &&
        !run.runtimeOwner && !run.runtimePid && !run.runtimeCommand && !run.runtimeStartedAt &&
        event?.status === "ok" &&
        !event.runtimeOwner && !event.runtimePid && !event.runtimeCommand && !event.runtimeStartedAt &&
        /pass79-live-final summary/.test(event.detail || "") &&
        /pass79-live-stdout-1/.test(event.stdout || "") &&
        /pass79-live-stderr-1/.test(event.stderr || "");
    })());

    console.log("PASS79_SUBAGENT_LIVE_STREAM_DONE");
    cleanup();
    app.exit(0);
  } catch (error) {
    console.error(error);
    cleanup();
    app.exit(1);
  }
});

setTimeout(() => {
  console.error("PASS79_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
