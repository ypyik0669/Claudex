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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass230-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass230-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass230-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const PAUSED_AUTOMATION_ID = "pass230-paused-automation";

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
if (args[0] === '--version') out('2.30.0 (Claude Code PASS230)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out({ plugins: [] });
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out({ servers: [] });
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else out('pass230 fake claude command: ' + args.join(' '));
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass230-project" }), "utf8");
  const project = { name: "pass230-project", path: PROJECT_DIR };
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
        id: "pass230-session",
        title: "PASS230 paused automation rail deeplink",
        project: project.name,
        projectPath: project.path,
        createdAt: "2026-07-08T02:30:00.000Z",
        updatedAt: "2026-07-08T02:30:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    runEvents: [],
    automations: [
      {
        id: PAUSED_AUTOMATION_ID,
        prompt: "PASS230 paused automation prompt",
        schedule: { type: "once", runAt: "2099-07-08T02:30:00.000Z" },
        project,
        threadId: "pass230-session",
        enabled: false,
        status: "paused",
        createdAt: "2026-07-08T02:30:00.000Z",
        updatedAt: "2026-07-08T02:30:02.000Z",
        history: [],
      },
    ],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS230_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS230_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS230_RAIL_PAUSED_AUTOMATION_READY", await waitFor(win, `
    (function() {
      const button = document.querySelector('.tool-rail [data-tool="automations"]');
      const text = button?.getAttribute('title') || button?.getAttribute('aria-label') || '';
      return Boolean(
        button &&
        button.getAttribute('data-tool-rail-status') === 'ready' &&
        /自动化/.test(text) &&
        /暂停/.test(text) &&
        /1/.test(text) &&
        /1/.test(button.textContent || '')
      );
    })();
  `, 12000));

  assertStep("PASS230_CLICK_RAIL_FOCUSES_PAUSED_AUTOMATION", await win.webContents.executeJavaScript(`
    (async function() {
      const button = document.querySelector('.tool-rail [data-tool="automations"]');
      if (!button) return false;
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 450));
      return true;
    })();
  `));
  assertStep("PASS230_PAUSED_AUTOMATION_VISIBLE_IN_TASK_CENTER", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.bottom-work-panel');
      const allFilter = document.querySelector('.task-center-filters [data-task-filter="all"].active');
      const activeFilter = document.querySelector('.task-center-filters [data-task-filter="active"].active');
      const paused = document.querySelector('.automation-task-card.focused-task-card[data-automation-id="${PAUSED_AUTOMATION_ID}"]');
      const text = panel?.textContent || '';
      return Boolean(
        panel &&
        allFilter &&
        !activeFilter &&
        paused &&
        paused.getAttribute('aria-current') === 'true' &&
        /PASS230 paused automation prompt/.test(text) &&
        /已暂停|暂停/.test(text)
      );
    })();
  `, 12000));

  console.log("PASS230_TOOL_RAIL_PAUSED_AUTOMATION_DEEPLINK_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS230_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (function() {
          return {
            railButton: document.querySelector('.tool-rail [data-tool="automations"]')?.outerHTML || '',
            filters: document.querySelector('.task-center-filters')?.outerHTML || '',
            panel: document.querySelector('.bottom-work-panel')?.textContent || '',
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS230_DEBUG", JSON.stringify(debug, null, 2).slice(0, 12000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS230_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
