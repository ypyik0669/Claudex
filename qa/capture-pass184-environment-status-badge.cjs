const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass184-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass184-repo-"));
const MISSING_PROJECT_DIR = path.join(os.tmpdir(), `claudex-pass184-missing-${Date.now()}`);
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass184-bin-"));
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

function git(args) {
  execFileSync("git", args, { cwd: PROJECT_DIR, stdio: "ignore" });
}

function writeInitialStore() {
  fs.mkdirSync(path.join(PROJECT_DIR, "src"), { recursive: true });
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass184-project", version: "1.0.0" }, null, 2), "utf8");
  fs.writeFileSync(path.join(PROJECT_DIR, "src", "tracked.txt"), "pass184 tracked initial\n", "utf8");
  git(["init"]);
  git(["config", "user.email", "pass184@example.invalid"]);
  git(["config", "user.name", "Pass184 QA"]);
  git(["add", "package.json", "src/tracked.txt"]);
  git(["commit", "-m", "pass184 initial"]);
  fs.writeFileSync(path.join(PROJECT_DIR, "src", "tracked.txt"), "pass184 tracked modified\n", "utf8");
  fs.writeFileSync(path.join(PROJECT_DIR, "src", "untracked.txt"), "pass184 untracked evidence\n", "utf8");

  fs.writeFileSync(
    path.join(FAKE_BIN_DIR, "claude.cmd"),
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass184& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass184 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  const fakeClaude = path.join(FAKE_BIN_DIR, "claude.cmd");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;

  const createdAt = "2026-07-07T18:00:00.000Z";
  const project = { name: "pass184-project", path: PROJECT_DIR };
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
    activeProject: project,
    projects: [project],
    sessions: [
      {
        id: "pass184-session",
        title: "Pass184 environment status badge",
        project: project.name,
        projectPath: project.path,
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

async function clickEnvironment(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.workspace-context-button[data-context-tab="environment"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function switchToMissingProjectAndReload(win) {
  const ok = await win.webContents.executeJavaScript(`
    (async function() {
      const next = await window.claudexDesktop.setActiveProject({
        name: 'Pass184 Missing Project',
        path: ${JSON.stringify(MISSING_PROJECT_DIR)}
      });
      return Boolean(next?.activeProject?.path === ${JSON.stringify(MISSING_PROJECT_DIR)});
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
  if (!win) throw new Error("PASS184_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS184_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS184_ENV_BADGE_BACKED_BY_DIRTY_GIT", await waitFor(win, `
    (async function() {
      const env = await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(PROJECT_DIR)} });
      const button = document.querySelector('.workspace-context-button[data-context-tab="environment"][data-status="warning"]');
      const badge = button?.querySelector('.context-tab-badge');
      const aria = button?.getAttribute('aria-label') || '';
      const title = button?.getAttribute('title') || '';
      return Boolean(
        env.projectExists === true &&
        env.projectMissing === false &&
        env.git?.available === true &&
        env.git?.changes === 2 &&
        (env.git?.files || []).some((file) => file.path === 'src/tracked.txt') &&
        (env.git?.files || []).some((file) => file.path === 'src/untracked.txt') &&
        button &&
        badge &&
        badge.textContent.trim() === '2' &&
        /\\u53d8\\u66f4 2/.test(aria) &&
        /\\u540c\\u6b65/.test(aria) &&
        /Git /.test(aria) &&
        /\\u53d8\\u66f4 2/.test(title) &&
        button.getBoundingClientRect().width <= 40
      );
    })();
  `, 10000));

  assertStep("PASS184_CLICK_ENVIRONMENT_WARNING", await clickEnvironment(win));
  assertStep("PASS184_ENVIRONMENT_PANEL_SHOWS_GIT_EVIDENCE", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.bottom-work-panel');
      const text = panel?.textContent || '';
      const bottomBadge = document.querySelector('.bottom-panel-tabs button[data-bottom-tab="environment"][data-status="warning"] .context-tab-badge');
      return Boolean(
        panel &&
        document.querySelector('.workspace-context-button[data-context-tab="environment"].active.status-warning') &&
        bottomBadge &&
        bottomBadge.textContent.trim() === '2' &&
        /Git \\u6839\\u76ee\\u5f55/.test(text) &&
        /\\u53d8\\u66f4/.test(text) &&
        /2/.test(text)
      );
    })();
  `, 8000));

  assertStep("PASS184_SWITCH_TO_MISSING_PROJECT", await switchToMissingProjectAndReload(win));
  assertStep("PASS184_RELOADED_MISSING_PROJECT", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS184_ENV_BADGE_BACKED_BY_MISSING_PROJECT", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const env = await window.claudexDesktop.getEnvironment({ projectPath: state.activeProject?.path });
      const button = document.querySelector('.workspace-context-button[data-context-tab="environment"][data-status="error"]');
      const badge = button?.querySelector('.context-tab-badge');
      const aria = button?.getAttribute('aria-label') || '';
      return Boolean(
        state.activeProject?.path === ${JSON.stringify(MISSING_PROJECT_DIR)} &&
        env.projectExists === false &&
        env.projectMissing === true &&
        button &&
        badge &&
        badge.textContent.trim() === '!' &&
        /\\u8def\\u5f84\\u5931\\u6548/.test(aria) &&
        aria.includes(${JSON.stringify(MISSING_PROJECT_DIR)}) &&
        button.getBoundingClientRect().width <= 40
      );
    })();
  `, 10000));

  assertStep("PASS184_CLICK_ENVIRONMENT_ERROR", await clickEnvironment(win));
  assertStep("PASS184_ENVIRONMENT_PANEL_SHOWS_MISSING_PATH", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.bottom-work-panel');
      const missingPathWarning = panel?.querySelector('.project-path-warning-inline');
      return Boolean(
        panel &&
        document.querySelector('.workspace-context-button[data-context-tab="environment"].active.status-error') &&
        missingPathWarning &&
        (missingPathWarning.getAttribute('title') || '').includes(${JSON.stringify(MISSING_PROJECT_DIR)})
      );
    })();
  `, 8000));

  console.log("PASS184_ENVIRONMENT_STATUS_BADGE_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS184_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (function() {
          const envButton = document.querySelector('.workspace-context-button[data-context-tab="environment"]');
          const bottomTab = document.querySelector('.bottom-panel-tabs button[data-bottom-tab="environment"]');
          return {
            envStatus: envButton?.getAttribute('data-status') || '',
            envActive: envButton?.className || '',
            envAria: envButton?.getAttribute('aria-label') || '',
            bottomStatus: bottomTab?.getAttribute('data-status') || '',
            bottomActive: bottomTab?.className || '',
            bottomText: document.querySelector('.bottom-work-panel')?.textContent || '',
            bodyText: document.body?.textContent?.slice(0, 4000) || '',
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS184_DEBUG", JSON.stringify(debug, null, 2).slice(0, 8000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS184_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
