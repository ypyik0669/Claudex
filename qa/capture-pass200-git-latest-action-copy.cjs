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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass200-data-"));
const GIT_PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass200-git-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass200-bin-"));
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const TARGET_FILE = "pass200-changes.txt";
const RUN_ID = "pass200-git-run";

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
      "if \"%1\"==\"--version\" (echo claude fake pass200& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins: none& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces: none& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass200 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function setupGitProject() {
  fs.mkdirSync(GIT_PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, TARGET_FILE), "pass200 baseline\n", "utf8");
  runGit(["init"]);
  runGit(["config", "user.name", "Claudex QA"]);
  runGit(["config", "user.email", "qa@example.invalid"]);
  runGit(["add", TARGET_FILE]);
  runGit(["commit", "-m", "baseline"]);
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, TARGET_FILE), "pass200 baseline\npass200 dirty changes evidence\n", "utf8");
}

function writeInitialStore() {
  writeFakeClaude();
  setupGitProject();
  const project = { name: "pass200-git-project", path: GIT_PROJECT_DIR };
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify({
      version: 1,
      activeProject: project,
      projects: [project],
      sessions: [
        {
          id: "pass200-session",
          title: "Pass200 latest git action copy evidence",
          project: project.name,
          projectPath: GIT_PROJECT_DIR,
          createdAt: "2026-07-08T00:50:00.000Z",
          updatedAt: "2026-07-08T00:50:00.000Z",
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
          id: RUN_ID,
          requestId: RUN_ID,
          kind: "git",
          command: `git add missing-${TARGET_FILE}`,
          commandLine: `git add missing-${TARGET_FILE}`,
          cwd: GIT_PROJECT_DIR,
          project,
          code: 128,
          durationMs: 200,
          stdout: "pass200 git stdout before failure",
          stderr: `fatal: pathspec 'missing-${TARGET_FILE}' did not match any files`,
          startedAt: "2026-07-08T00:50:01.000Z",
          endedAt: "2026-07-08T00:50:02.000Z",
        },
      ],
      runEvents: [
        {
          id: RUN_ID,
          type: "git-command",
          status: "error",
          title: "Git: pass200 stage failed",
          detail: `pass200 latest git action detail · git add missing-${TARGET_FILE}`,
          commandLine: `git add missing-${TARGET_FILE}`,
          cwd: GIT_PROJECT_DIR,
          project,
          sessionId: "pass200-session",
          code: 128,
          durationMs: 200,
          createdAt: "2026-07-08T00:50:02.000Z",
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

async function openChanges(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('[data-context-tab="changes"], [data-bottom-tab="changes"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS200_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS200_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS200_GIT_STATE_READY", await waitFor(win, `
    (async function() {
      const env = await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(GIT_PROJECT_DIR)} });
      const state = await window.claudexDesktop.getState();
      const event = (state.runEvents || []).find((item) => item.id === ${JSON.stringify(RUN_ID)});
      const run = (state.commandRuns || []).find((item) => item.id === ${JSON.stringify(RUN_ID)});
      return Boolean(env?.git?.available && /${TARGET_FILE}/.test(env?.git?.diff?.text || '') && event?.type === 'git-command' && run?.stderr && run?.stdout);
    })();
  `, 12000));

  assertStep("PASS200_OPEN_CHANGES", await openChanges(win));
  assertStep("PASS200_LATEST_GIT_ACTION_READY", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.git-latest-action.error');
      const text = panel?.textContent || '';
      return Boolean(panel &&
        /Git: pass200 stage failed/.test(text) &&
        /pass200 latest git action detail/.test(text) &&
        /git add missing-${TARGET_FILE}/.test(text) &&
        panel.querySelector('button[data-git-action="copy-latest-evidence"]') &&
        panel.querySelector('button[data-git-action="open-timeline"]'));
    })();
  `, 10000));

  assertStep("PASS200_COPY_LATEST_GIT_ACTION_EVIDENCE", await win.webContents.executeJavaScript(`
    (async function() {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text) => { window.__pass200Clipboard = String(text || ''); } },
      });
      const button = document.querySelector('.git-latest-action button[data-git-action="copy-latest-evidence"]');
      if (!button) return false;
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 250));
      const copied = window.__pass200Clipboard || '';
      return /Git: pass200 stage failed/.test(copied) &&
        /git add missing-${TARGET_FILE}/.test(copied) &&
        copied.includes(${JSON.stringify(GIT_PROJECT_DIR)}) &&
        /pass200 latest git action detail/.test(copied) &&
        /pass200 git stdout before failure/.test(copied) &&
        /pathspec/.test(copied) &&
        /128/.test(copied);
    })();
  `));

  assertStep("PASS200_COPY_FEEDBACK_VISIBLE", await waitFor(win, `
    (function() {
      const button = document.querySelector('.git-latest-action button[data-git-action="copy-latest-evidence"]');
      return Boolean(button && /\\u5df2\\u590d\\u5236/.test(button.textContent || ''));
    })();
  `, 5000));

  assertStep("PASS200_OPEN_LATEST_GIT_TIMELINE", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.git-latest-action button[data-git-action="open-timeline"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS200_TIMELINE_FOCUSED_ON_LATEST_GIT_ACTION", await waitFor(win, `
    (function() {
      const active = document.querySelector('.workspace-context-button.active')?.textContent || document.querySelector('.bottom-panel-tabs button.active')?.textContent || '';
      const panel = document.querySelector('.selected-run-evidence-panel.error');
      const text = panel?.textContent || '';
      return Boolean(/\\u8f93\\u51fa|Outputs/i.test(active) &&
        panel &&
        /Git: pass200 stage failed/.test(text) &&
        /git add missing-${TARGET_FILE}/.test(text) &&
        /pass200 git stdout before failure/.test(text) &&
        /pathspec/.test(text) &&
        panel.querySelector('[data-run-event-type="git-command"]'));
    })();
  `, 10000));

  console.log("PASS200_GIT_LATEST_ACTION_COPY_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS200_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (function() {
          return {
            latest: document.querySelector('.git-latest-action')?.textContent || '',
            clipboard: window.__pass200Clipboard || '',
            activeBottom: document.querySelector('.workspace-context-button.active')?.textContent || document.querySelector('.bottom-panel-tabs button.active')?.textContent || '',
            selected: document.querySelector('.selected-run-evidence-panel')?.textContent || '',
            body: document.body?.textContent?.slice(0, 4000) || '',
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS200_DEBUG", JSON.stringify(debug, null, 2).slice(0, 8000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS200_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
