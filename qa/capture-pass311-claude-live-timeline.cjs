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
      if (fs.existsSync(path.join(current, "package.json")) && fs.existsSync(path.join(current, "electron", "main.cjs"))) {
        return current;
      }
      current = path.dirname(current);
    }
  }
  throw new Error("Unable to locate Claudex repo root");
}

const REPO_DIR = findRepoDir();
process.chdir(REPO_DIR);
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass311-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass311-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass311-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const COMMAND_LOG = path.join(USER_DATA_DIR, "claude-command-log.txt");
const LIVE_ARGS = "pass311-live";
const BACKGROUND_REQUEST_ID = "pass311_background";
const CAPABILITY_REQUEST_ID = "pass311_capability";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
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
        (async function() {
          const desktop = window.claudexDesktop;
          if (!desktop?.getState || !desktop?.cancelRequest) return;
          const state = await desktop.getState();
          const ids = Array.from(new Set((state.runEvents || [])
            .filter((event) => event?.type === 'claude-command' && event?.status === 'running')
            .map((event) => event?.id)
            .filter(Boolean)));
          for (const requestId of ids) {
            try {
              await desktop.cancelRequest(requestId);
            } catch (_error) {
              // Best-effort cancellation during teardown.
            }
          }
        })()
      `);
    } catch (_error) {
      // A renderer may disappear while cleanup is in progress.
    }
  }
  await wait(450);
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win.isDestroyed()) win.destroy();
    } catch (_error) {
      // Best-effort window teardown.
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
      // The store may be between atomic writes.
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
const fs = require('fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(COMMAND_LOG)}, args.join(' ') + '\\n', 'utf8');
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value) + '\\n'); }
if (args[0] === '--version') out('2.9.0 (Claude Code PASS311)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'pass311-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'mcp' && args[1] === 'list') out('pass311-mcp connected');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else if (args[0] === ${JSON.stringify(LIVE_ARGS)}) {
  out('pass311 stdout live');
  process.stderr.write('pass311 stderr live\\n');
  setTimeout(() => {
    out('pass311 stdout done');
    process.exit(0);
  }, 12000);
} else out('fake claude command: ' + args.join(' '));
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass311-project" }), "utf8");
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
      claudeCode: { executionMode: "claude-code", claudeCommand, permissionMode: "default" },
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
    activeProject: { name: "pass311-project", path: PROJECT_DIR },
    projects: [{ name: "pass311-project", path: PROJECT_DIR }],
    sessions: [{
      id: "default",
      title: "PASS311 Claude live timeline",
      project: "pass311-project",
      projectPath: PROJECT_DIR,
      createdAt: "2026-07-14T00:00:00.000Z",
      updatedAt: "2026-07-14T00:00:00.000Z",
      messages: [],
    }],
    automations: [],
    subagentRuns: [],
    commandRuns: [],
    runEvents: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

async function openClaude(win) {
  return win.webContents.executeJavaScript(`
    (() => {
      const panel = document.querySelector('.tools-panel');
      if (!panel || getComputedStyle(panel).display === 'none') {
        const rail = document.querySelector('.tool-rail-button[data-tool="claude"]');
        if (!rail) return false;
        rail.click();
        return true;
      }
      const button = Array.from(document.querySelectorAll('button.tool-row')).find((item) => /Claude Code/.test(item.textContent || ''));
      if (!button) return false;
      if (button.getAttribute('aria-expanded') !== 'true') button.click();
      return true;
    })()
  `);
}

async function setClaudeArgs(win) {
  return win.webContents.executeJavaScript(`
    (() => {
      const input = document.querySelector('#claude-tool-detail .claude-primary-card input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(LIVE_ARGS)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()
  `);
}

async function clickRun(win) {
  return win.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector('#claude-tool-detail .claude-primary-card .primary-action-row .primary-action');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })()
  `);
}

async function openOutputs(win) {
  return win.webContents.executeJavaScript(`
    (() => {
      if (document.querySelector('.bottom-work-panel .run-timeline')) return true;
      const button = Array.from(document.querySelectorAll('.workspace-context-tabs .workspace-context-button'))[1];
      if (!button) return false;
      button.click();
      return true;
    })()
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS311_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(600);

  assertStep("PASS311_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS311_HAIKU_45", await win.webContents.executeJavaScript(`
    window.claudexDesktop.getState().then((state) => state.settings?.model === 'claude-haiku-4-5-20251001')
  `));
  assertStep("PASS311_OPEN_CLAUDE", await openClaude(win));
  assertStep("PASS311_CLAUDE_VISIBLE", await waitFor(win, `
    Boolean(document.querySelector('#claude-tool-detail .claude-primary-card input'))
  `, 15000));
  assertStep("PASS311_BACKGROUND_COMMAND_FILTERED", await win.webContents.executeJavaScript(`
    (async () => {
      const result = await window.claudexDesktop.runClaudeCommand({
        projectPath: ${JSON.stringify(PROJECT_DIR)},
        args: 'plugin list --json',
        requestId: ${JSON.stringify(BACKGROUND_REQUEST_ID)},
        persistCommandRun: false,
      });
      const state = await window.claudexDesktop.getState();
      return result.code === 0 &&
        !(state.commandRuns || []).some((run) => (run.requestId || run.id) === ${JSON.stringify(BACKGROUND_REQUEST_ID)}) &&
        !(state.runEvents || []).some((event) => event.id === ${JSON.stringify(BACKGROUND_REQUEST_ID)});
    })()
  `));
  assertStep("PASS311_CAPABILITY_COMMAND_FILTERED", await win.webContents.executeJavaScript(`
    (async () => {
      const result = await window.claudexDesktop.runClaudeCommand({
        projectPath: ${JSON.stringify(PROJECT_DIR)},
        args: 'mcp list',
        requestId: ${JSON.stringify(CAPABILITY_REQUEST_ID)},
        sessionId: 'default',
        persistCommandRun: true,
        commandRunKind: 'capability',
        capabilityContext: { tab: 'mcp', kind: 'mcp', id: 'pass311-mcp', action: 'refresh' },
      });
      const state = await window.claudexDesktop.getState();
      return result.code === 0 &&
        (state.commandRuns || []).some((run) => (run.requestId || run.id) === ${JSON.stringify(CAPABILITY_REQUEST_ID)} && run.kind === 'capability' && run.sessionId === 'default') &&
        !(state.runEvents || []).some((event) => event.id === ${JSON.stringify(CAPABILITY_REQUEST_ID)} && event.type === 'claude-command');
    })()
  `));
  assertStep("PASS311_SET_ARGS", await setClaudeArgs(win));
  assertStep("PASS311_RUN", await clickRun(win));
  assertStep("PASS311_SIDE_STREAM_LIVE", await waitFor(win, `
    (() => {
      const text = document.querySelector('#claude-tool-detail .command-output-card.live')?.textContent || '';
      return /pass311 stdout live/.test(text) && /pass311 stderr live/.test(text);
    })()
  `, 10000));
  assertStep("PASS311_OPEN_OUTPUTS", await openOutputs(win));
  assertStep("PASS311_FILTERED_COMMANDS_NOT_CLAUDE_TIMELINE", await win.webContents.executeJavaScript(`
    (() => {
      const backgroundRow = document.querySelector('.run-timeline-row[data-run-event-id="${BACKGROUND_REQUEST_ID}"]');
      const capabilityRow = document.querySelector('.run-timeline-row[data-run-event-id="${CAPABILITY_REQUEST_ID}"]');
      return !backgroundRow && !capabilityRow?.querySelector('[data-run-event-type="claude-command"]');
    })()
  `));

  const runningEventId = await waitFor(win, `
    (() => {
      const rows = Array.from(document.querySelectorAll('.run-timeline-row.running'));
      const row = rows.find((item) => /pass311-live/.test(item.textContent || ''));
      return row?.getAttribute('data-run-event-id') || false;
    })()
  `, 5000);
  assertStep("PASS311_RUNNING_ROW_PRESENT", Boolean(runningEventId));
  assertStep("PASS311_RUNNING_ROW_LIVE_STDOUT_STDERR", await waitFor(win, `
    (() => {
      const row = Array.from(document.querySelectorAll('.run-timeline-row.running'))
        .find((item) => item.getAttribute('data-run-event-id') === ${JSON.stringify(runningEventId)});
      if (!row) return false;
      row.open = true;
      const outputs = Array.from(row.querySelectorAll('.subagent-output')).filter((item) => item.getBoundingClientRect().height > 0);
      return outputs.some((item) => /pass311 stdout live/.test(item.textContent || '')) &&
        outputs.some((item) => /pass311 stderr live/.test(item.textContent || ''));
    })()
  `, 5000));
  assertStep("PASS311_RUNNING_ROW_SINGLE_ID", await win.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('.run-timeline-row'))
      .filter((item) => item.getAttribute('data-run-event-id') === ${JSON.stringify(runningEventId)}).length === 1
  `));
  assertStep("PASS311_SAME_ROW_OK", await waitFor(win, `
    (() => {
      const rows = Array.from(document.querySelectorAll('.run-timeline-row'))
        .filter((item) => item.getAttribute('data-run-event-id') === ${JSON.stringify(runningEventId)});
      const row = rows[0];
      if (!row) return false;
      row.open = true;
      return rows.length === 1 && row.classList.contains('ok') &&
        /pass311 stdout live/.test(row.textContent || '') && /pass311 stdout done/.test(row.textContent || '') &&
        /pass311 stderr live/.test(row.textContent || '');
    })()
  `, 20000));
  assertStep("PASS311_SIDE_HISTORY_OK", await waitFor(win, `
    Boolean(document.querySelector('#claude-tool-detail .command-output-card.ok'))
  `, 5000));
  assertStep("PASS311_STATE_PERSISTED", await waitForStore((state) => {
    const runs = (state.commandRuns || []).filter((run) => (run.requestId || run.id) === runningEventId);
    const events = (state.runEvents || []).filter((event) => event.id === runningEventId);
    return runs.length === 1 && events.length === 1 && runs[0].code === 0 && runs[0].sessionId === "default" &&
      /pass311 stdout live/.test(runs[0].stdout || "") && /pass311 stdout done/.test(runs[0].stdout || "") &&
      /pass311 stderr live/.test(runs[0].stderr || "") && events[0].status === "ok" && events[0].code === 0 && events[0].sessionId === "default" &&
      /pass311 stdout live/.test(events[0].stdout || "") && /pass311 stdout done/.test(events[0].stdout || "") &&
      /pass311 stderr live/.test(events[0].stderr || "");
  }, 10000));

  console.log("PASS311_CLAUDE_LIVE_TIMELINE_DONE");
  await exitWithCleanup(0);
}

const fakeClaudeCommand = writeFakeClaude();
app.setPath("userData", USER_DATA_DIR);
writeInitialStore(fakeClaudeCommand);
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS311_FAILED", error?.stack || error);
  void exitWithCleanup(1);
});

setTimeout(() => {
  console.error("PASS311_TIMEOUT");
  void exitWithCleanup(1);
}, 120000);
