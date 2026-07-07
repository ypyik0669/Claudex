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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass280-data-"));
const GIT_PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass280-git-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass280-bin-"));
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const TARGET_FILE = "pass280-changes.txt";
const FAILURE_RUN_ID = "pass280-git-failed-run";
const SUCCESS_RUN_ID = "pass280-git-success-run";
const FAILED_STDOUT = "pass280 git stdout before failure";
const FAILED_STDERR = `fatal: pathspec 'missing-${TARGET_FILE}' did not match any files`;
const SUCCESS_STDOUT = ` M ${TARGET_FILE}`;

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: GIT_PROJECT_DIR,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
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
      "if \"%1\"==\"--version\" (echo claude fake pass280& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins: none& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces: none& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass280 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function setupGitProject() {
  fs.mkdirSync(GIT_PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, TARGET_FILE), "pass280 baseline\n", "utf8");
  runGit(["init"]);
  runGit(["config", "user.name", "Claudex QA"]);
  runGit(["config", "user.email", "qa@example.invalid"]);
  runGit(["add", TARGET_FILE]);
  runGit(["commit", "-m", "pass280 baseline"]);
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, TARGET_FILE), "pass280 baseline\npass280 dirty changes evidence\n", "utf8");
}

function writeInitialStore() {
  writeFakeClaude();
  setupGitProject();
  const project = { name: "pass280-git-project", path: GIT_PROJECT_DIR };
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify({
      version: 1,
      activeProject: project,
      projects: [project],
      sessions: [
        {
          id: "pass280-session",
          title: "Pass280 git latest action controls",
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
          stdout: SUCCESS_STDOUT,
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
          stdout: FAILED_STDOUT,
          stderr: FAILED_STDERR,
          startedAt: "2026-07-08T01:00:01.000Z",
          endedAt: "2026-07-08T01:00:02.000Z",
        },
      ],
      runEvents: [
        {
          id: SUCCESS_RUN_ID,
          type: "git-command",
          status: "ok",
          title: "Git: pass280 status succeeded",
          detail: "pass280 latest successful git action Â· git status --short",
          commandLine: "git status --short",
          cwd: GIT_PROJECT_DIR,
          project,
          sessionId: "pass280-session",
          code: 0,
          durationMs: 80,
          createdAt: "2026-07-08T01:05:02.000Z",
        },
        {
          id: FAILURE_RUN_ID,
          type: "git-command",
          status: "error",
          title: "Git: pass280 stage failed",
          detail: `pass280 latest failed git action detail Â· git add missing-${TARGET_FILE}`,
          commandLine: `git add missing-${TARGET_FILE}`,
          cwd: GIT_PROJECT_DIR,
          project,
          sessionId: "pass280-session",
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

async function runPaletteCommand(win, query, id) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return { ok: false, reason: 'no input' };
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 320));
      const button = Array.from(document.querySelectorAll('.command-modal .command-list button'))
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === ${JSON.stringify(id)});
      if (!button) {
        return {
          ok: false,
          reason: 'no command',
          visible: Array.from(document.querySelectorAll('.command-modal .command-list button')).slice(0, 24).map((candidate) => ({
            id: candidate.getAttribute('data-command-id') || '',
            target: candidate.getAttribute('data-command-target') || '',
            action: candidate.getAttribute('data-command-git-action') || '',
            eventId: candidate.getAttribute('data-command-git-action-event-id') || '',
            text: candidate.textContent || '',
          })),
        };
      }
      const trace = {
        id: button.getAttribute('data-command-id') || '',
        target: button.getAttribute('data-command-target') || '',
        action: button.getAttribute('data-command-git-action') || '',
        eventId: button.getAttribute('data-command-git-action-event-id') || '',
        status: button.getAttribute('data-command-git-action-status') || '',
        command: button.getAttribute('data-command-git-action-command') || '',
        root: button.getAttribute('data-command-git-root') || '',
      };
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 420));
      return { ok: true, trace };
    })();
  `);
}

async function latestActionControlFocused(win, action, eventId, expectedStatus) {
  return waitFor(win, `
    (async function() {
      const active = document.querySelector('.workspace-context-button.active')?.getAttribute('data-context-tab') || '';
      const card = document.querySelector('.git-latest-action.${expectedStatus}');
      const text = card?.textContent || '';
      const button = card?.querySelector('[data-git-action="${action}"]');
      const state = await window.claudexDesktop.getState();
      return Boolean(
        active === 'changes' &&
        card &&
        /\u805a\u7126 Git \u64cd\u4f5c/.test(text) &&
        text.includes(${JSON.stringify(eventId === FAILURE_RUN_ID ? "Git: pass280 stage failed" : "Git: pass280 status succeeded")}) &&
        button?.getAttribute('data-git-action-focused') === 'true' &&
        button?.getAttribute('aria-current') === 'true' &&
        document.activeElement === button &&
        (state.commandRuns || []).length === 2
      );
    })();
  `, 10000);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS280_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS280_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS280_GIT_ACTION_STATE_READY", await waitFor(win, `
    (async function() {
      const env = await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(GIT_PROJECT_DIR)} });
      const state = await window.claudexDesktop.getState();
      return Boolean(
        env?.git?.available &&
        /${TARGET_FILE}/.test(env?.git?.diff?.text || '') &&
        (state.commandRuns || []).length === 2 &&
        (state.runEvents || []).some((event) => event.id === ${JSON.stringify(FAILURE_RUN_ID)} && event.status === 'error') &&
        (state.runEvents || []).some((event) => event.id === ${JSON.stringify(SUCCESS_RUN_ID)} && event.status === 'ok')
      );
    })();
  `, 12000));

  const copyFocus = await runPaletteCommand(win, "copy failed git action pass280", `git-latest-failed-action-action:copy-latest-evidence:${FAILURE_RUN_ID}`);
  assertStep("PASS280_COPY_FAILED_ACTION_COMMAND_TRACE", Boolean(copyFocus?.ok && copyFocus.trace?.target === "git-latest-action-action" && copyFocus.trace?.action === "copy-latest-evidence" && copyFocus.trace?.eventId === FAILURE_RUN_ID && copyFocus.trace?.status === "error" && /git add missing/.test(copyFocus.trace?.command || "") && copyFocus.trace?.root === GIT_PROJECT_DIR));
  assertStep("PASS280_COPY_FAILED_ACTION_FOCUSED_WITHOUT_COPY", await latestActionControlFocused(win, "copy-latest-evidence", FAILURE_RUN_ID, "error"));
  assertStep("PASS280_COPY_FAILED_ACTION_CLICK_COPIES_EVIDENCE", await waitFor(win, `
    (async function() {
      const button = document.querySelector('.git-latest-action.error [data-git-action="copy-latest-evidence"]');
      if (!button || window.__pass280CopyClicked) return false;
      window.__pass280CopyClicked = true;
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 320));
      const state = await window.claudexDesktop.getState();
      return Boolean(/\u5df2\u590d\u5236/.test(button.textContent || '') && (state.commandRuns || []).length === 2);
    })();
  `, 5000));

  const timelineFocus = await runPaletteCommand(win, "timeline failed git action pass280", `git-latest-failed-action-action:open-timeline:${FAILURE_RUN_ID}`);
  assertStep("PASS280_TIMELINE_FAILED_ACTION_COMMAND_TRACE", Boolean(timelineFocus?.ok && timelineFocus.trace?.target === "git-latest-action-action" && timelineFocus.trace?.action === "open-timeline" && timelineFocus.trace?.eventId === FAILURE_RUN_ID && timelineFocus.trace?.status === "error"));
  assertStep("PASS280_TIMELINE_FAILED_ACTION_FOCUSED_WITHOUT_OPENING_OUTPUTS", await latestActionControlFocused(win, "open-timeline", FAILURE_RUN_ID, "error"));
  assertStep("PASS280_TIMELINE_BUTTON_OPENS_OUTPUTS", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.git-latest-action.error [data-git-action="open-timeline"]');
      if (!button || window.__pass280TimelineClicked) return false;
      window.__pass280TimelineClicked = true;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS280_OUTPUTS_FOCUSED_ON_FAILED_GIT_ACTION", await waitFor(win, `
    (function() {
      const active = document.querySelector('.workspace-context-button.active')?.getAttribute('data-context-tab') || document.querySelector('.bottom-panel-tabs button.active')?.getAttribute('data-bottom-tab') || '';
      const panel = document.querySelector('.selected-run-evidence-panel.error');
      const text = panel?.textContent || '';
      return Boolean(active === 'outputs' && panel && /Git: pass280 stage failed/.test(text) && /git add missing-${TARGET_FILE}/.test(text) && /${FAILED_STDOUT}/.test(text) && /pathspec/.test(text));
    })();
  `, 10000));

  const clearFocus = await runPaletteCommand(win, "clear focused git action pass280", `git-focused-action-action:clear-focus:${FAILURE_RUN_ID}`);
  assertStep("PASS280_CLEAR_FOCUSED_ACTION_COMMAND_TRACE", Boolean(clearFocus?.ok && clearFocus.trace?.target === "git-latest-action-action" && clearFocus.trace?.action === "clear-focus" && clearFocus.trace?.eventId === FAILURE_RUN_ID && clearFocus.trace?.status === "error"));
  assertStep("PASS280_CLEAR_FOCUS_ACTION_FOCUSED_WITHOUT_CLEARING", await latestActionControlFocused(win, "clear-focus", FAILURE_RUN_ID, "error"));
  assertStep("PASS280_CLEAR_FOCUS_BUTTON_RETURNS_TO_RECENT", await waitFor(win, `
    (async function() {
      const button = document.querySelector('.git-latest-action.error [data-git-action="clear-focus"]');
      if (!button || window.__pass280ClearClicked) return false;
      window.__pass280ClearClicked = true;
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 320));
      const card = document.querySelector('.git-latest-action.ok');
      const text = card?.textContent || '';
      const state = await window.claudexDesktop.getState();
      return Boolean(
        card &&
        /\u6700\u8fd1 Git \u64cd\u4f5c/.test(text) &&
        !/\u805a\u7126 Git \u64cd\u4f5c/.test(text) &&
        /Git: pass280 status succeeded/.test(text) &&
        !document.querySelector('.git-latest-action [data-git-action="clear-focus"]') &&
        (state.commandRuns || []).length === 2
      );
    })();
  `, 10000));

  console.log("PASS280_GIT_LATEST_ACTION_CONTROL_FOCUS_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS280_FAILED", error?.stack || error);
  try {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      const debug = await win.webContents.executeJavaScript(`
        ({
          active: document.querySelector('.workspace-context-button.active')?.outerHTML || document.querySelector('.bottom-panel-tabs button.active')?.outerHTML || '',
          latest: document.querySelector('.git-latest-action')?.outerHTML || '',
          selected: document.querySelector('.selected-run-evidence-panel')?.textContent || '',
          commands: Array.from(document.querySelectorAll('.command-modal .command-list button')).slice(0, 30).map((button) => ({
            id: button.getAttribute('data-command-id') || '',
            target: button.getAttribute('data-command-target') || '',
            action: button.getAttribute('data-command-git-action') || '',
            eventId: button.getAttribute('data-command-git-action-event-id') || '',
            text: button.textContent || '',
          })),
        })
      `);
      console.error("PASS280_DEBUG", JSON.stringify(debug, null, 2).slice(0, 16000));
    }
  } catch (_debugError) {
    // ignore debug failures
  }
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS280_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
