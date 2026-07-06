const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass80-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass80-bin-"));
const PROJECT_A = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass80-project-a-"));
const PROJECT_B = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass80-project-b-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const COMMAND_LOG = path.join(USER_DATA_DIR, "claude-command-log.jsonl");

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_A, PROJECT_B]) {
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

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function commandLogEntries() {
  try {
    return fs.readFileSync(COMMAND_LOG, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (_error) {
    return [];
  }
}

const fakeClaudeScript = `
const fs = require('fs');
const args = process.argv.slice(2);
const commandLog = ${JSON.stringify(COMMAND_LOG)};
fs.appendFileSync(commandLog, JSON.stringify(args) + '\\n', 'utf8');
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value) + '\\n'); }
if (args[0] === '-p' && /pass80 follow up/.test(String(args[1] || ''))) {
  out({ type: 'result', result: 'pass80 resumed response', session_id: 'pass80-next-session' });
} else if (args[0] === '--version') {
  out('2.9.0 (pass80 fake)');
} else {
  out({ type: 'result', result: 'pass80 generic response', session_id: 'pass80-generic-session' });
}
`;

fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
const FAKE_CLAUDE_COMMAND = path.join(FAKE_BIN_DIR, "claude.cmd");
process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;

app.setPath("userData", USER_DATA_DIR);
fs.mkdirSync(PROJECT_A, { recursive: true });
fs.mkdirSync(PROJECT_B, { recursive: true });
fs.writeFileSync(path.join(PROJECT_A, "package.json"), JSON.stringify({ name: "pass80-project-a" }), "utf8");
fs.writeFileSync(path.join(PROJECT_B, "package.json"), JSON.stringify({ name: "pass80-project-b" }), "utf8");

writeJson(DATA_FILE, {
  version: 1,
  activeProject: { name: "Project A", path: PROJECT_A },
  projects: [
    { name: "Project A", path: PROJECT_A },
    { name: "Project B", path: PROJECT_B },
  ],
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
  sessions: [
    {
      id: "project-a-current",
      title: "Project A current thread",
      project: "Project A",
      projectPath: PROJECT_A,
      createdAt: "2026-07-06T00:00:00.000Z",
      updatedAt: "2026-07-06T00:10:00.000Z",
      messages: [{ role: "user", content: "project a context", createdAt: "2026-07-06T00:00:00.000Z" }],
    },
    {
      id: "project-b-fresh",
      title: "Fresh B thread",
      project: "Project B",
      projectPath: PROJECT_B,
      createdAt: "2026-07-06T00:01:00.000Z",
      updatedAt: "2026-07-06T00:09:00.000Z",
      messages: [{ role: "user", content: "fresh project b context", createdAt: "2026-07-06T00:01:00.000Z" }],
    },
    {
      id: "project-b-resume",
      title: "Resume source thread",
      project: "Project B",
      projectPath: PROJECT_B,
      claudeSessionId: "pass80-claude-session",
      pinned: true,
      createdAt: "2026-07-06T00:02:00.000Z",
      updatedAt: "2026-07-06T00:08:00.000Z",
      messages: [
        { role: "user", content: "pass80 previous user turn", createdAt: "2026-07-06T00:02:00.000Z" },
        { role: "assistant", content: "pass80 previous assistant turn", createdAt: "2026-07-06T00:03:00.000Z" },
      ],
    },
  ],
  automations: [],
  subagentRuns: [],
  commandRuns: [],
  runEvents: [],
  sourceRefs: [],
  browserVisits: [],
  notices: [],
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

app.whenReady().then(async () => {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.error("PASS80_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  try {
    assertStep("PASS80_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
    assertStep("PASS80_INITIAL_PROJECT_A_ONLY", await waitFor(win, `
      (function() {
        const list = document.querySelector('.thread-list')?.textContent || '';
        return /Project A current thread/.test(list) &&
          !/Resume source thread|Fresh B thread/.test(list);
      })();
    `, 10000));

    assertStep("PASS80_ALL_PROJECTS_SHOWS_RESUME_SOURCE", await waitFor(win, `
      (async function() {
        if (!window.__pass80AllClicked) {
          window.__pass80AllClicked = true;
          const button = document.querySelector('.chat-scope-toggle button[data-thread-scope="all"]');
          if (!button) return false;
          button.click();
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
        const list = document.querySelector('.thread-list')?.textContent || '';
        return /Project A current thread/.test(list) &&
          /Resume source thread/.test(list) &&
          /Fresh B thread/.test(list);
      })();
    `, 10000));

    assertStep("PASS80_RESUME_SELECTS_THREAD_AND_PROJECT", await waitFor(win, `
      (async function() {
        if (!window.__pass80ResumeClicked) {
          window.__pass80ResumeClicked = true;
          const row = Array.from(document.querySelectorAll('.thread-list .thread-item'))
            .find((item) => /Resume source thread/.test(item.textContent || ''));
          const resume = row?.querySelector('button[data-thread-action="resume"]');
          if (!resume) return false;
          resume.click();
        }
        await new Promise((resolve) => setTimeout(resolve, 800));
        const state = await window.claudexDesktop.getState();
        const active = document.querySelector('.thread-list .thread-item.active')?.textContent || '';
        const header = document.querySelector('.thread-header')?.textContent || '';
        const scope = document.querySelector('.thread-scope-summary')?.textContent || '';
        return state.activeProject?.path === ${JSON.stringify(PROJECT_B)} &&
          state.sessions.length === 3 &&
          /Resume source thread/.test(active) &&
          /Resume source thread/.test(header) &&
          /Project B/.test(scope);
      })();
    `, 12000));

    assertStep("PASS80_RESUME_FOCUSES_COMPOSER", await waitFor(win, `
      document.activeElement === document.querySelector('.prompt-box textarea')
    `, 5000));

    assertStep("PASS80_UNPIN_PERSISTS", await waitFor(win, `
      (async function() {
        if (!window.__pass80UnpinClicked) {
          window.__pass80UnpinClicked = true;
          const row = document.querySelector('.thread-list .thread-item[data-thread-id="project-b-resume"]');
          const unpin = row?.querySelector('[data-thread-action="unpin"]');
          if (!unpin) return false;
          unpin.click();
        }
        await new Promise((resolve) => setTimeout(resolve, 450));
        const state = await window.claudexDesktop.getState();
        const row = Array.from(document.querySelectorAll('.thread-list .thread-item'))
          .find((item) => /Resume source thread/.test(item.textContent || ''));
        return state.sessions.find((item) => item.id === 'project-b-resume')?.pinned === false &&
          row &&
          !row.classList.contains('pinned-thread');
      })();
    `, 10000));

    assertStep("PASS80_DELETE_CANCEL_PRESERVES_THREAD", await waitFor(win, `
      (async function() {
        if (!window.__pass80DeleteCancelClicked) {
          window.__pass80DeleteCancelClicked = true;
          window.confirm = () => false;
          const row = document.querySelector('.thread-list .thread-item[data-thread-id="project-b-fresh"]');
          const del = row?.querySelector('[data-thread-action="delete"]');
          if (!del) return false;
          del.click();
        }
        await new Promise((resolve) => setTimeout(resolve, 350));
        const state = await window.claudexDesktop.getState();
        const list = document.querySelector('.thread-list')?.textContent || '';
        return state.sessions.length === 3 &&
          state.sessions.some((item) => item.id === 'project-b-fresh') &&
          /Fresh B thread/.test(list);
      })();
    `, 10000));

    assertStep("PASS80_RESUME_SESSION_ID_PRESERVED", await win.webContents.executeJavaScript(`
      (async function() {
        const state = await window.claudexDesktop.getState();
        const session = state.sessions.find((item) => item.id === 'project-b-resume');
        return state.activeProject?.path === ${JSON.stringify(PROJECT_B)} &&
          session?.claudeSessionId === 'pass80-claude-session';
      })();
    `));

    assertStep("PASS80_SEND_AFTER_RESUME", await waitFor(win, `
      (async function() {
        if (!window.__pass80SendClicked) {
          window.__pass80SendClicked = true;
          const textarea = document.querySelector('.prompt-box textarea');
          if (!textarea) return false;
          Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(textarea, 'pass80 follow up');
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise((resolve) => setTimeout(resolve, 200));
          const send = document.querySelector('.prompt-box .send-button:not([disabled])');
          if (!send) return false;
          send.click();
        }
        await new Promise((resolve) => setTimeout(resolve, 650));
        const state = await window.claudexDesktop.getState();
        const session = state.sessions.find((item) => item.id === 'project-b-resume');
        return Boolean(session &&
          session.claudeSessionId === 'pass80-next-session' &&
          session.messages?.some((message) => message.role === 'user' && /pass80 follow up/.test(message.content || '')) &&
          session.messages?.some((message) => message.role === 'assistant' && /pass80 resumed response/.test(message.content || '')) &&
          state.sessions.length === 3);
      })();
    `, 15000));

    assertStep("PASS80_CLAUDE_RESUME_ARG_USED", (() => {
      const entries = commandLogEntries();
      const chatArgs = entries.find((args) => args[0] === "-p" && /pass80 follow up/.test(args[1] || ""));
      const resumeIndex = Array.isArray(chatArgs) ? chatArgs.indexOf("--resume") : -1;
      return Boolean(chatArgs &&
        chatArgs.includes("claude-haiku-4-5-20251001") &&
        resumeIndex >= 0 &&
        chatArgs[resumeIndex + 1] === "pass80-claude-session");
    })());

    assertStep("PASS80_STORE_PERSISTED", (() => {
      const parsed = readJson(DATA_FILE);
      const session = parsed.sessions?.find((item) => item.id === "project-b-resume");
      return parsed.activeProject?.path === PROJECT_B &&
        parsed.sessions?.length === 3 &&
        session?.pinned === false &&
        session?.claudeSessionId === "pass80-next-session" &&
        session.messages?.some((message) => message.role === "user" && /pass80 follow up/.test(message.content || "")) &&
        session.messages?.some((message) => message.role === "assistant" && /pass80 resumed response/.test(message.content || ""));
    })());

    console.log("PASS80_THREAD_RESUME_LIFECYCLE_DONE");
    cleanup();
    app.exit(0);
  } catch (error) {
    console.error("PASS80_THREAD_RESUME_LIFECYCLE_FAILED", error?.stack || error);
    cleanup();
    app.exit(1);
  }
});

setTimeout(() => {
  console.error("PASS80_THREAD_RESUME_LIFECYCLE_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
