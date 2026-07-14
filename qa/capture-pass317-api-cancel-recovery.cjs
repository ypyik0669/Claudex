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
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass317-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass317-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const CANCEL_PROMPT = "pass317 cancel direct api";
const RECOVERY_PROMPT = "pass317 recover direct api";
const ERROR_PROMPT = "pass317 direct api error";
const apiRequests = [];
let apiServer = null;
let cancelObserved = false;

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

async function startApiServer() {
  apiServer = http.createServer((request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
      sendJson(response, 404, { error: { message: "pass317 route not found" } });
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
        sendJson(response, 400, { error: { message: "pass317 invalid json" } });
        return;
      }
      const userPrompt = [...(payload.messages || [])].reverse().find((message) => message?.role === "user")?.content || "";
      apiRequests.push({ model: payload.model, userPrompt });
      if (userPrompt === CANCEL_PROMPT) {
        const markCancelled = () => {
          if (!response.writableEnded) cancelObserved = true;
        };
        request.on("aborted", markCancelled);
        response.on("close", markCancelled);
        return;
      }
      if (userPrompt === RECOVERY_PROMPT) {
        sendJson(response, 200, {
          choices: [{ message: { role: "assistant", content: "pass317 direct api recovered" } }],
        });
        return;
      }
      if (userPrompt === ERROR_PROMPT) {
        sendJson(response, 503, { error: { message: "pass317 provider unavailable" } });
        return;
      }
      sendJson(response, 200, {
        choices: [{ message: { role: "assistant", content: "pass317 fallback" } }],
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass317-project" }), "utf8");
  fs.writeFileSync(DATA_FILE, JSON.stringify({
    version: 1,
    settings: {
      provider: "openai-compatible",
      model: "claude-haiku-4-5-20251001",
      baseUrl,
      temperature: 0.2,
      timeoutMs: 600000,
      language: "zh",
      appearance: { fontSize: "compact", density: "compact" },
      claudeCode: { executionMode: "api", permissionMode: "default" },
      capabilities: { "project-context": true, "terminal-helper": true, "mcp-runtime": true, "plugin-router": true, "marketplace-router": true },
      customMarketplaces: [],
      apiKeys: {},
    },
    activeProject: { name: "pass317-project", path: PROJECT_DIR },
    projects: [{ name: "pass317-project", path: PROJECT_DIR }],
    sessions: [{ id: "default", title: "新聊天", project: "pass317-project", projectPath: PROJECT_DIR, createdAt: "2026-07-15T00:00:00.000Z", updatedAt: "2026-07-15T00:00:00.000Z", messages: [] }],
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
  if (!win) throw new Error("PASS317_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(600);

  assertStep("PASS317_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS317_API_MODE_HAIKU_45", await win.webContents.executeJavaScript(`
    window.claudexDesktop.getState().then((state) =>
      state.settings?.model === 'claude-haiku-4-5-20251001' &&
      state.settings?.provider === 'openai-compatible' &&
      state.settings?.claudeCode?.executionMode === 'api'
    )
  `));
  assertStep("PASS317_SET_CANCEL_PROMPT", await setComposer(win, CANCEL_PROMPT));
  assertStep("PASS317_SEND_CANCEL_PROMPT", await clickSend(win));
  const requestId = await waitFor(win, `
    window.claudexDesktop.getState().then((state) => state.runEvents?.find((event) =>
      event.type === 'chat' && event.status === 'running' && /pass317 cancel direct api/.test(event.detail || '')
    )?.id || false)
  `, 10000);
  assertStep("PASS317_CHAT_RUNNING_EVENT", Boolean(requestId));
  assertStep("PASS317_API_REQUEST_REACHED_SERVER", await waitForStore(() => apiRequests.some((entry) => entry.userPrompt === CANCEL_PROMPT), 10000));
  assertStep("PASS317_CHAT_STOP_VISIBLE", await waitFor(win, `
    Array.from(document.querySelectorAll('.message.assistant .message-meta button')).some((button) => /停止|取消|cancel/i.test(button.textContent || ''))
  `, 10000));
  assertStep("PASS317_CANCEL_CLICKED", await win.webContents.executeJavaScript(`
    (() => {
      const button = Array.from(document.querySelectorAll('.message.assistant .message-meta button'))
        .find((item) => /停止|取消|cancel/i.test(item.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })()
  `));
  assertStep("PASS317_ABORT_OBSERVED_BY_SERVER", await waitForStore(() => cancelObserved, 10000));
  assertStep("PASS317_CANCELLED_MESSAGE_VISIBLE", await waitFor(win, `
    Boolean(document.querySelector('.message.cancelled') && /已停止|已取消/.test(document.querySelector('.message.cancelled')?.textContent || '') && !document.querySelector('.message.error'))
  `, 15000));
  assertStep("PASS317_CANCELLED_STATE_PERSISTED", await waitForStore((state) => {
    const session = state.sessions?.find((item) => item.id === "default");
    const cancelled = session?.messages?.filter((message) => message.role === "cancelled" && message.requestId === requestId) || [];
    const errors = session?.messages?.filter((message) => message.role === "error") || [];
    const event = state.runEvents?.find((item) => item.id === requestId);
    return cancelled.length === 1 && errors.length === 0 && event?.type === "chat" && event.status === "cancelled" && event.sessionId === "default";
  }, 10000));
  win.webContents.reload();
  assertStep("PASS317_RELOAD", true);
  assertStep("PASS317_RELOAD_CANCELLED_VISIBLE", await waitFor(win, `
    Boolean(document.querySelector('.message.cancelled') && /已停止|已取消/.test(document.querySelector('.message.cancelled')?.textContent || '') && !document.querySelector('[data-error-action="retry"]'))
  `, 15000));
  assertStep("PASS317_SET_RECOVERY_PROMPT", await setComposer(win, RECOVERY_PROMPT));
  assertStep("PASS317_SEND_RECOVERY_PROMPT", await clickSend(win));
  assertStep("PASS317_RECOVERY_ASSISTANT_VISIBLE", await waitFor(win, `
    Array.from(document.querySelectorAll('.message.assistant')).some((message) => /pass317 direct api recovered/.test(message.textContent || ''))
  `, 15000));
  assertStep("PASS317_RECOVERY_STATE_PERSISTED", await waitForStore((state) => {
    const session = state.sessions?.find((item) => item.id === "default");
    const messages = session?.messages || [];
    const recoveryEvent = (state.runEvents || []).find((event) => event.type === "chat" && event.id !== requestId && event.status === "ok");
    return messages.filter((message) => message.role === "cancelled").length === 1 &&
      messages.filter((message) => message.role === "error").length === 0 &&
      messages.some((message) => message.role === "assistant" && /pass317 direct api recovered/.test(message.content || "")) &&
      Boolean(recoveryEvent);
  }, 10000));
  assertStep("PASS317_API_REQUESTS_USE_HAIKU_45", apiRequests.filter((entry) => [CANCEL_PROMPT, RECOVERY_PROMPT].includes(entry.userPrompt))
    .every((entry) => entry.model === "claude-haiku-4-5-20251001"));

  assertStep("PASS317_SET_ERROR_PROMPT", await setComposer(win, ERROR_PROMPT));
  assertStep("PASS317_SEND_ERROR_PROMPT", await clickSend(win));
  assertStep("PASS317_ERROR_MESSAGE_VISIBLE", await waitFor(win, `
    Array.from(document.querySelectorAll('.message.error')).some((message) => /pass317 provider unavailable/.test(message.textContent || ''))
  `, 15000));
  assertStep("PASS317_ERROR_STATE_PERSISTED", await waitForStore((state) => {
    const session = state.sessions?.find((item) => item.id === "default");
    const errorEvent = (state.runEvents || []).find((event) =>
      event.type === "chat" && event.status === "error" && /pass317 provider unavailable/.test(event.detail || "")
    );
    return session?.messages?.filter((message) => message.role === "cancelled").length === 1 &&
      session?.messages?.some((message) => message.role === "error" && /pass317 provider unavailable/.test(message.content || "")) &&
      Boolean(errorEvent);
  }, 10000));

  console.log("PASS317_API_CANCEL_RECOVERY_DONE");
  await exitWithCleanup(0);
}

async function bootstrap() {
  const baseUrl = await startApiServer();
  app.setPath("userData", USER_DATA_DIR);
  writeInitialStore(baseUrl);
  require(path.join(REPO_DIR, "electron", "main.cjs"));
  app.whenReady().then(runTest).catch((error) => {
    console.error("PASS317_FAILED", error?.stack || error);
    void exitWithCleanup(1);
  });
}

bootstrap().catch((error) => {
  console.error("PASS317_BOOTSTRAP_FAILED", error?.stack || error);
  void exitWithCleanup(1);
});

setTimeout(() => {
  console.error("PASS317_TIMEOUT");
  void exitWithCleanup(1);
}, 120000);
