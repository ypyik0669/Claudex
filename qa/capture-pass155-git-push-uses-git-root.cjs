const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { app, BrowserWindow } = require("electron");

function findRepoDir() {
  const candidates = [process.env.CLAUDEX_REPO_DIR, process.cwd(), __dirname, path.join(__dirname, "..")].filter(Boolean);
  for (const candidate of candidates) {
    let current = path.resolve(candidate);
    while (current && current !== path.dirname(current)) {
      if (fs.existsSync(path.join(current, "package.json")) && fs.existsSync(path.join(current, "electron", "main.cjs"))) return current;
      current = path.dirname(current);
    }
  }
  throw new Error("Unable to locate Claudex repo root");
}

const REPO_DIR = findRepoDir();
process.chdir(REPO_DIR);

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass155-data-"));
const REPO_PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass155-repo-"));
const REMOTE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass155-remote-"));
const ACTIVE_PROJECT_DIR = path.join(REPO_PROJECT_DIR, "packages", "app");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const TARGET_RELATIVE = "shared/pass155-push-target.txt";
const TARGET_FILE = path.join(REPO_PROJECT_DIR, TARGET_RELATIVE);
const PUSH_MESSAGE = "pass155 push from git root";

function cleanup() {
  for (const dir of [USER_DATA_DIR, REPO_PROJECT_DIR, REMOTE_DIR]) {
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

function git(args, options = {}) {
  return execFileSync("git", args, { cwd: REPO_PROJECT_DIR, stdio: options.stdio || "pipe", encoding: options.encoding || "utf8" });
}

function gitRaw(args, options = {}) {
  return execFileSync("git", args, { stdio: options.stdio || "pipe", encoding: options.encoding || "utf8" });
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

function writeInitialStore() {
  fs.mkdirSync(path.dirname(TARGET_FILE), { recursive: true });
  fs.mkdirSync(ACTIVE_PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPO_PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass155-repo-project" }), "utf8");
  fs.writeFileSync(path.join(ACTIVE_PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass155-active-app" }), "utf8");
  fs.writeFileSync(TARGET_FILE, "pass155 baseline repo-root file\n", "utf8");
  gitRaw(["init", "--bare", REMOTE_DIR], { stdio: "ignore" });
  git(["init"], { stdio: "ignore" });
  git(["config", "user.name", "Claudex QA"], { stdio: "ignore" });
  git(["config", "user.email", "qa@example.invalid"], { stdio: "ignore" });
  git(["add", "."], { stdio: "ignore" });
  git(["commit", "-m", "pass155 baseline"], { stdio: "ignore" });
  git(["branch", "-M", "main"], { stdio: "ignore" });
  git(["remote", "add", "origin", REMOTE_DIR], { stdio: "ignore" });
  git(["push", "-u", "origin", "main"], { stdio: "ignore" });
  fs.writeFileSync(TARGET_FILE, "pass155 baseline repo-root file\npass155 local ahead evidence\n", "utf8");
  git(["add", TARGET_RELATIVE], { stdio: "ignore" });
  git(["commit", "-m", PUSH_MESSAGE], { stdio: "ignore" });

  const activeProject = { name: "pass155-active-app", path: ACTIVE_PROJECT_DIR };
  const repoProject = { name: "pass155-repo-project", path: REPO_PROJECT_DIR };
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
    activeProject,
    projects: [activeProject, repoProject],
    sessions: [{
      id: "pass155-session",
      title: "Pass155 git push cwd",
      project: activeProject.name,
      projectPath: ACTIVE_PROJECT_DIR,
      createdAt: "2026-07-07T00:00:00.000Z",
      updatedAt: "2026-07-07T00:00:00.000Z",
      messages: [],
    }],
    commandRuns: [],
    runEvents: [],
    automations: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

async function openPanel(win, labelPattern) {
  return win.webContents.executeJavaScript(`
    (function() {
      const pattern = new RegExp(${JSON.stringify(labelPattern)});
      const candidates = [...document.querySelectorAll('.workspace-context-button, .bottom-panel-tabs button')];
      const preferredTab = /\\\\u53d8\\\\u66f4|\\u53d8\\u66f4|Changes/i.test(${JSON.stringify(labelPattern)}) ? 'changes' : '';
      const button = candidates.find((candidate) =>
          preferredTab &&
          (candidate.getAttribute('data-context-tab') === preferredTab || candidate.getAttribute('data-bottom-tab') === preferredTab)
        ) || candidates
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
  if (!win) throw new Error("PASS155_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS155_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS155_ENVIRONMENT_AHEAD_READY", await waitFor(win, `
    (async function() {
      const env = await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(ACTIVE_PROJECT_DIR)} });
      return Boolean(
        env?.git?.available &&
        env.git.root === ${JSON.stringify(REPO_PROJECT_DIR)} &&
        /packages\\/app|packages\\\\app/.test(env.git.relativePath || '') &&
        /origin\\/main/.test(env.git.upstream || '') &&
        Number(env.git.ahead || 0) >= 1
      );
    })();
  `, 10000));
  assertStep("PASS155_OPEN_CHANGES", await openPanel(win, "\\u53d8\\u66f4|Changes"));
  assertStep("PASS155_PUSH_CONTROL_READY", await waitFor(win, `
    Boolean(
      document.querySelector('.git-repo-actions [data-git-action="push"]') &&
      !document.querySelector('.git-repo-actions [data-git-action="push"]').disabled
    )
  `, 10000));
  assertStep("PASS155_CLICK_PUSH", await win.webContents.executeJavaScript(`
    (function() {
      window.confirm = () => true;
      const button = document.querySelector('.git-repo-actions [data-git-action="push"]');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS155_PUSH_USED_GIT_ROOT", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const env = await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(ACTIVE_PROJECT_DIR)} });
      const runs = state.commandRuns || [];
      const events = state.runEvents || [];
      return Boolean(
        Number(env?.git?.ahead || 0) === 0 &&
        runs.some((run) => /^git push$/.test(run.command || '') && run.cwd === ${JSON.stringify(REPO_PROJECT_DIR)} && run.code === 0) &&
        events.some((event) => event.type === 'git-command' && event.status === 'ok' && event.cwd === ${JSON.stringify(REPO_PROJECT_DIR)} && /Git:/.test(event.title || ''))
      );
    })();
  `, 15000));
  const remoteSubject = gitRaw(["--git-dir", REMOTE_DIR, "log", "-1", "--pretty=%s", "refs/heads/main"]).trim();
  assertStep("PASS155_REMOTE_UPDATED", remoteSubject === PUSH_MESSAGE);

  console.log("PASS155_GIT_PUSH_USES_GIT_ROOT_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS155_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS155_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
