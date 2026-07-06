const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass97-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass97-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass97-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");

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

fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), "@echo off\r\necho pass97 fake claude\r\n", "utf8");
const FAKE_CLAUDE_COMMAND = path.join(FAKE_BIN_DIR, "claude.cmd");
process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;

app.setPath("userData", USER_DATA_DIR);
fs.mkdirSync(PROJECT_DIR, { recursive: true });
fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass97-project" }), "utf8");

const createdAt = "2026-07-06T00:00:00.000Z";
const project = { name: "pass97-project", path: PROJECT_DIR };
const doneRun = {
  id: "pass97-artifact-run",
  requestId: "pass97-artifact-request",
  nickname: "Pass97 Artifact QA",
  task: "pass97 inspect artifacts",
  status: "done",
  sessionId: "default",
  project,
  cwd: PROJECT_DIR,
  command: FAKE_CLAUDE_COMMAND,
  args: ["-p", "pass97 inspect artifacts", "--output-format", "json"],
  stdout: "pass97 stdout body",
  stderr: "",
  summary: "pass97 summary body",
  code: 0,
  durationMs: 1234,
  startedAt: createdAt,
  endedAt: "2026-07-06T00:00:01.234Z",
  artifacts: [
    { type: "summary", label: "Pass97 Summary Artifact", content: "pass97 artifact summary content" },
    { type: "file", label: "Pass97 Patch Plan", path: "docs/pass97-plan.md", content: "pass97 artifact patch plan content" },
    { type: "stderr", label: "Pass97 Empty Artifact", content: "" },
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
    claudeCode: { executionMode: "claude-code", claudeCommand: FAKE_CLAUDE_COMMAND, permissionMode: "default" },
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
      title: "新聊天",
      project: project.name,
      projectPath: PROJECT_DIR,
      createdAt,
      updatedAt: createdAt,
      messages: [],
    },
  ],
  automations: [],
  subagentRuns: [doneRun],
  runEvents: [
    {
      id: doneRun.requestId,
      type: "subagent",
      status: "ok",
      title: "子代理：Pass97 Artifact QA",
      detail: "pass97 summary body",
      commandLine: [doneRun.command, ...doneRun.args].join(" "),
      cwd: PROJECT_DIR,
      code: 0,
      durationMs: 1234,
      stdout: doneRun.stdout,
      stderr: doneRun.stderr,
      project,
      sessionId: "default",
      createdAt,
    },
  ],
  sourceRefs: [],
  browserVisits: [],
  notices: [],
});

require(path.join(REPO_DIR, "electron", "main.cjs"));

async function openSubagents(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = Array.from(document.querySelectorAll('.workspace-context-button, button'))
        .find((item) => /子代理|Subagent|任务/.test(item.textContent || '') || item.getAttribute('aria-label') === '子代理');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

app.whenReady().then(async () => {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.error("PASS97_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  try {
    assertStep("PASS97_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
    assertStep("PASS97_OPEN_SUBAGENTS", await openSubagents(win));
    assertStep("PASS97_ARTIFACT_DETAILS_VISIBLE", await waitFor(win, `
      (function() {
        const card = document.querySelector('.subagent-run-card[data-subagent-run-id="pass97-artifact-run"]');
        if (!card) return false;
        const details = Array.from(card.querySelectorAll('.subagent-evidence-details'))
          .find((item) => /产物/.test(item.textContent || ''));
        details?.setAttribute('open', '');
        const text = card.textContent || '';
        return Boolean(
          card.querySelector('[data-subagent-artifact-index="0"]') &&
          card.querySelector('[data-subagent-artifact-index="1"]') &&
          /Pass97 Summary Artifact/.test(text) &&
          /pass97 artifact summary content/.test(text) &&
          /docs\\/pass97-plan\\.md/.test(text) &&
          /pass97 artifact patch plan content/.test(text) &&
          /Pass97 Empty Artifact/.test(text)
        );
      })();
    `, 8000));
    assertStep("PASS97_COPY_SINGLE_ARTIFACT", await waitFor(win, `
      (async function() {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText: async (text) => { window.__pass97Clipboard = String(text || ''); } },
        });
        const button = document.querySelector('[data-subagent-artifact-copy="1"]');
        if (!button) return false;
        button.click();
        await new Promise((resolve) => setTimeout(resolve, 250));
        return /Pass97 Patch Plan/.test(window.__pass97Clipboard || '') &&
          /docs\\/pass97-plan\\.md/.test(window.__pass97Clipboard || '') &&
          /pass97 artifact patch plan content/.test(window.__pass97Clipboard || '');
      })();
    `, 5000));
    assertStep("PASS97_COPY_RUN_INCLUDES_ARTIFACT_CONTENT", await waitFor(win, `
      (async function() {
        window.__pass97Clipboard = '';
        const card = document.querySelector('.subagent-run-card[data-subagent-run-id="pass97-artifact-run"]');
        const copy = Array.from(card?.querySelectorAll('.subagent-run-foot button') || [])
          .find((button) => /复制证据/.test(button.textContent || ''));
        if (!copy) return false;
        copy.click();
        await new Promise((resolve) => setTimeout(resolve, 250));
        return /Pass97 Summary Artifact/.test(window.__pass97Clipboard || '') &&
          /pass97 artifact summary content/.test(window.__pass97Clipboard || '') &&
          /Pass97 Patch Plan/.test(window.__pass97Clipboard || '') &&
          /pass97 artifact patch plan content/.test(window.__pass97Clipboard || '');
      })();
    `, 5000));

    console.log("PASS97_SUBAGENT_ARTIFACT_DETAILS_DONE");
    cleanup();
    app.exit(0);
  } catch (error) {
    console.error(error);
    cleanup();
    app.exit(1);
  }
});

setTimeout(() => {
  console.error("PASS97_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
