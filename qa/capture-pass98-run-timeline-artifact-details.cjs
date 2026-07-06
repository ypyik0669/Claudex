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
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass98-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass98-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass98-project-"));
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
fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), "@echo off\r\necho pass98 fake claude\r\n", "utf8");
const FAKE_CLAUDE_COMMAND = path.join(FAKE_BIN_DIR, "claude.cmd");
process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;

app.setPath("userData", USER_DATA_DIR);
fs.mkdirSync(PROJECT_DIR, { recursive: true });
fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass98-project" }), "utf8");

const createdAt = "2026-07-06T00:00:00.000Z";
const project = { name: "pass98-project", path: PROJECT_DIR };
const doneRun = {
  id: "pass98-artifact-run",
  requestId: "pass98-artifact-request",
  nickname: "Pass98 Timeline QA",
  task: "pass98 inspect timeline artifact details",
  status: "done",
  sessionId: "default",
  project,
  cwd: PROJECT_DIR,
  command: FAKE_CLAUDE_COMMAND,
  args: ["-p", "pass98 inspect timeline artifact details", "--output-format", "json"],
  stdout: "pass98 stdout body",
  stderr: "",
  summary: "pass98 summary body",
  code: 0,
  durationMs: 2345,
  startedAt: createdAt,
  endedAt: "2026-07-06T00:00:02.345Z",
  artifacts: [
    { type: "summary", label: "Pass98 Timeline Summary", content: "pass98 timeline artifact summary content" },
    { type: "file", label: "Pass98 Timeline Plan", path: "docs/pass98-plan.md", content: "pass98 timeline artifact plan content" },
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
      title: "\u65b0\u804a\u5929",
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
      title: "\u5b50\u4ee3\u7406\uff1aPass98 Timeline QA",
      detail: "pass98 summary body",
      commandLine: [doneRun.command, ...doneRun.args].join(" "),
      cwd: PROJECT_DIR,
      code: 0,
      durationMs: 2345,
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

async function openOutputs(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = Array.from(document.querySelectorAll('.workspace-context-button, .bottom-panel-tabs button, button'))
        .find((item) => item.getAttribute('aria-label') === '\\u8f93\\u51fa' || /\\u8f93\\u51fa|Outputs/i.test(item.textContent || ''));
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
    console.error("PASS98_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  try {
    assertStep("PASS98_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
    assertStep("PASS98_OPEN_OUTPUTS", await openOutputs(win));
    assertStep("PASS98_SELECT_TIMELINE_ROW", await waitFor(win, `
      (async function() {
        const row = Array.from(document.querySelectorAll('.run-timeline-row.ok'))
          .find((item) => /pass98 summary body/.test(item.textContent || ''));
        if (!row) return false;
        row.querySelector('summary')?.click();
        row.setAttribute('open', '');
        await new Promise((resolve) => setTimeout(resolve, 250));
        return Boolean(document.querySelector('.selected-run-evidence-panel'));
      })();
    `, 8000));
    assertStep("PASS98_TIMELINE_ARTIFACT_DETAILS_VISIBLE", await waitFor(win, `
      (function() {
        const panel = document.querySelector('.selected-run-evidence-panel');
        const text = panel?.textContent || '';
        return Boolean(
          panel &&
          panel.querySelector('[data-run-timeline-artifact-index="0"]') &&
          panel.querySelector('[data-run-timeline-artifact-index="1"]') &&
          /Pass98 Timeline Summary/.test(text) &&
          /pass98 timeline artifact summary content/.test(text) &&
          /docs\\/pass98-plan\\.md/.test(text) &&
          /pass98 timeline artifact plan content/.test(text)
        );
      })();
    `, 5000));
    assertStep("PASS98_COPY_SINGLE_TIMELINE_ARTIFACT", await waitFor(win, `
      (async function() {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText: async (text) => { window.__pass98Clipboard = String(text || ''); } },
        });
        const button = document.querySelector('.selected-run-evidence-panel [data-run-timeline-artifact-copy="1"]');
        if (!button) return false;
        button.click();
        await new Promise((resolve) => setTimeout(resolve, 250));
        return /Pass98 Timeline Plan/.test(window.__pass98Clipboard || '') &&
          /docs\\/pass98-plan\\.md/.test(window.__pass98Clipboard || '') &&
          /pass98 timeline artifact plan content/.test(window.__pass98Clipboard || '');
      })();
    `, 5000));
    assertStep("PASS98_COPY_TIMELINE_EVIDENCE_INCLUDES_ARTIFACT_CONTENT", await waitFor(win, `
      (async function() {
        window.__pass98Clipboard = '';
        const copy = document.querySelector('.selected-run-evidence-panel .run-timeline-actions button');
        if (!copy) return false;
        copy.click();
        await new Promise((resolve) => setTimeout(resolve, 250));
        return /Pass98 Timeline Summary/.test(window.__pass98Clipboard || '') &&
          /pass98 timeline artifact summary content/.test(window.__pass98Clipboard || '') &&
          /Pass98 Timeline Plan/.test(window.__pass98Clipboard || '') &&
          /pass98 timeline artifact plan content/.test(window.__pass98Clipboard || '');
      })();
    `, 5000));

    console.log("PASS98_RUN_TIMELINE_ARTIFACT_DETAILS_DONE");
    cleanup();
    app.exit(0);
  } catch (error) {
    console.error(error);
    cleanup();
    app.exit(1);
  }
});

setTimeout(() => {
  console.error("PASS98_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
