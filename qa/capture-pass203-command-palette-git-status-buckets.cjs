const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass203-data-"));
const GIT_PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass203-git-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass203-bin-"));
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const TARGET_FILE = "pass203-changes.txt";
const FAILURE_RUN_ID = "pass203-git-failed-run";
const SUCCESS_RUN_ID = "pass203-git-success-run";

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: GIT_PROJECT_DIR,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result;
}

function cleanup() {
  for (const dir of [USER_DATA_DIR, GIT_PROJECT_DIR, FAKE_BIN_DIR]) {
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

function writeFakeClaude() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(
    FAKE_CLAUDE,
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass203& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins: none& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces: none& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass203 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function setupGitProject() {
  fs.mkdirSync(GIT_PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, TARGET_FILE), "pass203 baseline\n", "utf8");
  runGit(["init"]);
  runGit(["config", "user.name", "Claudex QA"]);
  runGit(["config", "user.email", "qa@example.invalid"]);
  runGit(["add", TARGET_FILE]);
  runGit(["commit", "-m", "baseline"]);
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, TARGET_FILE), "pass203 baseline\npass203 dirty changes evidence\n", "utf8");
}

function writeInitialStore() {
  writeFakeClaude();
  setupGitProject();
  const project = { name: "pass203-git-project", path: GIT_PROJECT_DIR };
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify({
      version: 1,
      activeProject: project,
      projects: [project],
      sessions: [
        {
          id: "pass203-session",
          title: "Pass203 git status bucket palette evidence",
          project: project.name,
          projectPath: GIT_PROJECT_DIR,
          createdAt: "2026-07-08T01:00:00.000Z",
          updatedAt: "2026-07-08T01:00:00.000Z",
          messages: [],
        },
      ],
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
      commandRuns: [
        {
          id: SUCCESS_RUN_ID,
          requestId: SUCCESS_RUN_ID,
          kind: "git",
          command: "git status --short",
          commandLine: "git status --short",
          cwd: GIT_PROJECT_DIR,
          project,
          code: 0,
          durationMs: 80,
          stdout: ` M ${TARGET_FILE}`,
          stderr: "",
          startedAt: "2026-07-08T01:05:01.000Z",
          endedAt: "2026-07-08T01:05:02.000Z",
        },
        {
          id: FAILURE_RUN_ID,
          requestId: FAILURE_RUN_ID,
          kind: "git",
          command: `git add missing-${TARGET_FILE}`,
          commandLine: `git add missing-${TARGET_FILE}`,
          cwd: GIT_PROJECT_DIR,
          project,
          code: 128,
          durationMs: 203,
          stdout: "pass203 git stdout before failure",
          stderr: `fatal: pathspec 'missing-${TARGET_FILE}' did not match any files`,
          startedAt: "2026-07-08T01:00:01.000Z",
          endedAt: "2026-07-08T01:00:02.000Z",
        },
      ],
      runEvents: [
        {
          id: SUCCESS_RUN_ID,
          type: "git-command",
          status: "ok",
          title: "Git: pass203 status succeeded",
          detail: `pass203 latest successful git action · git status --short`,
          commandLine: "git status --short",
          cwd: GIT_PROJECT_DIR,
          project,
          sessionId: "pass203-session",
          code: 0,
          durationMs: 80,
          createdAt: "2026-07-08T01:05:02.000Z",
        },
        {
          id: FAILURE_RUN_ID,
          type: "git-command",
          status: "error",
          title: "Git: pass203 stage failed",
          detail: `pass203 latest failed git action detail · git add missing-${TARGET_FILE}`,
          commandLine: `git add missing-${TARGET_FILE}`,
          cwd: GIT_PROJECT_DIR,
          project,
          sessionId: "pass203-session",
          code: 128,
          durationMs: 201,
          createdAt: "2026-07-08T01:00:02.000Z",
        },
      ],
      notices: [],
      automations: [],
      subagentRuns: [],
      sourceRefs: [],
      browserVisits: [],
    }, null, 2),
    "utf8",
  );
}

async function openPaletteAndQuery(win, query) {
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
      return true;
    })();
  `);
}

async function clickCommandById(win, id) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === ${JSON.stringify(id)});
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS203_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS203_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS203_GIT_STATUS_BUCKET_STATE_READY", await waitFor(win, `
    (async function() {
      const env = await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(GIT_PROJECT_DIR)} });
      const state = await window.claudexDesktop.getState();
      const failedEvent = (state.runEvents || []).find((item) => item.id === ${JSON.stringify(FAILURE_RUN_ID)});
      const successEvent = (state.runEvents || []).find((item) => item.id === ${JSON.stringify(SUCCESS_RUN_ID)});
      const failedRun = (state.commandRuns || []).find((item) => item.id === ${JSON.stringify(FAILURE_RUN_ID)});
      const successRun = (state.commandRuns || []).find((item) => item.id === ${JSON.stringify(SUCCESS_RUN_ID)});
      return Boolean(env?.git?.available &&
        /${TARGET_FILE}/.test(env?.git?.diff?.text || '') &&
        failedEvent?.type === 'git-command' &&
        failedEvent?.status === 'error' &&
        successEvent?.type === 'git-command' &&
        successEvent?.status === 'ok' &&
        failedRun?.stderr &&
        successRun?.stdout &&
        (state.notices || []).length === 0);
    })();
  `, 12000));

  assertStep("PASS203_OPEN_PALETTE_FAILED_GIT_ACTION", await openPaletteAndQuery(win, "failed git pass203"));
  assertStep("PASS203_PALETTE_FAILED_GIT_ACTION_COMMAND", await waitFor(win, `
    (function() {
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === 'git-latest-failed-action:${FAILURE_RUN_ID}');
      const text = button?.textContent || '';
      return Boolean(button &&
        button.getAttribute('data-command-target') === 'changes' &&
        /\\u6700\\u8fd1\\u5931\\u8d25 Git \\u64cd\\u4f5c/.test(text) &&
        /\\u67e5\\u770b\\u53d8\\u66f4\\u8bc1\\u636e/.test(text) &&
        /Git: pass203 stage failed/.test(text) &&
        /git add missing-${TARGET_FILE}/.test(text) &&
        /128/.test(text));
    })();
  `, 8000));

  assertStep("PASS203_CLICK_FAILED_GIT_ACTION_COMMAND", await clickCommandById(win, `git-latest-failed-action:${FAILURE_RUN_ID}`));
  assertStep("PASS203_FAILED_COMMAND_OPENS_CHANGES_EVIDENCE", await waitFor(win, `
    (function() {
      const active = document.querySelector('.workspace-context-button.active')?.textContent || document.querySelector('.bottom-panel-tabs button.active')?.textContent || '';
      const latest = document.querySelector('.git-latest-action.error')?.textContent || '';
      return /\\u53d8\\u66f4/.test(active) &&
        /Git: pass203 stage failed/.test(latest) &&
        /pass203 latest failed git action detail/.test(latest) &&
        /git add missing-${TARGET_FILE}/.test(latest) &&
        /pass203 git stdout before failure/.test(latest) &&
        /pathspec|did not match|fatal/i.test(latest);
    })();
  `, 10000));

  assertStep("PASS203_OPEN_FAILED_GIT_TIMELINE", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.git-latest-action button[data-git-action="open-timeline"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS203_TIMELINE_FOCUSED_ON_FAILED_GIT_ACTION", await waitFor(win, `
    (function() {
      const active = document.querySelector('.workspace-context-button.active')?.textContent || document.querySelector('.bottom-panel-tabs button.active')?.textContent || '';
      const panel = document.querySelector('.selected-run-evidence-panel.error');
      const text = panel?.textContent || '';
      return Boolean(/\\u8f93\\u51fa|Outputs/i.test(active) &&
        panel &&
        /Git: pass203 stage failed/.test(text) &&
        /git add missing-${TARGET_FILE}/.test(text) &&
        /pass203 git stdout before failure/.test(text) &&
        /pathspec/.test(text) &&
        panel.querySelector('[data-run-event-type="git-command"]'));
    })();
  `, 10000));

  assertStep("PASS203_OPEN_PALETTE_SUCCESSFUL_GIT_ACTION", await openPaletteAndQuery(win, "successful git pass203"));
  assertStep("PASS203_PALETTE_SUCCESSFUL_GIT_ACTION_COMMAND", await waitFor(win, `
    (function() {
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === 'git-latest-successful-action:${SUCCESS_RUN_ID}');
      const text = button?.textContent || '';
      return Boolean(button &&
        button.getAttribute('data-command-target') === 'changes' &&
        /\\u6700\\u8fd1\\u6210\\u529f Git \\u64cd\\u4f5c/.test(text) &&
        /\\u67e5\\u770b\\u53d8\\u66f4\\u8bc1\\u636e/.test(text) &&
        /Git: pass203 status succeeded/.test(text) &&
        /git status --short/.test(text) &&
        /0/.test(text));
    })();
  `, 8000));

  assertStep("PASS203_CLICK_SUCCESSFUL_GIT_ACTION_COMMAND", await clickCommandById(win, `git-latest-successful-action:${SUCCESS_RUN_ID}`));
  assertStep("PASS203_SUCCESSFUL_COMMAND_OPENS_CHANGES_EVIDENCE", await waitFor(win, `
    (function() {
      const active = document.querySelector('.workspace-context-button.active')?.textContent || document.querySelector('.bottom-panel-tabs button.active')?.textContent || '';
      const latest = document.querySelector('.git-latest-action.ok')?.textContent || '';
      return /\\u53d8\\u66f4/.test(active) &&
        /Git: pass203 status succeeded/.test(latest) &&
        /pass203 latest successful git action/.test(latest) &&
        /git status --short/.test(latest) &&
        /${TARGET_FILE}/.test(latest);
    })();
  `, 10000));

  assertStep("PASS203_OPEN_PALETTE_LATEST_GIT_ACTION", await openPaletteAndQuery(win, "latest git action pass203"));
  assertStep("PASS203_PALETTE_LATEST_GIT_ACTION_STILL_POINTS_TO_SUCCESS", await waitFor(win, `
    (function() {
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === 'git-latest-action:${SUCCESS_RUN_ID}');
      const text = button?.textContent || '';
      return Boolean(button &&
        button.getAttribute('data-command-target') === 'changes' &&
        /\\u6700\\u8fd1 Git \\u64cd\\u4f5c/.test(text) &&
        /Git: pass203 status succeeded/.test(text) &&
        /git status --short/.test(text));
    })();
  `, 8000));

  console.log("PASS203_COMMAND_PALETTE_GIT_STATUS_BUCKETS_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS203_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (function() {
          return {
            commands: [...document.querySelectorAll('.command-modal .command-list button')].map((button) => ({
              id: button.getAttribute('data-command-id'),
              target: button.getAttribute('data-command-target'),
              text: button.textContent,
            })),
            activeBottom: document.querySelector('.workspace-context-button.active')?.textContent || document.querySelector('.bottom-panel-tabs button.active')?.textContent || '',
            latest: document.querySelector('.git-latest-action')?.textContent || '',
            selected: document.querySelector('.selected-run-evidence-panel')?.textContent || '',
            notices: [...document.querySelectorAll('.notice-card')].map((card) => card.textContent),
            body: document.body?.textContent?.slice(0, 4000) || '',
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS203_DEBUG", JSON.stringify(debug, null, 2).slice(0, 8000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS203_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
