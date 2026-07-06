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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass147-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass147-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const ARTIFACT_RELATIVE = "docs/pass147-artifact.md";
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass147-project" }), "utf8");
  fs.writeFileSync(ARTIFACT_FILE, "# Pass147 Artifact\n\npass147 real workspace file opened from palette", "utf8");
  const project = { name: "pass147-project", path: PROJECT_DIR };
  const subagentRun = {
    id: "pass147-subagent-run",
    requestId: "pass147-subagent-request",
    nickname: "Pass147 Palette Agent",
    task: "pass147 focus subagent artifact evidence",
    status: "done",
    sessionId: "pass147-session",
    project,
    command: "claude",
    args: ["-p", "pass147 focus subagent artifact evidence", "--model", "claude-haiku-4-5-20251001"],
    cwd: PROJECT_DIR,
    code: 0,
    summary: "pass147 palette subagent summary",
    stdout: "pass147 palette subagent stdout",
    stderr: "pass147 palette subagent stderr",
    durationMs: 1470,
    startedAt: "2026-07-07T00:00:00.000Z",
    endedAt: "2026-07-07T00:00:01.470Z",
    artifacts: [
      {
        label: "Pass147 Palette Artifact",
        path: ARTIFACT_FILE,
        type: "markdown",
        content: "pass147 searchable artifact body evidence",
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
        id: "pass147-session",
        title: "pass147 command palette subagent artifact focus",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    runEvents: [],
    automations: [],
    subagentRuns: [subagentRun],
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
      await new Promise((resolve) => setTimeout(resolve, 250));
      return true;
    })();
  `);
}

async function clickSubagentTaskCenterCommand(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) =>
          /^subagent:/.test(candidate.getAttribute('data-command-id') || '') &&
          /Pass147 Palette Agent/.test(candidate.textContent || '')
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
  if (!win) throw new Error("PASS147_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS147_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS147_OPEN_PALETTE_QUERY_ARTIFACT", await openPaletteAndQuery(win, "pass147 searchable artifact body evidence"));
  assertStep("PASS147_SUBAGENT_COMMAND_SEARCHABLE", await waitFor(win, `
    Boolean([...document.querySelectorAll('.command-modal .command-list button')].some((button) =>
      /^subagent:/.test(button.getAttribute('data-command-id') || '') &&
      /Pass147 Palette Agent/.test(button.textContent || '')
    ))
  `, 5000));
  assertStep("PASS147_CLICK_SUBAGENT_COMMAND", await clickSubagentTaskCenterCommand(win));
  assertStep("PASS147_FOCUSED_CARD_EXPANDS_ARTIFACTS", await waitFor(win, `
    (function() {
      const active = document.querySelector('.workspace-context-button.active')?.textContent || '';
      const card = document.querySelector('.subagent-run-card[data-subagent-run-id="pass147-subagent-run"]');
      const artifactDetails = Array.from(card?.querySelectorAll('.subagent-evidence-details[open]') || [])
        .find((details) => /产物/.test(details.querySelector('summary')?.textContent || ''));
      const evidenceDetails = Array.from(card?.querySelectorAll('.subagent-evidence-details[open]') || [])
        .find((details) => /证据/.test(details.querySelector('summary')?.textContent || ''));
      return /子代理|Subagent|任务/.test(active) &&
        card?.classList.contains('focused-task-card') &&
        card?.getAttribute('aria-current') === 'true' &&
        Boolean(artifactDetails) &&
        Boolean(evidenceDetails) &&
        /Pass147 Palette Artifact/.test(card?.textContent || '') &&
        /pass147 searchable artifact body evidence/.test(card?.textContent || '') &&
        Boolean(card?.querySelector('[data-subagent-artifact-open="0"]'));
    })();
  `, 10000));
  assertStep("PASS147_OPEN_FOCUSED_ARTIFACT", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.subagent-run-card[data-subagent-run-id="pass147-subagent-run"] [data-subagent-artifact-open="0"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS147_WORKSPACE_FILE_OPENED", await waitFor(win, `
    (async function() {
      const activeTool = document.querySelector('.tool-row.active')?.textContent || '';
      const textarea = document.querySelector('.workspace-detail textarea[aria-label="docs/pass147-artifact.md"]');
      const state = await window.claudexDesktop.getState();
      return /工作区|Workspace/.test(activeTool) &&
        Boolean(textarea) &&
        /pass147 real workspace file opened from palette/.test(textarea.value || '') &&
        state.sourceRefs?.some((source) => source.path === 'docs/pass147-artifact.md');
    })();
  `, 12000));

  console.log("PASS147_COMMAND_PALETTE_SUBAGENT_ARTIFACT_FOCUS_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS147_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS147_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
