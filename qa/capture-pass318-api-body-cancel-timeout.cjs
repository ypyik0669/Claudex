const fs = require("fs");
const http = require("http");
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
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass318-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass318-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const BODY_CANCEL_PROMPT = "pass318 body cancel";
const BODY_TIMEOUT_PROMPT = "pass318 body timeout";
const LATE_ERROR_PROMPT = "pass318 late provider error";
const serverTimers = new Set();
const serverState = {
  bodyCancelHeaders: false,
  bodyCancelClosed: false,
  bodyTimeoutHeaders: false,
  lateErrorHeaders: false,
};
let apiServer = null;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanup() {
  for (const dir of [USER_DATA_DIR, PROJECT_DIR]) {
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
  for (const timer of serverTimers) clearTimeout(timer);
  serverTimers.clear();
  if (apiServer) {
    try {
      apiServer.closeAllConnections?.();
      await new Promise((resolve) => apiServer.close(() => resolve()));
    } catch (_error) {
      // Best-effort local API teardown.
    }
    apiServer = null;
  }
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

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}

function scheduleServerWrite(callback, delayMs) {
  const timer = setTimeout(() => {
    serverTimers.delete(timer);
    callback();
  }, delayMs);
  serverTimers.add(timer);
}

async function startApiServer() {
  apiServer = http.createServer((request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
      sendJson(response, 404, { error: { message: "pass318 route not found" } });
      return;
    }
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      let payload = {};
      try {
        payload = JSON.parse(body || "{}");
      } catch (_error) {
        sendJson(response, 400, { error: { message: "pass318 invalid json" } });
        return;
      }
      const userPrompt = [...(payload.messages || [])].reverse().find((message) => message?.role === "user")?.content || "";
      if (userPrompt === BODY_CANCEL_PROMPT) {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.flushHeaders();
        response.write('{"choices":[{"message":{"role":"assistant","content":"');
        serverState.bodyCancelHeaders = true;
        response.on("close", () => {
          if (!response.writableEnded) serverState.bodyCancelClosed = true;
        });
        return;
      }
      if (userPrompt === BODY_TIMEOUT_PROMPT) {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.flushHeaders();
        response.write('{"choices":[{"message":{"role":"assistant","content":"');
        serverState.bodyTimeoutHeaders = true;
        scheduleServerWrite(() => {
          if (!response.destroyed && !response.writableEnded) {
            response.end('pass318 timeout should not arrive"}}]}');
          }
        }, 3000);
        return;
      }
      if (userPrompt === LATE_ERROR_PROMPT) {
        response.writeHead(503, { "Content-Type": "application/json" });
        response.flushHeaders();
        response.write('{"error":{"message":"');
        serverState.lateErrorHeaders = true;
        scheduleServerWrite(() => {
          if (!response.destroyed && !response.writableEnded) {
            response.end('pass318 provider late error"}}');
          }
        }, 600);
        return;
      }
      sendJson(response, 200, {
        choices: [{ message: { role: "assistant", content: "pass318 fallback" } }],
      });
    });
  });
  await new Promise((resolve, reject) => {
    apiServer.once("error", reject);
    apiServer.listen(0, "127.0.0.1", resolve);
  });
  const address = apiServer.address();
  return `http://127.0.0.1:${address.port}/v1`;
}

function writeInitialStore(baseUrl) {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass318-project" }), "utf8");
  fs.writeFileSync(DATA_FILE, JSON.stringify({
    version: 1,
    settings: {
      provider: "openai-compatible",
      model: "claude-haiku-4-5-20251001",
      baseUrl,
      temperature: 0.2,
      timeoutMs: 1500,
      language: "zh",
      appearance: { fontSize: "compact", density: "compact" },
      claudeCode: { executionMode: "api", permissionMode: "default" },
      capabilities: { "project-context": true, "terminal-helper": true, "mcp-runtime": true, "plugin-router": true, "marketplace-router": true },
      customMarketplaces: [],
      apiKeys: {},
    },
    activeProject: { name: "pass318-project", path: PROJECT_DIR },
    projects: [{ name: "pass318-project", path: PROJECT_DIR }],
    sessions: [{ id: "default", title: "新聊天", project: "pass318-project", projectPath: PROJECT_DIR, createdAt: "2026-07-15T00:00:00.000Z", updatedAt: "2026-07-15T00:00:00.000Z", messages: [] }],
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
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })()
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS318_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(600);

  assertStep("PASS318_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS318_API_MODE_HAIKU_45", await win.webContents.executeJavaScript(`
    window.claudexDesktop.getState().then((state) =>
      state.settings?.model === 'claude-haiku-4-5-20251001' &&
      state.settings?.provider === 'openai-compatible' &&
      state.settings?.claudeCode?.executionMode === 'api' &&
      state.settings?.timeoutMs === 1500
    )
  `));
  assertStep("PASS318_SET_BODY_CANCEL_PROMPT", await setComposer(win, BODY_CANCEL_PROMPT));
  assertStep("PASS318_SEND_BODY_CANCEL_PROMPT", await clickSend(win));
  const bodyCancelRequestId = await waitFor(win, `
    window.claudexDesktop.getState().then((state) => state.runEvents?.find((event) =>
      event.type === 'chat' && event.status === 'running' && /pass318 body cancel/.test(event.detail || '')
    )?.id || false)
  `, 10000);
  assertStep("PASS318_BODY_CANCEL_RUNNING_EVENT", Boolean(bodyCancelRequestId));
  assertStep("PASS318_BODY_CANCEL_HEADERS_READY", await waitForStore(() => serverState.bodyCancelHeaders, 10000));
  assertStep("PASS318_BODY_CANCEL_CLICKED", await clickChatCancel(win));
  assertStep("PASS318_BODY_CANCEL_CONNECTION_CLOSED", await waitForStore(() => serverState.bodyCancelClosed, 8000));
  assertStep("PASS318_BODY_CANCEL_STATE_PERSISTED", await waitForStore((state) => {
    const session = state.sessions?.find((item) => item.id === "default");
    const event = state.runEvents?.find((item) => item.id === bodyCancelRequestId);
    return event?.type === "chat" && event.status === "cancelled" &&
      session?.messages?.some((message) => message.role === "cancelled" && message.requestId === bodyCancelRequestId) &&
      !session?.messages?.some((message) => message.role === "error");
  }, 10000));

  assertStep("PASS318_SET_BODY_TIMEOUT_PROMPT", await setComposer(win, BODY_TIMEOUT_PROMPT));
  assertStep("PASS318_SEND_BODY_TIMEOUT_PROMPT", await clickSend(win));
  const bodyTimeoutRequestId = await waitFor(win, `
    window.claudexDesktop.getState().then((state) => state.runEvents?.find((event) =>
      event.type === 'chat' && event.status === 'running' && /pass318 body timeout/.test(event.detail || '')
    )?.id || false)
  `, 10000);
  assertStep("PASS318_BODY_TIMEOUT_RUNNING_EVENT", Boolean(bodyTimeoutRequestId));
  assertStep("PASS318_BODY_TIMEOUT_HEADERS_READY", await waitForStore(() => serverState.bodyTimeoutHeaders, 10000));
  assertStep("PASS318_BODY_TIMEOUT_ERROR_VISIBLE", await waitFor(win, `
    Array.from(document.querySelectorAll('.message.error')).some((message) => /超过 1500 毫秒|timeout/i.test(message.textContent || ''))
  `, 6000));
  assertStep("PASS318_BODY_TIMEOUT_STATE_PERSISTED", await waitForStore((state) => {
    const session = state.sessions?.find((item) => item.id === "default");
    const event = state.runEvents?.find((item) => item.id === bodyTimeoutRequestId);
    return event?.type === "chat" && event.status === "error" && /超过 1500 毫秒|timeout/i.test(event.detail || "") &&
      !session?.messages?.some((message) => message.role === "cancelled" && message.requestId === bodyTimeoutRequestId) &&
      !session?.messages?.some((message) => message.role === "assistant" && /pass318 timeout should not arrive/.test(message.content || ""));
  }, 10000));

  assertStep("PASS318_SET_LATE_ERROR_PROMPT", await setComposer(win, LATE_ERROR_PROMPT));
  assertStep("PASS318_SEND_LATE_ERROR_PROMPT", await clickSend(win));
  const lateErrorRequestId = await waitFor(win, `
    window.claudexDesktop.getState().then((state) => state.runEvents?.find((event) =>
      event.type === 'chat' && event.status === 'running' && /pass318 late provider error/.test(event.detail || '')
    )?.id || false)
  `, 10000);
  assertStep("PASS318_LATE_ERROR_RUNNING_EVENT", Boolean(lateErrorRequestId));
  assertStep("PASS318_LATE_ERROR_HEADERS_READY", await waitForStore(() => serverState.lateErrorHeaders, 10000));
  assertStep("PASS318_LATE_ERROR_CANCEL_CLICKED", await clickChatCancel(win));
  assertStep("PASS318_LATE_ERROR_VISIBLE", await waitFor(win, `
    Array.from(document.querySelectorAll('.message.error')).some((message) => /HTTP 503|pass318 provider late error/.test(message.textContent || ''))
  `, 10000));
  assertStep("PASS318_LATE_ERROR_STATE_PERSISTED", await waitForStore((state) => {
    const session = state.sessions?.find((item) => item.id === "default");
    const event = state.runEvents?.find((item) => item.id === lateErrorRequestId);
    return event?.type === "chat" && event.status === "error" && /HTTP 503|pass318 provider late error/.test(event.detail || "") &&
      !session?.messages?.some((message) => message.role === "cancelled" && message.requestId === lateErrorRequestId) &&
      session?.messages?.filter((message) => message.role === "cancelled").length === 1 &&
      session?.messages?.filter((message) => message.role === "error").length === 2;
  }, 10000));

  console.log("PASS318_API_BODY_CANCEL_TIMEOUT_DONE");
  await exitWithCleanup(0);
}

async function bootstrap() {
  const baseUrl = await startApiServer();
  app.setPath("userData", USER_DATA_DIR);
  writeInitialStore(baseUrl);
  require(path.join(REPO_DIR, "electron", "main.cjs"));
  app.whenReady().then(runTest).catch((error) => {
    console.error("PASS318_FAILED", error?.stack || error);
    void exitWithCleanup(1);
  });
}

bootstrap().catch((error) => {
  console.error("PASS318_BOOTSTRAP_FAILED", error?.stack || error);
  void exitWithCleanup(1);
});

setTimeout(() => {
  console.error("PASS318_TIMEOUT");
  void exitWithCleanup(1);
}, 120000);
