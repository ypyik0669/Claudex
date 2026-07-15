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
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass320-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass320-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass320-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const RUN_PROMPT = "pass320 reload while running";
const RECOVERY_PROMPT = "pass320 after reload cancel";

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
if (args[0] === '-p' && /pass320 reload while running/.test(String(args[1] || ''))) {
  out({ type: 'system', subtype: 'init', session_id: 'pass320-session', claude_code_version: '2.9.0' });
  out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'pass320 before reload' } } });
  setTimeout(() => {
    out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: ' pass320 after reload stream' } } });
  }, 3000);
  setInterval(() => {}, 1000);
} else if (args[0] === '-p' && /pass320 after reload cancel/.test(String(args[1] || ''))) {
  out({ type: 'result', result: 'pass320 recovered assistant', session_id: 'pass320-session' });
} else if (args[0] === '--version') out('2.9.0 (Claude Code PASS320)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'pass320-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'mcp' && args[1] === 'list') out('pass320-mcp connected');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else out('pass320 generic');
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass320-project" }), "utf8");
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
    activeProject: { name: "pass320-project", path: PROJECT_DIR },
    projects: [{ name: "pass320-project", path: PROJECT_DIR }],
    sessions: [
      {
        id: "default",
        title: "Thread A",
        project: "pass320-project",
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-15T00:00:00.000Z",
        updatedAt: "2026-07-15T00:00:00.000Z",
        messages: [],
      },
      {
        id: "secondary",
        title: "Thread B",
        project: "pass320-project",
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-14T23:59:00.000Z",
        updatedAt: "2026-07-14T23:59:00.000Z",
        messages: [
          { role: "user", content: "pass320 secondary existing", createdAt: "2026-07-14T23:59:01.000Z" },
          { role: "assistant", content: "pass320 secondary reply", createdAt: "2026-07-14T23:59:02.000Z" },
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

async function openThread(win, sessionId) {
  return win.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector(${JSON.stringify(`.thread-item[data-thread-id="${sessionId}"] .thread-open-button`)});
      if (!button) return false;
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
        .find((item) => /pass320 after reload stream/.test(item.textContent || ''));
      const button = message?.querySelector('.message-meta button');
      if (!button || button.disabled) {
        resolve({ clicked: false });
        return;
      }
      button.click();
      setTimeout(() => {
        const currentMessage = Array.from(document.querySelectorAll('.message.assistant'))
          .find((item) => /pass320 after reload stream/.test(item.textContent || ''));
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
  if (!win) throw new Error("PASS320_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(600);

  assertStep("PASS320_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS320_HAIKU_45", await win.webContents.executeJavaScript(`window.claudexDesktop.getState().then((state) => state.settings?.model === 'claude-haiku-4-5-20251001')`));
  assertStep("PASS320_SET_RUNNING_PROMPT", await setComposer(win, RUN_PROMPT));
  assertStep("PASS320_SEND_RUNNING_PROMPT", await clickSend(win));
  const requestId = await waitFor(win, `
    window.claudexDesktop.getState().then((state) => state.runEvents?.find((event) =>
      event.type === 'chat' && event.status === 'running' && /pass320 reload while running/.test(event.detail || '')
    )?.id || false)
  `, 10000);
  assertStep("PASS320_CHAT_RUNNING_EVENT", Boolean(requestId));
  assertStep("PASS320_PRE_RELOAD_STREAM_VISIBLE", await waitFor(win, `
    Array.from(document.querySelectorAll('.message.assistant')).some((message) => /pass320 before reload/.test(message.textContent || ''))
  `, 10000));
  assertStep("PASS320_PRE_RELOAD_USER_PERSISTED", await waitForStore((state) => {
    const messages = state.sessions?.find((item) => item.id === "default")?.messages || [];
    return messages.filter((message) => message.role === "user" && message.content === RUN_PROMPT).length === 1;
  }));

  await reloadWindow(win);
  assertStep("PASS320_RELOAD_FINISHED", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS320_CAPTURE_RESUMABLE_STREAM_EVENTS", await win.webContents.executeJavaScript(`
    (() => {
      window.__pass320ChatEvents = [];
      window.__pass320DisposeChatCapture?.();
      window.__pass320DisposeChatCapture = window.claudexDesktop.onChatStream((event) => {
        window.__pass320ChatEvents.push(event);
      });
      return true;
    })()
  `));
  assertStep("PASS320_RELOAD_ACTIVE_RUNTIME_VISIBLE", await waitFor(win, `
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
    console.log("PASS320_RELOAD_BUSY_DEBUG", JSON.stringify(debug));
  }
  assertStep("PASS320_RELOAD_BUSY_CANCEL_VISIBLE", reloadBusyVisible);
  assertStep("PASS320_RELOAD_PARTIAL_AND_LIVE_STREAM_VISIBLE", await waitFor(win, `
    Array.from(document.querySelectorAll('.message.assistant')).some((message) =>
      /pass320 before reload/.test(message.textContent || '') &&
      /pass320 after reload stream/.test(message.textContent || '')
    )
  `, 12000));
  const resumableCheckpoint = await waitFor(win, `
    (() => {
      const event = [...(window.__pass320ChatEvents || [])].reverse().find((item) =>
        item?.requestId === ${JSON.stringify(requestId)} && item?.type === 'delta'
      );
      return Number(event?.streamRevision || 0) > 0 &&
        /pass320 before reload/.test(event?.content || '') &&
        /pass320 after reload stream/.test(event?.content || '')
        ? event
        : false;
    })()
  `, 10000);
  assertStep("PASS320_STREAM_EVENT_IS_RESUMABLE_CHECKPOINT", Boolean(resumableCheckpoint));
  assertStep("PASS320_RUNTIME_REVISION_COVERS_CHECKPOINT", await win.webContents.executeJavaScript(`
    window.claudexDesktop.getState().then((state) => {
      const active = (state.activeChatRequests || []).find((item) => item?.requestId === ${JSON.stringify(requestId)});
      return Number(active?.streamRevision || 0) >= ${JSON.stringify(Number(resumableCheckpoint?.streamRevision || 0))};
    })
  `));
  win.webContents.send("chat:stream-event", resumableCheckpoint);
  win.webContents.send("chat:stream-event", resumableCheckpoint);
  await wait(80);
  assertStep("PASS320_DUPLICATE_STREAM_CHECKPOINT_IDEMPOTENT", await win.webContents.executeJavaScript(`
    (() => {
      const message = Array.from(document.querySelectorAll('.message.assistant'))
        .find((item) => /pass320 before reload/.test(item.textContent || ''));
      const text = message?.textContent || '';
      return text.split('pass320 after reload stream').length - 1 === 1;
    })()
  `));
  assertStep("PASS320_RELOAD_USER_NOT_DUPLICATED", await waitForStore((state) => {
    const messages = state.sessions?.find((item) => item.id === "default")?.messages || [];
    return messages.filter((message) => message.role === "user" && message.content === RUN_PROMPT).length === 1;
  }));

  assertStep("PASS320_OPEN_SECONDARY_THREAD", await openThread(win, "secondary"));
  assertStep("PASS320_SECONDARY_THREAD_ACTIVE", await waitFor(win, `
    Boolean(document.querySelector('.thread-item[data-thread-id="secondary"][data-thread-active="true"]'))
  `, 10000));
  assertStep("PASS320_SECONDARY_THREAD_ISOLATED", await waitFor(win, `
    (() => {
      const bodyText = document.querySelector('.conversation-shell')?.textContent || '';
      const composerButton = document.querySelector('.prompt-box .send-button');
      const runningThread = document.querySelector('.thread-item[data-thread-id="default"] .thread-stream-dot');
      const assistantMessages = Array.from(document.querySelectorAll('.message.assistant'));
      const hasCancelButton = assistantMessages.some((message) =>
        Array.from(message.querySelectorAll('.message-meta button')).some((button) => Boolean((button.textContent || '').trim()))
      );
      return /pass320 secondary existing/.test(bodyText) &&
        /pass320 secondary reply/.test(bodyText) &&
        !/pass320 before reload|pass320 after reload stream/.test(bodyText) &&
        assistantMessages.length === 1 &&
        !hasCancelButton &&
        Boolean(composerButton?.disabled) &&
        Boolean(runningThread);
    })()
  `, 10000));
  assertStep("PASS320_RETURN_RUNNING_THREAD", await openThread(win, "default"));
  assertStep("PASS320_RUNNING_THREAD_ACTIVE", await waitFor(win, `
    Boolean(document.querySelector('.thread-item[data-thread-id="default"][data-thread-active="true"]')) &&
    Array.from(document.querySelectorAll('.message.assistant')).some((message) => /pass320 after reload stream/.test(message.textContent || ''))
  `, 10000));

  const staleRunningState = await win.webContents.executeJavaScript(`window.claudexDesktop.getState()`);
  const feedback = await captureCancelFeedback(win);
  assertStep("PASS320_RELOAD_CANCEL_CLICKED", feedback?.clicked === true);
  assertStep("PASS320_RELOAD_STOPPING_VISIBLE", feedback?.stoppingVisible === true);
  assertStep("PASS320_RELOAD_CANCELS_DISABLED", feedback?.messageButtonDisabled === true && feedback?.composerButtonDisabled === true);
  win.webContents.send("app:state-updated", staleRunningState);
  await wait(40);
  assertStep("PASS320_STALE_RUNNING_DID_NOT_REENABLE_CANCEL", await win.webContents.executeJavaScript(`
    (() => {
      const message = Array.from(document.querySelectorAll('.message.assistant'))
        .find((item) => /pass320 after reload stream/.test(item.textContent || ''));
      if (!message) return Boolean(document.querySelector('.message.cancelled'));
      return Boolean(message.querySelector('.streaming-status')) &&
        Boolean(message.querySelector('.message-meta button')?.disabled) &&
        Boolean(document.querySelector('.prompt-box .send-button')?.disabled);
    })()
  `));
  assertStep("PASS320_CANCELLED_STATE_PERSISTED", await waitForStore((state) => {
    const session = state.sessions?.find((item) => item.id === "default");
    const event = state.runEvents?.find((item) => item.id === requestId);
    const messages = session?.messages || [];
    const secondary = state.sessions?.find((item) => item.id === "secondary");
    return session?.claudeSessionId === "pass320-session" &&
      event?.type === "chat" && event.status === "cancelled" && event.sessionId === "default" &&
      messages.filter((message) => message.role === "cancelled" && message.requestId === requestId).length === 1 &&
      messages.filter((message) => message.role === "error").length === 0 &&
      secondary?.messages?.length === 2 &&
      !secondary.messages.some((message) => message.role === "cancelled" || message.content === RUN_PROMPT);
  }, 15000));
  assertStep("PASS320_CANCELLED_MESSAGE_VISIBLE", await waitFor(win, `
    Boolean(document.querySelector('.message.cancelled') && !document.querySelector('.message.error'))
  `, 15000));
  assertStep("PASS320_RUNTIME_CLEARED", await waitFor(win, `
    window.claudexDesktop.getState().then((state) => !(state.activeChatRequests || []).some((item) =>
      item?.requestId === ${JSON.stringify(requestId)}
    ))
  `, 10000));

  assertStep("PASS320_SET_RECOVERY_PROMPT", await setComposer(win, RECOVERY_PROMPT));
  assertStep("PASS320_SEND_RECOVERY_PROMPT", await clickSend(win));
  assertStep("PASS320_RECOVERY_ASSISTANT_VISIBLE", await waitFor(win, `
    Array.from(document.querySelectorAll('.message.assistant')).some((message) => /pass320 recovered assistant/.test(message.textContent || ''))
  `, 15000));
  assertStep("PASS320_RECOVERY_STATE_PERSISTED", await waitForStore((state) => {
    const session = state.sessions?.find((item) => item.id === "default");
    const messages = session?.messages || [];
    return messages.filter((message) => message.role === "cancelled").length === 1 &&
      messages.filter((message) => message.role === "error").length === 0 &&
      messages.some((message) => message.role === "assistant" && /pass320 recovered assistant/.test(message.content || ""));
  }, 10000));

  console.log("PASS320_CHAT_RUNNING_THREAD_ISOLATION_DONE");
  await exitWithCleanup(0);
}

const fakeClaudeCommand = writeFakeClaude();
app.setPath("userData", USER_DATA_DIR);
writeInitialStore(fakeClaudeCommand);
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS320_FAILED", error?.stack || error);
  void exitWithCleanup(1);
});

setTimeout(() => {
  console.error("PASS320_TIMEOUT");
  void exitWithCleanup(1);
}, 120000);
