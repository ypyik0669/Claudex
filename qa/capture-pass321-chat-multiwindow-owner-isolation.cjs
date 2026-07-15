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
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass321-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass321-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass321-project-"));
const SECOND_PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass321-project-b-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const RUN_PROMPT = "pass321 reload while running";
const ATOMIC_OWNER_PROMPT = "pass321 atomic owner";
const ATOMIC_OBSERVER_PROMPT = "pass321 atomic observer";
const OWNER_DESTROYED_PROMPT = "pass321 owner destroyed";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_DIR, SECOND_PROJECT_DIR]) {
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
if (args[0] === '-p' && /pass321 reload while running/.test(String(args[1] || ''))) {
  out({ type: 'system', subtype: 'init', session_id: 'pass321-session', claude_code_version: '2.9.0' });
  out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'pass321 before reload' } } });
  setTimeout(() => {
    out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: ' pass321 after reload stream' } } });
  }, 3000);
  setInterval(() => {}, 1000);
} else if (args[0] === '-p' && /pass321 atomic (owner|observer)/.test(String(args[1] || ''))) {
  out({ type: 'system', subtype: 'init', session_id: 'pass321-atomic-session', claude_code_version: '2.9.0' });
  out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'pass321 atomic running' } } });
  setInterval(() => {}, 1000);
} else if (args[0] === '-p' && /pass321 owner destroyed/.test(String(args[1] || ''))) {
  out({ type: 'system', subtype: 'init', session_id: 'pass321-destroyed-session', claude_code_version: '2.9.0' });
  out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'pass321 owner close running' } } });
  setInterval(() => {}, 1000);
} else if (args[0] === '--version') out('2.9.0 (Claude Code PASS321)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'pass321-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'mcp' && args[1] === 'list') out('pass321-mcp connected');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else out('pass321 generic');
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
  fs.mkdirSync(SECOND_PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass321-project" }), "utf8");
  fs.writeFileSync(path.join(SECOND_PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass321-project-b" }), "utf8");
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
    activeProject: { name: "pass321-project", path: PROJECT_DIR },
    projects: [
      { name: "pass321-project", path: PROJECT_DIR },
      { name: "pass321-project-b", path: SECOND_PROJECT_DIR },
    ],
    sessions: [{
      id: "default",
      title: "新聊天",
      project: "pass321-project",
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

async function startDirectRequest(win, sessionId, content, requestId) {
  return win.webContents.executeJavaScript(`
    (() => {
      window.__pass321AtomicResults = window.__pass321AtomicResults || {};
      window.__pass321AtomicResults[${JSON.stringify(requestId)}] = { status: 'pending' };
      window.claudexDesktop.sendMessage({
        sessionId: ${JSON.stringify(sessionId)},
        content: ${JSON.stringify(content)},
        requestId: ${JSON.stringify(requestId)},
        claudeSessionId: '',
      }).then((value) => {
        window.__pass321AtomicResults[${JSON.stringify(requestId)}] = { status: 'resolved', value };
      }).catch((error) => {
        window.__pass321AtomicResults[${JSON.stringify(requestId)}] = { status: 'rejected', message: error?.message || String(error) };
      });
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
        .find((item) => /pass321 after reload stream/.test(item.textContent || ''));
      const button = message?.querySelector('.message-meta button');
      if (!button || button.disabled) {
        resolve({ clicked: false });
        return;
      }
      button.click();
      setTimeout(() => {
        const currentMessage = Array.from(document.querySelectorAll('.message.assistant'))
          .find((item) => /pass321 after reload stream/.test(item.textContent || ''));
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

async function createSecondaryWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    show: false,
    backgroundColor: "#111111",
    autoHideMenuBar: true,
    title: "Claudex PASS321 observer",
    webPreferences: {
      preload: path.join(REPO_DIR, "electron", "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: false,
    },
  });
  win.setMenuBarVisibility(false);
  await win.loadFile(path.join(REPO_DIR, "dist", "index.html"));
  return win;
}

async function runTest() {
  await wait(1600);
  const ownerWin = BrowserWindow.getAllWindows()[0];
  if (!ownerWin) throw new Error("PASS321_FAILED_NO_OWNER_WINDOW");
  ownerWin.setBounds({ x: 0, y: 0, width: 1280, height: 840 });
  const observerWin = await createSecondaryWindow();
  observerWin.setBounds({ x: 80, y: 80, width: 1280, height: 840 });

  assertStep("PASS321_OWNER_READY", await waitFor(ownerWin, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS321_OBSERVER_READY", await waitFor(observerWin, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  const ownerRendererId = await ownerWin.webContents.executeJavaScript(`window.claudexDesktop.getState().then((state) => state.runtimeRendererId)`);
  const observerRendererId = await observerWin.webContents.executeJavaScript(`window.claudexDesktop.getState().then((state) => state.runtimeRendererId)`);
  assertStep("PASS321_RENDERER_IDS_DISTINCT", Number(ownerRendererId) > 0 && Number(observerRendererId) > 0 && ownerRendererId !== observerRendererId);
  assertStep("PASS321_HAIKU_45", await ownerWin.webContents.executeJavaScript(`window.claudexDesktop.getState().then((state) => state.settings?.model === 'claude-haiku-4-5-20251001')`));

  assertStep("PASS321_SET_OWNER_PROMPT", await setComposer(ownerWin, RUN_PROMPT));
  assertStep("PASS321_SEND_OWNER_PROMPT", await clickSend(ownerWin));
  const requestId = await waitFor(ownerWin, `
    window.claudexDesktop.getState().then((state) => state.runEvents?.find((event) =>
      event.type === 'chat' && event.status === 'running' && /pass321 reload while running/.test(event.detail || '')
    )?.id || false)
  `, 10000);
  assertStep("PASS321_OWNER_RUNNING_EVENT", Boolean(requestId));
  assertStep("PASS321_OWNER_STREAM_VISIBLE", await waitFor(ownerWin, `
    Array.from(document.querySelectorAll('.message.assistant')).some((message) => /pass321 before reload/.test(message.textContent || ''))
  `, 10000));
  assertStep("PASS321_OWNER_RUNTIME_OWNED", await waitFor(ownerWin, `
    window.claudexDesktop.getState().then((state) =>
      state.runtimeRendererId === ${JSON.stringify(ownerRendererId)} &&
      (state.activeChatRequests || []).some((item) =>
        item?.requestId === ${JSON.stringify(requestId)} &&
        item?.ownerWebContentsId === ${JSON.stringify(ownerRendererId)}
      )
    )
  `, 10000));

  assertStep("PASS321_OBSERVER_SEES_FOREIGN_OWNER", await waitFor(observerWin, `
    window.claudexDesktop.getState().then((state) =>
      state.runtimeRendererId === ${JSON.stringify(observerRendererId)} &&
      (state.activeChatRequests || []).some((item) =>
        item?.requestId === ${JSON.stringify(requestId)} &&
        item?.ownerWebContentsId === ${JSON.stringify(ownerRendererId)}
      )
    )
  `, 10000));
  assertStep("PASS321_SET_OBSERVER_DRAFT", await setComposer(observerWin, "pass321 observer must not send"));
  assertStep("PASS321_OBSERVER_FOREIGN_REQUEST_BLOCKED", await waitFor(observerWin, `
    (() => {
      const shellText = document.querySelector('.conversation-shell')?.textContent || '';
      const sendButton = document.querySelector('.prompt-box .send-button');
      return Boolean(sendButton?.disabled) &&
        !/pass321 before reload|pass321 after reload stream/.test(shellText) &&
        !Array.from(document.querySelectorAll('.message.assistant .message-meta button'))
          .some((button) => Boolean((button.textContent || '').trim()));
    })()
  `, 10000));
  assertStep("PASS321_OBSERVER_CANNOT_SEND", (await clickSend(observerWin)) === false);

  await reloadWindow(observerWin);
  assertStep("PASS321_OBSERVER_RELOAD_FINISHED", await waitFor(observerWin, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS321_SET_OBSERVER_RELOAD_DRAFT", await setComposer(observerWin, "pass321 observer reload must not send"));
  assertStep("PASS321_OBSERVER_RELOAD_NOT_HIJACKED", await waitFor(observerWin, `
    (() => {
      const shellText = document.querySelector('.conversation-shell')?.textContent || '';
      const sendButton = document.querySelector('.prompt-box .send-button');
      return Boolean(sendButton?.disabled) &&
        !/pass321 before reload|pass321 after reload stream/.test(shellText);
    })()
  `, 10000));
  assertStep("PASS321_OWNER_STILL_CONTROLS_REQUEST", await waitFor(ownerWin, `
    Array.from(document.querySelectorAll('.message.assistant')).some((message) =>
      /pass321 after reload stream/.test(message.textContent || '') &&
      Array.from(message.querySelectorAll('.message-meta button')).some((button) => !button.disabled)
    )
  `, 12000));

  const feedback = await captureCancelFeedback(ownerWin);
  assertStep("PASS321_OWNER_CANCEL_CLICKED", feedback?.clicked === true);
  assertStep("PASS321_OWNER_STOPPING_FEEDBACK", feedback?.stoppingVisible === true && feedback?.messageButtonDisabled === true);
  assertStep("PASS321_CANCELLED_STATE_PERSISTED", await waitForStore((state) => {
    const session = state.sessions?.find((item) => item.id === "default");
    const event = state.runEvents?.find((item) => item.id === requestId);
    const messages = session?.messages || [];
    return event?.status === "cancelled" && event?.sessionId === "default" &&
      messages.filter((message) => message.role === "user" && message.content === RUN_PROMPT).length === 1 &&
      messages.filter((message) => message.role === "cancelled" && message.requestId === requestId).length === 1 &&
      !messages.some((message) => /pass321 observer must not send/.test(message.content || ""));
  }, 15000));
  assertStep("PASS321_RUNTIME_CLEARED_BOTH_WINDOWS", await waitFor(ownerWin, `
    Promise.all([
      window.claudexDesktop.getState().then((state) => !(state.activeChatRequests || []).some((item) => item?.requestId === ${JSON.stringify(requestId)})),
    ]).then((values) => values.every(Boolean))
  `, 10000) && await waitFor(observerWin, `
    window.claudexDesktop.getState().then((state) => !(state.activeChatRequests || []).some((item) => item?.requestId === ${JSON.stringify(requestId)}))
  `, 10000));
  assertStep("PASS321_SET_OBSERVER_AFTER_DONE", await setComposer(observerWin, "pass321 observer after done"));
  assertStep("PASS321_OBSERVER_UNBLOCKED_AFTER_DONE", await waitFor(observerWin, `
    document.querySelector('.prompt-box .send-button')?.disabled === false
  `, 10000));

  const ownerAtomicRequestId = "request_pass321_atomic_owner";
  const observerAtomicRequestId = "request_pass321_atomic_observer";
  assertStep("PASS321_START_ATOMIC_OWNER_REQUEST", await startDirectRequest(
    ownerWin,
    "default",
    ATOMIC_OWNER_PROMPT,
    ownerAtomicRequestId,
  ));
  assertStep("PASS321_START_ATOMIC_OBSERVER_REQUEST", await startDirectRequest(
    observerWin,
    "default",
    ATOMIC_OBSERVER_PROMPT,
    observerAtomicRequestId,
  ));
  const atomicRuntime = await waitFor(ownerWin, `
    window.claudexDesktop.getState().then((state) => {
      const items = (state.activeChatRequests || []).filter((item) =>
        [${JSON.stringify(ownerAtomicRequestId)}, ${JSON.stringify(observerAtomicRequestId)}].includes(item?.requestId)
      );
      return items.length ? items : false;
    })
  `, 10000);
  assertStep("PASS321_MAIN_ATOMIC_SINGLE_REQUEST", Array.isArray(atomicRuntime) && atomicRuntime.length === 1);
  const acceptedRequest = atomicRuntime[0];
  const acceptedByOwner = Number(acceptedRequest.ownerWebContentsId) === Number(ownerRendererId);
  const acceptedWin = acceptedByOwner ? ownerWin : observerWin;
  const foreignWin = acceptedByOwner ? observerWin : ownerWin;
  const rejectedRequestId = acceptedByOwner ? observerAtomicRequestId : ownerAtomicRequestId;
  assertStep("PASS321_SECOND_CONCURRENT_REQUEST_REJECTED", await waitFor(foreignWin, `
    window.__pass321AtomicResults?.[${JSON.stringify(rejectedRequestId)}]?.status === 'rejected'
  `, 10000));
  assertStep("PASS321_ONLY_ACCEPTED_USER_MESSAGE_PERSISTED", await waitForStore((state) => {
    const messages = state.sessions?.find((item) => item.id === "default")?.messages || [];
    const atomicUsers = messages.filter((message) =>
      message.role === "user" && [ATOMIC_OWNER_PROMPT, ATOMIC_OBSERVER_PROMPT].includes(message.content)
    );
    return atomicUsers.length === 1;
  }, 10000));

  const foreignCancelResult = await foreignWin.webContents.executeJavaScript(
    `window.claudexDesktop.cancelRequest(${JSON.stringify(acceptedRequest.requestId)})`,
  );
  assertStep("PASS321_FOREIGN_CANCEL_REJECTED_BY_MAIN", foreignCancelResult === false);
  assertStep("PASS321_REQUEST_STILL_RUNNING_AFTER_FOREIGN_CANCEL", await waitFor(acceptedWin, `
    window.claudexDesktop.getState().then((state) => (state.activeChatRequests || []).some((item) =>
      item?.requestId === ${JSON.stringify(acceptedRequest.requestId)} && item?.status === 'running'
    ))
  `, 5000));

  assertStep("PASS321_SWITCH_PROJECT_DURING_REQUEST", await foreignWin.webContents.executeJavaScript(`
    window.claudexDesktop.setActiveProject({
      name: 'pass321-project-b',
      path: ${JSON.stringify(SECOND_PROJECT_DIR)},
    }).then((state) => state.activeProject?.path === ${JSON.stringify(SECOND_PROJECT_DIR)})
  `));
  assertStep("PASS321_SECOND_PROJECT_PERSISTED_DURING_REQUEST", await waitForStore((state) => (
    state.activeProject?.path === SECOND_PROJECT_DIR
  ), 10000));
  assertStep("PASS321_OWNER_CANCELS_ATOMIC_REQUEST", await acceptedWin.webContents.executeJavaScript(
    `window.claudexDesktop.cancelRequest(${JSON.stringify(acceptedRequest.requestId)})`,
  ));
  assertStep("PASS321_TERMINAL_MERGE_PRESERVES_LATEST_STORE", await waitForStore((state) => {
    const session = state.sessions?.find((item) => item.id === "default");
    const event = state.runEvents?.find((item) => item.id === acceptedRequest.requestId);
    const messages = session?.messages || [];
    return state.activeProject?.path === SECOND_PROJECT_DIR &&
      event?.status === "cancelled" &&
      messages.filter((message) => message.role === "cancelled" && message.requestId === acceptedRequest.requestId).length === 1;
  }, 15000));

  const destroyedRequestId = "request_pass321_owner_destroyed";
  assertStep("PASS321_START_OWNER_DESTROYED_REQUEST", await startDirectRequest(
    ownerWin,
    "default",
    OWNER_DESTROYED_PROMPT,
    destroyedRequestId,
  ));
  assertStep("PASS321_OWNER_DESTROYED_REQUEST_RUNNING", await waitFor(observerWin, `
    window.claudexDesktop.getState().then((state) => (state.activeChatRequests || []).some((item) =>
      item?.requestId === ${JSON.stringify(destroyedRequestId)} &&
      item?.ownerWebContentsId === ${JSON.stringify(ownerRendererId)} &&
      item?.status === 'running'
    ))
  `, 10000));
  ownerWin.destroy();
  assertStep("PASS321_DESTROYED_OWNER_REQUEST_CANCELLED", await waitForStore((state) => {
    const session = state.sessions?.find((item) => item.id === "default");
    const event = state.runEvents?.find((item) => item.id === destroyedRequestId);
    const messages = session?.messages || [];
    return state.activeProject?.path === SECOND_PROJECT_DIR &&
      event?.status === "cancelled" &&
      messages.filter((message) => message.role === "cancelled" && message.requestId === destroyedRequestId).length === 1;
  }, 15000));
  assertStep("PASS321_OBSERVER_UNBLOCKED_AFTER_OWNER_DESTROYED", await waitFor(observerWin, `
    window.claudexDesktop.getState().then((state) =>
      !(state.activeChatRequests || []).some((item) => item?.requestId === ${JSON.stringify(destroyedRequestId)}) &&
      document.querySelector('.prompt-box .send-button')?.disabled === false
    )
  `, 10000));

  console.log("PASS321_CHAT_MULTIWINDOW_OWNER_ISOLATION_DONE");
  await exitWithCleanup(0);
}

const fakeClaudeCommand = writeFakeClaude();
app.setPath("userData", USER_DATA_DIR);
writeInitialStore(fakeClaudeCommand);
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS321_FAILED", error?.stack || error);
  void exitWithCleanup(1);
});

setTimeout(() => {
  console.error("PASS321_TIMEOUT");
  void exitWithCleanup(1);
}, 120000);
