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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass131-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass131-project-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass131-bin-"));
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
      "if \"%1\"==\"--version\" (echo claude fake pass131& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins: none& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces: none& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass131 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
}

function writeInitialStore() {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass131-project" }), "utf8");
  writeFakeClaude();
  const project = { name: "pass131-project", path: PROJECT_DIR };
  const run = {
    id: "pass131-automation-run",
    status: "succeeded",
    trigger: "scheduled",
    startedAt: "2026-07-07T00:00:00.000Z",
    endedAt: "2026-07-07T00:00:01.310Z",
    durationMs: 1310,
    sessionId: "pass131-session",
    code: 0,
    summary: "pass131 scheduled modal summary evidence",
    detail: "pass131 scheduled modal detail evidence",
    stdout: "pass131 scheduled modal stdout evidence",
    stderr: "pass131 scheduled modal stderr evidence",
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
        id: "pass131-session",
        title: "pass131 scheduled modal copy evidence",
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
        title: "自动化：pass131 scheduled modal copy evidence task",
        detail: run.summary,
        stdout: run.stdout,
        stderr: run.stderr,
        code: 0,
        durationMs: 1310,
        createdAt: run.endedAt,
      },
    ],
    automations: [
      {
        id: "pass131-automation",
        prompt: "pass131 scheduled modal copy evidence task",
        schedule: { type: "daily", runAt: "2026-07-08T00:00:00.000Z" },
        nextRun: "2026-07-08T00:00:00.000Z",
        project,
        threadId: "pass131-session",
        enabled: true,
        status: "scheduled",
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

async function openAutomation(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const automationPattern = new RegExp("\\\\u81ea\\\\u52a8\\\\u5316");
      const button = [...document.querySelectorAll('button')]
        .find((item) => item.getAttribute('aria-label') === '自动化' || automationPattern.test(item.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS131_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS131_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS131_OPEN_AUTOMATION", await openAutomation(win));
  assertStep("PASS131_SCHEDULED_MODAL_READY", await waitFor(win, `
    Boolean(
      document.querySelector('.scheduled-modal') &&
      /pass131 scheduled modal copy evidence task/.test(document.querySelector('.scheduled-modal')?.textContent || '') &&
      /pass131 scheduled modal detail evidence/.test(document.querySelector('.scheduled-modal')?.textContent || '')
    )
  `, 15000));
  assertStep("PASS131_COPY_SCHEDULED_EVIDENCE_ACTION", await win.webContents.executeJavaScript(`
    (function() {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text) => { window.__pass131Clipboard = String(text || ''); } },
      });
      const modal = document.querySelector('.scheduled-modal');
      const copy = modal?.querySelector('[data-automation-schedule-action="copy-evidence"]');
      if (!copy) return false;
      copy.click();
      return true;
    })();
  `));
  assertStep("PASS131_SCHEDULED_EVIDENCE_COPIED", await waitFor(win, `
    (function() {
      const modal = document.querySelector('.scheduled-modal');
      const text = window.__pass131Clipboard || '';
      return /pass131 scheduled modal copy evidence task/.test(text) &&
        /pass131 scheduled modal detail evidence/.test(text) &&
        /pass131 scheduled modal stdout evidence/.test(text) &&
        /pass131 scheduled modal stderr evidence/.test(text) &&
        /pass131-session/.test(text) &&
        /已复制/.test(modal?.textContent || '');
    })();
  `, 5000));

  console.log("PASS131_SCHEDULED_MODAL_COPY_EVIDENCE_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS131_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS131_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
