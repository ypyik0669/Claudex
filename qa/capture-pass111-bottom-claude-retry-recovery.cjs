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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass111-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass111-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass111-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const COMMAND_LOG = path.join(USER_DATA_DIR, "claude-command-log.txt");
const DOCTOR_COUNT_FILE = path.join(USER_DATA_DIR, "pass111-doctor-count.txt");

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_DIR]) {
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

function writeFakeClaude() {
  const fakeClaudeScript = `
const fs = require('fs');
const args = process.argv.slice(2);
const commandLog = ${JSON.stringify(COMMAND_LOG)};
const doctorCountFile = ${JSON.stringify(DOCTOR_COUNT_FILE)};
function doctorCount() { try { return Number(fs.readFileSync(doctorCountFile, 'utf8')) || 0; } catch (_error) { return 0; } }
fs.appendFileSync(commandLog, args.join(' ') + '\\n', 'utf8');
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
if (args[0] === '--version') out('2.11.0 (Claude Code QA)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'mcp' && args[1] === 'list') out('? pass111-mcp: connected');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else if (args[0] === 'doctor') {
  const nextDoctorCount = doctorCount() + 1;
  fs.writeFileSync(doctorCountFile, String(nextDoctorCount), 'utf8');
  if (nextDoctorCount === 1) {
    process.stderr.write('pass111 doctor failed\\n');
    process.exit(30);
  }
  out('pass111 doctor ok');
}
else out('pass111 fake claude command: ' + args.join(' '));
`;
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
  return path.join(FAKE_BIN_DIR, "claude.cmd");
}

function writeInitialStore(claudeCommand) {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass111-project" }), "utf8");
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
    activeProject: { name: "pass111-project", path: PROJECT_DIR },
    projects: [{ name: "pass111-project", path: PROJECT_DIR }],
    sessions: [
      {
        id: "default",
        title: "Bottom Claude retry recovery",
        project: "pass111-project",
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-06T00:00:00.000Z",
        updatedAt: "2026-07-06T00:00:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    automations: [],
    subagentRuns: [],
    runEvents: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

async function openClaudeTool(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = Array.from(document.querySelectorAll('button.tool-row')).find((item) => /Claude Code/.test(item.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runClaudeQuick(win, args) {
  return win.webContents.executeJavaScript(`
    (function() {
      const detail = document.querySelector('#claude-tool-detail');
      const button = Array.from(detail?.querySelectorAll('.quick-command-row button') || []).find((item) => item.title === ${JSON.stringify(args)});
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `);
}

async function openOutputsPanel(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      if (document.querySelector('.bottom-work-panel .claude-command-evidence-stack')) return true;
      const button = Array.from(document.querySelectorAll('.workspace-context-tabs .workspace-context-button'))[1];
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS111_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS111_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS111_OPEN_CLAUDE_TOOL", await openClaudeTool(win));
  assertStep("PASS111_CLAUDE_READY", await waitFor(win, `
    Boolean(document.querySelector('#claude-tool-detail') &&
      Array.from(document.querySelectorAll('#claude-tool-detail .quick-command-row button')).some((button) => button.title === 'doctor' && !button.disabled))
  `, 15000));

  const beforeFailure = readCommandLog();
  assertStep("PASS111_RUN_DOCTOR", await runClaudeQuick(win, "doctor"));
  assertStep("PASS111_DOCTOR_FAILURE_RAN", await waitForLogGrowth(/doctor/, beforeFailure, 12000));
  assertStep("PASS111_OPEN_OUTPUTS_PANEL_AFTER_FAILURE", await openOutputsPanel(win));
  assertStep("PASS111_BOTTOM_FAILURE_RETRY_VISIBLE", await waitFor(win, `
    (function() {
      const stack = document.querySelector('.claude-command-evidence-stack');
      const card = stack?.querySelector('.command-output-card.error');
      const text = card?.textContent || '';
      const retry = [...(card?.querySelectorAll('button') || [])]
        .find((button) => /\\u91cd\\u8bd5/.test(button.textContent || ''));
      return Boolean(
        card &&
        /Claude CLI/.test(stack?.textContent || '') &&
        /doctor/.test(text) &&
        /30/.test(text) &&
        /pass111 doctor failed/.test(text) &&
        retry
      );
    })();
  `, 10000));

  const beforeRetry = readCommandLog();
  assertStep("PASS111_CLICK_BOTTOM_RETRY", await win.webContents.executeJavaScript(`
    (function() {
      const card = document.querySelector('.claude-command-evidence-stack .command-output-card.error');
      const retry = [...(card?.querySelectorAll('button') || [])]
        .find((button) => /\\u91cd\\u8bd5/.test(button.textContent || ''));
      if (!retry || retry.disabled) return false;
      retry.click();
      return true;
    })();
  `));
  assertStep("PASS111_RETRY_DOCTOR_RAN", await waitForLogGrowth(/doctor/, beforeRetry, 12000));
  assertStep("PASS111_BOTTOM_RETRY_RECOVERED", await waitFor(win, `
    (function() {
      const stack = document.querySelector('.claude-command-evidence-stack');
      const okCard = stack?.querySelector('.command-output-card.ok');
      const text = okCard?.textContent || '';
      return Boolean(
        okCard &&
        /doctor/.test(text) &&
        /pass111 doctor ok/.test(text)
      );
    })();
  `, 15000));
  assertStep("PASS111_SIDE_HISTORY_UPDATED_FROM_BOTTOM_RETRY", await waitFor(win, `
    Boolean(document.querySelector('#claude-tool-detail .command-output-card.ok') &&
      /doctor/.test(document.querySelector('#claude-tool-detail .command-output-card.ok')?.textContent || '') &&
      /pass111 doctor ok/.test(document.querySelector('#claude-tool-detail .command-output-card.ok')?.textContent || ''))
  `, 15000));
  assertStep("PASS111_TIMELINE_BOTH_RUNS_VISIBLE", await waitFor(win, `
    (function() {
      const rows = [...document.querySelectorAll('.run-timeline-row')];
      return rows.some((row) => row.classList.contains('error') && /doctor/.test(row.textContent || '')) &&
        rows.some((row) => row.classList.contains('ok') && /doctor/.test(row.textContent || ''));
    })();
  `, 10000));
  assertStep("PASS111_RETRY_PERSISTED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const runs = state.commandRuns?.filter((run) => run.kind === 'claude' && /doctor/.test(run.command || '')) || [];
      return Boolean(
        runs.length >= 2 &&
        runs.some((run) => run.code === 30 && /pass111 doctor failed/.test(run.stderr || '')) &&
        runs.some((run) => run.code === 0 && /pass111 doctor ok/.test(run.stdout || ''))
      );
    })();
  `, 10000));

  console.log("PASS111_BOTTOM_CLAUDE_RETRY_RECOVERY_DONE");
  cleanup();
  app.exit(0);
}

const fakeClaudeCommand = writeFakeClaude();
app.setPath("userData", USER_DATA_DIR);
writeInitialStore(fakeClaudeCommand);
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS111_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS111_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
