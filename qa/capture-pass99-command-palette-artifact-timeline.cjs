const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass99-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass99-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass99-project-"));
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
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
fs.mkdirSync(PROJECT_DIR, { recursive: true });
fs.writeFileSync(FAKE_CLAUDE, "@echo off\r\necho pass99 fake claude\r\n", "utf8");
fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass99-project" }), "utf8");
process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
app.setPath("userData", USER_DATA_DIR);

const createdAt = "2026-07-06T00:00:00.000Z";
const project = { name: "pass99-project", path: PROJECT_DIR };
const doneRun = {
  id: "pass99-artifact-run",
  requestId: "pass99-artifact-request",
  nickname: "Pass99 Artifact Link",
  task: "pass99 command palette artifact timeline",
  status: "done",
  sessionId: "pass99-session",
  project,
  cwd: PROJECT_DIR,
  command: FAKE_CLAUDE,
  args: ["-p", "pass99 command palette artifact timeline", "--output-format", "json"],
  stdout: "pass99 stdout body",
  stderr: "",
  summary: "pass99 summary body",
  code: 0,
  durationMs: 3456,
  startedAt: createdAt,
  endedAt: "2026-07-06T00:00:03.456Z",
  artifacts: [
    { type: "summary", label: "Pass99 Summary Artifact", content: "pass99 summary artifact body" },
    {
      type: "file",
      label: "Pass99 Timeline Deep Link Plan",
      path: "docs/pass99-artifact-plan.md",
      content: "pass99 artifact deep link token content",
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
      id: "pass99-session",
      title: "pass99 work thread",
      project: project.name,
      projectPath: PROJECT_DIR,
      createdAt,
      updatedAt: createdAt,
      messages: [{ role: "user", content: "pass99 thread", createdAt }],
    },
  ],
  automations: [],
  subagentRuns: [doneRun],
  runEvents: [
    {
      id: doneRun.requestId,
      type: "subagent",
      status: "ok",
      title: "\u5b50\u4ee3\u7406\uff1aPass99 Artifact Link",
      detail: "pass99 summary body",
      commandLine: [doneRun.command, ...doneRun.args].join(" "),
      cwd: PROJECT_DIR,
      code: 0,
      durationMs: 3456,
      stdout: doneRun.stdout,
      stderr: doneRun.stderr,
      project,
      sessionId: "pass99-session",
      createdAt,
    },
  ],
  sourceRefs: [],
  browserVisits: [],
  notices: [],
});

require(path.join(REPO_DIR, "electron", "main.cjs"));

async function openPaletteWithQuery(win, query) {
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
      return Boolean(document.querySelector('.command-modal .command-list button'));
    })();
  `);
}

async function clickFirstPaletteCommand(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.command-modal .command-list button');
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
    console.error("PASS99_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  try {
    assertStep("PASS99_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
    assertStep("PASS99_ARTIFACT_TIMELINE_COMMAND_SEARCHABLE", await openPaletteWithQuery(win, "timeline pass99 artifact deep link token content"));
    assertStep("PASS99_ARTIFACT_TIMELINE_COMMAND_IS_RUN", await win.webContents.executeJavaScript(`
      (function() {
        const button = document.querySelector('.command-modal .command-list button');
        const id = button?.getAttribute('data-command-id') || '';
        const text = button?.textContent || '';
        return id.includes('run:pass99-artifact-request') &&
          /Pass99 Artifact Link/.test(text) &&
          /pass99 summary body/.test(text);
      })();
    `));
    assertStep("PASS99_RUN_ARTIFACT_TIMELINE_COMMAND", await clickFirstPaletteCommand(win));
    assertStep("PASS99_TIMELINE_ARTIFACT_EVIDENCE_FOCUSED", await waitFor(win, `
      (function() {
        const panel = document.querySelector('.selected-run-evidence-panel');
        const row = document.querySelector('.run-timeline-row.selected');
        const text = panel?.textContent || '';
        return Boolean(
          row &&
          /Pass99 Artifact Link/.test(row.textContent || '') &&
          panel &&
          panel.querySelector('[data-run-timeline-artifact-index="1"]') &&
          /Pass99 Timeline Deep Link Plan/.test(text) &&
          /docs\\/pass99-artifact-plan\\.md/.test(text) &&
          /pass99 artifact deep link token content/.test(text)
        );
      })();
    `, 10000));

    console.log("PASS99_COMMAND_PALETTE_ARTIFACT_TIMELINE_DONE");
    cleanup();
    app.exit(0);
  } catch (error) {
    console.error(error);
    cleanup();
    app.exit(1);
  }
});

setTimeout(() => {
  console.error("PASS99_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
