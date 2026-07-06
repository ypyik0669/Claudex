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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass145-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass145-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const TARGET_FILE = "pass145-target.txt";
const OTHER_FILE = "pass145-other.txt";

function cleanup() {
  for (const dir of [USER_DATA_DIR, PROJECT_DIR]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_error) {
      // best-effort cleanup
    }
  }
}

function git(args) {
  const result = spawnSync("git", args, {
    cwd: PROJECT_DIR,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
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

function setupGitProject() {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass145-project" }), "utf8");
  fs.writeFileSync(path.join(PROJECT_DIR, TARGET_FILE), "pass145 target baseline\n", "utf8");
  fs.writeFileSync(path.join(PROJECT_DIR, OTHER_FILE), "pass145 other baseline\n", "utf8");
  git(["init"]);
  git(["config", "user.name", "Claudex QA"]);
  git(["config", "user.email", "qa@example.invalid"]);
  git(["add", "package.json", TARGET_FILE, OTHER_FILE]);
  git(["commit", "-m", "pass145 baseline"]);
  fs.writeFileSync(path.join(PROJECT_DIR, TARGET_FILE), "pass145 target baseline\npass145-target-diff-evidence\n", "utf8");
  fs.writeFileSync(path.join(PROJECT_DIR, OTHER_FILE), "pass145 other baseline\npass145-other-diff-evidence\n", "utf8");
}

function writeInitialStore() {
  setupGitProject();
  const project = { name: "pass145-project", path: PROJECT_DIR };
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
      claudeCode: { executionMode: "claude-code", claudeCommand: "claude", permissionMode: "default" },
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
        id: "pass145-session",
        title: "Pass145 command palette all changes reset",
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

async function clickPaletteCommand(win, idPrefix, textNeedle = "") {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) =>
          (candidate.getAttribute('data-command-id') || '').startsWith(${JSON.stringify(idPrefix)}) &&
          (!${JSON.stringify(textNeedle)} || (candidate.textContent || '').includes(${JSON.stringify(textNeedle)}))
        );
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS145_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS145_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS145_ENVIRONMENT_GIT_READY", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(PROJECT_DIR)} });
      return Boolean(
        state?.git?.available &&
        state.git.changes >= 2 &&
        /pass145-target-diff-evidence/.test(state.git.diff?.text || '') &&
        /pass145-other-diff-evidence/.test(state.git.diff?.text || '')
      );
    })();
  `, 15000));

  assertStep("PASS145_OPEN_PALETTE_QUERY_TARGET", await openPaletteAndQuery(win, "pass145-target"));
  assertStep("PASS145_CLICK_TARGET_GIT_COMMAND", await clickPaletteCommand(win, "git-file:", TARGET_FILE));
  assertStep("PASS145_TARGET_FILE_FOCUSED_FROM_PALETTE", await waitFor(win, `
    (function() {
      const active = document.querySelector('.bottom-panel-tabs button.active')?.textContent || '';
      const selected = document.querySelector('.git-change-item.selected')?.textContent || '';
      const preview = document.querySelector('.git-diff-preview')?.textContent || '';
      const panel = document.querySelector('.git-selected-evidence-panel')?.textContent || '';
      return /\\u53d8\\u66f4/.test(active) &&
        /${TARGET_FILE}/.test(selected) &&
        /pass145-target-diff-evidence/.test(preview) &&
        !/pass145-other-diff-evidence/.test(preview) &&
        /${TARGET_FILE}/.test(panel);
    })();
  `, 10000));

  assertStep("PASS145_OPEN_PALETTE_QUERY_ALL_CHANGES", await openPaletteAndQuery(win, "changes git diff status"));
  assertStep("PASS145_CLICK_ALL_CHANGES_COMMAND", await clickPaletteCommand(win, "panel-changes"));
  assertStep("PASS145_ALL_CHANGES_RESET_FROM_PALETTE", await waitFor(win, `
    (function() {
      const active = document.querySelector('.bottom-panel-tabs button.active')?.textContent || '';
      const selected = document.querySelector('.git-change-item.selected')?.textContent || '';
      const preview = document.querySelector('.git-diff-preview')?.textContent || '';
      const panel = document.querySelector('.git-selected-evidence-panel')?.textContent || '';
      return /\\u53d8\\u66f4/.test(active) &&
        /\\u5168\\u90e8\\u53d8\\u66f4/.test(selected) &&
        /pass145-target-diff-evidence/.test(preview) &&
        /pass145-other-diff-evidence/.test(preview) &&
        /\\u5168\\u90e8\\u53d8\\u66f4/.test(panel);
    })();
  `, 10000));

  console.log("PASS145_COMMAND_PALETTE_ALL_CHANGES_RESET_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS145_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS145_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
