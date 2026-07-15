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
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass322-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass322-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const STREAM_PROMPT = "pass322 stream reload";
const CANCEL_PROMPT = "pass322 stream cancel";
const ANTHROPIC_PROMPT = "pass322 anthropic stream";
const OLLAMA_PROMPT = "pass322 ollama stream";
const TRUNCATED_PROMPT = "pass322 truncated stream";
const ANTHROPIC_TRUNCATED_PROMPT = "pass322 anthropic truncated stream";
const OLLAMA_TRUNCATED_PROMPT = "pass322 ollama truncated stream";
const OPENAI_FINISH_EOF_PROMPT = "pass322 openai finish reason eof";
const ANTHROPIC_JSON_PROMPT = "pass322 anthropic json fallback";
const OLLAMA_JSON_PROMPT = "pass322 ollama json fallback";
const HTTP_ERROR_CANCEL_PROMPT = "pass322 http error body cancel";
const MODEL = "claude-haiku-4-5-20251001";
const serverState = {
  requests: [],
  streamFinished: false,
  streamResponse: null,
  streamTerminalClosed: false,
  cancelClosed: false,
  anthropicResponse: null,
  anthropicTerminalClosed: false,
  ollamaResponse: null,
  ollamaTerminalClosed: false,
  truncatedResponse: null,
  anthropicTruncatedResponse: null,
  ollamaTruncatedResponse: null,
  httpErrorCancelResponse: null,
  httpErrorCancelClosed: false,
};
let apiServer = null;
let apiOrigin = "";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanup() {
  try {
    apiServer?.closeAllConnections?.();
    apiServer?.close();
  } catch (_error) {
    // Best-effort server cleanup.
  }
  for (const dir of [USER_DATA_DIR, PROJECT_DIR]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_error) {
      // Best-effort cleanup for Windows file-handle races.
    }
  }
}

async function exitWithCleanup(code) {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (win.isDestroyed() || win.webContents.isDestroyed()) continue;
      await win.webContents.executeJavaScript(`
        window.claudexDesktop.getState().then(async (state) => {
          for (const item of state.activeChatRequests || []) {
            try { await window.claudexDesktop.cancelRequest(item.requestId); } catch (_error) {}
          }
        })
      `);
    } catch (_error) {
      // Renderer teardown can race cleanup.
    }
  }
  await wait(300);
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win.isDestroyed()) win.destroy();
    } catch (_error) {
      // Best-effort teardown.
    }
  }
  await wait(200);
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
      // Reload briefly invalidates the execution context.
    }
    await wait(100);
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
    await wait(100);
  }
  return false;
}

function assertStep(name, ok) {
  console.log(name, ok);
  if (!ok) throw new Error(`${name} failed`);
}

function writeSse(response, payload) {
  const data = typeof payload === "string" ? payload : JSON.stringify(payload);
  response.write(`data: ${data}\n\n`);
}

function writeNdjson(response, payload) {
  response.write(`${JSON.stringify(payload)}\n`);
}

async function startApiServer() {
  apiServer = http.createServer((request, response) => {
    const supportedRoute = ["/v1/chat/completions", "/v1/messages", "/api/chat"].includes(request.url);
    if (request.method !== "POST" || !supportedRoute) {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: { message: "pass322 route not found" } }));
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
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: { message: "pass322 invalid json" } }));
        return;
      }
      const userPrompt = [...(payload.messages || [])].reverse().find((message) => message?.role === "user")?.content || "";
      serverState.requests.push({ model: payload.model, stream: payload.stream, userPrompt, route: request.url });
      if (request.url === "/v1/messages") {
        if (userPrompt === ANTHROPIC_JSON_PROMPT) {
          response.writeHead(200, { "Content-Type": "application/json" });
          response.end(JSON.stringify({
            type: "message",
            content: [{ type: "text", text: "pass322 anthropic json success" }],
            stop_reason: "end_turn",
            usage: { input_tokens: 19, output_tokens: 8 },
          }, null, 2));
          return;
        }
        response.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        response.flushHeaders();
        if (userPrompt === ANTHROPIC_TRUNCATED_PROMPT) {
          response.write("event: content_block_delta\n");
          writeSse(response, { type: "content_block_delta", delta: { type: "text_delta", text: "pass322 anthropic truncated partial" } });
          serverState.anthropicTruncatedResponse = response;
          return;
        }
        response.write("event: message_start\n");
        writeSse(response, { type: "message_start", message: { usage: { input_tokens: 13 } } });
        response.write("event: content_block_delta\n");
        writeSse(response, { type: "content_block_delta", delta: { type: "text_delta", text: "pass322 anthropic first" } });
        response.on("close", () => {
          if (!response.writableEnded) serverState.anthropicTerminalClosed = true;
        });
        serverState.anthropicResponse = response;
        return;
      }
      if (request.url === "/api/chat") {
        if (userPrompt === OLLAMA_JSON_PROMPT) {
          response.writeHead(200, { "Content-Type": "application/json" });
          response.end(JSON.stringify({
            message: { role: "assistant", content: "pass322 ollama json success" },
            done_reason: "stop",
            prompt_eval_count: 23,
            eval_count: 6,
          }, null, 2));
          return;
        }
        response.writeHead(200, { "Content-Type": "application/x-ndjson" });
        response.flushHeaders();
        if (userPrompt === OLLAMA_TRUNCATED_PROMPT) {
          writeNdjson(response, { message: { role: "assistant", content: "pass322 ollama truncated partial" }, done: false });
          serverState.ollamaTruncatedResponse = response;
          return;
        }
        writeNdjson(response, { message: { role: "assistant", content: "pass322 ollama first" }, done: false });
        response.on("close", () => {
          if (!response.writableEnded) serverState.ollamaTerminalClosed = true;
        });
        serverState.ollamaResponse = response;
        return;
      }
      if (userPrompt === HTTP_ERROR_CANCEL_PROMPT) {
        response.writeHead(503, { "Content-Type": "application/json" });
        response.flushHeaders();
        response.write('{"error":{"message":"pass322 slow provider error');
        serverState.httpErrorCancelResponse = response;
        response.on("close", () => {
          if (!response.writableEnded) serverState.httpErrorCancelClosed = true;
        });
        return;
      }
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      response.flushHeaders();
      if (userPrompt === STREAM_PROMPT) {
        writeSse(response, { choices: [{ delta: { role: "assistant", content: "pass322 before reload" } }] });
        response.on("close", () => {
          if (!response.writableEnded) serverState.streamTerminalClosed = true;
        });
        serverState.streamResponse = response;
        return;
      }
      if (userPrompt === CANCEL_PROMPT) {
        writeSse(response, { choices: [{ delta: { role: "assistant", content: "pass322 cancel partial" } }] });
        response.on("close", () => {
          if (!response.writableEnded) serverState.cancelClosed = true;
        });
        return;
      }
      if (userPrompt === TRUNCATED_PROMPT) {
        writeSse(response, { choices: [{ delta: { role: "assistant", content: "pass322 truncated partial" } }] });
        serverState.truncatedResponse = response;
        return;
      }
      if (userPrompt === OPENAI_FINISH_EOF_PROMPT) {
        writeSse(response, { choices: [{ delta: { content: "pass322 finish eof success" } }] });
        writeSse(response, { choices: [{ delta: {}, finish_reason: "stop" }] });
        response.end();
        return;
      }
      writeSse(response, { choices: [{ delta: { content: "pass322 fallback" } }] });
      writeSse(response, "[DONE]");
      response.end();
    });
  });
  await new Promise((resolve, reject) => {
    apiServer.once("error", reject);
    apiServer.listen(0, "127.0.0.1", resolve);
  });
  const address = apiServer.address();
  apiOrigin = `http://127.0.0.1:${address.port}`;
  return `${apiOrigin}/v1`;
}

function writeInitialStore(baseUrl) {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass322-project" }), "utf8");
  fs.writeFileSync(DATA_FILE, JSON.stringify({
    version: 1,
    settings: {
      provider: "openai-compatible",
      model: MODEL,
      baseUrl,
      temperature: 0.2,
      timeoutMs: 30000,
      language: "zh",
      appearance: { fontSize: "compact", density: "compact" },
      claudeCode: { executionMode: "api", permissionMode: "default" },
      capabilities: { "project-context": true, "terminal-helper": true, "mcp-runtime": true, "plugin-router": true, "marketplace-router": true },
      customMarketplaces: [],
      apiKeys: {},
    },
    activeProject: { name: "pass322-project", path: PROJECT_DIR },
    projects: [{ name: "pass322-project", path: PROJECT_DIR }],
    sessions: [{
      id: "default",
      title: "New chat",
      project: "pass322-project",
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

async function clickCancel(win) {
  return win.webContents.executeJavaScript(`
    (() => {
      const button = Array.from(document.querySelectorAll('.messages .message.assistant .message-meta button'))
        .find((item) => !item.disabled && /停止|stop/i.test(item.textContent || ''));
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

async function configureProvider(win, provider, baseUrl) {
  const saved = await win.webContents.executeJavaScript(`
    window.claudexDesktop.saveSettings({
      provider: ${JSON.stringify(provider)},
      model: ${JSON.stringify(MODEL)},
      baseUrl: ${JSON.stringify(baseUrl)},
      claudeCode: { executionMode: 'api' },
    }).then((state) => state.settings?.provider === ${JSON.stringify(provider)})
  `);
  if (!saved) return false;
  await reloadWindow(win);
  return waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS322_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(500);

  assertStep("PASS322_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS322_API_MODE_HAIKU_45", await win.webContents.executeJavaScript(`
    window.claudexDesktop.getState().then((state) =>
      state.settings?.model === ${JSON.stringify(MODEL)} &&
      state.settings?.provider === 'openai-compatible' &&
      state.settings?.claudeCode?.executionMode === 'api'
    )
  `));
  assertStep("PASS322_SET_STREAM_PROMPT", await setComposer(win, STREAM_PROMPT));
  assertStep("PASS322_SEND_STREAM_PROMPT", await clickSend(win));
  const streamRequestId = await waitFor(win, `
    window.claudexDesktop.getState().then((state) => state.runEvents?.find((event) =>
      event.type === 'chat' && event.status === 'running' && /pass322 stream reload/.test(event.detail || '')
    )?.id || false)
  `, 10000);
  assertStep("PASS322_STREAM_RUNNING_EVENT", Boolean(streamRequestId));
  assertStep("PASS322_REQUESTED_TRUE_STREAM", await waitForStore(() => (
    serverState.requests.some((item) => item.userPrompt === STREAM_PROMPT && item.stream === true)
  ), 10000));
  const partialVisibleBeforeEnd = await waitFor(win, `
    Array.from(document.querySelectorAll('.message.assistant')).some((message) =>
      /pass322 before reload/.test(message.textContent || '') &&
      !/pass322 after reload/.test(message.textContent || '')
    )
  `, 10000);
  assertStep("PASS322_PARTIAL_VISIBLE_BEFORE_RESPONSE_END", partialVisibleBeforeEnd &&
    Boolean(serverState.streamResponse) && !serverState.streamResponse.writableEnded);
  const preReloadCheckpoint = await win.webContents.executeJavaScript(`
    window.claudexDesktop.getState().then((state) =>
      (state.activeChatRequests || []).find((item) => item?.requestId === ${JSON.stringify(streamRequestId)}) || null
    )
  `);
  assertStep("PASS322_PRE_RELOAD_CHECKPOINT_EXACT", preReloadCheckpoint?.content === "pass322 before reload" &&
    Number(preReloadCheckpoint?.streamRevision || 0) > 0);

  await reloadWindow(win);
  assertStep("PASS322_RELOAD_FINISHED", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS322_RELOAD_RESTORED_PARTIAL", await waitFor(win, `
    window.claudexDesktop.getState().then((state) => {
      const active = (state.activeChatRequests || []).find((item) => item?.requestId === ${JSON.stringify(streamRequestId)});
      return Number(active?.streamRevision || 0) === ${JSON.stringify(Number(preReloadCheckpoint.streamRevision))} &&
        active?.content === 'pass322 before reload' &&
        Array.from(document.querySelectorAll('.message.assistant')).some((message) => /pass322 before reload/.test(message.textContent || ''));
    })
  `, 10000));
  writeSse(serverState.streamResponse, { choices: [{ delta: { content: " pass322 after reload" } }] });
  assertStep("PASS322_POST_RELOAD_DELTA_VISIBLE", await waitFor(win, `
    Array.from(document.querySelectorAll('.message.assistant')).some((message) =>
      /pass322 before reload/.test(message.textContent || '') && /pass322 after reload/.test(message.textContent || '')
    )
  `, 10000));
  const postReloadCheckpoint = await win.webContents.executeJavaScript(`
    window.claudexDesktop.getState().then((state) =>
      (state.activeChatRequests || []).find((item) => item?.requestId === ${JSON.stringify(streamRequestId)}) || null
    )
  `);
  assertStep("PASS322_POST_RELOAD_DELTA_CHECKPOINT", postReloadCheckpoint?.content === "pass322 before reload pass322 after reload" &&
    Number(postReloadCheckpoint?.streamRevision || 0) > Number(preReloadCheckpoint.streamRevision) &&
    !serverState.streamResponse.writableEnded);
  writeSse(serverState.streamResponse, {
    choices: [{ delta: {}, finish_reason: "stop" }],
  });
  writeSse(serverState.streamResponse, {
    choices: [],
    usage: { prompt_tokens: 17, completion_tokens: 9, total_tokens: 26 },
  });
  writeSse(serverState.streamResponse, "[DONE]");
  serverState.streamFinished = true;
  assertStep("PASS322_STREAM_SUCCESS_PERSISTED_ONCE", await waitForStore((state) => {
    const session = state.sessions?.find((item) => item.id === "default");
    const assistants = (session?.messages || []).filter((message) => message.role === "assistant" && message.requestId === streamRequestId);
    const event = state.runEvents?.find((item) => item.id === streamRequestId);
    return event?.status === "ok" && assistants.length === 1 &&
      assistants[0].content === "pass322 before reload pass322 after reload" &&
      assistants[0].finishReason === "stop" &&
      assistants[0].usage?.prompt_tokens === 17 &&
      assistants[0].usage?.completion_tokens === 9 &&
      assistants[0].usage?.total_tokens === 26;
  }, 15000));
  assertStep("PASS322_OPENAI_TERMINAL_WITHOUT_EOF", !serverState.streamResponse.writableEnded);
  assertStep("PASS322_OPENAI_TERMINAL_CONNECTION_CLOSED", await waitForStore(() => serverState.streamTerminalClosed, 5000));
  if (!serverState.streamResponse.destroyed) serverState.streamResponse.end();
  assertStep("PASS322_STREAM_RUNTIME_CLEARED", await waitFor(win, `
    window.claudexDesktop.getState().then((state) =>
      !(state.activeChatRequests || []).some((item) => item?.requestId === ${JSON.stringify(streamRequestId)})
    )
  `, 10000));

  assertStep("PASS322_SET_CANCEL_PROMPT", await setComposer(win, CANCEL_PROMPT));
  assertStep("PASS322_SEND_CANCEL_PROMPT", await clickSend(win));
  const cancelRequestId = await waitFor(win, `
    window.claudexDesktop.getState().then((state) => state.runEvents?.find((event) =>
      event.type === 'chat' && event.status === 'running' && /pass322 stream cancel/.test(event.detail || '')
    )?.id || false)
  `, 10000);
  assertStep("PASS322_CANCEL_RUNNING_EVENT", Boolean(cancelRequestId));
  assertStep("PASS322_CANCEL_PARTIAL_VISIBLE", await waitFor(win, `
    Array.from(document.querySelectorAll('.message.assistant')).some((message) => /pass322 cancel partial/.test(message.textContent || ''))
  `, 10000));
  assertStep("PASS322_CANCEL_CLICKED", await clickCancel(win));
  assertStep("PASS322_CANCEL_STREAM_CONNECTION_CLOSED", await waitForStore(() => serverState.cancelClosed, 10000));
  assertStep("PASS322_CANCELLED_PERSISTED_ONCE", await waitForStore((state) => {
    const session = state.sessions?.find((item) => item.id === "default");
    const messages = session?.messages || [];
    const event = state.runEvents?.find((item) => item.id === cancelRequestId);
    return event?.status === "cancelled" &&
      messages.filter((message) => message.role === "cancelled" && message.requestId === cancelRequestId).length === 1 &&
      !messages.some((message) => message.role === "assistant" && message.requestId === cancelRequestId);
  }, 10000));

  assertStep("PASS322_CONFIGURE_ANTHROPIC", await configureProvider(win, "anthropic", `${apiOrigin}/v1`));
  assertStep("PASS322_SET_ANTHROPIC_PROMPT", await setComposer(win, ANTHROPIC_PROMPT));
  assertStep("PASS322_SEND_ANTHROPIC_PROMPT", await clickSend(win));
  const anthropicRequestId = await waitFor(win, `
    window.claudexDesktop.getState().then((state) => state.runEvents?.find((event) =>
      event.type === 'chat' && event.status === 'running' && /pass322 anthropic stream/.test(event.detail || '')
    )?.id || false)
  `, 10000);
  assertStep("PASS322_ANTHROPIC_RUNNING_EVENT", Boolean(anthropicRequestId));
  assertStep("PASS322_ANTHROPIC_TRUE_STREAM", await waitForStore(() => (
    serverState.requests.some((item) => item.route === "/v1/messages" && item.userPrompt === ANTHROPIC_PROMPT && item.stream === true)
  ), 10000));
  assertStep("PASS322_ANTHROPIC_PARTIAL_BEFORE_END", await waitFor(win, `
    Array.from(document.querySelectorAll('.message.assistant')).some((message) =>
      /pass322 anthropic first/.test(message.textContent || '') && !/anthropic second/.test(message.textContent || '')
    )
  `, 10000) && Boolean(serverState.anthropicResponse) && !serverState.anthropicResponse.writableEnded);
  serverState.anthropicResponse.write("event: content_block_delta\n");
  writeSse(serverState.anthropicResponse, {
    type: "content_block_delta",
    delta: { type: "text_delta", text: " anthropic second" },
  });
  serverState.anthropicResponse.write("event: message_delta\n");
  writeSse(serverState.anthropicResponse, {
    type: "message_delta",
    delta: { stop_reason: "end_turn" },
    usage: { output_tokens: 7 },
  });
  serverState.anthropicResponse.write("event: message_stop\n");
  writeSse(serverState.anthropicResponse, { type: "message_stop" });
  assertStep("PASS322_ANTHROPIC_SUCCESS_SINGLE_TERMINAL", await waitForStore((state) => {
    const session = state.sessions?.find((item) => item.id === "default");
    const assistants = (session?.messages || []).filter((message) => message.role === "assistant" && message.requestId === anthropicRequestId);
    const event = state.runEvents?.find((item) => item.id === anthropicRequestId);
    return event?.status === "ok" && assistants.length === 1 &&
      assistants[0].content === "pass322 anthropic first anthropic second" &&
      assistants[0].finishReason === "end_turn" &&
      assistants[0].usage?.input_tokens === 13 &&
      assistants[0].usage?.output_tokens === 7;
  }, 10000));
  assertStep("PASS322_ANTHROPIC_TERMINAL_WITHOUT_EOF", !serverState.anthropicResponse.writableEnded);
  assertStep("PASS322_ANTHROPIC_TERMINAL_CONNECTION_CLOSED", await waitForStore(() => serverState.anthropicTerminalClosed, 5000));
  if (!serverState.anthropicResponse.destroyed) serverState.anthropicResponse.end();

  assertStep("PASS322_CONFIGURE_OLLAMA", await configureProvider(win, "ollama", apiOrigin));
  assertStep("PASS322_SET_OLLAMA_PROMPT", await setComposer(win, OLLAMA_PROMPT));
  assertStep("PASS322_SEND_OLLAMA_PROMPT", await clickSend(win));
  const ollamaRequestId = await waitFor(win, `
    window.claudexDesktop.getState().then((state) => state.runEvents?.find((event) =>
      event.type === 'chat' && event.status === 'running' && /pass322 ollama stream/.test(event.detail || '')
    )?.id || false)
  `, 10000);
  assertStep("PASS322_OLLAMA_RUNNING_EVENT", Boolean(ollamaRequestId));
  assertStep("PASS322_OLLAMA_TRUE_STREAM", await waitForStore(() => (
    serverState.requests.some((item) => item.route === "/api/chat" && item.userPrompt === OLLAMA_PROMPT && item.stream === true)
  ), 10000));
  assertStep("PASS322_OLLAMA_PARTIAL_BEFORE_END", await waitFor(win, `
    Array.from(document.querySelectorAll('.message.assistant')).some((message) =>
      /pass322 ollama first/.test(message.textContent || '') && !/ollama second/.test(message.textContent || '')
    )
  `, 10000) && Boolean(serverState.ollamaResponse) && !serverState.ollamaResponse.writableEnded);
  writeNdjson(serverState.ollamaResponse, { message: { role: "assistant", content: " ollama second" }, done: false });
  writeNdjson(serverState.ollamaResponse, {
    message: { role: "assistant", content: "" },
    done: true,
    done_reason: "stop",
    prompt_eval_count: 11,
    eval_count: 5,
  });
  assertStep("PASS322_OLLAMA_SUCCESS_SINGLE_TERMINAL", await waitForStore((state) => {
    const session = state.sessions?.find((item) => item.id === "default");
    const assistants = (session?.messages || []).filter((message) => message.role === "assistant" && message.requestId === ollamaRequestId);
    const event = state.runEvents?.find((item) => item.id === ollamaRequestId);
    return event?.status === "ok" && assistants.length === 1 &&
      assistants[0].content === "pass322 ollama first ollama second" &&
      assistants[0].finishReason === "stop" &&
      assistants[0].usage?.prompt_eval_count === 11 &&
      assistants[0].usage?.eval_count === 5;
  }, 10000));
  assertStep("PASS322_OLLAMA_TERMINAL_WITHOUT_EOF", !serverState.ollamaResponse.writableEnded);
  assertStep("PASS322_OLLAMA_TERMINAL_CONNECTION_CLOSED", await waitForStore(() => serverState.ollamaTerminalClosed, 5000));
  if (!serverState.ollamaResponse.destroyed) serverState.ollamaResponse.end();

  assertStep("PASS322_CONFIGURE_OPENAI_TRUNCATION", await configureProvider(win, "openai-compatible", `${apiOrigin}/v1`));
  assertStep("PASS322_SET_TRUNCATED_PROMPT", await setComposer(win, TRUNCATED_PROMPT));
  assertStep("PASS322_SEND_TRUNCATED_PROMPT", await clickSend(win));
  const truncatedRequestId = await waitFor(win, `
    window.claudexDesktop.getState().then((state) => state.runEvents?.find((event) =>
      event.type === 'chat' && event.status === 'running' && /pass322 truncated stream/.test(event.detail || '')
    )?.id || false)
  `, 10000);
  assertStep("PASS322_TRUNCATED_RUNNING_EVENT", Boolean(truncatedRequestId));
  assertStep("PASS322_TRUNCATED_PARTIAL_VISIBLE", await waitFor(win, `
    Array.from(document.querySelectorAll('.message.assistant')).some((message) => /pass322 truncated partial/.test(message.textContent || ''))
  `, 10000) && Boolean(serverState.truncatedResponse));
  serverState.truncatedResponse.end();
  assertStep("PASS322_TRUNCATED_STREAM_REJECTED", await waitForStore((state) => {
    const session = state.sessions?.find((item) => item.id === "default");
    const messages = session?.messages || [];
    const event = state.runEvents?.find((item) => item.id === truncatedRequestId);
    return event?.status === "error" &&
      messages.filter((message) => message.role === "error" && message.requestId === truncatedRequestId).length === 1 &&
      !messages.some((message) => message.role === "assistant" && message.requestId === truncatedRequestId);
  }, 10000));

  assertStep("PASS322_SET_OPENAI_FINISH_EOF_PROMPT", await setComposer(win, OPENAI_FINISH_EOF_PROMPT));
  assertStep("PASS322_SEND_OPENAI_FINISH_EOF_PROMPT", await clickSend(win));
  const openAiFinishEofRequestId = await waitFor(win, `
    window.claudexDesktop.getState().then((state) => state.sessions?.find((session) => session.id === 'default')?.messages?.find((message) =>
      message.role === 'user' && message.content === ${JSON.stringify(OPENAI_FINISH_EOF_PROMPT)}
    )?.requestId || false)
  `, 10000);
  assertStep("PASS322_OPENAI_FINISH_EOF_REQUEST", Boolean(openAiFinishEofRequestId));
  assertStep("PASS322_OPENAI_FINISH_REASON_CLEAN_EOF_ACCEPTED", await waitForStore((state) => {
    const session = state.sessions?.find((item) => item.id === "default");
    const assistant = (session?.messages || []).find((message) => message.role === "assistant" && message.requestId === openAiFinishEofRequestId);
    const event = state.runEvents?.find((item) => item.id === openAiFinishEofRequestId);
    return event?.status === "ok" && assistant?.content === "pass322 finish eof success" && assistant?.finishReason === "stop";
  }, 10000));

  assertStep("PASS322_CONFIGURE_ANTHROPIC_TRUNCATION", await configureProvider(win, "anthropic", `${apiOrigin}/v1`));
  assertStep("PASS322_SET_ANTHROPIC_TRUNCATED_PROMPT", await setComposer(win, ANTHROPIC_TRUNCATED_PROMPT));
  assertStep("PASS322_SEND_ANTHROPIC_TRUNCATED_PROMPT", await clickSend(win));
  const anthropicTruncatedRequestId = await waitFor(win, `
    window.claudexDesktop.getState().then((state) => state.runEvents?.find((event) =>
      event.type === 'chat' && event.status === 'running' && /pass322 anthropic truncated stream/.test(event.detail || '')
    )?.id || false)
  `, 10000);
  assertStep("PASS322_ANTHROPIC_TRUNCATED_RUNNING_EVENT", Boolean(anthropicTruncatedRequestId));
  assertStep("PASS322_ANTHROPIC_TRUNCATED_PARTIAL_VISIBLE", await waitFor(win, `
    Array.from(document.querySelectorAll('.message.assistant')).some((message) => /pass322 anthropic truncated partial/.test(message.textContent || ''))
  `, 10000) && Boolean(serverState.anthropicTruncatedResponse));
  serverState.anthropicTruncatedResponse.end();
  assertStep("PASS322_ANTHROPIC_TRUNCATED_STREAM_REJECTED", await waitForStore((state) => {
    const session = state.sessions?.find((item) => item.id === "default");
    const messages = session?.messages || [];
    const event = state.runEvents?.find((item) => item.id === anthropicTruncatedRequestId);
    return event?.status === "error" &&
      messages.filter((message) => message.role === "error" && message.requestId === anthropicTruncatedRequestId).length === 1 &&
      !messages.some((message) => message.role === "assistant" && message.requestId === anthropicTruncatedRequestId);
  }, 10000));

  assertStep("PASS322_CONFIGURE_OLLAMA_TRUNCATION", await configureProvider(win, "ollama", apiOrigin));
  assertStep("PASS322_SET_OLLAMA_TRUNCATED_PROMPT", await setComposer(win, OLLAMA_TRUNCATED_PROMPT));
  assertStep("PASS322_SEND_OLLAMA_TRUNCATED_PROMPT", await clickSend(win));
  const ollamaTruncatedRequestId = await waitFor(win, `
    window.claudexDesktop.getState().then((state) => state.runEvents?.find((event) =>
      event.type === 'chat' && event.status === 'running' && /pass322 ollama truncated stream/.test(event.detail || '')
    )?.id || false)
  `, 10000);
  assertStep("PASS322_OLLAMA_TRUNCATED_RUNNING_EVENT", Boolean(ollamaTruncatedRequestId));
  assertStep("PASS322_OLLAMA_TRUNCATED_PARTIAL_VISIBLE", await waitFor(win, `
    Array.from(document.querySelectorAll('.message.assistant')).some((message) => /pass322 ollama truncated partial/.test(message.textContent || ''))
  `, 10000) && Boolean(serverState.ollamaTruncatedResponse));
  serverState.ollamaTruncatedResponse.end();
  assertStep("PASS322_OLLAMA_TRUNCATED_STREAM_REJECTED", await waitForStore((state) => {
    const session = state.sessions?.find((item) => item.id === "default");
    const messages = session?.messages || [];
    const event = state.runEvents?.find((item) => item.id === ollamaTruncatedRequestId);
    return event?.status === "error" &&
      messages.filter((message) => message.role === "error" && message.requestId === ollamaTruncatedRequestId).length === 1 &&
      !messages.some((message) => message.role === "assistant" && message.requestId === ollamaTruncatedRequestId);
  }, 10000));

  assertStep("PASS322_CONFIGURE_ANTHROPIC_JSON", await configureProvider(win, "anthropic", `${apiOrigin}/v1`));
  assertStep("PASS322_SET_ANTHROPIC_JSON_PROMPT", await setComposer(win, ANTHROPIC_JSON_PROMPT));
  assertStep("PASS322_SEND_ANTHROPIC_JSON_PROMPT", await clickSend(win));
  const anthropicJsonRequestId = await waitFor(win, `
    window.claudexDesktop.getState().then((state) => state.sessions?.find((session) => session.id === 'default')?.messages?.find((message) =>
      message.role === 'user' && message.content === ${JSON.stringify(ANTHROPIC_JSON_PROMPT)}
    )?.requestId || false)
  `, 10000);
  assertStep("PASS322_ANTHROPIC_JSON_REQUEST", Boolean(anthropicJsonRequestId));
  assertStep("PASS322_ANTHROPIC_JSON_FALLBACK", await waitForStore((state) => {
    const session = state.sessions?.find((item) => item.id === "default");
    const assistant = (session?.messages || []).find((message) => message.role === "assistant" && message.requestId === anthropicJsonRequestId);
    const event = state.runEvents?.find((item) => item.id === anthropicJsonRequestId);
    return event?.status === "ok" && assistant?.content === "pass322 anthropic json success" &&
      assistant?.finishReason === "end_turn" &&
      assistant?.usage?.input_tokens === 19 &&
      assistant?.usage?.output_tokens === 8;
  }, 10000));

  assertStep("PASS322_CONFIGURE_OLLAMA_JSON", await configureProvider(win, "ollama", apiOrigin));
  assertStep("PASS322_SET_OLLAMA_JSON_PROMPT", await setComposer(win, OLLAMA_JSON_PROMPT));
  assertStep("PASS322_SEND_OLLAMA_JSON_PROMPT", await clickSend(win));
  const ollamaJsonRequestId = await waitFor(win, `
    window.claudexDesktop.getState().then((state) => state.sessions?.find((session) => session.id === 'default')?.messages?.find((message) =>
      message.role === 'user' && message.content === ${JSON.stringify(OLLAMA_JSON_PROMPT)}
    )?.requestId || false)
  `, 10000);
  assertStep("PASS322_OLLAMA_JSON_REQUEST", Boolean(ollamaJsonRequestId));
  assertStep("PASS322_OLLAMA_PRETTY_JSON_FALLBACK", await waitForStore((state) => {
    const session = state.sessions?.find((item) => item.id === "default");
    const assistant = (session?.messages || []).find((message) => message.role === "assistant" && message.requestId === ollamaJsonRequestId);
    const event = state.runEvents?.find((item) => item.id === ollamaJsonRequestId);
    return event?.status === "ok" && assistant?.content === "pass322 ollama json success" &&
      assistant?.finishReason === "stop" &&
      assistant?.usage?.prompt_eval_count === 23 &&
      assistant?.usage?.eval_count === 6;
  }, 10000));

  assertStep("PASS322_CONFIGURE_HTTP_ERROR_CANCEL", await configureProvider(win, "openai-compatible", `${apiOrigin}/v1`));
  assertStep("PASS322_SET_HTTP_ERROR_CANCEL_PROMPT", await setComposer(win, HTTP_ERROR_CANCEL_PROMPT));
  assertStep("PASS322_SEND_HTTP_ERROR_CANCEL_PROMPT", await clickSend(win));
  const httpErrorCancelRequestId = await waitFor(win, `
    window.claudexDesktop.getState().then((state) => state.runEvents?.find((event) =>
      event.type === 'chat' && event.status === 'running' && /pass322 http error body cancel/.test(event.detail || '')
    )?.id || false)
  `, 10000);
  assertStep("PASS322_HTTP_ERROR_CANCEL_RUNNING_EVENT", Boolean(httpErrorCancelRequestId));
  assertStep("PASS322_HTTP_ERROR_CANCEL_BODY_PENDING", await waitForStore(() => Boolean(serverState.httpErrorCancelResponse), 10000));
  assertStep("PASS322_HTTP_ERROR_CANCEL_CLICKED", await clickCancel(win));
  assertStep("PASS322_HTTP_ERROR_CANCEL_CONNECTION_CLOSED", await waitForStore(() => serverState.httpErrorCancelClosed, 10000));
  assertStep("PASS322_HTTP_ERROR_STATUS_PRESERVED_ON_CANCEL", await waitForStore((state) => {
    const session = state.sessions?.find((item) => item.id === "default");
    const messages = session?.messages || [];
    const event = state.runEvents?.find((item) => item.id === httpErrorCancelRequestId);
    return event?.status === "error" && /HTTP 503/.test(event.detail || "") &&
      messages.filter((message) => message.role === "error" && message.requestId === httpErrorCancelRequestId).length === 1 &&
      !messages.some((message) => ["assistant", "cancelled"].includes(message.role) && message.requestId === httpErrorCancelRequestId);
  }, 10000));
  assertStep("PASS322_ALL_REQUESTS_USE_HAIKU_45", serverState.requests.every((item) => item.model === MODEL));

  console.log("PASS322_API_STREAMING_RELOAD_DONE");
  await exitWithCleanup(0);
}

async function bootstrap() {
  const baseUrl = await startApiServer();
  process.env.ANTHROPIC_API_KEY = "pass322-test-key";
  app.setPath("userData", USER_DATA_DIR);
  writeInitialStore(baseUrl);
  require(path.join(REPO_DIR, "electron", "main.cjs"));
  app.whenReady().then(runTest).catch((error) => {
    console.error("PASS322_FAILED", error?.stack || error);
    void exitWithCleanup(1);
  });
}

bootstrap().catch((error) => {
  console.error("PASS322_BOOTSTRAP_FAILED", error?.stack || error);
  void exitWithCleanup(1);
});

setTimeout(() => {
  console.error("PASS322_TIMEOUT");
  void exitWithCleanup(1);
}, 120000);
