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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass286-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass286-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass286-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const FAILED_RUN_ID = "pass286-failed-subagent";
const FAILED_REQUEST_ID = "pass286-failed-request";
const RUNNING_RUN_ID = "pass286-running-subagent";

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_DIR]) {
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
  const fakeClaudeScript = `
const args = process.argv.slice(2);
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value) + '\\n'); }
if (args[0] === '--version') out('2.86.0 (Claude Code PASS286)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out({ plugins: [] });
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out({ servers: [] });
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else out('pass286 fake claude command: ' + args.join(' '));
`;
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(FAKE_CLAUDE, `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function writeInitialStore() {
  writeFakeClaude();
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass286-project" }), "utf8");
  const project = { name: "pass286-project", path: PROJECT_DIR };
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
        id: "pass286-session",
        title: "PASS286 tool rail subagent action focus",
        project: project.name,
        projectPath: project.path,
        createdAt: "2026-07-08T02:28:00.000Z",
        updatedAt: "2026-07-08T02:28:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    runEvents: [],
    automations: [],
    subagentRuns: [
      {
        id: FAILED_RUN_ID,
        requestId: FAILED_REQUEST_ID,
        nickname: "PASS286 Failed Agent",
        task: "PASS286 investigate failing rail state and retry action focus",
        status: "error",
        sessionId: "pass286-session",
        project,
        cwd: PROJECT_DIR,
        command: FAKE_CLAUDE,
        args: ["-p", "PASS286 failing agent task"],
        stderr: "PASS286 subagent failure from persisted store",
        summary: "PASS286 failure summary from subagent run",
        code: 17,
        durationMs: 1234,
        startedAt: "2026-07-08T02:27:00.000Z",
        endedAt: "2026-07-08T02:27:02.000Z",
        artifacts: [
          { type: "summary", label: "PASS286 failure artifact", content: "PASS286 failed artifact content" },
        ],
      },
      {
        id: RUNNING_RUN_ID,
        requestId: "pass286-running-request",
        nickname: "PASS286 Running Agent",
        task: "PASS286 running agent should be lower priority than failure",
        status: "running",
        sessionId: "pass286-session",
        project,
        cwd: PROJECT_DIR,
        command: FAKE_CLAUDE,
        args: ["-p", "PASS286 running agent task"],
        stdout: "PASS286 live stdout chunk",
        startedAt: "2026-07-08T02:28:00.000Z",
        artifacts: [],
      },
    ],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS286_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS286_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS286_RAIL_SUBAGENT_STATUS_VISIBLE", await waitFor(win, `
    (function() {
      const rail = document.querySelector('.tool-rail');
      const button = rail?.querySelector('[data-tool="subagents"]');
      const text = button?.getAttribute('title') || button?.getAttribute('aria-label') || '';
      return Boolean(
        rail &&
        button &&
        button.getAttribute('data-tool-rail-status') === 'error' &&
        /子代理/.test(text) &&
        /失败/.test(text) &&
        /1/.test(text) &&
        /!/.test(button.textContent || '')
      );
    })();
  `, 12000));

  assertStep("PASS286_CLICK_RAIL_FOCUSES_FAILED_SUBAGENT", await win.webContents.executeJavaScript(`
    (async function() {
      const button = document.querySelector('.tool-rail [data-tool="subagents"]');
      if (!button) return false;
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 450));
      return true;
    })();
  `));
  assertStep("PASS286_SUBAGENT_WORKBENCH_FAILED_FOCUSED", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.bottom-work-panel');
      const failed = document.querySelector('.subagent-run-card.focused-task-card[data-subagent-run-id="${FAILED_RUN_ID}"]');
      const running = document.querySelector('.subagent-run-card[data-subagent-run-id="${RUNNING_RUN_ID}"]');
      const evidence = failed?.querySelector('.subagent-evidence-details');
      const artifacts = failed?.querySelector('.subagent-evidence-details + .subagent-evidence-details');
      const retry = failed?.querySelector('[data-subagent-recovery-action="retry"]');
      const text = panel?.textContent || '';
      return Boolean(
        panel &&
        failed &&
        failed.getAttribute('aria-current') === 'true' &&
        evidence?.open &&
        artifacts?.open &&
        retry &&
        retry.getAttribute('data-task-action-focused') === 'true' &&
        document.activeElement === retry &&
        /PASS286 Failed Agent/.test(text) &&
        /PASS286 failure summary from subagent run/.test(text) &&
        /PASS286 failed artifact content/.test(text) &&
        /失败/.test(text) &&
        !running
      );
    })();
  `, 12000));
  assertStep("PASS286_RAIL_FOCUS_DID_NOT_MUTATE_SUBAGENT", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      const failed = (state.subagentRuns || []).find((item) => item.id === "${FAILED_RUN_ID}");
      const running = (state.subagentRuns || []).find((item) => item.id === "${RUNNING_RUN_ID}");
      return Boolean(
        (state.commandRuns || []).length === 0 &&
        (state.runEvents || []).length === 0 &&
        failed &&
        failed.status === "error" &&
        failed.task === "PASS286 investigate failing rail state and retry action focus" &&
        !failed.continuedAt &&
        Array.isArray(failed.artifacts) &&
        failed.artifacts.length === 1 &&
        running &&
        running.status === "running"
      );
    })();
  `));

  console.log("PASS286_TOOL_RAIL_SUBAGENT_ACTION_FOCUS_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS286_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (function() {
          return {
            rail: document.querySelector('.tool-rail')?.textContent || '',
            railButton: document.querySelector('.tool-rail [data-tool="subagents"]')?.outerHTML || '',
            panel: document.querySelector('.bottom-work-panel')?.textContent || '',
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS286_DEBUG", JSON.stringify(debug, null, 2).slice(0, 12000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS286_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
