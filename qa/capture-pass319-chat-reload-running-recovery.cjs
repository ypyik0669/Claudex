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
  const candidates = [process.env.CLAUDEX_REPO_DIR, process.cwd(), __dirname, path.join(__dirname, "..")].filter(Boolean);
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
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass319-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass319-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass319-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const RUN_PROMPT = "pass319 reload while running";
const RECOVERY_PROMPT = "pass319 after reload cancel";

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
          const activeIds = (state.activeChatRequests || []).map((item) => item?.requestId);
          const runningIds = (state.runEvents || [])
            .filter((event) => event?.type === 'chat' && event?.status === 'running')
            .map((event) => event?.id);
          for (const requestId of Array.from(new Set([...activeIds, ...runningIds])).filter(Boolean)) {
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
  process.exit(code);
}

async function waitFor(win, script, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const value = await win.webContents.executeJavaScript(script);
      if (value) return value;
    } catch (_error) {
      // Renderer reload can briefly invalidate the execution context.
    }
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
      // Store may be between writes.
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
if (args[0] === '-p' && /pass319 reload while running/.test(String(args[1] || ''))) {
  out({ type: 'system', subtype: 'init', session_id: 'pass319-session', claude_code_version: '2.9.0' });
  out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'pass319 before reload' } } });
  setTimeout(() => {
    out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: ' pass319 after reload stream' } } });
  }, 3000);
  setInterval(() => {}, 1000);
} else if (args[0] === '-p' && /pass319 after reload cancel/.test(String(args[1] || ''))) {
  out({ type: 'result', result: 'pass319 recovered assistant', session_id: 'pass319-session' });
} else if (args[0] === '--version') out('2.9.0 (Claude Code PASS319)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'pass319-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'mcp' && args[1] === 'list') out('pass319-mcp connected');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else out('pass319 generic');
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass319-project" }), "utf8");
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
    activeProject: { name: "pass319-project", path: PROJECT_DIR },
    projects: [{ name: "pass319-project", path: PROJECT_DIR }],
    sessions: [{
      id: "default",
      title: "新聊天",
      project: "pass319-project",
      projectPath: PROJECT_DIR,
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z",
      messages: [],
    }],
    automations: [],
    subagentRuns: [],
    commandRuns: [],
    runEvents: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
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

async function reloadWindow(win) {
  const loaded = new Promise((resolve) => win.webContents.once("did-finish-load", resolve));
  win.webContents.reload();
  await loaded;
}

async function captureCancelFeedback(win) {
  return win.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const message = Array.from(document.querySelectorAll('.message.assistant'))
        .find((item) => /pass319 after reload stream/.test(item.textContent || ''));
      const button = message?.querySelector('.message-meta button');
      if (!button || button.disabled) {
        resolve({ clicked: false });
        return;
      }
      button.click();
      setTimeout(() => {
        const currentMessage = Array.from(document.querySelectorAll('.message.assistant'))
          .find((item) => /pass319 after reload stream/.test(item.textContent || ''));
        resolve({
          clicked: true,
          stoppingVisible: Boolean(currentMessage?.querySelector('.streaming-status')),
          messageButtonDisabled: Boolean(currentMessage?.querySelector('.message-meta button')?.disabled),
          composerButtonDisabled: Boolean(document.querySelector('.prompt-box .send-button')?.disabled),
        });
      }, 0);
    })
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS319_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(600);

  assertStep("PASS319_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS319_HAIKU_45", await win.webContents.executeJavaScript(`window.claudexDesktop.getState().then((state) => state.settings?.model === 'claude-haiku-4-5-20251001')`));
  assertStep("PASS319_SET_RUNNING_PROMPT", await setComposer(win, RUN_PROMPT));
  assertStep("PASS319_SEND_RUNNING_PROMPT", await clickSend(win));
  const requestId = await waitFor(win, `
    window.claudexDesktop.getState().then((state) => state.runEvents?.find((event) =>
      event.type === 'chat' && event.status === 'running' && /pass319 reload while running/.test(event.detail || '')
    )?.id || false)
  `, 10000);
  assertStep("PASS319_CHAT_RUNNING_EVENT", Boolean(requestId));
  assertStep("PASS319_PRE_RELOAD_STREAM_VISIBLE", await waitFor(win, `
    Array.from(document.querySelectorAll('.message.assistant')).some((message) => /pass319 before reload/.test(message.textContent || ''))
  `, 10000));
  assertStep("PASS319_PRE_RELOAD_USER_PERSISTED", await waitForStore((state) => {
    const messages = state.sessions?.find((item) => item.id === "default")?.messages || [];
    return messages.filter((message) => message.role === "user" && message.content === RUN_PROMPT).length === 1;
  }));

  await reloadWindow(win);
  assertStep("PASS319_RELOAD_FINISHED", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS319_RELOAD_ACTIVE_RUNTIME_VISIBLE", await waitFor(win, `
    window.claudexDesktop.getState().then((state) => (state.activeChatRequests || []).some((item) =>
      item?.requestId === ${JSON.stringify(requestId)} && item?.sessionId === 'default' && item?.status === 'running'
    ))
  `, 10000));
  const reloadBusyVisible = await waitFor(win, `
    (() => {
      const messageButton = document.querySelector('.message.assistant .message-meta button');
      const composerButton = document.querySelector('.prompt-box .send-button');
      return Boolean(messageButton && !messageButton.disabled && composerButton && !composerButton.disabled);
    })()
  `, 10000);
  if (!reloadBusyVisible) {
    const debug = await win.webContents.executeJavaScript(`
      window.claudexDesktop.getState().then((state) => ({
        activeChatRequests: state.activeChatRequests,
        messageClasses: Array.from(document.querySelectorAll('.message')).map((item) => item.className),
        assistantButtons: Array.from(document.querySelectorAll('.message.assistant .message-meta button')).map((item) => ({
          text: item.textContent,
          disabled: item.disabled,
        })),
        composerButton: (() => {
          const item = document.querySelector('.prompt-box .send-button');
          return item ? { disabled: item.disabled, ariaLabel: item.getAttribute('aria-label') } : null;
        })(),
        bodyText: (document.body.textContent || '').slice(-800),
      }))
    `);
    console.log("PASS319_RELOAD_BUSY_DEBUG", JSON.stringify(debug));
  }
  assertStep("PASS319_RELOAD_BUSY_CANCEL_VISIBLE", reloadBusyVisible);
  assertStep("PASS319_POST_RELOAD_STREAM_VISIBLE", await waitFor(win, `
    Array.from(document.querySelectorAll('.message.assistant')).some((message) => /pass319 after reload stream/.test(message.textContent || ''))
  `, 12000));
  assertStep("PASS319_RELOAD_USER_NOT_DUPLICATED", await waitForStore((state) => {
    const messages = state.sessions?.find((item) => item.id === "default")?.messages || [];
    return messages.filter((message) => message.role === "user" && message.content === RUN_PROMPT).length === 1;
  }));

  const feedback = await captureCancelFeedback(win);
  assertStep("PASS319_RELOAD_CANCEL_CLICKED", feedback?.clicked === true);
  assertStep("PASS319_RELOAD_STOPPING_VISIBLE", feedback?.stoppingVisible === true);
  assertStep("PASS319_RELOAD_CANCELS_DISABLED", feedback?.messageButtonDisabled === true && feedback?.composerButtonDisabled === true);
  assertStep("PASS319_CANCELLED_STATE_PERSISTED", await waitForStore((state) => {
    const session = state.sessions?.find((item) => item.id === "default");
    const event = state.runEvents?.find((item) => item.id === requestId);
    const messages = session?.messages || [];
    return session?.claudeSessionId === "pass319-session" &&
      event?.type === "chat" && event.status === "cancelled" &&
      messages.filter((message) => message.role === "cancelled" && message.requestId === requestId).length === 1 &&
      messages.filter((message) => message.role === "error").length === 0;
  }, 15000));
  assertStep("PASS319_CANCELLED_MESSAGE_VISIBLE", await waitFor(win, `
    Boolean(document.querySelector('.message.cancelled') && !document.querySelector('.message.error'))
  `, 15000));
  assertStep("PASS319_RUNTIME_CLEARED", await waitFor(win, `
    window.claudexDesktop.getState().then((state) => !(state.activeChatRequests || []).some((item) =>
      item?.requestId === ${JSON.stringify(requestId)}
    ))
  `, 10000));

  assertStep("PASS319_SET_RECOVERY_PROMPT", await setComposer(win, RECOVERY_PROMPT));
  assertStep("PASS319_SEND_RECOVERY_PROMPT", await clickSend(win));
  assertStep("PASS319_RECOVERY_ASSISTANT_VISIBLE", await waitFor(win, `
    Array.from(document.querySelectorAll('.message.assistant')).some((message) => /pass319 recovered assistant/.test(message.textContent || ''))
  `, 15000));
  assertStep("PASS319_RECOVERY_STATE_PERSISTED", await waitForStore((state) => {
    const session = state.sessions?.find((item) => item.id === "default");
    const messages = session?.messages || [];
    return messages.filter((message) => message.role === "cancelled").length === 1 &&
      messages.filter((message) => message.role === "error").length === 0 &&
      messages.some((message) => message.role === "assistant" && /pass319 recovered assistant/.test(message.content || ""));
  }, 10000));

  console.log("PASS319_CHAT_RELOAD_RUNNING_RECOVERY_DONE");
  await exitWithCleanup(0);
}

const fakeClaudeCommand = writeFakeClaude();
app.setPath("userData", USER_DATA_DIR);
writeInitialStore(fakeClaudeCommand);
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS319_FAILED", error?.stack || error);
  void exitWithCleanup(1);
});

setTimeout(() => {
  console.error("PASS319_TIMEOUT");
  void exitWithCleanup(1);
}, 120000);
