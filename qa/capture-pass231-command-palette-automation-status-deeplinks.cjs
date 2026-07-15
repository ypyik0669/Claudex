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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass231-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass231-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass231-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, process.platform === "win32" ? "claude.cmd" : "claude");
const RUNNING_MARKER = path.join(PROJECT_DIR, "pass231-running.pid");
const RUNNING_RUN_ID = "pass231-running-run";
const RUNNING_AUTOMATION_ID = "pass231-running-automation";
const SCHEDULED_AUTOMATION_ID = "pass231-scheduled-automation";
const PAUSED_AUTOMATION_ID = "pass231-paused-automation";

function cleanup() {
  try {
    const pid = Number(fs.readFileSync(RUNNING_MARKER, "utf8"));
    if (processIsAlive(pid)) process.kill(pid, "SIGKILL");
  } catch (_error) {
    // best-effort process cleanup
  }
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_DIR]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_error) {
      // best-effort cleanup
    }
  }
}

function processIsAlive(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (_error) {
    return false;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
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

function assertStep(name, ok) {
  console.log(name, ok);
  if (!ok) throw new Error(`${name} failed`);
}

function writeFakeClaude() {
const fakeClaudeScript = `
const fs = require('fs');
const args = process.argv.slice(2);
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value) + '\\n'); }
if (args[0] === '--version') out('2.31.0 (Claude Code PASS231)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out({ plugins: [] });
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out({ servers: [] });
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else if (args[0] === '-p') {
  fs.writeFileSync(${JSON.stringify(RUNNING_MARKER)}, String(process.pid), 'utf8');
  setInterval(() => {}, 1000);
}
else out('pass231 fake claude command: ' + args.join(' '));
`;
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  const posixShim = path.join(FAKE_BIN_DIR, "claude");
  fs.writeFileSync(posixShim, `#!/bin/sh\nexec node "$(dirname "$0")/fake-claude.cjs" "$@"\n`, "utf8");
  fs.chmodSync(posixShim, 0o755);
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function writeInitialStore() {
  writeFakeClaude();
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass231-project" }), "utf8");
  const project = { name: "pass231-project", path: PROJECT_DIR };
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
        id: "pass231-session",
        title: "PASS231 command palette automation status deeplinks",
        project: project.name,
        projectPath: project.path,
        createdAt: "2026-07-08T02:31:00.000Z",
        updatedAt: "2026-07-08T02:31:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    runEvents: [],
    automations: [
      {
        id: RUNNING_AUTOMATION_ID,
        prompt: "PASS231 running automation prompt",
        schedule: { type: "once", runAt: "" },
        project,
        threadId: "pass231-session",
        enabled: false,
        status: "idle",
        createdAt: "2026-07-08T02:31:00.000Z",
        updatedAt: "2026-07-08T02:31:02.000Z",
        lastRun: null,
        history: [],
      },
      {
        id: SCHEDULED_AUTOMATION_ID,
        prompt: "PASS231 scheduled automation prompt",
        schedule: { type: "once", runAt: "2099-07-08T02:31:00.000Z" },
        project,
        threadId: "pass231-session",
        enabled: true,
        status: "scheduled",
        createdAt: "2026-07-08T02:31:00.000Z",
        updatedAt: "2026-07-08T02:31:02.000Z",
        history: [],
      },
      {
        id: PAUSED_AUTOMATION_ID,
        prompt: "PASS231 paused automation prompt",
        schedule: { type: "once", runAt: "2099-07-08T02:31:00.000Z" },
        project,
        threadId: "pass231-session",
        enabled: false,
        status: "paused",
        createdAt: "2026-07-08T02:31:00.000Z",
        updatedAt: "2026-07-08T02:31:02.000Z",
        history: [],
      },
    ],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

async function runPaletteCommand(win, commandId, query) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));
      const button = document.querySelector(${JSON.stringify(`.command-modal .command-list button[data-command-id="${commandId}"]`)});
      if (!button) return false;
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 220));
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS231_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS231_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS231_START_REAL_RUNNING_AUTOMATION", await waitFor(win, `
    (async function() {
      if (!window.__pass231RunStarted) {
        window.__pass231RunStarted = true;
        window.claudexDesktop.runAutomationNow({
          automationId: ${JSON.stringify(RUNNING_AUTOMATION_ID)},
          requestId: ${JSON.stringify(RUNNING_RUN_ID)}
        }).catch((error) => { window.__pass231RunError = String(error?.message || error); });
      }
      const state = await window.claudexDesktop.getState();
      const automation = state.automations?.find((item) => item.id === ${JSON.stringify(RUNNING_AUTOMATION_ID)});
      return automation?.status === 'running' && automation.lastRun?.id === ${JSON.stringify(RUNNING_RUN_ID)};
    })();
  `, 10000));

  assertStep(
    "PASS231_OPEN_SCHEDULED_AUTOMATION_FROM_PALETTE",
    await runPaletteCommand(win, `automation:${SCHEDULED_AUTOMATION_ID}`, "PASS231 scheduled automation prompt"),
  );
  assertStep("PASS231_SCHEDULED_AUTOMATION_USES_ACTIVE_FILTER", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.subagent-workbench');
      const activeFilter = document.querySelector('.task-center-filters [data-task-filter="active"].active');
      const scheduled = document.querySelector('.automation-task-card.focused-task-card[data-automation-id="${SCHEDULED_AUTOMATION_ID}"]');
      const running = document.querySelector('.automation-task-card[data-automation-id="${RUNNING_AUTOMATION_ID}"]');
      const paused = document.querySelector('.automation-task-card[data-automation-id="${PAUSED_AUTOMATION_ID}"]');
      const text = panel?.textContent || '';
      return Boolean(
        panel &&
        activeFilter &&
        scheduled &&
        scheduled.getAttribute('aria-current') === 'true' &&
        running &&
        !paused &&
        /PASS231 scheduled automation prompt/.test(text) &&
        /PASS231 running automation prompt/.test(text) &&
        !/PASS231 paused automation prompt/.test(text)
      );
    })();
  `, 12000));

  assertStep(
    "PASS231_OPEN_RUNNING_AUTOMATION_FROM_PALETTE",
    await runPaletteCommand(win, `automation:${RUNNING_AUTOMATION_ID}`, "PASS231 running automation prompt"),
  );
  assertStep("PASS231_RUNNING_AUTOMATION_USES_ACTIVE_FILTER", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.subagent-workbench');
      const activeFilter = document.querySelector('.task-center-filters [data-task-filter="active"].active');
      const running = document.querySelector('.automation-task-card.focused-task-card[data-automation-id="${RUNNING_AUTOMATION_ID}"]');
      const scheduled = document.querySelector('.automation-task-card[data-automation-id="${SCHEDULED_AUTOMATION_ID}"]');
      const paused = document.querySelector('.automation-task-card[data-automation-id="${PAUSED_AUTOMATION_ID}"]');
      const text = panel?.textContent || '';
      return Boolean(
        panel &&
        activeFilter &&
        running &&
        running.getAttribute('aria-current') === 'true' &&
        scheduled &&
        !paused &&
        /PASS231 running automation prompt/.test(text) &&
        /PASS231 scheduled automation prompt/.test(text) &&
        !/PASS231 paused automation prompt/.test(text)
      );
    })();
  `, 12000));

  assertStep("PASS231_STOP_REAL_RUNNING_AUTOMATION", await win.webContents.executeJavaScript(`
    window.claudexDesktop.cancelAutomation({
      automationId: ${JSON.stringify(RUNNING_AUTOMATION_ID)},
      runId: ${JSON.stringify(RUNNING_RUN_ID)}
    }).then((state) => state.automationRun?.status === 'cancelled')
  `));

  console.log("PASS231_COMMAND_PALETTE_AUTOMATION_STATUS_DEEPLINKS_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS231_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (function() {
          return {
            commandModal: document.querySelector('.command-modal')?.textContent || '',
            activeFilter: document.querySelector('.task-center-filters .active')?.getAttribute('data-task-filter') || '',
            cards: Array.from(document.querySelectorAll('.automation-task-card')).map((card) => ({
              id: card.getAttribute('data-automation-id'),
              className: card.className,
              current: card.getAttribute('aria-current'),
              text: card.textContent,
            })),
            panel: document.querySelector('.bottom-work-panel')?.textContent || '',
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS231_DEBUG", JSON.stringify(debug, null, 2).slice(0, 12000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS231_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
