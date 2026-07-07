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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass232-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass232-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass232-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const RUNNING_RUN_ID = "pass232-running-subagent";
const FAILED_RUN_ID = "pass232-failed-subagent";
const DONE_RUN_ID = "pass232-done-subagent";
const ARCHIVED_RUN_ID = "pass232-archived-subagent";

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
if (args[0] === '--version') out('2.32.0 (Claude Code PASS232)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out({ plugins: [] });
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out({ servers: [] });
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else out('pass232 fake claude command: ' + args.join(' '));
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass232-project" }), "utf8");
  const project = { name: "pass232-project", path: PROJECT_DIR };
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
        id: "pass232-session",
        title: "PASS232 command palette subagent status deeplinks",
        project: project.name,
        projectPath: project.path,
        createdAt: "2026-07-08T02:32:00.000Z",
        updatedAt: "2026-07-08T02:32:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    runEvents: [],
    automations: [],
    subagentRuns: [
      {
        id: RUNNING_RUN_ID,
        requestId: "pass232-running-request",
        nickname: "PASS232 Running Agent",
        task: "PASS232 running subagent task",
        status: "running",
        sessionId: "pass232-session",
        project,
        cwd: PROJECT_DIR,
        command: FAKE_CLAUDE,
        args: ["-p", "PASS232 running subagent task"],
        stdout: "PASS232 running stdout",
        stderr: "",
        summary: "",
        artifacts: [],
        startedAt: "2026-07-08T02:32:00.000Z",
      },
      {
        id: FAILED_RUN_ID,
        requestId: "pass232-failed-request",
        nickname: "PASS232 Failed Agent",
        task: "PASS232 failed subagent task",
        status: "error",
        sessionId: "pass232-session",
        project,
        cwd: PROJECT_DIR,
        command: FAKE_CLAUDE,
        args: ["-p", "PASS232 failed subagent task"],
        stdout: "",
        stderr: "PASS232 failed stderr evidence",
        summary: "PASS232 failed summary",
        code: 2,
        durationMs: 2222,
        artifacts: [{ type: "stderr", label: "PASS232 stderr artifact", content: "PASS232 failed artifact content" }],
        startedAt: "2026-07-08T02:31:00.000Z",
        endedAt: "2026-07-08T02:31:03.000Z",
      },
      {
        id: DONE_RUN_ID,
        requestId: "pass232-done-request",
        nickname: "PASS232 Done Agent",
        task: "PASS232 done subagent task",
        status: "done",
        sessionId: "pass232-session",
        project,
        cwd: PROJECT_DIR,
        command: FAKE_CLAUDE,
        args: ["-p", "PASS232 done subagent task"],
        stdout: "PASS232 done stdout",
        stderr: "",
        summary: "PASS232 done summary",
        code: 0,
        durationMs: 1111,
        artifacts: [],
        startedAt: "2026-07-08T02:30:00.000Z",
        endedAt: "2026-07-08T02:30:02.000Z",
      },
      {
        id: ARCHIVED_RUN_ID,
        requestId: "pass232-archived-request",
        nickname: "PASS232 Archived Agent",
        task: "PASS232 archived subagent task",
        status: "done",
        sessionId: "pass232-session",
        project,
        cwd: PROJECT_DIR,
        command: FAKE_CLAUDE,
        args: ["-p", "PASS232 archived subagent task"],
        stdout: "PASS232 archived stdout",
        stderr: "",
        summary: "PASS232 archived summary",
        code: 0,
        durationMs: 3333,
        archivedAt: "2026-07-08T02:32:30.000Z",
        artifacts: [{ type: "summary", label: "PASS232 archived artifact", content: "PASS232 archived artifact content" }],
        startedAt: "2026-07-08T02:29:00.000Z",
        endedAt: "2026-07-08T02:29:03.000Z",
      },
    ],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

async function runPaletteCommand(win, commandId, query) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));
      const button = document.querySelector(${JSON.stringify(`.command-modal .command-list button[data-command-id="${commandId}"]`)});
      if (!button) return false;
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 260));
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS232_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS232_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));

  assertStep(
    "PASS232_OPEN_RUNNING_SUBAGENT_FROM_PALETTE",
    await runPaletteCommand(win, `subagent:${RUNNING_RUN_ID}`, "PASS232 Running Agent"),
  );
  assertStep("PASS232_RUNNING_SUBAGENT_USES_ACTIVE_FILTER", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.subagent-workbench');
      const activeFilter = document.querySelector('.task-center-filters [data-task-filter="active"].active');
      const running = document.querySelector('.subagent-run-card.focused-task-card[data-subagent-run-id="${RUNNING_RUN_ID}"]');
      const failed = document.querySelector('.subagent-run-card[data-subagent-run-id="${FAILED_RUN_ID}"]');
      const done = document.querySelector('.subagent-run-card[data-subagent-run-id="${DONE_RUN_ID}"]');
      const archived = document.querySelector('.subagent-run-card[data-subagent-run-id="${ARCHIVED_RUN_ID}"]');
      const text = panel?.textContent || '';
      return Boolean(
        panel &&
        activeFilter &&
        running &&
        running.getAttribute('aria-current') === 'true' &&
        /PASS232 Running Agent/.test(text) &&
        !failed &&
        !done &&
        !archived &&
        !/PASS232 Failed Agent/.test(text) &&
        !/PASS232 Done Agent/.test(text) &&
        !/PASS232 Archived Agent/.test(text)
      );
    })();
  `, 12000));

  assertStep(
    "PASS232_OPEN_FAILED_SUBAGENT_FROM_PALETTE",
    await runPaletteCommand(win, `subagent:${FAILED_RUN_ID}`, "PASS232 Failed Agent"),
  );
  assertStep("PASS232_FAILED_SUBAGENT_USES_FAILED_FILTER_AND_EVIDENCE", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.subagent-workbench');
      const failedFilter = document.querySelector('.task-center-filters [data-task-filter="failed"].active');
      const failed = document.querySelector('.subagent-run-card.focused-task-card[data-subagent-run-id="${FAILED_RUN_ID}"]');
      const running = document.querySelector('.subagent-run-card[data-subagent-run-id="${RUNNING_RUN_ID}"]');
      const evidence = failed?.querySelector('.subagent-evidence-details');
      const artifacts = failed?.querySelector('.subagent-evidence-details + .subagent-evidence-details');
      const text = panel?.textContent || '';
      return Boolean(
        panel &&
        failedFilter &&
        failed &&
        failed.getAttribute('aria-current') === 'true' &&
        evidence?.open &&
        artifacts?.open &&
        /PASS232 Failed Agent/.test(text) &&
        /PASS232 failed stderr evidence/.test(text) &&
        /PASS232 failed artifact content/.test(text) &&
        !running &&
        !/PASS232 Running Agent/.test(text) &&
        !/PASS232 Done Agent/.test(text)
      );
    })();
  `, 12000));

  assertStep(
    "PASS232_OPEN_ARCHIVED_SUBAGENT_FROM_PALETTE",
    await runPaletteCommand(win, `subagent:${ARCHIVED_RUN_ID}`, "PASS232 Archived Agent"),
  );
  assertStep("PASS232_ARCHIVED_SUBAGENT_USES_ARCHIVED_FILTER", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.subagent-workbench');
      const archivedFilter = document.querySelector('.task-center-filters [data-task-filter="archived"].active');
      const archived = document.querySelector('.subagent-run-card.focused-task-card.archived[data-subagent-run-id="${ARCHIVED_RUN_ID}"]');
      const failed = document.querySelector('.subagent-run-card[data-subagent-run-id="${FAILED_RUN_ID}"]');
      const running = document.querySelector('.subagent-run-card[data-subagent-run-id="${RUNNING_RUN_ID}"]');
      const artifacts = archived?.querySelector('.subagent-evidence-details + .subagent-evidence-details');
      const text = panel?.textContent || '';
      return Boolean(
        panel &&
        archivedFilter &&
        archived &&
        archived.getAttribute('aria-current') === 'true' &&
        artifacts?.open &&
        /PASS232 Archived Agent/.test(text) &&
        /PASS232 archived artifact content/.test(text) &&
        !failed &&
        !running &&
        !/PASS232 Failed Agent/.test(text) &&
        !/PASS232 Running Agent/.test(text)
      );
    })();
  `, 12000));

  console.log("PASS232_COMMAND_PALETTE_SUBAGENT_STATUS_DEEPLINKS_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS232_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (function() {
          return {
            commandModal: document.querySelector('.command-modal')?.textContent || '',
            activeFilter: document.querySelector('.task-center-filters .active')?.getAttribute('data-task-filter') || '',
            cards: Array.from(document.querySelectorAll('.subagent-run-card')).map((card) => ({
              id: card.getAttribute('data-subagent-run-id'),
              requestId: card.getAttribute('data-subagent-request-id'),
              className: card.className,
              current: card.getAttribute('aria-current'),
              text: card.textContent,
            })),
            panel: document.querySelector('.bottom-work-panel')?.textContent || '',
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS232_DEBUG", JSON.stringify(debug, null, 2).slice(0, 12000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS232_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
