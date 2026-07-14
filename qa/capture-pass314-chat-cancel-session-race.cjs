const fs = require("fs");
const os = require("os");
const path = require("path");

for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", (error) => {
    if (error?.code !== "EPIPE") throw error;
  });
}

const { app, BrowserWindow } = require("electron");

function findRepoDir() {
  const candidates = [process.env.CLAUDEX_REPO_DIR, process.cwd(), __dirname, path.join(__dirname, "..")] .filter(Boolean);
  for (const candidate of candidates) {
    let current = path.resolve(candidate);
    while (current && current !== path.dirname(current)) {
      if (fs.existsSync(path.join(current, "package.json")) && fs.existsSync(path.join(current, "electron", "main.cjs"))) return current;
      current = path.dirname(current);
    }
  }
  throw new Error("Unable to locate Claudex repo root");
}

const REPO_DIR = findRepoDir();
process.chdir(REPO_DIR);
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass314-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass314-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass314-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const COMMAND_LOG = path.join(USER_DATA_DIR, "pass314-command-log.jsonl");
const CANCEL_PROMPT = "pass314 cancel with session";
const RECOVERY_PROMPT = "pass314 resume after cancel";
const RACE_ERROR_PROMPT = "pass314 late error";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_DIR]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_error) {
      // Best-effort cleanup for Windows file-handle races.
    }
  }
}

async function exitWithCleanup(code) {
  let windows = [];
  try {
    windows = BrowserWindow.getAllWindows();
  } catch (_error) {
    // Electron may already be tearing down.
  }
  for (const win of windows) {
    try {
      if (win.isDestroyed() || win.webContents.isDestroyed()) continue;
      await win.webContents.executeJavaScript(`
        (async () => {
          const desktop = window.claudexDesktop;
          if (!desktop?.getState || !desktop?.cancelRequest) return;
          const state = await desktop.getState();
          const ids = Array.from(new Set((state.runEvents || [])
            .filter((event) => event?.type === 'chat' && event?.status === 'running')
            .map((event) => event?.id)
            .filter(Boolean)));
          for (const requestId of ids) {
            try { await desktop.cancelRequest(requestId); } catch (_error) {}
          }
        })()
      `);
    } catch (_error) {
      // Renderer teardown may race cleanup.
    }
  }
  await wait(500);
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win.isDestroyed()) win.destroy();
    } catch (_error) {
      // Best-effort teardown.
    }
  }
  await wait(250);
  cleanup();
  app.exit(code);
}

async function waitFor(win, script, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await win.webContents.executeJavaScript(script);
    if (value) return value;
    await wait(120);
  }
  return false;
}

async function waitForStore(predicate, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const state = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      if (predicate(state)) return true;
    } catch (_error) {
      // Store may be between atomic writes.
    }
    await wait(120);
  }
  return false;
}

function assertStep(name, ok) {
  console.log(name, ok);
  if (!ok) throw new Error(`${name} failed`);
}

function writeFakeClaude() {
  const script = `
const fs = require('fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(COMMAND_LOG)}, JSON.stringify(args) + '\\n', 'utf8');
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value) + '\\n'); }
if (args[0] === '-p' && /pass314 cancel with session/.test(String(args[1] || ''))) {
  out({ type: 'system', subtype: 'init', session_id: 'pass314-cancelled-session', claude_code_version: '2.9.0' });
  out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'pass314 partial assistant' } } });
  setInterval(() => {}, 1000);
} else if (args[0] === '-p' && /pass314 resume after cancel/.test(String(args[1] || ''))) {
  const resumeIndex = args.indexOf('--resume');
  if (resumeIndex >= 0 && args[resumeIndex + 1] === 'pass314-cancelled-session') {
    out({ type: 'result', result: 'pass314 resumed assistant', session_id: 'pass314-cancelled-session' });
  } else {
    out({ type: 'result', is_error: true, result: 'pass314 missing cancelled-session resume' });
  }
} else if (args[0] === '-p' && /pass314 late error/.test(String(args[1] || ''))) {
  out({ type: 'result', is_error: true, result: 'pass314 late failure', session_id: 'pass314-race-session' });
  setInterval(() => {}, 1000);
} else if (args[0] === '--version') out('2.9.0 (Claude Code PASS314)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'pass314-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'mcp' && args[1] === 'list') out('pass314-mcp connected');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else out('pass314 generic');
`;
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), script, "utf8");
  const command = path.join(FAKE_BIN_DIR, "claude.cmd");
  fs.writeFileSync(command, `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
  return command;
}

function writeInitialStore(claudeCommand) {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass314-project" }), "utf8");
  fs.writeFileSync(DATA_FILE, JSON.stringify({
    version: 1,
    settings: {
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      baseUrl: "https://api.example.invalid",
      temperature: 0.2,
      timeoutMs: 600000,
      language: "zh",
      appearance: { fontSize: "compact", density: "compact" },
      claudeCode: { executionMode: "claude-code", claudeCommand, permissionMode: "default" },
      capabilities: { "project-context": true, "terminal-helper": true, "mcp-runtime": true, "plugin-router": true, "marketplace-router": true },
      customMarketplaces: [],
      apiKeys: {},
    },
    activeProject: { name: "pass314-project", path: PROJECT_DIR },
    projects: [{ name: "pass314-project", path: PROJECT_DIR }],
    sessions: [{ id: "default", title: "新聊天", project: "pass314-project", projectPath: PROJECT_DIR, createdAt: "2026-07-14T00:00:00.000Z", updatedAt: "2026-07-14T00:00:00.000Z", messages: [] }],
    automations: [], subagentRuns: [], commandRuns: [], runEvents: [], sourceRefs: [], browserVisits: [], notices: [],
  }, null, 2), "utf8");
}

async function setComposer(win, value) {
  return win.webContents.executeJavaScript(`
    (() => {
      const textarea = document.querySelector('.prompt-box textarea');
      if (!textarea) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(textarea, ${JSON.stringify(value)});
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()
  `);
}

async function clickSend(win) {
  return win.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector('.prompt-box .send-button');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })()
  `);
}

async function clickChatCancel(win) {
  return win.webContents.executeJavaScript(`
    (() => {
      const button = Array.from(document.querySelectorAll('.message.assistant .message-meta button'))
        .find((item) => /停止|取消|cancel/i.test(item.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })()
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS314_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(600);

  assertStep("PASS314_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS314_HAIKU_45", await win.webContents.executeJavaScript(`window.claudexDesktop.getState().then((state) => state.settings?.model === 'claude-haiku-4-5-20251001')`));
  assertStep("PASS314_SET_CANCEL_PROMPT", await setComposer(win, CANCEL_PROMPT));
  assertStep("PASS314_SEND_CANCEL_PROMPT", await clickSend(win));
  const requestId = await waitFor(win, `
    window.claudexDesktop.getState().then((state) => state.runEvents?.find((event) =>
      event.type === 'chat' && event.status === 'running' && /pass314 cancel with session/.test(event.detail || '')
    )?.id || false)
  `, 10000);
  assertStep("PASS314_CHAT_RUNNING_EVENT", Boolean(requestId));
  assertStep("PASS314_CHAT_STOP_VISIBLE", await waitFor(win, `
    Boolean(document.querySelector('.message.assistant .message-meta button') && document.querySelector('.prompt-box .send-button[aria-label]'))
  `, 10000));
  assertStep("PASS314_CANCEL_CLICKED", await clickChatCancel(win));
  assertStep("PASS314_CANCELLED_MESSAGE_VISIBLE", await waitFor(win, `
    Boolean(document.querySelector('.message.cancelled') && /已停止|已取消/.test(document.querySelector('.message.cancelled')?.textContent || '') && !document.querySelector('.message.error'))
  `, 15000));
  assertStep("PASS314_CANCELLED_SESSION_PERSISTED", await waitForStore((state) => {
    const session = state.sessions?.find((item) => item.id === "default");
    const cancelled = session?.messages?.filter((message) => message.role === "cancelled" && message.requestId === requestId) || [];
    const errors = session?.messages?.filter((message) => message.role === "error") || [];
    const event = state.runEvents?.find((item) => item.id === requestId);
    return session?.claudeSessionId === "pass314-cancelled-session" &&
      cancelled.length === 1 && errors.length === 0 &&
      event?.type === "chat" && event.status === "cancelled" && event.sessionId === "default";
  }, 10000));
  win.webContents.reload();
  assertStep("PASS314_RELOAD", true);
  assertStep("PASS314_RELOAD_CANCELLED_VISIBLE", await waitFor(win, `
    Boolean(document.querySelector('.message.cancelled') && /已停止|已取消/.test(document.querySelector('.message.cancelled')?.textContent || '') && !document.querySelector('[data-error-action="retry"]'))
  `, 15000));
  assertStep("PASS314_SET_RECOVERY_PROMPT", await setComposer(win, RECOVERY_PROMPT));
  assertStep("PASS314_SEND_RECOVERY_PROMPT", await clickSend(win));
  assertStep("PASS314_RECOVERY_ASSISTANT_VISIBLE", await waitFor(win, `
    Array.from(document.querySelectorAll('.message.assistant')).some((message) => /pass314 resumed assistant/.test(message.textContent || ''))
  `, 15000));
  assertStep("PASS314_RECOVERY_USED_CANCELLED_SESSION", (() => {
    const entries = fs.readFileSync(COMMAND_LOG, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    const args = entries.find((entry) => entry[0] === "-p" && /pass314 resume after cancel/.test(entry[1] || ""));
    const resumeIndex = Array.isArray(args) ? args.indexOf("--resume") : -1;
    return resumeIndex >= 0 && args[resumeIndex + 1] === "pass314-cancelled-session";
  })());
  assertStep("PASS314_RECOVERY_STATE_PERSISTED", await waitForStore((state) => {
    const session = state.sessions?.find((item) => item.id === "default");
    const messages = session?.messages || [];
    const recoveryEvent = (state.runEvents || []).find((event) => event.type === "chat" && event.id !== requestId && event.status === "ok");
    return session?.claudeSessionId === "pass314-cancelled-session" &&
      messages.filter((message) => message.role === "cancelled").length === 1 &&
      messages.filter((message) => message.role === "error").length === 0 &&
      messages.some((message) => message.role === "assistant" && /pass314 resumed assistant/.test(message.content || "")) &&
      Boolean(recoveryEvent);
  }, 10000));

  assertStep("PASS314_RACE_STREAM_PROBE", await win.webContents.executeJavaScript(`
    (() => {
      window.__pass314RaceErrorSeen = false;
      window.__pass314RaceUnsubscribe?.();
      window.__pass314RaceUnsubscribe = window.claudexDesktop.onChatStream((event) => {
        if (event?.type === 'error' && /pass314 late failure/.test(event.text || '')) {
          window.__pass314RaceErrorSeen = true;
        }
      });
      return true;
    })()
  `));
  assertStep("PASS314_SET_RACE_ERROR_PROMPT", await setComposer(win, RACE_ERROR_PROMPT));
  assertStep("PASS314_SEND_RACE_ERROR_PROMPT", await clickSend(win));
  const raceRequestId = await waitFor(win, `
    window.claudexDesktop.getState().then((state) => state.runEvents?.find((event) =>
      event.type === 'chat' && event.status === 'running' && /pass314 late error/.test(event.detail || '')
    )?.id || false)
  `, 10000);
  assertStep("PASS314_RACE_RUNNING_EVENT", Boolean(raceRequestId));
  assertStep("PASS314_RACE_ERROR_RESULT_READY", await waitFor(win, "Boolean(window.__pass314RaceErrorSeen)", 10000));
  assertStep("PASS314_RACE_CANCEL_CLICKED", await clickChatCancel(win));
  assertStep("PASS314_RACE_ERROR_WINS", await waitForStore((state) => {
    const session = state.sessions?.find((item) => item.id === "default");
    const event = state.runEvents?.find((item) => item.id === raceRequestId);
    return event?.type === "chat" && event.status === "error" &&
      session?.messages?.filter((message) => message.role === "cancelled").length === 1 &&
      !session?.messages?.some((message) => message.role === "cancelled" && message.requestId === raceRequestId) &&
      session?.messages?.some((message) => message.role === "error" && /pass314 late failure/.test(message.content || ""));
  }, 10000));
  assertStep("PASS314_RACE_ERROR_VISIBLE", await waitFor(win, `
    Array.from(document.querySelectorAll('.message.error')).some((message) => /pass314 late failure/.test(message.textContent || ''))
  `, 15000));

  console.log("PASS314_CHAT_CANCEL_SESSION_RACE_DONE");
  await exitWithCleanup(0);
}

const fakeClaudeCommand = writeFakeClaude();
app.setPath("userData", USER_DATA_DIR);
writeInitialStore(fakeClaudeCommand);
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS314_FAILED", error?.stack || error);
  void exitWithCleanup(1);
});

setTimeout(() => {
  console.error("PASS314_TIMEOUT");
  void exitWithCleanup(1);
}, 120000);
