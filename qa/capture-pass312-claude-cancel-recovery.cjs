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
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass312-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass312-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass312-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const LONG_ARGS = "pass312-long";
const RECOVERY_ARGS = "pass312-recovery";

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
        (async () => {
          const desktop = window.claudexDesktop;
          if (!desktop?.getState || !desktop?.cancelRequest) return;
          const state = await desktop.getState();
          const ids = Array.from(new Set((state.runEvents || [])
            .filter((event) => event?.type === 'claude-command' && event?.status === 'running')
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
if (args[0] === '--version') out('2.9.0 (Claude Code PASS312)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'pass312-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'mcp' && args[1] === 'list') out('pass312-mcp connected');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else if (args[0] === ${JSON.stringify(LONG_ARGS)}) {
  out('pass312 stdout live');
  process.stderr.write('pass312 stderr live\\n');
  setInterval(() => {}, 1000);
} else if (args[0] === ${JSON.stringify(RECOVERY_ARGS)}) {
  out('pass312 after cancel ok');
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass312-project" }), "utf8");
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
    activeProject: { name: "pass312-project", path: PROJECT_DIR },
    projects: [{ name: "pass312-project", path: PROJECT_DIR }],
    sessions: [{ id: "default", title: "PASS312 Claude cancel recovery", project: "pass312-project", projectPath: PROJECT_DIR, createdAt: "2026-07-14T00:00:00.000Z", updatedAt: "2026-07-14T00:00:00.000Z", messages: [] }],
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

async function setArgs(win, value) {
  return win.webContents.executeJavaScript(`
    (() => {
      const input = document.querySelector('#claude-tool-detail .claude-primary-card input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()
  `);
}

async function clickPrimary(win) {
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
  if (!win) throw new Error("PASS312_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(600);

  assertStep("PASS312_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS312_HAIKU_45", await win.webContents.executeJavaScript(`window.claudexDesktop.getState().then((state) => state.settings?.model === 'claude-haiku-4-5-20251001')`));
  assertStep("PASS312_OPEN_CLAUDE", await openClaude(win));
  assertStep("PASS312_CLAUDE_VISIBLE", await waitFor(win, `Boolean(document.querySelector('#claude-tool-detail .claude-primary-card input'))`, 15000));
  assertStep("PASS312_SET_LONG_ARGS", await setArgs(win, LONG_ARGS));
  assertStep("PASS312_RUN_LONG", await clickPrimary(win));
  assertStep("PASS312_SIDE_STREAM_LIVE", await waitFor(win, `
    (() => {
      const text = document.querySelector('#claude-tool-detail .command-output-card.live')?.textContent || '';
      return /pass312 stdout live/.test(text) && /pass312 stderr live/.test(text);
    })()
  `, 10000));
  assertStep("PASS312_OPEN_OUTPUTS", await openOutputs(win));
  const eventId = await waitFor(win, `
    (() => {
      const row = Array.from(document.querySelectorAll('.run-timeline-row.running')).find((item) => /pass312-long/.test(item.textContent || ''));
      return row?.getAttribute('data-run-event-id') || false;
    })()
  `, 5000);
  assertStep("PASS312_RUNNING_ROW_LIVE", Boolean(eventId) && await waitFor(win, `
    (() => {
      const row = document.querySelector('.run-timeline-row[data-run-event-id="${eventId}"]');
      if (!row) return false;
      row.open = true;
      return /pass312 stdout live/.test(row.textContent || '') && /pass312 stderr live/.test(row.textContent || '');
    })()
  `, 5000));
  assertStep("PASS312_CANCEL_BUTTON_READY", await waitFor(win, `
    (() => {
      const button = document.querySelector('#claude-tool-detail .claude-primary-card .primary-action-row .primary-action');
      return Boolean(button && !button.disabled && /取消|停止/.test((button.textContent || '') + ' ' + (button.title || '')));
    })()
  `, 5000));
  assertStep("PASS312_CANCEL_CLICKED", await clickPrimary(win));
  assertStep("PASS312_SAME_ROW_CANCELLED", await waitFor(win, `
    (() => {
      const rows = Array.from(document.querySelectorAll('.run-timeline-row')).filter((item) => item.getAttribute('data-run-event-id') === ${JSON.stringify(eventId)});
      const row = rows[0];
      if (!row) return false;
      row.open = true;
      return rows.length === 1 && row.classList.contains('cancelled') && /130/.test(row.textContent || '') &&
        /pass312 stdout live/.test(row.textContent || '') && /pass312 stderr live/.test(row.textContent || '');
    })()
  `, 15000));
  assertStep("PASS312_RUNNER_RECOVERED", await waitFor(win, `
    Boolean(document.querySelector('#claude-tool-detail .command-output-card.cancelled')) &&
      Boolean(document.querySelector('#claude-tool-detail .claude-primary-card .primary-action-row .primary-action:not(:disabled)'))
  `, 10000));
  assertStep("PASS312_SET_RECOVERY_ARGS", await setArgs(win, RECOVERY_ARGS));
  assertStep("PASS312_RUN_RECOVERY", await clickPrimary(win));
  assertStep("PASS312_RECOVERY_OK", await waitFor(win, `
    Array.from(document.querySelectorAll('#claude-tool-detail .command-output-card.ok')).some((item) => /pass312 after cancel ok/.test(item.textContent || ''))
  `, 10000));
  assertStep("PASS312_OUTPUTS_SHOW_CANCEL_AND_RECOVERY", await waitFor(win, `
    (() => {
      const text = document.querySelector('.run-timeline')?.textContent || '';
      return /pass312-long/.test(text) && /pass312-recovery/.test(text) && /pass312 after cancel ok/.test(text);
    })()
  `, 10000));
  assertStep("PASS312_STORE_HAS_CANCELLED_AND_OK", await waitForStore((state) => {
    const cancelledRuns = (state.commandRuns || []).filter((run) => /pass312-long/.test(run.command || ""));
    const recoveryRuns = (state.commandRuns || []).filter((run) => /pass312-recovery/.test(run.command || ""));
    const cancelledEvents = (state.runEvents || []).filter((event) => /pass312-long/.test(event.commandLine || event.title || ""));
    const recoveryEvents = (state.runEvents || []).filter((event) => /pass312-recovery/.test(event.commandLine || event.title || ""));
    return cancelledRuns.length === 1 && recoveryRuns.length === 1 && cancelledEvents.length === 1 && recoveryEvents.length === 1 &&
      cancelledRuns[0].cancelled === true && cancelledRuns[0].code === 130 && cancelledRuns[0].sessionId === "default" &&
      /pass312 stdout live/.test(cancelledRuns[0].stdout || "") && /pass312 stderr live/.test(cancelledRuns[0].stderr || "") &&
      cancelledEvents[0].status === "cancelled" && cancelledEvents[0].code === 130 && cancelledEvents[0].sessionId === "default" &&
      /pass312 stdout live/.test(cancelledEvents[0].stdout || "") && /pass312 stderr live/.test(cancelledEvents[0].stderr || "") &&
      recoveryRuns[0].code === 0 && recoveryRuns[0].cancelled !== true && /pass312 after cancel ok/.test(recoveryRuns[0].stdout || "") &&
      recoveryEvents[0].status === "ok" && !(state.runEvents || []).some((event) => event.status === "running");
  }, 15000));

  console.log("PASS312_CLAUDE_CANCEL_RECOVERY_DONE");
  await exitWithCleanup(0);
}

const fakeClaudeCommand = writeFakeClaude();
app.setPath("userData", USER_DATA_DIR);
writeInitialStore(fakeClaudeCommand);
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS312_FAILED", error?.stack || error);
  void exitWithCleanup(1);
});

setTimeout(() => {
  console.error("PASS312_TIMEOUT");
  void exitWithCleanup(1);
}, 120000);
