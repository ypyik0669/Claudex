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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass130-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass130-project-"));
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass130-project" }), "utf8");
  const project = { name: "pass130-project", path: PROJECT_DIR };
  const run = {
    id: "pass130-automation-run",
    status: "succeeded",
    trigger: "manual",
    startedAt: "2026-07-07T00:00:00.000Z",
    endedAt: "2026-07-07T00:00:01.300Z",
    durationMs: 1300,
    sessionId: "pass130-session",
    code: 0,
    summary: "pass130 automation summary evidence",
    detail: "pass130 automation detail evidence",
    stdout: "pass130 automation stdout evidence",
    stderr: "pass130 automation stderr evidence",
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
        id: "pass130-session",
        title: "pass130 automation copy evidence",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    runEvents: [
      {
        id: run.id,
        type: "automation",
        status: "ok",
        title: "自动化：pass130 automation copy evidence task",
        detail: run.summary,
        stdout: run.stdout,
        stderr: run.stderr,
        code: 0,
        durationMs: 1300,
        createdAt: run.endedAt,
      },
    ],
    automations: [
      {
        id: "pass130-automation",
        prompt: "pass130 automation copy evidence task",
        schedule: { type: "once", runAt: "" },
        project,
        threadId: "pass130-session",
        enabled: true,
        status: "succeeded",
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: run.endedAt,
        lastRun: run,
        history: [run],
      },
    ],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

async function openTaskCenter(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const buttons = [...document.querySelectorAll('.workspace-context-button')];
      const button = buttons.find((candidate) => /子代理|Subagent|任务/.test(candidate.textContent || '') || candidate.getAttribute('aria-label') === '子代理');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS130_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS130_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS130_OPEN_TASK_CENTER", await openTaskCenter(win));
  assertStep("PASS130_AUTOMATION_CARD_READY", await waitFor(win, `
    Boolean(
      document.querySelector('.automation-task-card[data-automation-id="pass130-automation"]') &&
      /pass130 automation copy evidence task/.test(document.querySelector('.automation-task-card[data-automation-id="pass130-automation"]')?.textContent || '') &&
      /pass130 automation detail evidence/.test(document.querySelector('.automation-task-card[data-automation-id="pass130-automation"]')?.textContent || '')
    )
  `, 15000));
  assertStep("PASS130_COPY_AUTOMATION_EVIDENCE_ACTION", await win.webContents.executeJavaScript(`
    (function() {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text) => { window.__pass130Clipboard = String(text || ''); } },
      });
      const card = document.querySelector('.automation-task-card[data-automation-id="pass130-automation"]');
      const copy = card?.querySelector('[data-automation-task-action="copy-evidence"]');
      if (!copy) return false;
      copy.click();
      return true;
    })();
  `));
  assertStep("PASS130_AUTOMATION_EVIDENCE_COPIED", await waitFor(win, `
    (function() {
      const card = document.querySelector('.automation-task-card[data-automation-id="pass130-automation"]');
      const text = window.__pass130Clipboard || '';
      return /pass130 automation copy evidence task/.test(text) &&
        /pass130 automation detail evidence/.test(text) &&
        /pass130 automation stdout evidence/.test(text) &&
        /pass130 automation stderr evidence/.test(text) &&
        /pass130-session/.test(text) &&
        /已复制/.test(card?.textContent || '');
    })();
  `, 5000));

  console.log("PASS130_AUTOMATION_TASK_COPY_EVIDENCE_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS130_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS130_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
