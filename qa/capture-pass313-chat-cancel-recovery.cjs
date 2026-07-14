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
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass313-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass313-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass313-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const CANCEL_PROMPT = "pass313 cancel this response";
const RECOVERY_PROMPT = "pass313 after cancel";

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
const args = process.argv.slice(2);
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value) + '\\n'); }
if (args[0] === '-p' && /pass313 cancel this response/.test(String(args[1] || ''))) {
  out({ type: 'assistant', message: { content: [{ type: 'text', text: 'pass313 partial assistant' }] } });
  setInterval(() => {}, 1000);
} else if (args[0] === '-p' && /pass313 after cancel/.test(String(args[1] || ''))) {
  out({ type: 'result', result: 'pass313 recovered assistant', session_id: 'pass313-claude-session' });
} else if (args[0] === '--version') out('2.9.0 (Claude Code PASS313)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'pass313-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'mcp' && args[1] === 'list') out('pass313-mcp connected');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else out('pass313 generic');
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass313-project" }), "utf8");
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
    activeProject: { name: "pass313-project", path: PROJECT_DIR },
    projects: [{ name: "pass313-project", path: PROJECT_DIR }],
    sessions: [{ id: "default", title: "新聊天", project: "pass313-project", projectPath: PROJECT_DIR, createdAt: "2026-07-14T00:00:00.000Z", updatedAt: "2026-07-14T00:00:00.000Z", messages: [] }],
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

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS313_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(600);

  assertStep("PASS313_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS313_HAIKU_45", await win.webContents.executeJavaScript(`window.claudexDesktop.getState().then((state) => state.settings?.model === 'claude-haiku-4-5-20251001')`));
  assertStep("PASS313_SET_CANCEL_PROMPT", await setComposer(win, CANCEL_PROMPT));
  assertStep("PASS313_SEND_CANCEL_PROMPT", await clickSend(win));
  const requestId = await waitFor(win, `
    window.claudexDesktop.getState().then((state) => state.runEvents?.find((event) => event.type === 'chat' && event.status === 'running')?.id || false)
  `, 10000);
  assertStep("PASS313_CHAT_RUNNING_EVENT", Boolean(requestId));
  assertStep("PASS313_CHAT_STOP_VISIBLE", await waitFor(win, `
    Boolean(document.querySelector('.message.assistant .message-meta button') && document.querySelector('.prompt-box .send-button[aria-label]'))
  `, 10000));
  assertStep("PASS313_CANCEL_CLICKED", await win.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector('.message.assistant .message-meta button');
      if (!button) return false;
      button.click();
      return true;
    })()
  `));
  assertStep("PASS313_CANCELLED_MESSAGE_VISIBLE", await waitFor(win, `
    Boolean(document.querySelector('.message.cancelled') && /已停止|已取消/.test(document.querySelector('.message.cancelled')?.textContent || '') && !document.querySelector('.message.error'))
  `, 15000));
  assertStep("PASS313_CANCELLED_STATE_PERSISTED", await waitForStore((state) => {
    const session = state.sessions?.find((item) => item.id === "default");
    const cancelled = session?.messages?.filter((message) => message.role === "cancelled" && message.requestId === requestId) || [];
    const errors = session?.messages?.filter((message) => message.role === "error") || [];
    const event = state.runEvents?.find((item) => item.id === requestId);
    return cancelled.length === 1 && errors.length === 0 && event?.type === "chat" && event.status === "cancelled" && event.sessionId === "default";
  }, 10000));
  win.webContents.reload();
  assertStep("PASS313_RELOAD", true);
  assertStep("PASS313_RELOAD_CANCELLED_VISIBLE", await waitFor(win, `
    Boolean(document.querySelector('.message.cancelled') && /已停止|已取消/.test(document.querySelector('.message.cancelled')?.textContent || '') && !document.querySelector('[data-error-action="retry"]'))
  `, 15000));
  assertStep("PASS313_SET_RECOVERY_PROMPT", await setComposer(win, RECOVERY_PROMPT));
  assertStep("PASS313_SEND_RECOVERY_PROMPT", await clickSend(win));
  assertStep("PASS313_RECOVERY_ASSISTANT_VISIBLE", await waitFor(win, `
    Array.from(document.querySelectorAll('.message.assistant')).some((message) => /pass313 recovered assistant/.test(message.textContent || ''))
  `, 15000));
  assertStep("PASS313_RECOVERY_STATE_PERSISTED", await waitForStore((state) => {
    const session = state.sessions?.find((item) => item.id === "default");
    const messages = session?.messages || [];
    const recoveryEvent = (state.runEvents || []).find((event) => event.type === "chat" && event.id !== requestId && event.status === "ok");
    return session?.claudeSessionId === "pass313-claude-session" &&
      messages.filter((message) => message.role === "cancelled").length === 1 &&
      messages.filter((message) => message.role === "error").length === 0 &&
      messages.some((message) => message.role === "assistant" && /pass313 recovered assistant/.test(message.content || "")) &&
      Boolean(recoveryEvent);
  }, 10000));

  console.log("PASS313_CHAT_CANCEL_RECOVERY_DONE");
  await exitWithCleanup(0);
}

const fakeClaudeCommand = writeFakeClaude();
app.setPath("userData", USER_DATA_DIR);
writeInitialStore(fakeClaudeCommand);
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS313_FAILED", error?.stack || error);
  void exitWithCleanup(1);
});

setTimeout(() => {
  console.error("PASS313_TIMEOUT");
  void exitWithCleanup(1);
}, 120000);
