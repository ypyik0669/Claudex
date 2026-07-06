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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass146-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass146-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const ARTIFACT_RELATIVE = "docs/pass146-artifact.md";
const ARTIFACT_FILE = path.join(PROJECT_DIR, ARTIFACT_RELATIVE);

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
  fs.mkdirSync(path.dirname(ARTIFACT_FILE), { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass146-project" }), "utf8");
  fs.writeFileSync(ARTIFACT_FILE, "# Pass146 Artifact\n\npass146 real artifact file body", "utf8");
  const project = { name: "pass146-project", path: PROJECT_DIR };
  const subagentRun = {
    id: "pass146-subagent-run",
    requestId: "pass146-subagent-request",
    nickname: "Pass146 Artifact Opener",
    task: "pass146 open artifact from subagent workbench",
    status: "done",
    sessionId: "pass146-session",
    project,
    command: "claude",
    args: ["-p", "pass146 open artifact from subagent workbench", "--model", "claude-haiku-4-5-20251001"],
    cwd: PROJECT_DIR,
    code: 0,
    summary: "pass146 subagent produced a real workspace artifact",
    stdout: "pass146 stdout evidence",
    stderr: "",
    durationMs: 1460,
    startedAt: "2026-07-07T00:00:00.000Z",
    endedAt: "2026-07-07T00:00:01.460Z",
    artifacts: [
      {
        label: "Pass146 Workspace Artifact",
        path: ARTIFACT_FILE,
        type: "markdown",
        content: "pass146 artifact metadata content",
      },
    ],
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
        id: "pass146-session",
        title: "pass146 subagent artifact workspace opener",
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
        id: "pass146-subagent-request",
        type: "subagent",
        status: "ok",
        title: "子代理：Pass146 Artifact Opener",
        detail: "pass146 subagent produced a real workspace artifact",
        commandLine: "claude -p pass146 open artifact from subagent workbench --model claude-haiku-4-5-20251001",
        cwd: PROJECT_DIR,
        stdout: subagentRun.stdout,
        stderr: subagentRun.stderr,
        code: 0,
        durationMs: 1460,
        createdAt: subagentRun.endedAt,
      },
    ],
    automations: [],
    subagentRuns: [subagentRun],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

async function openSubagents(win) {
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
  if (!win) throw new Error("PASS146_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS146_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS146_OPEN_SUBAGENTS", await openSubagents(win));
  assertStep("PASS146_ARTIFACT_OPEN_ACTION_VISIBLE", await waitFor(win, `
    (function() {
      const card = document.querySelector('.subagent-run-card[data-subagent-run-id="pass146-subagent-run"]');
      if (!card) return false;
      const details = Array.from(card.querySelectorAll('.subagent-evidence-details'))
        .find((item) => /产物/.test(item.textContent || ''));
      details?.setAttribute('open', '');
      return Boolean(
        card.querySelector('[data-subagent-artifact-open="0"]') &&
        /Pass146 Workspace Artifact/.test(card.textContent || '') &&
        /pass146 artifact metadata content/.test(card.textContent || '')
      );
    })();
  `, 10000));
  assertStep("PASS146_OPEN_ARTIFACT_FROM_WORKBENCH", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.subagent-run-card[data-subagent-run-id="pass146-subagent-run"] [data-subagent-artifact-open="0"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS146_WORKSPACE_FILE_OPENED_FROM_WORKBENCH", await waitFor(win, `
    (async function() {
      const activeTool = document.querySelector('.tool-row.active')?.textContent || '';
      const textarea = document.querySelector('.workspace-detail textarea[aria-label="docs/pass146-artifact.md"]');
      const state = await window.claudexDesktop.getState();
      return /工作区|Workspace/.test(activeTool) &&
        Boolean(textarea) &&
        /pass146 real artifact file body/.test(textarea.value || '') &&
        state.sourceRefs?.some((source) => source.path === 'docs/pass146-artifact.md');
    })();
  `, 12000));
  assertStep("PASS146_OPEN_TIMELINE", await win.webContents.executeJavaScript(`
    (function() {
      const card = document.querySelector('.subagent-run-card[data-subagent-run-id="pass146-subagent-run"]');
      const button = Array.from(card?.querySelectorAll('.subagent-run-foot button') || [])
        .find((candidate) => /timeline/i.test(candidate.textContent || '') || /timeline/i.test(candidate.title || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS146_TIMELINE_ARTIFACT_OPEN_ACTION_VISIBLE", await waitFor(win, `
    Boolean(
      document.querySelector('.selected-run-evidence-panel [data-run-timeline-artifact-open="0"]') &&
      /pass146 artifact metadata content/.test(document.querySelector('.selected-run-evidence-panel')?.textContent || '')
    )
  `, 10000));
  assertStep("PASS146_OPEN_ARTIFACT_FROM_TIMELINE", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.selected-run-evidence-panel [data-run-timeline-artifact-open="0"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS146_WORKSPACE_FILE_OPENED_FROM_TIMELINE", await waitFor(win, `
    (function() {
      const textarea = document.querySelector('.workspace-detail textarea[aria-label="docs/pass146-artifact.md"]');
      return Boolean(textarea) && /pass146 real artifact file body/.test(textarea.value || '');
    })();
  `, 12000));

  console.log("PASS146_SUBAGENT_ARTIFACT_OPEN_WORKSPACE_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS146_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS146_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
