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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass133-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass133-project-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass133-bin-"));
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

async function waitForStore(predicate, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      if (predicate(parsed)) return true;
    } catch (_error) {
      // store may be mid-write
    }
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
      "if \"%1\"==\"--version\" (echo claude fake pass133& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins: none& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces: none& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass133 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function writeInitialStore() {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass133-project" }), "utf8");
  writeFakeClaude();
  const project = { name: "pass133-project", path: PROJECT_DIR };
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
        id: "pass133-session",
        title: "Pass133 main-owned workspace timeline",
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
  if (!win) throw new Error("PASS133_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  const successCommand = "node -e \"console.log('pass133 direct stdout evidence')\"";
  const cancelCommand = "node -e \"let n=0;console.log('pass133 direct cancel start');const timer=setInterval(()=>console.log('pass133 direct tick '+(++n)),120);setTimeout(()=>{clearInterval(timer);console.log('pass133 should not complete')},8000)\"";

  assertStep("PASS133_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS133_DIRECT_SUCCESS_COMMAND", await win.webContents.executeJavaScript(`
    (async function() {
      const result = await window.claudexDesktop.runWorkspaceCommand({
        projectPath: ${JSON.stringify(PROJECT_DIR)},
        command: ${JSON.stringify(successCommand)},
        requestId: 'workspace_pass133_success',
      });
      return Boolean(result?.code === 0 && /pass133 direct stdout evidence/.test(result?.stdout || ''));
    })();
  `));
  assertStep("PASS133_SUCCESS_RUN_EVENT_FROM_MAIN", await waitForStore((parsed) => {
    const run = parsed.commandRuns?.find((item) => item.id === "workspace_pass133_success");
    const event = parsed.runEvents?.find((item) => item.id === "workspace_pass133_success");
    return Boolean(
      run &&
      run.kind === "workspace" &&
      run.code === 0 &&
      /pass133 direct stdout evidence/.test(run.stdout || "") &&
      event &&
      event.type === "workspace-command" &&
      event.status === "ok" &&
      event.code === 0 &&
      /pass133 direct stdout evidence/.test(event.stdout || "") &&
      /pass133 direct stdout evidence/.test(event.commandLine || "")
    );
  }, 8000));

  assertStep("PASS133_DIRECT_CANCEL_COMMAND", await win.webContents.executeJavaScript(`
    (async function() {
      window.__pass133CancelPromise = window.claudexDesktop.runWorkspaceCommand({
        projectPath: ${JSON.stringify(PROJECT_DIR)},
        command: ${JSON.stringify(cancelCommand)},
        requestId: 'workspace_pass133_cancel',
      });
      await new Promise((resolve) => setTimeout(resolve, 650));
      const cancel = await window.claudexDesktop.cancelWorkspaceCommand({ requestId: 'workspace_pass133_cancel' });
      const result = await window.__pass133CancelPromise;
      return Boolean(cancel?.cancelled && result?.cancelled && result?.code === 130);
    })();
  `));
  assertStep("PASS133_CANCEL_RUN_EVENT_FROM_MAIN", await waitForStore((parsed) => {
    const run = parsed.commandRuns?.find((item) => item.id === "workspace_pass133_cancel");
    const event = parsed.runEvents?.find((item) => item.id === "workspace_pass133_cancel");
    return Boolean(
      run &&
      run.kind === "workspace" &&
      run.cancelled === true &&
      run.code === 130 &&
      /pass133 direct cancel start/.test(run.stdout || "") &&
      /命令已取消/.test(run.stderr || "") &&
      event &&
      event.type === "workspace-command" &&
      event.status === "cancelled" &&
      event.code === 130 &&
      /pass133 direct cancel start/.test(event.stdout || "") &&
      /命令已取消/.test(event.stderr || "") &&
      /pass133 direct cancel/.test(event.commandLine || "")
    );
  }, 10000));

  assertStep("PASS133_OPEN_OUTPUTS", await openOutputs(win));
  assertStep("PASS133_TIMELINE_SHOWS_MAIN_OWNED_COMMANDS", await waitFor(win, `
    (function() {
      const text = document.querySelector('.bottom-work-panel')?.textContent || '';
      return Boolean(
        document.querySelector('.run-timeline-row.ok') &&
        document.querySelector('.run-timeline-row.cancelled') &&
        /pass133 direct stdout evidence/.test(text) &&
        /pass133 direct cancel start/.test(text) &&
        /\\u547d\\u4ee4\\u5df2\\u53d6\\u6d88/.test(text)
      );
    })();
  `, 10000));
  assertStep("PASS133_CANCEL_SELECTED_EVIDENCE_COPY", await waitFor(win, `
    (async function() {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text) => { window.__pass133Clipboard = String(text || ''); } },
      });
      const row = Array.from(document.querySelectorAll('.run-timeline-row.cancelled'))
        .find((item) => /pass133 direct cancel/.test(item.textContent || ''));
      if (!row) return false;
      row.querySelector('summary')?.click();
      await new Promise((resolve) => setTimeout(resolve, 250));
      const panel = document.querySelector('.selected-run-evidence-panel.cancelled');
      const copy = panel?.querySelector('[data-run-timeline-action="copy-evidence"]');
      if (!copy) return false;
      copy.click();
      await new Promise((resolve) => setTimeout(resolve, 250));
      return /pass133 direct cancel start/.test(window.__pass133Clipboard || '') &&
        /\\u547d\\u4ee4\\u5df2\\u53d6\\u6d88/.test(window.__pass133Clipboard || '') &&
        /workspace_pass133_cancel/.test(window.__pass133Clipboard || '') &&
        /\\u5df2\\u590d\\u5236/.test(panel.textContent || '');
    })();
  `, 8000));

  console.log("PASS133_WORKSPACE_COMMAND_MAIN_TIMELINE_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS133_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS133_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
