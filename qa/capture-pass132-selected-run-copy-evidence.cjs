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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass132-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass132-project-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass132-bin-"));
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");

function cleanup() {
  for (const dir of [USER_DATA_DIR, PROJECT_DIR, FAKE_BIN_DIR]) {
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

function writeFakeClaude() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(
    FAKE_CLAUDE,
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass132& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins: none& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces: none& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass132 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function writeInitialStore() {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass132-project" }), "utf8");
  writeFakeClaude();
  const createdAt = "2026-07-07T00:00:00.000Z";
  const project = { name: "pass132-project", path: PROJECT_DIR };
  const doneRun = {
    id: "pass132-subagent-run",
    requestId: "pass132-selected-request",
    nickname: "Pass132 Selected Evidence",
    task: "pass132 selected run evidence copy task",
    status: "done",
    sessionId: "pass132-session",
    project,
    cwd: PROJECT_DIR,
    command: FAKE_CLAUDE,
    args: ["-p", "pass132 selected run evidence copy task", "--output-format", "json"],
    stdout: "pass132 selected stdout evidence",
    stderr: "pass132 selected stderr evidence",
    summary: "pass132 selected summary evidence",
    code: 0,
    durationMs: 1320,
    startedAt: createdAt,
    endedAt: "2026-07-07T00:00:01.320Z",
    artifacts: [
      { type: "summary", label: "Pass132 Selected Summary", content: "pass132 selected artifact summary evidence" },
      { type: "file", label: "Pass132 Selected Plan", path: "docs/pass132-plan.md", content: "pass132 selected artifact plan evidence" },
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
        id: "pass132-session",
        title: "Pass132 selected run evidence copy",
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
        title: "子代理：Pass132 Selected Evidence",
        detail: doneRun.summary,
        commandLine: [doneRun.command, ...doneRun.args].join(" "),
        cwd: PROJECT_DIR,
        code: 0,
        durationMs: doneRun.durationMs,
        stdout: doneRun.stdout,
        stderr: doneRun.stderr,
        project,
        sessionId: doneRun.sessionId,
        createdAt,
      },
    ],
    commandRuns: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

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

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS132_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS132_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS132_OPEN_OUTPUTS", await openOutputs(win));
  assertStep("PASS132_SELECTED_PANEL_READY", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.selected-run-evidence-panel.ok');
      const text = panel?.textContent || '';
      return Boolean(
        panel &&
        /Pass132 Selected Evidence/.test(text) &&
        /pass132 selected summary evidence/.test(text) &&
        /pass132 selected stdout evidence/.test(text) &&
        /pass132 selected stderr evidence/.test(text) &&
        /Pass132 Selected Summary/.test(text) &&
        /pass132 selected artifact summary evidence/.test(text)
      );
    })();
  `, 10000));
  assertStep("PASS132_COPY_SELECTED_RUN_EVIDENCE_ACTION", await win.webContents.executeJavaScript(`
    (function() {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text) => { window.__pass132Clipboard = String(text || ''); } },
      });
      const panel = document.querySelector('.selected-run-evidence-panel');
      const copy = panel?.querySelector('[data-run-timeline-action="copy-evidence"]');
      if (!copy) return false;
      copy.click();
      return true;
    })();
  `));
  assertStep("PASS132_SELECTED_RUN_EVIDENCE_COPIED", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.selected-run-evidence-panel');
      const text = window.__pass132Clipboard || '';
      return /Pass132 Selected Evidence/.test(text) &&
        /pass132 selected summary evidence/.test(text) &&
        /pass132 selected stdout evidence/.test(text) &&
        /pass132 selected stderr evidence/.test(text) &&
        /pass132-session/.test(text) &&
        /Pass132 Selected Summary/.test(text) &&
        /pass132 selected artifact summary evidence/.test(text) &&
        /Pass132 Selected Plan/.test(text) &&
        /pass132 selected artifact plan evidence/.test(text) &&
        /已复制/.test(panel?.textContent || '');
    })();
  `, 5000));

  console.log("PASS132_SELECTED_RUN_COPY_EVIDENCE_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS132_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS132_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
