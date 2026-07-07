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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass225-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass225-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass225-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const TARGET_AUTOMATION_ID = "pass225-automation";
const TARGET_RUN_ID = "pass225-automation-run-7";
const TARGET_TOKEN = "pass225 deep automation history 7 command palette token";

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

function assertStep(name, ok) {
  console.log(name, ok);
  if (!ok) throw new Error(`${name} failed`);
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function writeFakeClaude() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  const fakeScript = `
const args = process.argv.slice(2);
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
if (args[0] === '--version') out('2.25.0 (Claude Code PASS225)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out({ plugins: [] });
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out({ servers: [] });
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else out('pass225 fake claude command: ' + args.join(' '));
`;
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeScript, "utf8");
  fs.writeFileSync(FAKE_CLAUDE, '@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n', "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function makeAutomationRun(index) {
  const padded = String(index).padStart(2, "0");
  const isTarget = index === 7;
  return {
    id: `pass225-automation-run-${index}`,
    trigger: "manual",
    status: isTarget ? "failed" : "succeeded",
    startedAt: `2026-07-08T02:${padded}:00.000Z`,
    endedAt: `2026-07-08T02:${padded}:03.000Z`,
    durationMs: 3000 + index,
    sessionId: "pass225-session",
    code: isTarget ? 7 : 0,
    detail: isTarget ? `${TARGET_TOKEN} detail` : `pass225 filler automation run ${index} detail`,
    summary: isTarget ? `${TARGET_TOKEN} summary` : `pass225 filler automation run ${index} summary`,
    stdout: isTarget ? `${TARGET_TOKEN} stdout` : `pass225 filler automation run ${index} stdout`,
    stderr: isTarget ? `${TARGET_TOKEN} stderr` : "",
  };
}

function writeInitialStore() {
  writeFakeClaude();
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass225-project" }), "utf8");
  const project = { name: "pass225-project", path: PROJECT_DIR };
  const history = Array.from({ length: 7 }, (_value, index) => makeAutomationRun(index + 1));
  const lastRun = {
    id: "pass225-last-run",
    trigger: "scheduled",
    status: "succeeded",
    startedAt: "2026-07-08T03:00:00.000Z",
    endedAt: "2026-07-08T03:00:02.000Z",
    durationMs: 2000,
    sessionId: "pass225-session",
    code: 0,
    summary: "pass225 last run summary",
    stdout: "pass225 last run stdout",
    stderr: "",
  };

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
        id: "pass225-session",
        title: "PASS225 deep automation history",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-08T02:25:00.000Z",
        updatedAt: "2026-07-08T02:25:00.000Z",
        messages: [],
      },
    ],
    automations: [
      {
        id: TARGET_AUTOMATION_ID,
        prompt: "pass225 automation has more than six history entries",
        schedule: { type: "once", runAt: "" },
        project,
        threadId: "pass225-session",
        enabled: false,
        status: "failed",
        createdAt: "2026-07-08T02:25:00.000Z",
        updatedAt: "2026-07-08T03:00:02.000Z",
        lastRun,
        history,
      },
    ],
    commandRuns: [],
    runEvents: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
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
        text: button.textContent || '',
      }));
      window.__pass225Commands = result;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return result;
    })();
  `);
}

async function waitForAutomationRunCommand(win, timeoutMs = 12000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const commands = await paletteCommands(win, TARGET_TOKEN);
    if (Array.isArray(commands) && commands.some((command) =>
      command.id === `automation-run:${TARGET_RUN_ID}` &&
      /pass225 automation has more than six history entries/.test(command.text || '')
    )) return true;
    await wait(180);
  }
  return false;
}

async function runAutomationRunCommand(win) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(TARGET_TOKEN)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === ${JSON.stringify(`automation-run:${TARGET_RUN_ID}`)});
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS225_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS225_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS225_STORE_HAS_DEEP_HISTORY", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      const automation = state.automations?.find((item) => item.id === ${JSON.stringify(TARGET_AUTOMATION_ID)});
      return Boolean(
        state.runEvents?.length === 0 &&
        automation?.history?.length === 7 &&
        automation.history[6]?.id === ${JSON.stringify(TARGET_RUN_ID)} &&
        automation.lastRun?.id === 'pass225-last-run'
      );
    })();
  `));

  assertStep("PASS225_DEEP_AUTOMATION_RUN_COMMAND_SEARCHABLE", await waitForAutomationRunCommand(win));
  assertStep("PASS225_OPEN_DEEP_AUTOMATION_RUN_TIMELINE", await runAutomationRunCommand(win));
  assertStep("PASS225_DEEP_AUTOMATION_RUN_TIMELINE_FOCUSED", await waitFor(win, `
    (function() {
      const active = document.querySelector('.workspace-context-button.active')?.textContent || '';
      const selectedRow = document.querySelector('.run-timeline-row.selected')?.textContent || '';
      const panel = document.querySelector('.selected-run-evidence-panel.error')?.textContent || '';
      return /\u8f93\u51fa/.test(active) &&
        /pass225 automation has more than six history entries/.test(selectedRow) &&
        panel.includes(${JSON.stringify(TARGET_TOKEN)}) &&
        /pass225-project/.test(panel) &&
        !/pass225 last run summary/.test(panel);
    })();
  `, 10000));

  console.log("PASS225_COMMAND_PALETTE_DEEP_AUTOMATION_HISTORY_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS225_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (async function() {
          return {
            commands: window.__pass225Commands || [],
            selectedRow: document.querySelector('.run-timeline-row.selected')?.textContent || '',
            panel: document.querySelector('.selected-run-evidence-panel')?.textContent || '',
            state: await window.claudexDesktop.getState().catch((stateError) => ({ error: String(stateError?.message || stateError) })),
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS225_DEBUG", JSON.stringify(debug, null, 2).slice(0, 12000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS225_TIMEOUT");
  cleanup();
  app.exit(1);
}, 100000);
