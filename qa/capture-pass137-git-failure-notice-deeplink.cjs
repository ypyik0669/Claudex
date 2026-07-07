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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass137-data-"));
const GIT_PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass137-git-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass137-bin-"));
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const TARGET_FILE = "pass137-vanishing-untracked.txt";
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");

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
  for (const dir of [GIT_PROJECT_DIR, USER_DATA_DIR, FAKE_BIN_DIR]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_error) {
      // best-effort cleanup
    }
  }
}

function writeFakeClaude() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(
    FAKE_CLAUDE,
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass137& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins: none& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces: none& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass137 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function setupGitProject() {
  fs.mkdirSync(GIT_PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, "tracked.txt"), "pass137 baseline\n", "utf8");
  runGit(["init"]);
  runGit(["config", "user.name", "Claudex QA"]);
  runGit(["config", "user.email", "qa@example.invalid"]);
  runGit(["add", "tracked.txt"]);
  runGit(["commit", "-m", "baseline"]);
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, TARGET_FILE), "pass137 staged failure evidence\n", "utf8");
}

function writeInitialStore() {
  writeFakeClaude();
  setupGitProject();
  const project = { name: "pass137-git-project", path: GIT_PROJECT_DIR };
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify({
      version: 1,
      activeProject: project,
      projects: [project],
      sessions: [
        {
          id: "pass137-session",
          title: "Pass137 git failure notice deeplink",
          project: project.name,
          projectPath: GIT_PROJECT_DIR,
          createdAt: "2026-07-07T00:00:00.000Z",
          updatedAt: "2026-07-07T00:00:00.000Z",
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
      commandRuns: [],
      runEvents: [],
      automations: [],
      subagentRuns: [],
      sourceRefs: [],
      browserVisits: [],
      notices: [],
    }, null, 2),
    "utf8",
  );
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

async function openPanel(win, labelPattern) {
  const tabByPattern = {
    "\\u8f93\\u51fa": "outputs",
    "\\u53d8\\u66f4": "changes",
    "\\u901a\\u77e5": "notices",
  }[labelPattern] || "";
  return win.webContents.executeJavaScript(`
    (function() {
      const tab = ${JSON.stringify(tabByPattern)};
      if (tab) {
        const tabButton = document.querySelector('[data-context-tab="' + tab + '"], [data-bottom-tab="' + tab + '"]');
        if (tabButton) {
          tabButton.click();
          return true;
        }
      }
      const pattern = new RegExp(${JSON.stringify(labelPattern)});
      const button = [...document.querySelectorAll('.workspace-context-button, .bottom-panel-tabs button')]
        .find((candidate) => pattern.test(candidate.textContent || '') || pattern.test(candidate.getAttribute('aria-label') || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS137_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS137_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS137_ENVIRONMENT_GIT_READY", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(GIT_PROJECT_DIR)} });
      return Boolean(
        state?.git?.available &&
        /${TARGET_FILE}/.test(state?.git?.raw || '') &&
        /${TARGET_FILE}/.test(state?.git?.diff?.text || '')
      );
    })();
  `, 10000));

  assertStep("PASS137_OPEN_CHANGES", await openPanel(win, "\\u53d8\\u66f4"));
  assertStep("PASS137_SELECT_UNTRACKED", await waitFor(win, `
    (function() {
      window.confirm = () => true;
      if (!window.__pass137SelectedUntracked) {
        const button = [...document.querySelectorAll('.git-change-item')]
          .find((candidate) => /${TARGET_FILE}/.test(candidate.textContent || ''));
        if (!button) return false;
        button.click();
        window.__pass137SelectedUntracked = true;
      }
      return /${TARGET_FILE}/.test(document.querySelector('.git-change-item.selected')?.textContent || '');
    })();
  `, 10000));
  assertStep("PASS137_SELECTED_STAGE_ACTION_VISIBLE", await waitFor(win, `
    (function() {
      const selected = document.querySelector('.git-change-item.selected')?.textContent || '';
      const panel = document.querySelector('.git-selected-evidence-panel')?.textContent || '';
      const stage = [...document.querySelectorAll('.git-selected-evidence-panel button')]
        .some((button) => /\\u6682\\u5b58\\u6587\\u4ef6/.test(button.textContent || ''));
      return /${TARGET_FILE}/.test(selected) && /${TARGET_FILE}/.test(panel) && stage;
    })();
  `, 5000));

  fs.rmSync(path.join(GIT_PROJECT_DIR, TARGET_FILE), { force: true });

  assertStep("PASS137_STAGE_DELETED_FILE_CLICK", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.git-selected-evidence-panel button')]
        .find((candidate) => /\\u6682\\u5b58\\u6587\\u4ef6/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));

  assertStep("PASS137_GIT_FAILURE_NOTICE_RECORDED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const run = (state.commandRuns || []).find((item) => /git add/.test(item.command || '') && /${TARGET_FILE}/.test(item.command || ''));
      const event = (state.runEvents || []).find((item) => item.type === 'git-command' && item.status === 'error' && /${TARGET_FILE}/.test(item.commandLine || ''));
      const notice = (state.notices || []).find((item) => item.source === 'git-command' && /^git-run:/.test(item.action || '') && /Git:/.test(item.title || ''));
      return Boolean(run && run.code !== 0 && event && notice && notice.action.includes(encodeURIComponent(event.id)));
    })();
  `, 12000));

  assertStep("PASS137_OPEN_NOTICES", await openPanel(win, "\\u901a\\u77e5"));
  assertStep("PASS137_NOTICE_CARD_VISIBLE", await waitFor(win, `
    (function() {
      const card = [...document.querySelectorAll('.notice-card')]
        .find((candidate) => /Git:/.test(candidate.textContent || '') && /git-command/.test(candidate.textContent || ''));
      return Boolean(card && card.querySelector('button[data-notice-action="open"]'));
    })();
  `, 5000));

  assertStep("PASS137_NOTICE_ACTION_OPENS_CHANGES", await win.webContents.executeJavaScript(`
    (function() {
      const card = [...document.querySelectorAll('.notice-card')]
        .find((candidate) => /Git:/.test(candidate.textContent || '') && /git-command/.test(candidate.textContent || ''));
      const button = card?.querySelector('button[data-notice-action="open"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS137_CHANGES_SHOWS_FAILED_GIT_ACTION", await waitFor(win, `
    (function() {
      const active = document.querySelector('.workspace-context-button.active')?.textContent || '';
      const latest = document.querySelector('.git-latest-action.error')?.textContent || '';
      const timelineButton = document.querySelector('.git-latest-action button[data-git-action="open-timeline"]');
      return /\\u53d8\\u66f4/.test(active) &&
        /Git:/.test(latest) &&
        /\\u6682\\u5b58\\u6587\\u4ef6/.test(latest) &&
        /${TARGET_FILE}/.test(latest) &&
        Boolean(timelineButton);
    })();
  `, 10000));

  assertStep("PASS137_OPEN_GIT_TIMELINE", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.git-latest-action button[data-git-action="open-timeline"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS137_TIMELINE_FOCUSED_ON_GIT_FAILURE", await waitFor(win, `
    (function() {
      const active = document.querySelector('.workspace-context-button.active')?.textContent || '';
      const selected = document.querySelector('.selected-run-evidence-panel')?.textContent || '';
      return /\\u8f93\\u51fa/.test(active) &&
        /Git:/.test(selected) &&
        /\\u6682\\u5b58\\u6587\\u4ef6/.test(selected) &&
        /git add/.test(selected) &&
        /${TARGET_FILE}/.test(selected) &&
        /pathspec|did not match|fatal|error/i.test(selected);
    })();
  `, 10000));

  console.log("PASS137_GIT_FAILURE_NOTICE_DEEPLINK_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS137_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS137_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
