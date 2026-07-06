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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass151-data-"));
const ACTIVE_PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass151-active-"));
const TARGET_PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass151-target-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const ARTIFACT_RELATIVE = "docs/pass151-artifact.md";
const ACTIVE_ARTIFACT_FILE = path.join(ACTIVE_PROJECT_DIR, ARTIFACT_RELATIVE);
const TARGET_ARTIFACT_FILE = path.join(TARGET_PROJECT_DIR, ARTIFACT_RELATIVE);
const ACTIVE_CONTENT = "# Pass151 Active\n\npass151 wrong active artifact file body";
const TARGET_CONTENT = "# Pass151 Target\n\npass151 correct target artifact file body";

function cleanup() {
  for (const dir of [USER_DATA_DIR, ACTIVE_PROJECT_DIR, TARGET_PROJECT_DIR]) {
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
  fs.mkdirSync(path.dirname(ACTIVE_ARTIFACT_FILE), { recursive: true });
  fs.mkdirSync(path.dirname(TARGET_ARTIFACT_FILE), { recursive: true });
  fs.writeFileSync(path.join(ACTIVE_PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass151-active-project" }), "utf8");
  fs.writeFileSync(path.join(TARGET_PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass151-target-project" }), "utf8");
  fs.writeFileSync(ACTIVE_ARTIFACT_FILE, ACTIVE_CONTENT, "utf8");
  fs.writeFileSync(TARGET_ARTIFACT_FILE, TARGET_CONTENT, "utf8");
  const activeProject = { name: "pass151-active-project", path: ACTIVE_PROJECT_DIR };
  const targetProject = { name: "pass151-target-project", path: TARGET_PROJECT_DIR };
  const artifact = {
    label: "Pass151 Cross Project Artifact",
    path: ARTIFACT_RELATIVE,
    projectPath: TARGET_PROJECT_DIR,
    projectLabel: targetProject.name,
    type: "markdown",
    content: "pass151 artifact metadata points to target project",
  };
  const subagentRun = {
    id: "pass151-subagent-run",
    requestId: "pass151-subagent-request",
    nickname: "Pass151 Artifact Project Path",
    task: "pass151 open cross project artifact",
    status: "done",
    sessionId: "pass151-session",
    project: activeProject,
    command: "claude",
    args: ["-p", "pass151 open cross project artifact", "--model", "claude-haiku-4-5-20251001"],
    cwd: ACTIVE_PROJECT_DIR,
    code: 0,
    summary: "pass151 subagent produced a cross-project artifact",
    stdout: "pass151 stdout evidence",
    stderr: "",
    durationMs: 1510,
    startedAt: "2026-07-07T00:00:00.000Z",
    endedAt: "2026-07-07T00:00:01.510Z",
    artifacts: [artifact],
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
    activeProject,
    projects: [activeProject, targetProject],
    sessions: [
      {
        id: "pass151-session",
        title: "pass151 subagent cross-project artifact",
        project: activeProject.name,
        projectPath: ACTIVE_PROJECT_DIR,
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    runEvents: [
      {
        id: "pass151-subagent-request",
        type: "subagent",
        status: "ok",
        title: "子代理：Pass151 Artifact Project Path",
        detail: "pass151 subagent produced a cross-project artifact",
        commandLine: "claude -p pass151 open cross project artifact --model claude-haiku-4-5-20251001",
        cwd: ACTIVE_PROJECT_DIR,
        stdout: subagentRun.stdout,
        stderr: subagentRun.stderr,
        code: 0,
        durationMs: 1510,
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

async function assertTargetArtifactOpen(win, stepName) {
  assertStep(stepName, await waitFor(win, `
    (async function() {
      const activeTool = document.querySelector('.tool-row.active')?.textContent || '';
      const textarea = document.querySelector('.workspace-detail textarea[aria-label=${JSON.stringify(ARTIFACT_RELATIVE)}]');
      const state = await window.claudexDesktop.getState();
      return /工作区|Workspace/.test(activeTool) &&
        Boolean(textarea) &&
        /pass151 correct target artifact file body/.test(textarea.value || '') &&
        !/pass151 wrong active artifact file body/.test(textarea.value || '') &&
        state.sourceRefs?.some((source) =>
          source.path === ${JSON.stringify(ARTIFACT_RELATIVE)} &&
          source.project?.path === ${JSON.stringify(TARGET_PROJECT_DIR)}
        );
    })();
  `, 12000));
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS151_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS151_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS151_OPEN_SUBAGENTS", await openSubagents(win));
  assertStep("PASS151_ARTIFACT_OPEN_ACTION_VISIBLE", await waitFor(win, `
    (function() {
      const card = document.querySelector('.subagent-run-card[data-subagent-run-id="pass151-subagent-run"]');
      if (!card) return false;
      const details = Array.from(card.querySelectorAll('.subagent-evidence-details'))
        .find((item) => /产物/.test(item.textContent || ''));
      details?.setAttribute('open', '');
      return Boolean(
        card.querySelector('[data-subagent-artifact-open="0"]') &&
        /Pass151 Cross Project Artifact/.test(card.textContent || '') &&
        /pass151 artifact metadata points to target project/.test(card.textContent || '')
      );
    })();
  `, 10000));
  assertStep("PASS151_OPEN_ARTIFACT_FROM_WORKBENCH", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.subagent-run-card[data-subagent-run-id="pass151-subagent-run"] [data-subagent-artifact-open="0"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  await assertTargetArtifactOpen(win, "PASS151_WORKBENCH_OPENED_TARGET_PROJECT_ARTIFACT");
  assertStep("PASS151_OPEN_TIMELINE", await win.webContents.executeJavaScript(`
    (function() {
      const card = document.querySelector('.subagent-run-card[data-subagent-run-id="pass151-subagent-run"]');
      const button = Array.from(card?.querySelectorAll('.subagent-run-foot button') || [])
        .find((candidate) => /timeline/i.test(candidate.textContent || '') || /timeline/i.test(candidate.title || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS151_TIMELINE_ARTIFACT_OPEN_ACTION_VISIBLE", await waitFor(win, `
    Boolean(
      document.querySelector('.selected-run-evidence-panel [data-run-timeline-artifact-open="0"]') &&
      /pass151 artifact metadata points to target project/.test(document.querySelector('.selected-run-evidence-panel')?.textContent || '')
    )
  `, 10000));
  assertStep("PASS151_OPEN_ARTIFACT_FROM_TIMELINE", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.selected-run-evidence-panel [data-run-timeline-artifact-open="0"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  await assertTargetArtifactOpen(win, "PASS151_TIMELINE_OPENED_TARGET_PROJECT_ARTIFACT");

  console.log("PASS151_SUBAGENT_ARTIFACT_PROJECT_PATH_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS151_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS151_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
