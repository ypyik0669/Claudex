const fs = require("fs");
const os = require("os");
const path = require("path");

for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", (error) => {
    if (error?.code !== "EPIPE") throw error;
  });
}

const { app, BrowserWindow, clipboard } = require("electron");

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
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass337-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass337-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass337-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const COMPLETE_PROMPT = "pass337 complete tool evidence";
const LIMIT_PROMPT = "pass337 tool step limit";
const RUNNING_LIMIT_PROMPT = "pass337 running step retention";
const BUDGET_PROMPT = "pass337 tool evidence budget";
const ERROR_PROMPT = "pass337 error tool evidence";
const CANCEL_PROMPT = "pass337 cancel tool evidence";
const RESULT_CANCEL_PROMPT = "pass337 result cancel race";
const READ_TOOL_ID = "toolu_pass337_read";
const BASH_TOOL_ID = "toolu_pass337_bash";
const CANCEL_TOOL_ID = "toolu_pass337_cancel";
const RESULT_CANCEL_TOOL_ID = "toolu_pass337_result_cancel";
const ERROR_TOOL_ID = "toolu_pass337_error";

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
  try {
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      await win.webContents.executeJavaScript(`
        (async () => {
          const state = await window.claudexDesktop?.getState?.();
          for (const request of state?.activeChatRequests || []) {
            try { await window.claudexDesktop.cancelRequest(request.requestId); } catch (_error) {}
          }
        })()
      `);
    }
  } catch (_error) {
    // Renderer teardown may race cleanup.
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
    try {
      const value = await win.webContents.executeJavaScript(script);
      if (value) return value;
    } catch (_error) {
      // Reload can briefly invalidate the execution context.
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

async function waitForClipboard(expected = [], timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const text = clipboard.readText();
    if (expected.every((item) => item instanceof RegExp ? item.test(text) : text.includes(item))) return text;
    await wait(120);
  }
  return "";
}

function assertStep(name, ok) {
  console.log(name, ok);
  if (!ok) throw new Error(`${name} failed`);
}

function writeFakeClaude() {
  const script = `
const args = process.argv.slice(2);
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value) + '\\n'); }
if (args[0] === '-p' && /pass337 complete tool evidence/.test(String(args[1] || ''))) {
  out({ type: 'system', subtype: 'init', session_id: 'pass337-session', claude_code_version: '2.10.0' });
  out({ type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: '${READ_TOOL_ID}', name: 'Read', input: {} } } });
  out({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: '${READ_TOOL_ID}', name: 'Read', input: { file_path: 'README.md', evidence: 'i'.repeat(9000) } }] } });
  setTimeout(() => {
    out({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: '${READ_TOOL_ID}', content: [{ type: 'text', text: 'pass337 read result ' + 'o'.repeat(9000) }], is_error: false }] } });
    out({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: '${BASH_TOOL_ID}', name: 'Bash', input: { command: 'npm run build' } }] } });
    out({ type: 'stream_event', event: { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: '${BASH_TOOL_ID}', name: 'Bash', input: {} } } });
    out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'pass337 assistant complete' } } });
    out({ type: 'result', result: 'pass337 assistant complete', session_id: 'pass337-session', duration_ms: 337 });
  }, 4000);
} else if (args[0] === '-p' && /pass337 tool step limit/.test(String(args[1] || ''))) {
  out({ type: 'system', subtype: 'init', session_id: 'pass337-session', claude_code_version: '2.10.0' });
  for (let index = 0; index < 35; index += 1) {
    const toolUseId = 'toolu_pass337_limit_' + index;
    out({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: toolUseId, name: 'LimitTool', input: { index } }] } });
    out({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseId, content: 'limit result ' + index, is_error: false }] } });
  }
  out({ type: 'result', result: 'pass337 limit complete', session_id: 'pass337-session', duration_ms: 338 });
} else if (args[0] === '-p' && /pass337 running step retention/.test(String(args[1] || ''))) {
  out({ type: 'system', subtype: 'init', session_id: 'pass337-session', claude_code_version: '2.10.0' });
  out({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_pass337_running_0', name: 'RunningTool', input: { index: 0 } }] } });
  for (let index = 1; index < 35; index += 1) {
    const toolUseId = 'toolu_pass337_running_' + index;
    out({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: toolUseId, name: 'RunningTool', input: { index } }] } });
    out({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseId, content: 'running retention result ' + index, is_error: false }] } });
  }
  setTimeout(() => out({ type: 'result', result: 'pass337 running retention complete', session_id: 'pass337-session', duration_ms: 339 }), 2000);
} else if (args[0] === '-p' && /pass337 tool evidence budget/.test(String(args[1] || ''))) {
  out({ type: 'system', subtype: 'init', session_id: 'pass337-session', claude_code_version: '2.10.0' });
  for (let index = 0; index < 5; index += 1) {
    const toolUseId = 'toolu_pass337_budget_' + index;
    out({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: toolUseId, name: 'BudgetTool', input: { index, evidence: ('input-' + index + '-').repeat(1200) } }] } });
    out({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseId, content: ('output-' + index + '-').repeat(1200), is_error: false }] } });
  }
  out({ type: 'result', result: 'pass337 budget complete', session_id: 'pass337-session', duration_ms: 340 });
} else if (args[0] === '-p' && /pass337 error tool evidence/.test(String(args[1] || ''))) {
  out({ type: 'system', subtype: 'init', session_id: 'pass337-session', claude_code_version: '2.10.0' });
  out({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: '${ERROR_TOOL_ID}', name: 'Bash', input: { command: 'pass337-error-command' } }] } });
  out({ type: 'result', is_error: true, result: 'pass337 terminal tool error', session_id: 'pass337-session', duration_ms: 341 });
} else if (args[0] === '-p' && /pass337 cancel tool evidence/.test(String(args[1] || ''))) {
  out({ type: 'system', subtype: 'init', session_id: 'pass337-session', claude_code_version: '2.10.0' });
  out({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: '${CANCEL_TOOL_ID}', name: 'Bash', input: { command: 'long-running-pass337' } }] } });
  process.stdout.write(JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: '${CANCEL_TOOL_ID}', content: 'pass337 late cancel result', is_error: false }] } }));
  setInterval(() => {}, 1000);
} else if (args[0] === '-p' && /pass337 result cancel race/.test(String(args[1] || ''))) {
  out({ type: 'system', subtype: 'init', session_id: 'pass337-session', claude_code_version: '2.10.0' });
  out({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: '${RESULT_CANCEL_TOOL_ID}', name: 'Read', input: { file_path: 'RESULT.md' } }] } });
  setTimeout(() => {
    out({ type: 'result', result: 'pass337 result wins cancel', session_id: 'pass337-session', duration_ms: 339 });
  }, 500);
  setInterval(() => {}, 1000);
} else if (args[0] === '--version') out('2.10.0 (Claude Code PASS337)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'pass337-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else out('pass337 generic');
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass337-project" }), "utf8");
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
    activeProject: { name: "pass337-project", path: PROJECT_DIR },
    projects: [{ name: "pass337-project", path: PROJECT_DIR }],
    sessions: [{
      id: "default",
      title: "新聊天",
      project: "pass337-project",
      projectPath: PROJECT_DIR,
      createdAt: "2026-07-16T00:00:00.000Z",
      updatedAt: "2026-07-16T00:00:00.000Z",
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

async function openOutputsPanel(win) {
  return win.webContents.executeJavaScript(`
    (() => {
      if (document.querySelector('.bottom-work-panel .run-timeline')) return true;
      const button = [...document.querySelectorAll('.workspace-context-tabs .workspace-context-button')]
        .find((candidate) => /输出/.test(candidate.textContent || ''));
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

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS337_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(600);

  assertStep("PASS337_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS337_HAIKU_45", await win.webContents.executeJavaScript(`window.claudexDesktop.getState().then((state) => state.settings?.model === 'claude-haiku-4-5-20251001')`));
  assertStep("PASS337_SET_COMPLETE_PROMPT", await setComposer(win, COMPLETE_PROMPT));
  assertStep("PASS337_SEND_COMPLETE_PROMPT", await clickSend(win));
  const completedRequestId = await waitFor(win, `
    window.claudexDesktop.getState().then((state) => state.sessions?.find((session) => session.id === 'default')?.messages?.find((message) =>
      message.role === 'user' && message.content === ${JSON.stringify(COMPLETE_PROMPT)}
    )?.requestId || false)
  `, 15000);
  assertStep("PASS337_COMPLETE_REQUEST_PERSISTED", Boolean(completedRequestId));
  assertStep("PASS337_RUNNING_TOOL_STEP_PERSISTED", await waitForStore((state) => {
    const event = (state.runEvents || []).find((item) => item.id === completedRequestId);
    const steps = event?.steps || [];
    const read = steps.find((step) => step.toolUseId === READ_TOOL_ID);
    return event?.status === "running" && steps.length === 1 && read?.status === "running" && /README\.md/.test(read.input || "");
  }, 10000));
  assertStep("PASS337_RUNNING_ACTIVITY_DEDUPED", await waitFor(win, `
    (() => {
      const activities = Array.from(document.querySelectorAll('.message.assistant .activity-lines li'))
        .filter((item) => /Read/.test(item.textContent || ''));
      return activities.length === 1;
    })()
  `, 10000));
  await reloadWindow(win);
  assertStep("PASS337_RUNNING_RELOAD_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS337_RUNNING_RELOAD_RESTORES_TOOL_STEP", await waitFor(win, `
    window.claudexDesktop.getState().then((state) => {
      const request = (state.activeChatRequests || []).find((item) => item.requestId === ${JSON.stringify(completedRequestId)});
      const steps = request?.steps || [];
      return request?.status === 'running' && steps.length === 1 &&
        steps[0]?.toolUseId === ${JSON.stringify(READ_TOOL_ID)} && steps[0]?.status === 'running';
    })
  `, 10000));
  assertStep("PASS337_COMPLETE_EVENT", await waitForStore((state) => (
    state.runEvents?.some((event) => event.id === completedRequestId && event.type === "chat" && event.status === "ok")
  ), 10000));
  assertStep("PASS337_COMPLETED_TOOL_STEPS_PERSISTED", await waitForStore((state) => {
    const event = (state.runEvents || []).find((item) => item.id === completedRequestId);
    const steps = event?.steps || [];
    const read = steps.find((step) => step.toolUseId === READ_TOOL_ID);
    const bash = steps.find((step) => step.toolUseId === BASH_TOOL_ID);
    const totalEvidenceChars = steps.reduce((total, step) => total + String(step.input || "").length + String(step.output || "").length, 0);
    return event?.status === "ok" && steps.length === 2 &&
      read?.status === "ok" && /README\.md/.test(read.input || "") && /pass337 read result/.test(read.output || "") &&
      read.input.length <= 6000 && read.output.length <= 6000 && /证据已截断/.test(read.input) && /证据已截断/.test(read.output) &&
      bash?.status === "ok" && /npm run build/.test(bash.input || "") && Boolean(bash.endedAt) &&
      steps.filter((step) => step.toolUseId === READ_TOOL_ID).length === 1 &&
      steps.filter((step) => step.toolUseId === BASH_TOOL_ID).length === 1 && totalEvidenceChars <= 48000;
  }, 10000));
  assertStep("PASS337_OPEN_OUTPUTS", await openOutputsPanel(win));
  assertStep("PASS337_TOOL_STEPS_VISIBLE", await waitFor(win, `
    (() => {
      const row = document.querySelector('.run-timeline-row[data-run-event-id="${completedRequestId}"]');
      if (!row) return false;
      row.open = true;
      const steps = row.querySelectorAll('[data-run-step-id]');
      const text = row.textContent || '';
      return steps.length === 2 && /Read/.test(text) && /Bash/.test(text) && /pass337 read result/.test(text);
    })()
  `, 10000));

  await reloadWindow(win);
  assertStep("PASS337_RELOAD_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS337_RELOAD_OUTPUTS", await openOutputsPanel(win));
  assertStep("PASS337_RELOAD_RESTORES_TOOL_STEPS", await waitFor(win, `
    (() => {
      const row = document.querySelector('.run-timeline-row[data-run-event-id="${completedRequestId}"]');
      if (!row) return false;
      row.open = true;
      return row.querySelectorAll('[data-run-step-id]').length === 2 && /pass337 read result/.test(row.textContent || '');
    })()
  `, 10000));
  clipboard.writeText("");
  assertStep("PASS337_COPY_TOOL_EVIDENCE", await win.webContents.executeJavaScript(`
    (() => {
      const row = document.querySelector('.run-timeline-row[data-run-event-id="${completedRequestId}"]');
      const button = row?.querySelector('[data-run-timeline-action="copy-evidence"]');
      if (!button) return false;
      button.click();
      return true;
    })()
  `));
  assertStep("PASS337_COPIED_TOOL_EVIDENCE_COMPLETE", Boolean(await waitForClipboard([
    READ_TOOL_ID,
    BASH_TOOL_ID,
    "pass337 read result",
    "[证据已截断]",
  ])));

  assertStep("PASS337_SET_LIMIT_PROMPT", await setComposer(win, LIMIT_PROMPT));
  assertStep("PASS337_SEND_LIMIT_PROMPT", await clickSend(win));
  const limitRequestId = await waitFor(win, `
    window.claudexDesktop.getState().then((state) => state.sessions?.find((session) => session.id === 'default')?.messages?.find((message) =>
      message.role === 'user' && message.content === ${JSON.stringify(LIMIT_PROMPT)}
    )?.requestId || false)
  `, 15000);
  assertStep("PASS337_LIMIT_REQUEST_PERSISTED", Boolean(limitRequestId));
  assertStep("PASS337_STEP_LIMIT_KEEPS_LATEST", await waitForStore((state) => {
    const event = (state.runEvents || []).find((item) => item.id === limitRequestId);
    const steps = event?.steps || [];
    return event?.status === "ok" && steps.length === 32 &&
      !steps.some((step) => step.toolUseId === "toolu_pass337_limit_0") &&
      steps.some((step) => step.toolUseId === "toolu_pass337_limit_34" && step.status === "ok" && /limit result 34/.test(step.output || "")) &&
      !steps.some((step) => step.status === "running");
  }, 15000));

  assertStep("PASS337_SET_RUNNING_LIMIT_PROMPT", await setComposer(win, RUNNING_LIMIT_PROMPT));
  assertStep("PASS337_SEND_RUNNING_LIMIT_PROMPT", await clickSend(win));
  const runningLimitRequestId = await waitFor(win, `
    window.claudexDesktop.getState().then((state) => state.sessions?.find((session) => session.id === 'default')?.messages?.find((message) =>
      message.role === 'user' && message.content === ${JSON.stringify(RUNNING_LIMIT_PROMPT)}
    )?.requestId || false)
  `, 15000);
  assertStep("PASS337_RUNNING_LIMIT_REQUEST_PERSISTED", Boolean(runningLimitRequestId));
  assertStep("PASS337_STEP_LIMIT_RETAINS_RUNNING", await waitForStore((state) => {
    const event = (state.runEvents || []).find((item) => item.id === runningLimitRequestId);
    const steps = event?.steps || [];
    return event?.status === "running" && steps.length === 32 &&
      steps.some((step) => step.toolUseId === "toolu_pass337_running_0" && step.status === "running") &&
      !steps.some((step) => step.toolUseId === "toolu_pass337_running_1") &&
      steps.some((step) => step.toolUseId === "toolu_pass337_running_34" && step.status === "ok");
  }, 10000));
  assertStep("PASS337_RUNNING_LIMIT_SETTLES", await waitForStore((state) => {
    const event = (state.runEvents || []).find((item) => item.id === runningLimitRequestId);
    const step = (event?.steps || []).find((item) => item.toolUseId === "toolu_pass337_running_0");
    return event?.status === "ok" && step?.status === "ok" && !(event.steps || []).some((item) => item.status === "running");
  }, 15000));

  assertStep("PASS337_SET_BUDGET_PROMPT", await setComposer(win, BUDGET_PROMPT));
  assertStep("PASS337_SEND_BUDGET_PROMPT", await clickSend(win));
  const budgetRequestId = await waitFor(win, `
    window.claudexDesktop.getState().then((state) => state.sessions?.find((session) => session.id === 'default')?.messages?.find((message) =>
      message.role === 'user' && message.content === ${JSON.stringify(BUDGET_PROMPT)}
    )?.requestId || false)
  `, 15000);
  assertStep("PASS337_BUDGET_REQUEST_PERSISTED", Boolean(budgetRequestId));
  assertStep("PASS337_TOTAL_EVIDENCE_BUDGET", await waitForStore((state) => {
    const event = (state.runEvents || []).find((item) => item.id === budgetRequestId);
    const steps = event?.steps || [];
    const oldest = steps.find((step) => step.toolUseId === "toolu_pass337_budget_0");
    const latest = steps.find((step) => step.toolUseId === "toolu_pass337_budget_4");
    const totalEvidenceChars = steps.reduce((total, step) => total + String(step.input || "").length + String(step.output || "").length, 0);
    return event?.status === "ok" && steps.length === 5 && totalEvidenceChars <= 48000 &&
      !oldest?.input && !oldest?.output && latest?.input?.length <= 6000 && latest?.output?.length <= 6000 &&
      /证据已截断/.test(latest?.input || "") && /证据已截断/.test(latest?.output || "");
  }, 15000));

  assertStep("PASS337_SET_ERROR_PROMPT", await setComposer(win, ERROR_PROMPT));
  assertStep("PASS337_SEND_ERROR_PROMPT", await clickSend(win));
  const errorRequestId = await waitFor(win, `
    window.claudexDesktop.getState().then((state) => state.sessions?.find((session) => session.id === 'default')?.messages?.find((message) =>
      message.role === 'user' && message.content === ${JSON.stringify(ERROR_PROMPT)}
    )?.requestId || false)
  `, 15000);
  assertStep("PASS337_ERROR_REQUEST_PERSISTED", Boolean(errorRequestId));
  assertStep("PASS337_ERROR_TERMINATES_TOOL_STEP", await waitForStore((state) => {
    const event = (state.runEvents || []).find((item) => item.id === errorRequestId);
    const step = (event?.steps || []).find((item) => item.toolUseId === ERROR_TOOL_ID);
    return event?.status === "error" && /pass337 terminal tool error/.test(event.detail || "") &&
      step?.status === "error" && Boolean(step.endedAt) && !(event.steps || []).some((item) => item.status === "running");
  }, 15000));

  assertStep("PASS337_SET_CANCEL_PROMPT", await setComposer(win, CANCEL_PROMPT));
  assertStep("PASS337_SEND_CANCEL_PROMPT", await clickSend(win));
  const cancelledRequestId = await waitFor(win, `
    window.claudexDesktop.getState().then((state) => state.runEvents?.find((event) =>
      event.type === 'chat' && event.status === 'running' && /pass337 cancel tool evidence/.test(event.detail || '')
    )?.id || false)
  `, 10000);
  assertStep("PASS337_CANCEL_EVENT_RUNNING", Boolean(cancelledRequestId));
  assertStep("PASS337_CANCEL_TOOL_STEP_RUNNING", await waitForStore((state) => {
    const event = (state.runEvents || []).find((item) => item.id === cancelledRequestId);
    const step = (event?.steps || []).find((item) => item.toolUseId === CANCEL_TOOL_ID);
    return event?.status === "running" && step?.status === "running" && /long-running-pass337/.test(step.input || "");
  }, 10000));
  const cancelFeedback = await win.webContents.executeJavaScript(`
    (async () => {
      const cancelled = await window.claudexDesktop.cancelRequest(${JSON.stringify(cancelledRequestId)});
      const state = await window.claudexDesktop.getState();
      const request = (state.activeChatRequests || []).find((item) => item.requestId === ${JSON.stringify(cancelledRequestId)});
      const event = (state.runEvents || []).find((item) => item.id === ${JSON.stringify(cancelledRequestId)});
      return {
        cancelled,
        activeStatus: request?.status || '',
        activeStepStatus: request?.steps?.find((item) => item.toolUseId === ${JSON.stringify(CANCEL_TOOL_ID)})?.status || '',
        eventStatus: event?.status || '',
        eventStepStatus: event?.steps?.find((item) => item.toolUseId === ${JSON.stringify(CANCEL_TOOL_ID)})?.status || '',
      };
    })()
  `);
  assertStep("PASS337_CANCEL_REQUEST", cancelFeedback?.cancelled === true);
  assertStep("PASS337_CANCEL_STOPPING_STEP_TERMINAL", Boolean(
    cancelFeedback?.eventStepStatus === "cancelled" &&
    (!cancelFeedback.activeStatus || (
      cancelFeedback.activeStatus === "stopping" && cancelFeedback.activeStepStatus === "cancelled"
    )),
  ));
  assertStep("PASS337_CANCEL_TERMINATES_TOOL_STEP", await waitForStore((state) => {
    const event = (state.runEvents || []).find((item) => item.id === cancelledRequestId);
    const step = (event?.steps || []).find((item) => item.toolUseId === CANCEL_TOOL_ID);
    return event?.status === "cancelled" && step?.status === "cancelled" && Boolean(step.endedAt) &&
      /pass337 late cancel result/.test(step.output || "") &&
      !(event.steps || []).some((item) => item.status === "running");
  }, 15000));

  assertStep("PASS337_SET_RESULT_CANCEL_PROMPT", await setComposer(win, RESULT_CANCEL_PROMPT));
  assertStep("PASS337_SEND_RESULT_CANCEL_PROMPT", await clickSend(win));
  const resultCancelRequestId = await waitFor(win, `
    window.claudexDesktop.getState().then((state) => state.sessions?.find((session) => session.id === 'default')?.messages?.find((message) =>
      message.role === 'user' && message.content === ${JSON.stringify(RESULT_CANCEL_PROMPT)}
    )?.requestId || false)
  `, 15000);
  assertStep("PASS337_RESULT_CANCEL_REQUEST_PERSISTED", Boolean(resultCancelRequestId));
  assertStep("PASS337_RESULT_SETTLES_RUNTIME_STEP", await waitFor(win, `
    window.claudexDesktop.getState().then((state) => {
      const request = (state.activeChatRequests || []).find((item) => item.requestId === ${JSON.stringify(resultCancelRequestId)});
      const step = request?.steps?.find((item) => item.toolUseId === ${JSON.stringify(RESULT_CANCEL_TOOL_ID)});
      return request?.status === 'running' && step?.status === 'ok';
    })
  `, 10000));
  assertStep("PASS337_CANCEL_AFTER_RESULT_REQUEST", await win.webContents.executeJavaScript(`
    window.claudexDesktop.cancelRequest(${JSON.stringify(resultCancelRequestId)})
  `));
  assertStep("PASS337_RESULT_WINS_CANCEL_STEP_STATUS", await waitForStore((state) => {
    const event = (state.runEvents || []).find((item) => item.id === resultCancelRequestId);
    const step = (event?.steps || []).find((item) => item.toolUseId === RESULT_CANCEL_TOOL_ID);
    return event?.status === "ok" && step?.status === "ok" && Boolean(step.endedAt) &&
      !(event.steps || []).some((item) => item.status === "running");
  }, 15000));

  console.log("PASS337_CHAT_TOOL_EVIDENCE_DONE");
  await exitWithCleanup(0);
}

const fakeClaudeCommand = writeFakeClaude();
app.setPath("userData", USER_DATA_DIR);
writeInitialStore(fakeClaudeCommand);
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS337_FAILED", error?.stack || error);
  await exitWithCleanup(1);
});

setTimeout(() => {
  console.error("PASS337_TIMEOUT");
  void exitWithCleanup(1);
}, 120000);
