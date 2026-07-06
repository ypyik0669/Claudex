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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass122-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass122-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");

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

function writeInitialStore() {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass122-project" }), "utf8");
  const project = { name: "pass122-project", path: PROJECT_DIR };
  const targetRun = {
    id: "pass122-target-run",
    trigger: "manual",
    status: "succeeded",
    startedAt: "2026-07-07T00:00:00.000Z",
    endedAt: "2026-07-07T00:00:02.000Z",
    durationMs: 2000,
    sessionId: "default",
    code: 0,
    stdout: "pass122 target history stdout evidence",
    stderr: "pass122 target history stderr evidence",
    summary: "pass122 target history summary evidence",
  };
  const lastRun = {
    id: "pass122-last-run",
    trigger: "scheduled",
    status: "failed",
    startedAt: "2026-07-07T00:03:00.000Z",
    endedAt: "2026-07-07T00:03:05.000Z",
    durationMs: 5000,
    sessionId: "default",
    code: 1,
    stdout: "pass122 last run stdout",
    stderr: "pass122 last run stderr",
    error: "pass122 last run error",
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
    activeProject: project,
    projects: [project],
    sessions: [
      {
        id: "default",
        title: "Command palette automation run deeplink",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
        messages: [],
      },
    ],
    automations: [
      {
        id: "pass122-automation",
        prompt: "pass122 automation palette history task",
        schedule: { type: "once", runAt: "" },
        project,
        threadId: "default",
        enabled: false,
        status: "failed",
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:03:05.000Z",
        lastRun,
        history: [targetRun, lastRun],
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

async function openPaletteAndQuery(win, query) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      return true;
    })();
  `);
}

async function clickAutomationRunCommand(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) =>
          (candidate.getAttribute('data-command-id') || '').startsWith('automation-run:') &&
          /pass122 target history summary evidence/.test(candidate.textContent || '')
        );
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS122_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS122_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS122_STORE_HAS_HISTORY_WITHOUT_RUN_EVENTS", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      return Boolean(
        state.runEvents?.length === 0 &&
        state.automations?.[0]?.history?.some((entry) => entry.id === 'pass122-target-run') &&
        state.automations?.[0]?.lastRun?.id === 'pass122-last-run'
      );
    })();
  `));
  assertStep("PASS122_OPEN_PALETTE_QUERY_TARGET_RUN", await openPaletteAndQuery(win, "pass122 target history stdout"));
  assertStep("PASS122_AUTOMATION_RUN_COMMAND_VISIBLE", await waitFor(win, `
    Boolean([...document.querySelectorAll('.command-modal .command-list button')].some((button) =>
      (button.getAttribute('data-command-id') || '').startsWith('automation-run:') &&
      /pass122 target history summary evidence/.test(button.textContent || '') &&
      /pass122-target-run/.test(button.getAttribute('data-command-id') || '')
    ))
  `, 5000));
  assertStep("PASS122_CLICK_AUTOMATION_RUN_COMMAND", await clickAutomationRunCommand(win));
  assertStep("PASS122_AUTOMATION_RUN_TIMELINE_FOCUSED", await waitFor(win, `
    (function() {
      const active = document.querySelector('.workspace-context-button.active')?.textContent || '';
      const selectedRow = document.querySelector('.run-timeline-row.selected')?.textContent || '';
      const panel = document.querySelector('.selected-run-evidence-panel')?.textContent || '';
      return /\\u8f93\\u51fa/.test(active) &&
        /pass122 automation palette history task/.test(selectedRow) &&
        /pass122 target history summary evidence/.test(panel) &&
        /pass122 target history stdout evidence/.test(panel) &&
        /pass122 target history stderr evidence/.test(panel) &&
        /default/.test(panel) &&
        !/pass122 last run error/.test(panel);
    })()
  `, 10000));

  console.log("PASS122_COMMAND_PALETTE_AUTOMATION_RUN_DEEPLINK_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS122_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS122_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
