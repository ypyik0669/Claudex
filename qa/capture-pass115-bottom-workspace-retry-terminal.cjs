const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass115-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass115-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const COMMAND_SCRIPT = path.join(PROJECT_DIR, "pass115-command.cjs");
const COMMAND_COUNT = path.join(PROJECT_DIR, "pass115-count.txt");
const COMMAND_LOG = path.join(PROJECT_DIR, "pass115-command-log.txt");

function cleanup() {
  for (const dir of [USER_DATA_DIR, PROJECT_DIR]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_error) {
      // best-effort cleanup
    }
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function readCommandLog() {
  try {
    return fs.readFileSync(COMMAND_LOG, "utf8");
  } catch (_error) {
    return "";
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

async function waitForLogGrowth(pattern, before, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const next = readCommandLog().slice(before.length);
    if (pattern.test(next)) return true;
    await wait(150);
  }
  return false;
}

function assertStep(name, ok) {
  console.log(name, ok);
  if (!ok) throw new Error(`${name} failed`);
}

function writeInitialStore() {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass115-project" }), "utf8");
  fs.writeFileSync(COMMAND_SCRIPT, `
const fs = require('fs');
const countFile = ${JSON.stringify(COMMAND_COUNT)};
const logFile = ${JSON.stringify(COMMAND_LOG)};
function readCount() {
  try { return Number(fs.readFileSync(countFile, 'utf8')) || 0; } catch (_error) { return 0; }
}
const previous = readCount();
const next = previous + 1;
fs.writeFileSync(countFile, String(next), 'utf8');
fs.appendFileSync(logFile, 'pass115-run:' + next + '\\n', 'utf8');
if (previous === 0) {
  process.stderr.write('pass115 workspace failed\\n');
  process.exit(37);
}
process.stdout.write('pass115 workspace recovered\\n');
`, "utf8");
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
      claudeCode: { executionMode: "claude-code", claudeCommand: "claude", permissionMode: "default" },
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
    activeProject: { name: "pass115-project", path: PROJECT_DIR },
    projects: [{ name: "pass115-project", path: PROJECT_DIR }],
    sessions: [
      {
        id: "default",
        title: "Bottom workspace retry terminal",
        project: "pass115-project",
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-06T00:00:00.000Z",
        updatedAt: "2026-07-06T00:00:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    automations: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

async function openWorkspace(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const rail = document.querySelector('.rail-button[data-tool="workspace"]');
      if (rail) {
        rail.click();
        return true;
      }
      const button = Array.from(document.querySelectorAll('button.tool-row'))
        .find((item) => /\\u5de5\\u4f5c\\u533a/.test(item.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runWorkspaceCommand(win, command) {
  const filled = await win.webContents.executeJavaScript(`
    (function() {
      const input = document.querySelector('#workspace-tool-detail .command-runner input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(command)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })();
  `);
  if (!filled) return false;
  await wait(150);
  return win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('#workspace-tool-detail .command-runner button');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `);
}

async function openOutputsPanel(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      if (document.querySelector('.bottom-work-panel .workspace-command-evidence-stack')) return true;
      const button = [...document.querySelectorAll('.workspace-context-tabs .workspace-context-button')]
        .find((candidate) => /\\u8f93\\u51fa/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS115_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS115_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS115_OPEN_WORKSPACE", await openWorkspace(win));
  assertStep("PASS115_WORKSPACE_READY", await waitFor(win, "Boolean(document.querySelector('#workspace-tool-detail .command-runner input'))", 10000));

  const command = "node pass115-command.cjs";
  const beforeFailure = readCommandLog();
  assertStep("PASS115_RUN_WORKSPACE_FAILURE", await runWorkspaceCommand(win, command));
  assertStep("PASS115_WORKSPACE_FAILURE_RAN", await waitForLogGrowth(/pass115-run:1/, beforeFailure, 12000));
  assertStep("PASS115_WORKSPACE_FAILURE_PERSISTED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const run = state.commandRuns?.find((item) => item.kind === 'workspace' && /pass115-command/.test(item.command || ''));
      return Boolean(run &&
        run.code === 37 &&
        /pass115 workspace failed/.test(run.stderr || '') &&
        document.querySelector('#workspace-tool-detail .command-output-card.error'));
    })();
  `, 12000));

  assertStep("PASS115_OPEN_OUTPUTS_PANEL_AFTER_FAILURE", await openOutputsPanel(win));
  assertStep("PASS115_BOTTOM_FAILURE_ACTIONS_VISIBLE", await waitFor(win, `
    (function() {
      const card = document.querySelector('.workspace-command-evidence-stack .command-output-card.error');
      const text = card?.textContent || '';
      const retry = [...(card?.querySelectorAll('button') || [])]
        .find((button) => /\\u91cd\\u8bd5/.test(button.textContent || ''));
      const terminal = [...(card?.querySelectorAll('button') || [])]
        .find((button) => /\\u6253\\u5f00\\u7ec8\\u7aef\\u5de5\\u5177/.test(button.textContent || ''));
      return Boolean(
        card &&
        /pass115-command/.test(text) &&
        /37/.test(text) &&
        /pass115 workspace failed/.test(text) &&
        retry &&
        terminal
      );
    })();
  `, 10000));

  assertStep("PASS115_SELECTED_FAILURE_RECOVERY_VISIBLE", await waitFor(win, `
    (async function() {
      const row = [...document.querySelectorAll('.run-timeline-row.error')]
        .find((candidate) => /pass115-command/.test(candidate.textContent || ''));
      if (!row) return false;
      row.querySelector('summary')?.click();
      await new Promise((resolve) => setTimeout(resolve, 200));
      const panel = document.querySelector('.selected-run-evidence-panel.error');
      return Boolean(
        panel &&
        /pass115-command/.test(panel.textContent || '') &&
        /pass115 workspace failed/.test(panel.textContent || '') &&
        panel.querySelector('[data-run-recovery-action="retry-workspace"]') &&
        panel.querySelector('[data-run-recovery-action="terminal"]')
      );
    })()
  `, 10000));

  assertStep("PASS115_CLICK_SELECTED_TERMINAL_ACTION", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.selected-run-evidence-panel [data-run-recovery-action="terminal"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS115_TERMINAL_TOOL_OPENED_WITH_EVIDENCE", await waitFor(win, `
    Boolean(
      document.querySelector('#terminal-tool-detail') &&
      document.querySelector('.workspace-command-evidence-stack .command-output-card.error') &&
      /pass115 workspace failed/.test(document.querySelector('.workspace-command-evidence-stack')?.textContent || '')
    )
  `, 10000));

  const beforeRetry = readCommandLog();
  assertStep("PASS115_CLICK_SELECTED_RETRY", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.selected-run-evidence-panel [data-run-recovery-action="retry-workspace"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS115_WORKSPACE_RETRY_RAN", await waitForLogGrowth(/pass115-run:2/, beforeRetry, 12000));
  assertStep("PASS115_BOTTOM_RETRY_RECOVERED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const matching = (state.commandRuns || []).filter((run) =>
        run.kind === 'workspace' && /pass115-command/.test(run.command || ''));
      return Boolean(
        matching.length >= 2 &&
        matching.some((run) => run.code === 0 && /pass115 workspace recovered/.test(run.stdout || '')) &&
        matching.some((run) => run.code === 37 && /pass115 workspace failed/.test(run.stderr || '')) &&
        /pass115 workspace recovered/.test(document.querySelector('.workspace-command-evidence-stack')?.textContent || '') &&
        document.querySelector('.workspace-command-evidence-stack .command-output-card.ok')
      );
    })();
  `, 12000));
  assertStep("PASS115_RETRY_PERSISTED", (() => {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    const matching = (parsed.commandRuns || []).filter((run) =>
      run.kind === "workspace" && /pass115-command/.test(run.command || ""));
    return matching.length >= 2 &&
      matching.some((run) => run.code === 0 && /pass115 workspace recovered/.test(run.stdout || "")) &&
      matching.some((run) => run.code === 37 && /pass115 workspace failed/.test(run.stderr || ""));
  })());

  console.log("PASS115_BOTTOM_WORKSPACE_RETRY_TERMINAL_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS115_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS115_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
