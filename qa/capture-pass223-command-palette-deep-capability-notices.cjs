const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow, clipboard } = require("electron");

function findRepoDir() {
  const candidates = [
    process.env.CLAUDEX_REPO_DIR,
    process.cwd(),
    __dirname,
    path.join(__dirname, ".."),
  ].filter(Boolean);
  for (const candidate of candidates) {
    let current = path.resolve(candidate);
    while (current && current !== path.dirname(current)) {
      if (
        fs.existsSync(path.join(current, "package.json")) &&
        fs.existsSync(path.join(current, "electron", "main.cjs"))
      ) {
        return current;
      }
      current = path.dirname(current);
    }
  }
  throw new Error("Unable to locate Claudex repo root");
}

const REPO_DIR = findRepoDir();
process.chdir(REPO_DIR);

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass223-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass223-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass223-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const TARGET_CAPABILITY_RUN_ID = "pass223-capability-run-17";
const TARGET_NOTICE_ID = "pass223-notice-17";
const TARGET_NOTICE_RUN_ID = "pass223-notice-run-event-17";
const TARGET_CAPABILITY_TOKEN = "pass223 deep capability recovery 17 stderr token";
const TARGET_NOTICE_TOKEN = "pass223 deep notice 17 opens timeline token";

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_DIR]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_error) {
      // best-effort cleanup
    }
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(win, script, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const ok = await win.webContents.executeJavaScript(script);
    if (ok) return true;
    await wait(150);
  }
  return false;
}

async function waitForClipboard(patterns, timeoutMs = 6000) {
  const checks = Array.isArray(patterns) ? patterns : [patterns];
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const text = clipboard.readText() || "";
    if (checks.every((pattern) => (pattern instanceof RegExp ? pattern.test(text) : text.includes(String(pattern))))) {
      return true;
    }
    await wait(120);
  }
  console.error("PASS223_CLIPBOARD_DEBUG", clipboard.readText());
  return false;
}

function assertStep(name, ok) {
  console.log(name, ok);
  if (!ok) throw new Error(`${name} failed`);
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function writeFakeClaude() {
  const fakeClaudeScript = `
const args = process.argv.slice(2);
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
if (args[0] === '--version') out('2.23.0 (Claude Code PASS223)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else if (args[0] === 'mcp' && args[1] === 'list') out('pass223 mcp list ok');
else out('pass223 fake claude command: ' + args.join(' '));
`;
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(FAKE_CLAUDE, `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function makeCapabilityRun(index, project) {
  const padded = String(index).padStart(2, "0");
  const minute = String(60 - index).padStart(2, "0");
  const isTarget = index === 17;
  return {
    id: `pass223-capability-run-${index}`,
    requestId: `pass223-capability-run-${index}`,
    kind: "capability",
    command: "mcp list",
    commandLine: "mcp list",
    cwd: project.path,
    project,
    code: isTarget ? 17 : 9,
    durationMs: 300 + index,
    stdout: isTarget ? `${TARGET_CAPABILITY_TOKEN} stdout` : `pass223 filler capability ${padded} stdout`,
    stderr: isTarget ? `${TARGET_CAPABILITY_TOKEN} stderr` : `pass223 filler capability ${padded} stderr`,
    startedAt: `2026-07-08T03:${minute}:00.000Z`,
    endedAt: `2026-07-08T03:${minute}:01.000Z`,
  };
}

function makeNotice(index, project) {
  const padded = String(index).padStart(2, "0");
  const minute = String(40 - index).padStart(2, "0");
  const isTarget = index === 17;
  return {
    id: `pass223-notice-${index}`,
    key: `pass223:notice:${index}`,
    level: isTarget ? "error" : "warning",
    source: "runtime-health",
    title: isTarget ? "pass223 deep notice 17" : `pass223 filler notice ${padded}`,
    detail: isTarget ? TARGET_NOTICE_TOKEN : `pass223 filler notice ${padded} detail`,
    action: isTarget ? "runtime-health:plugins" : "runtime-health:mcp",
    runEventId: isTarget ? TARGET_NOTICE_RUN_ID : "",
    project,
    sessionId: "pass223-session",
    count: 1,
    createdAt: `2026-07-08T02:${minute}:00.000Z`,
    lastSeenAt: `2026-07-08T02:${minute}:00.000Z`,
  };
}

function writeInitialStore() {
  writeFakeClaude();
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass223-project" }), "utf8");
  const project = { name: "pass223-project", path: PROJECT_DIR };
  writeJson(DATA_FILE, {
    version: 1,
    settings: {
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      baseUrl: "https://api.example.invalid",
      temperature: 0.2,
      timeoutMs: 600000,
      language: "zh",
      appearance: { fontSize: "compact", density: "compact" },
      systemPrompt: "QA",
      claudeCode: { executionMode: "claude-code", claudeCommand: FAKE_CLAUDE, permissionMode: "default" },
      capabilities: {
        "project-context": true,
        "terminal-helper": true,
        "mcp-runtime": true,
        "plugin-router": true,
        "marketplace-router": true,
      },
      customMarketplaces: [],
      apiKeys: {},
    },
    activeProject: project,
    projects: [project],
    sessions: [
      {
        id: "pass223-session",
        title: "PASS223 deep capability and notice commands",
        project: project.name,
        projectPath: project.path,
        createdAt: "2026-07-08T02:23:00.000Z",
        updatedAt: "2026-07-08T02:23:00.000Z",
        messages: [],
      },
    ],
    commandRuns: Array.from({ length: 17 }, (_value, index) => makeCapabilityRun(index + 1, project)),
    runEvents: [
      {
        id: TARGET_NOTICE_RUN_ID,
        type: "runtime-health",
        status: "error",
        title: "pass223 deep notice run event 17",
        detail: TARGET_NOTICE_TOKEN,
        cwd: project.path,
        project,
        sessionId: "pass223-session",
        stdout: `${TARGET_NOTICE_TOKEN} stdout`,
        stderr: `${TARGET_NOTICE_TOKEN} stderr`,
        code: 17,
        durationMs: 223,
        createdAt: "2026-07-08T02:23:17.000Z",
      },
    ],
    notices: Array.from({ length: 17 }, (_value, index) => makeNotice(index + 1, project)),
    automations: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
  });
}

async function paletteCommands(win, query) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return null;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));
      const result = [...document.querySelectorAll('.command-modal .command-list button')].map((button) => ({
        id: button.getAttribute('data-command-id') || '',
        group: button.getAttribute('data-command-group') || '',
        target: button.getAttribute('data-command-target') || '',
        text: button.textContent || '',
      }));
      window.__pass223Commands = result;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return result;
    })();
  `);
}

async function waitForCommand(win, query, expectedId, target = "", timeoutMs = 12000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const commands = await paletteCommands(win, query);
    if (Array.isArray(commands) && commands.some((command) => command.id === expectedId && (!target || command.target === target))) return true;
    await wait(180);
  }
  return false;
}

async function runPaletteCommand(win, query, expectedId) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === ${JSON.stringify(expectedId)});
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS223_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  const capabilityCopyId = `capability-recovery:copy:${TARGET_CAPABILITY_RUN_ID}`;
  const capabilityTimelineId = `capability-recovery:timeline:${TARGET_CAPABILITY_RUN_ID}`;
  const noticeCommandId = `notice:${TARGET_NOTICE_ID}`;

  assertStep("PASS223_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS223_STORE_HAS_DEEP_ITEMS", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      const noticeIndex = (state.notices || []).findIndex((notice) => notice.id === ${JSON.stringify(TARGET_NOTICE_ID)});
      return state.commandRuns?.[16]?.id === ${JSON.stringify(TARGET_CAPABILITY_RUN_ID)} && noticeIndex >= 16;
    })();
  `));

  assertStep("PASS223_DEEP_CAPABILITY_COPY_COMMAND_SEARCHABLE", await waitForCommand(
    win,
    TARGET_CAPABILITY_TOKEN,
    capabilityCopyId,
    "clipboard",
  ));
  clipboard.writeText("");
  assertStep("PASS223_CLICK_DEEP_CAPABILITY_COPY", await runPaletteCommand(
    win,
    TARGET_CAPABILITY_TOKEN,
    capabilityCopyId,
  ));
  assertStep("PASS223_DEEP_CAPABILITY_COPY_CLIPBOARD", await waitForClipboard([
    /mcp list/,
    TARGET_CAPABILITY_TOKEN,
    /pass223-project/,
  ]));

  assertStep("PASS223_DEEP_CAPABILITY_TIMELINE_COMMAND_SEARCHABLE", await waitForCommand(
    win,
    TARGET_CAPABILITY_TOKEN,
    capabilityTimelineId,
    "outputs",
  ));
  assertStep("PASS223_CLICK_DEEP_CAPABILITY_TIMELINE", await runPaletteCommand(
    win,
    TARGET_CAPABILITY_TOKEN,
    capabilityTimelineId,
  ));
  assertStep("PASS223_DEEP_CAPABILITY_TIMELINE_FOCUSED", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.selected-run-evidence-panel')?.textContent || '';
      return panel.includes(${JSON.stringify(TARGET_CAPABILITY_TOKEN)}) &&
        /mcp list/.test(panel) &&
        /pass223-project/.test(panel);
    })();
  `, 10000));

  assertStep("PASS223_DEEP_NOTICE_COMMAND_SEARCHABLE", await waitForCommand(
    win,
    TARGET_NOTICE_TOKEN,
    noticeCommandId,
    "timeline",
  ));
  assertStep("PASS223_CLICK_DEEP_NOTICE_COMMAND", await runPaletteCommand(
    win,
    TARGET_NOTICE_TOKEN,
    noticeCommandId,
  ));
  assertStep("PASS223_DEEP_NOTICE_OPENS_TIMELINE", await waitFor(win, `
    (function() {
      const row = document.querySelector('.run-timeline-row.selected.error')?.textContent || '';
      const panel = document.querySelector('.selected-run-evidence-panel.error')?.textContent || '';
      return /pass223 deep notice run event 17/.test(row + panel) &&
        panel.includes(${JSON.stringify(TARGET_NOTICE_TOKEN)});
    })();
  `, 10000));

  console.log("PASS223_COMMAND_PALETTE_DEEP_CAPABILITY_NOTICE_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS223_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (async function() {
          return {
            commands: window.__pass223Commands || [],
            selectedRow: document.querySelector('.run-timeline-row.selected')?.textContent || '',
            panel: document.querySelector('.selected-run-evidence-panel')?.textContent || '',
            clipboard: '',
            state: await window.claudexDesktop.getState().catch((stateError) => ({ error: String(stateError?.message || stateError) })),
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS223_DEBUG", JSON.stringify(debug, null, 2).slice(0, 12000));
      console.error("PASS223_CLIPBOARD", clipboard.readText());
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS223_TIMEOUT");
  console.error("PASS223_CLIPBOARD", clipboard.readText());
  cleanup();
  app.exit(1);
}, 100000);
