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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass129-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass129-project-"));
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass129-project" }), "utf8");
  const project = { name: "pass129-project", path: PROJECT_DIR };
  const subagentRun = {
    id: "pass129-subagent-run",
    requestId: "pass129-subagent-request",
    nickname: "Pass129 Copy Agent",
    task: "pass129 copy subagent evidence task",
    status: "done",
    sessionId: "pass129-session",
    project,
    command: "claude",
    args: ["-p", "pass129 copy subagent evidence task", "--model", "claude-haiku-4-5-20251001"],
    cwd: PROJECT_DIR,
    code: 0,
    summary: "pass129 subagent summary evidence",
    stdout: "pass129 subagent stdout evidence",
    stderr: "pass129 subagent stderr evidence",
    durationMs: 1290,
    startedAt: "2026-07-07T00:00:00.000Z",
    endedAt: "2026-07-07T00:00:01.290Z",
    artifacts: [
      { label: "pass129 artifact", path: path.join(PROJECT_DIR, "pass129-artifact.md"), type: "markdown", content: "pass129 artifact body evidence" },
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
        id: "pass129-session",
        title: "pass129 subagent copy evidence",
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
        id: "pass129-subagent-request",
        type: "subagent",
        status: "ok",
        title: "子代理：Pass129 Copy Agent",
        detail: "pass129 subagent summary evidence",
        commandLine: "claude -p pass129 copy subagent evidence task --model claude-haiku-4-5-20251001",
        cwd: PROJECT_DIR,
        stdout: subagentRun.stdout,
        stderr: subagentRun.stderr,
        code: 0,
        durationMs: 1290,
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
  if (!win) throw new Error("PASS129_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS129_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS129_OPEN_SUBAGENTS", await openSubagents(win));
  assertStep("PASS129_SUBAGENT_CARD_READY", await waitFor(win, `
    Boolean(
      document.querySelector('.subagent-run-card[data-subagent-run-id="pass129-subagent-run"]') &&
      /Pass129 Copy Agent/.test(document.querySelector('.subagent-run-card[data-subagent-run-id="pass129-subagent-run"]')?.textContent || '') &&
      /pass129 subagent summary evidence/.test(document.querySelector('.subagent-run-card[data-subagent-run-id="pass129-subagent-run"]')?.textContent || '')
    )
  `, 15000));
  assertStep("PASS129_COPY_SUBAGENT_EVIDENCE_ACTION", await win.webContents.executeJavaScript(`
    (function() {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text) => { window.__pass129Clipboard = String(text || ''); } },
      });
      const card = document.querySelector('.subagent-run-card[data-subagent-run-id="pass129-subagent-run"]');
      const copy = card?.querySelector('[data-subagent-run-action="copy-evidence"]');
      if (!copy) return false;
      copy.click();
      return true;
    })();
  `));
  assertStep("PASS129_SUBAGENT_EVIDENCE_COPIED", await waitFor(win, `
    (function() {
      const card = document.querySelector('.subagent-run-card[data-subagent-run-id="pass129-subagent-run"]');
      const text = window.__pass129Clipboard || '';
      const projectDir = ${JSON.stringify(PROJECT_DIR)};
      return /Pass129 Copy Agent/.test(text) &&
        /pass129 copy subagent evidence task/.test(text) &&
        /pass129-subagent-run/.test(text) &&
        /pass129-subagent-request/.test(text) &&
        /pass129-session/.test(text) &&
        text.includes(projectDir) &&
        /claude -p pass129 copy subagent evidence task --model claude-haiku-4-5-20251001/.test(text) &&
        /1\\.3s/.test(text) &&
        /pass129 subagent summary evidence/.test(text) &&
        /pass129 subagent stdout evidence/.test(text) &&
        /pass129 subagent stderr evidence/.test(text) &&
        /pass129 artifact body evidence/.test(text) &&
        /证据已复制/.test(card?.textContent || '');
    })();
  `, 5000));

  console.log("PASS129_SUBAGENT_ROW_COPY_EVIDENCE_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS129_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS129_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
