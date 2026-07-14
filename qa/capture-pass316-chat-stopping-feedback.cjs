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
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass316-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass316-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass316-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const STOPPING_PROMPT = "pass316 stopping feedback";

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
if (args[0] === '-p' && /pass316 stopping feedback/.test(String(args[1] || ''))) {
  out({ type: 'system', subtype: 'init', session_id: 'pass316-session', claude_code_version: '2.9.0' });
  out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'pass316 partial assistant' } } });
  setInterval(() => {}, 1000);
} else if (args[0] === '--version') out('2.9.0 (Claude Code PASS316)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'pass316-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'mcp' && args[1] === 'list') out('pass316-mcp connected');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else out('pass316 generic');
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass316-project" }), "utf8");
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
    activeProject: { name: "pass316-project", path: PROJECT_DIR },
    projects: [{ name: "pass316-project", path: PROJECT_DIR }],
    sessions: [{ id: "default", title: "新聊天", project: "pass316-project", projectPath: PROJECT_DIR, createdAt: "2026-07-15T00:00:00.000Z", updatedAt: "2026-07-15T00:00:00.000Z", messages: [] }],
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

async function captureStoppingFeedback(win) {
  return win.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const button = Array.from(document.querySelectorAll('.message.assistant .message-meta button'))
        .find((item) => /停止|取消|cancel/i.test(item.textContent || ''));
      if (!button) {
        resolve({ clicked: false });
        return;
      }
      button.click();
      setTimeout(() => {
        const streamingMessage = Array.from(document.querySelectorAll('.message.assistant'))
          .find((item) => /pass316 partial assistant/.test(item.textContent || ''));
        const messageButton = streamingMessage?.querySelector('.message-meta button');
        const composerButton = document.querySelector('.prompt-box .send-button');
        resolve({
          clicked: true,
          partialVisible: /pass316 partial assistant/.test(streamingMessage?.textContent || ''),
          stoppingVisible: /正在停止|stopping/i.test(streamingMessage?.textContent || ''),
          messageButtonDisabled: Boolean(messageButton?.disabled),
          composerButtonDisabled: Boolean(composerButton?.disabled),
        });
      }, 0);
    })
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS316_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(600);

  assertStep("PASS316_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS316_HAIKU_45", await win.webContents.executeJavaScript(`window.claudexDesktop.getState().then((state) => state.settings?.model === 'claude-haiku-4-5-20251001')`));
  assertStep("PASS316_SET_STOPPING_PROMPT", await setComposer(win, STOPPING_PROMPT));
  assertStep("PASS316_SEND_STOPPING_PROMPT", await clickSend(win));
  const requestId = await waitFor(win, `
    window.claudexDesktop.getState().then((state) => state.runEvents?.find((event) =>
      event.type === 'chat' && event.status === 'running' && /pass316 stopping feedback/.test(event.detail || '')
    )?.id || false)
  `, 10000);
  assertStep("PASS316_CHAT_RUNNING_EVENT", Boolean(requestId));
  assertStep("PASS316_PARTIAL_STREAM_VISIBLE", await waitFor(win, `
    Array.from(document.querySelectorAll('.message.assistant')).some((message) => /pass316 partial assistant/.test(message.textContent || ''))
  `, 10000));
  const feedback = await captureStoppingFeedback(win);
  assertStep("PASS316_CANCEL_CLICKED", feedback?.clicked === true);
  assertStep("PASS316_PARTIAL_CONTENT_PRESERVED", feedback?.partialVisible === true);
  assertStep("PASS316_STOPPING_STATUS_VISIBLE", feedback?.stoppingVisible === true);
  assertStep("PASS316_MESSAGE_CANCEL_DISABLED", feedback?.messageButtonDisabled === true);
  assertStep("PASS316_COMPOSER_CANCEL_DISABLED", feedback?.composerButtonDisabled === true);
  win.webContents.send("chat:stream-event", { requestId, sessionId: "default", type: "delta", text: " pass316 late delta" });
  win.webContents.send("chat:stream-event", { requestId, sessionId: "default", type: "status", text: "pass316 late status" });
  await wait(20);
  const stableFeedback = await win.webContents.executeJavaScript(`
    (() => {
      const streamingMessage = Array.from(document.querySelectorAll('.message.assistant'))
        .find((item) => /pass316 partial assistant/.test(item.textContent || ''));
      const messageButton = streamingMessage?.querySelector('.message-meta button');
      const composerButton = document.querySelector('.prompt-box .send-button');
      return {
        exists: Boolean(streamingMessage),
        stoppingVisible: Boolean(streamingMessage?.querySelector('.streaming-status')),
        lateDeltaIgnored: !/pass316 late delta/.test(streamingMessage?.textContent || ''),
        lateStatusIgnored: !/pass316 late status/.test(streamingMessage?.textContent || ''),
        messageButtonDisabled: Boolean(messageButton?.disabled),
        composerButtonDisabled: Boolean(composerButton?.disabled),
      };
    })()
  `);
  assertStep("PASS316_LATE_STREAM_STOPPING_STABLE", stableFeedback?.exists === true && stableFeedback?.stoppingVisible === true);
  assertStep("PASS316_LATE_STREAM_IGNORED", stableFeedback?.lateDeltaIgnored === true && stableFeedback?.lateStatusIgnored === true);
  assertStep("PASS316_LATE_STREAM_CANCELS_DISABLED", stableFeedback?.messageButtonDisabled === true && stableFeedback?.composerButtonDisabled === true);
  assertStep("PASS316_CANCELLED_STATE_PERSISTED", await waitForStore((state) => {
    const session = state.sessions?.find((item) => item.id === "default");
    const event = state.runEvents?.find((item) => item.id === requestId);
    return session?.claudeSessionId === "pass316-session" &&
      event?.type === "chat" && event.status === "cancelled" &&
      session?.messages?.some((message) => message.role === "cancelled" && message.requestId === requestId) &&
      !session?.messages?.some((message) => message.role === "error");
  }, 10000));
  assertStep("PASS316_CANCELLED_MESSAGE_VISIBLE", await waitFor(win, `
    Boolean(document.querySelector('.message.cancelled') && /已停止|已取消/.test(document.querySelector('.message.cancelled')?.textContent || ''))
  `, 15000));

  console.log("PASS316_CHAT_STOPPING_FEEDBACK_DONE");
  await exitWithCleanup(0);
}

const fakeClaudeCommand = writeFakeClaude();
app.setPath("userData", USER_DATA_DIR);
writeInitialStore(fakeClaudeCommand);
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS316_FAILED", error?.stack || error);
  void exitWithCleanup(1);
});

setTimeout(() => {
  console.error("PASS316_TIMEOUT");
  void exitWithCleanup(1);
}, 120000);
