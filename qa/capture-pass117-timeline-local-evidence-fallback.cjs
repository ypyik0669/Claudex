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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass117-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass117-project-"));
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass117-project" }), "utf8");
  const project = { name: "pass117-project", path: PROJECT_DIR };
  const startedAt = "2026-07-06T00:00:00.000Z";
  const automationRun = {
    id: "pass117-automation-run",
    trigger: "manual",
    status: "succeeded",
    startedAt,
    endedAt: "2026-07-06T00:01:00.000Z",
    durationMs: 60000,
    sessionId: "default",
    code: 0,
    stdout: "pass117 automation stdout evidence",
    stderr: "pass117 automation stderr evidence",
    summary: "pass117 automation summary evidence",
  };
  const subagentRun = {
    id: "pass117-subagent",
    requestId: "pass117-subagent-request",
    nickname: "Pass117 Agent",
    task: "pass117 subagent local evidence task",
    status: "error",
    sessionId: "default",
    project,
    cwd: PROJECT_DIR,
    command: "claude",
    args: ["-p", "pass117 subagent local evidence task", "--output-format", "json"],
    summary: "pass117 subagent summary evidence",
    stdout: "pass117 subagent stdout evidence",
    stderr: "pass117 subagent stderr evidence",
    code: 42,
    durationMs: 4200,
    startedAt,
    endedAt: "2026-07-06T00:02:00.000Z",
    artifacts: [{ type: "summary", label: "pass117 subagent artifact", content: "pass117 artifact body" }],
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
        title: "Timeline local evidence fallback",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt: startedAt,
        updatedAt: startedAt,
        messages: [],
      },
    ],
    automations: [
      {
        id: "pass117-automation",
        prompt: "pass117 automation local evidence task",
        schedule: { type: "once", runAt: "" },
        project,
        threadId: "default",
        enabled: false,
        status: "succeeded",
        createdAt: startedAt,
        updatedAt: automationRun.endedAt,
        lastRun: automationRun,
        history: [automationRun],
      },
    ],
    subagentRuns: [subagentRun],
    commandRuns: [],
    runEvents: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

async function openOutputsPanel(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      if (document.querySelector('.bottom-work-panel .run-timeline')) return true;
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
  if (!win) throw new Error("PASS117_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS117_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS117_STORE_HAS_LOCAL_EVIDENCE_WITHOUT_RUN_EVENTS", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      return Boolean(
        state.runEvents?.length === 0 &&
        state.automations?.[0]?.history?.[0]?.id === 'pass117-automation-run' &&
        state.subagentRuns?.[0]?.requestId === 'pass117-subagent-request'
      );
    })();
  `));
  assertStep("PASS117_OPEN_OUTPUTS", await openOutputsPanel(win));
  assertStep("PASS117_SYNTHETIC_TIMELINE_ROWS_VISIBLE", await waitFor(win, `
    (function() {
      const rows = [...document.querySelectorAll('.run-timeline-row')];
      const automationRow = rows.find((row) => /pass117 automation local evidence task/.test(row.textContent || ''));
      const subagentRow = rows.find((row) => /Pass117 Agent/.test(row.textContent || ''));
      return Boolean(
        rows.length >= 2 &&
        automationRow?.classList.contains('ok') &&
        subagentRow?.classList.contains('error')
      );
    })();
  `, 10000));

  assertStep("PASS117_SELECT_AUTOMATION_SYNTHETIC_EVIDENCE", await waitFor(win, `
    (async function() {
      if (!window.__pass117AutomationSelected) {
        const row = [...document.querySelectorAll('.run-timeline-row')]
          .find((candidate) => /pass117 automation local evidence task/.test(candidate.textContent || ''));
        const summary = row?.querySelector('summary');
        if (!summary) return false;
        window.__pass117AutomationSelected = true;
        summary.click();
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
      const panel = document.querySelector('.selected-run-evidence-panel.ok');
      const text = panel?.textContent || '';
      return Boolean(
        panel &&
        /automation/.test(text) &&
        /pass117 automation local evidence task/.test(text) &&
        /pass117 automation stdout evidence/.test(text) &&
        /pass117 automation stderr evidence/.test(text) &&
        /default/.test(text)
      );
    })();
  `, 10000));

  assertStep("PASS117_SELECT_SUBAGENT_SYNTHETIC_EVIDENCE", await waitFor(win, `
    (async function() {
      if (!window.__pass117SubagentSelected) {
        const row = [...document.querySelectorAll('.run-timeline-row')]
          .find((candidate) => /Pass117 Agent/.test(candidate.textContent || ''));
        const summary = row?.querySelector('summary');
        if (!summary) return false;
        window.__pass117SubagentSelected = true;
        summary.click();
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
      const panel = document.querySelector('.selected-run-evidence-panel.error');
      const text = panel?.textContent || '';
      return Boolean(
        panel &&
        /subagent/.test(text) &&
        /Pass117 Agent/.test(text) &&
        /pass117 subagent summary evidence/.test(text) &&
        /pass117 subagent stderr evidence/.test(text) &&
        /pass117 subagent artifact/.test(text)
      );
    })();
  `, 10000));

  console.log("PASS117_TIMELINE_LOCAL_EVIDENCE_FALLBACK_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS117_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS117_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
