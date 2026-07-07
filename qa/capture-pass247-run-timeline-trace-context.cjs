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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass247-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass247-project-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass247-bin-"));
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const RUN_ID = "pass247-request-trace-context";
const SESSION_ID = "pass247-session";
const TRACE_TOKEN = "pass247 timeline trace context token";

function cleanup() {
  for (const dir of [USER_DATA_DIR, PROJECT_DIR, FAKE_BIN_DIR]) {
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

function writeFakeClaude() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(
    FAKE_CLAUDE,
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass247& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins: none& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces: none& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo {\"servers\":[]}& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass247 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function writeInitialStore() {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass247-project" }), "utf8");
  writeFakeClaude();
  const project = { name: "pass247-project", path: PROJECT_DIR };
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
      systemPrompt: "QA",
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
        id: SESSION_ID,
        title: "PASS247 trace context",
        project: project.name,
        projectPath: project.path,
        createdAt: "2026-07-08T04:47:00.000Z",
        updatedAt: "2026-07-08T04:47:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [
      {
        id: "pass247-command-run",
        requestId: RUN_ID,
        sessionId: SESSION_ID,
        kind: "workspace",
        command: "node pass247-trace-context.js",
        cwd: PROJECT_DIR,
        project,
        code: 0,
        durationMs: 2470,
        stdout: `${TRACE_TOKEN} stdout`,
        stderr: "",
        startedAt: "2026-07-08T04:47:01.000Z",
        endedAt: "2026-07-08T04:47:03.470Z",
      },
    ],
    runEvents: [],
    automations: [],
    subagentRuns: [],
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
  if (!win) throw new Error("PASS247_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS247_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS247_OPEN_OUTPUTS", await openOutputs(win));
  assertStep("PASS247_TRACE_DATA_ATTRIBUTES", await waitFor(win, `
    (function() {
      const row = document.querySelector('.run-timeline-row.selected.ok');
      const panel = document.querySelector('.selected-run-evidence-panel.ok');
      const details = panel?.querySelector('.run-timeline-evidence');
      return Boolean(
        row &&
        panel &&
        details &&
        row.getAttribute('data-run-event-id') === ${JSON.stringify(RUN_ID)} &&
        panel.getAttribute('data-run-event-id') === ${JSON.stringify(RUN_ID)} &&
        details.getAttribute('data-run-event-id') === ${JSON.stringify(RUN_ID)} &&
        panel.getAttribute('data-run-evidence-source') === 'command' &&
        row.getAttribute('data-run-event-session-id') === ${JSON.stringify(SESSION_ID)} &&
        panel.getAttribute('data-run-event-project-path') === ${JSON.stringify(PROJECT_DIR)}
      );
    })();
  `, 10000));
  assertStep("PASS247_TRACE_VISIBLE_CONTEXT", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.selected-run-evidence-panel.ok');
      const text = panel?.textContent || '';
      return /事件 ID/.test(text) &&
        /${RUN_ID}/.test(text) &&
        /证据来源/.test(text) &&
        /本地 commandRuns/.test(text) &&
        /项目路径/.test(text) &&
        /pass247-project/.test(text) &&
        /${TRACE_TOKEN}/.test(text);
    })();
  `, 10000));
  assertStep("PASS247_COPY_TRACE_CONTEXT", await win.webContents.executeJavaScript(`
    (function() {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text) => { window.__pass247Clipboard = String(text || ''); } },
      });
      const copy = document.querySelector('.selected-run-evidence-panel [data-run-timeline-action="copy-evidence"]');
      if (!copy) return false;
      copy.click();
      return true;
    })();
  `));
  assertStep("PASS247_COPIED_TRACE_CONTEXT", await waitFor(win, `
    (function() {
      const text = window.__pass247Clipboard || '';
      const panel = document.querySelector('.selected-run-evidence-panel')?.textContent || '';
      return /事件 ID: ${RUN_ID}/.test(text) &&
        /证据来源: 本地 commandRuns/.test(text) &&
        /项目路径: /.test(text) &&
        /会话: ${SESSION_ID}/.test(text) &&
        /${RUN_ID}/.test(text) &&
        /node pass247-trace-context\\.js/.test(text) &&
        /${TRACE_TOKEN}/.test(text) &&
        /已复制/.test(panel);
    })();
  `, 5000));

  console.log("PASS247_RUN_TIMELINE_TRACE_CONTEXT_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS247_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (function() {
          return {
            selectedRow: document.querySelector('.run-timeline-row.selected')?.outerHTML || '',
            panel: document.querySelector('.selected-run-evidence-panel')?.outerHTML || '',
            clipboard: window.__pass247Clipboard || '',
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS247_DEBUG", JSON.stringify(debug, null, 2).slice(0, 12000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS247_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
