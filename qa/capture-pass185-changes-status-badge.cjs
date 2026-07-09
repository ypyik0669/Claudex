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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass185-data-"));
const DIRTY_PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass185-dirty-"));
const CONFLICT_PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass185-conflict-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass185-bin-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");

function cleanup() {
  for (const dir of [USER_DATA_DIR, DIRTY_PROJECT_DIR, CONFLICT_PROJECT_DIR, FAKE_BIN_DIR]) {
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

function runGit(cwd, args, options = {}) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    ...options,
  });
  if (!options.allowFailure && result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result;
}

function initRepo(cwd) {
  runGit(cwd, ["init"]);
  runGit(cwd, ["config", "user.name", "Claudex QA"]);
  runGit(cwd, ["config", "user.email", "qa@example.invalid"]);
}

function setupDirtyProject() {
  fs.writeFileSync(path.join(DIRTY_PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass185-dirty", version: "1.0.0" }, null, 2), "utf8");
  fs.writeFileSync(path.join(DIRTY_PROJECT_DIR, "pass185-tracked.txt"), "pass185 tracked baseline\n", "utf8");
  fs.writeFileSync(path.join(DIRTY_PROJECT_DIR, "pass185-staged.txt"), "pass185 staged baseline\n", "utf8");
  initRepo(DIRTY_PROJECT_DIR);
  runGit(DIRTY_PROJECT_DIR, ["add", "package.json", "pass185-tracked.txt", "pass185-staged.txt"]);
  runGit(DIRTY_PROJECT_DIR, ["commit", "-m", "pass185 baseline"]);
  fs.writeFileSync(path.join(DIRTY_PROJECT_DIR, "pass185-tracked.txt"), "pass185 tracked baseline\npass185 unstaged evidence\n", "utf8");
  fs.writeFileSync(path.join(DIRTY_PROJECT_DIR, "pass185-staged.txt"), "pass185 staged baseline\npass185 staged evidence\n", "utf8");
  runGit(DIRTY_PROJECT_DIR, ["add", "pass185-staged.txt"]);
  fs.writeFileSync(path.join(DIRTY_PROJECT_DIR, "pass185-untracked.txt"), "pass185 untracked evidence\n", "utf8");
}

function setupConflictProject() {
  fs.writeFileSync(path.join(CONFLICT_PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass185-conflict", version: "1.0.0" }, null, 2), "utf8");
  fs.writeFileSync(path.join(CONFLICT_PROJECT_DIR, "pass185-conflict.txt"), "pass185 baseline\n", "utf8");
  initRepo(CONFLICT_PROJECT_DIR);
  runGit(CONFLICT_PROJECT_DIR, ["add", "package.json", "pass185-conflict.txt"]);
  runGit(CONFLICT_PROJECT_DIR, ["commit", "-m", "pass185 baseline"]);
  runGit(CONFLICT_PROJECT_DIR, ["checkout", "-b", "pass185-other"]);
  fs.writeFileSync(path.join(CONFLICT_PROJECT_DIR, "pass185-conflict.txt"), "pass185 other branch\n", "utf8");
  runGit(CONFLICT_PROJECT_DIR, ["add", "pass185-conflict.txt"]);
  runGit(CONFLICT_PROJECT_DIR, ["commit", "-m", "pass185 other edit"]);
  runGit(CONFLICT_PROJECT_DIR, ["checkout", "master"]);
  fs.writeFileSync(path.join(CONFLICT_PROJECT_DIR, "pass185-conflict.txt"), "pass185 master branch\n", "utf8");
  runGit(CONFLICT_PROJECT_DIR, ["add", "pass185-conflict.txt"]);
  runGit(CONFLICT_PROJECT_DIR, ["commit", "-m", "pass185 master edit"]);
  const merge = runGit(CONFLICT_PROJECT_DIR, ["merge", "pass185-other"], { allowFailure: true });
  if (merge.status === 0) throw new Error("Expected pass185 merge conflict");
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function writeFakeClaude() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(FAKE_BIN_DIR, "claude.cmd"),
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass185& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass185 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
  return path.join(FAKE_BIN_DIR, "claude.cmd");
}

function writeInitialStore() {
  const fakeClaude = writeFakeClaude();
  const createdAt = "2026-07-07T19:00:00.000Z";
  const dirtyProject = { name: "pass185-dirty", path: DIRTY_PROJECT_DIR };
  const conflictProject = { name: "pass185-conflict", path: CONFLICT_PROJECT_DIR };
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
      claudeCode: { executionMode: "claude-code", claudeCommand: fakeClaude, permissionMode: "default" },
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
    activeProject: dirtyProject,
    projects: [dirtyProject, conflictProject],
    sessions: [
      {
        id: "pass185-session",
        title: "Pass185 changes status badge",
        project: dirtyProject.name,
        projectPath: dirtyProject.path,
        createdAt,
        updatedAt: createdAt,
        messages: [],
      },
    ],
    automations: [],
    subagentRuns: [],
    commandRuns: [],
    runEvents: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

async function clickChanges(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.workspace-context-button[data-context-tab="changes"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function switchToConflictProjectAndReload(win) {
  const ok = await win.webContents.executeJavaScript(`
    (async function() {
      const next = await window.claudexDesktop.setActiveProject({
        name: 'pass185-conflict',
        path: ${JSON.stringify(CONFLICT_PROJECT_DIR)}
      });
      return Boolean(next?.activeProject?.path === ${JSON.stringify(CONFLICT_PROJECT_DIR)});
    })();
  `);
  if (!ok) return false;
  win.webContents.reload();
  await wait(1800);
  return true;
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS185_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS185_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS185_CHANGES_BADGE_BACKED_BY_DIRTY_GIT", await waitFor(win, `
    (async function() {
      const env = await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(DIRTY_PROJECT_DIR)} });
      const button = document.querySelector('.workspace-context-button[data-context-tab="changes"][data-status="warning"]');
      const badge = button?.querySelector('.context-tab-badge');
      const aria = button?.getAttribute('aria-label') || '';
      const title = button?.getAttribute('title') || '';
      return Boolean(
        env.git?.available === true &&
        env.git?.changes === 3 &&
        env.git?.summary?.staged === 1 &&
        env.git?.summary?.unstaged === 1 &&
        env.git?.summary?.untracked === 1 &&
        env.git?.summary?.conflicted === 0 &&
        button &&
        badge &&
        badge.textContent.trim() === '3' &&
        /\\u53d8\\u66f4 3/.test(aria) &&
        /\\u5df2\\u6682\\u5b58 1/.test(aria) &&
        /\\u672a\\u6682\\u5b58 1/.test(aria) &&
        /\\u672a\\u8ddf\\u8e2a 1/.test(aria) &&
        /\\u51b2\\u7a81 0/.test(aria) &&
        /\\u53d8\\u66f4 3/.test(title) &&
        button.getBoundingClientRect().width <= 40
      );
    })();
  `, 10000));

  assertStep("PASS185_CLICK_CHANGES_WARNING", await clickChanges(win));
  assertStep("PASS185_CHANGES_PANEL_SHOWS_WARNING_BADGE_AND_BREAKDOWN", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.bottom-work-panel');
      const text = panel?.textContent || '';
      const bottomBadge = document.querySelector('.bottom-panel-tabs button[data-bottom-tab="changes"][data-status="warning"] .context-tab-badge');
      return Boolean(
        panel &&
        document.querySelector('.workspace-context-button[data-context-tab="changes"].active.status-warning') &&
        bottomBadge &&
        bottomBadge.textContent.trim() === '3' &&
        /git status --short --branch/.test(text) &&
        /pass185-tracked\.txt/.test(text) &&
        /pass185-staged\.txt/.test(text) &&
        /pass185-untracked\.txt/.test(text) &&
        /\\u5df2\\u6682\\u5b58\\s*1/.test(text) &&
        /\\u672a\\u6682\\u5b58\\s*1/.test(text) &&
        /\\u672a\\u8ddf\\u8e2a\\s*1/.test(text)
      );
    })();
  `, 8000));

  assertStep("PASS185_SWITCH_TO_CONFLICT_PROJECT", await switchToConflictProjectAndReload(win));
  assertStep("PASS185_RELOADED_CONFLICT_PROJECT", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS185_CHANGES_BADGE_BACKED_BY_CONFLICT_GIT", await waitFor(win, `
    (async function() {
      const env = await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(CONFLICT_PROJECT_DIR)} });
      const button = document.querySelector('.workspace-context-button[data-context-tab="changes"][data-status="error"]');
      const badge = button?.querySelector('.context-tab-badge');
      const aria = button?.getAttribute('aria-label') || '';
      const title = button?.getAttribute('title') || '';
      return Boolean(
        env.git?.available === true &&
        env.git?.changes === 1 &&
        env.git?.summary?.conflicted === 1 &&
        env.git?.summary?.staged === 0 &&
        env.git?.summary?.unstaged === 0 &&
        (env.git?.files || []).some((file) => file.path === 'pass185-conflict.txt' && file.conflict === true && file.staged === false && file.unstaged === false) &&
        button &&
        badge &&
        badge.textContent.trim() === '1' &&
        /\\u53d8\\u66f4 1/.test(aria) &&
        /\\u51b2\\u7a81 1/.test(aria) &&
        !/\\u5df2\\u6682\\u5b58 1/.test(aria) &&
        !/\\u672a\\u6682\\u5b58 1/.test(aria) &&
        /\\u51b2\\u7a81 1/.test(title) &&
        !/\\u5df2\\u6682\\u5b58 1/.test(title) &&
        !/\\u672a\\u6682\\u5b58 1/.test(title) &&
        button.getBoundingClientRect().width <= 40
      );
    })();
  `, 10000));

  assertStep("PASS185_CLICK_CHANGES_ERROR", await clickChanges(win));
  assertStep("PASS185_CHANGES_PANEL_SHOWS_CONFLICT_STATUS", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.bottom-work-panel');
      const text = panel?.textContent || '';
      const bottomBadge = document.querySelector('.bottom-panel-tabs button[data-bottom-tab="changes"][data-status="error"] .context-tab-badge');
      return Boolean(
        panel &&
        document.querySelector('.workspace-context-button[data-context-tab="changes"].active.status-error') &&
        bottomBadge &&
        bottomBadge.textContent.trim() === '1' &&
        /pass185-conflict\.txt/.test(text) &&
        /\\u51b2\\u7a81\\s*1/.test(text) &&
        !/\\u5df2\\u6682\\u5b58\\s*1/.test(text) &&
        !/\\u672a\\u6682\\u5b58\\s*1/.test(text) &&
        /UU/.test(text)
      );
    })();
  `, 8000));

  console.log("PASS185_CHANGES_STATUS_BADGE_DONE");
  cleanup();
  app.exit(0);
}

setupDirtyProject();
setupConflictProject();
app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS185_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (function() {
          const changesButton = document.querySelector('.workspace-context-button[data-context-tab="changes"]');
          const bottomTab = document.querySelector('.bottom-panel-tabs button[data-bottom-tab="changes"]');
          return {
            changesStatus: changesButton?.getAttribute('data-status') || '',
            changesActive: changesButton?.className || '',
            changesAria: changesButton?.getAttribute('aria-label') || '',
            changesTitle: changesButton?.getAttribute('title') || '',
            badge: changesButton?.querySelector('.context-tab-badge')?.textContent || '',
            bottomStatus: bottomTab?.getAttribute('data-status') || '',
            bottomText: document.querySelector('.bottom-work-panel')?.textContent || '',
            bodyText: document.body?.textContent?.slice(0, 4000) || '',
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS185_DEBUG", JSON.stringify(debug, null, 2).slice(0, 8000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS185_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
