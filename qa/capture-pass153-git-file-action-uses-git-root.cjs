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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass153-data-"));
const REPO_PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass153-repo-"));
const ACTIVE_PROJECT_DIR = path.join(REPO_PROJECT_DIR, "packages", "app");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const TARGET_RELATIVE = "shared/pass153-stage-target.txt";
const ACTIVE_SHADOW_RELATIVE = "shared/pass153-stage-target.txt";
const TARGET_FILE = path.join(REPO_PROJECT_DIR, TARGET_RELATIVE);
const ACTIVE_SHADOW_FILE = path.join(ACTIVE_PROJECT_DIR, ACTIVE_SHADOW_RELATIVE);

function cleanup() {
  for (const dir of [USER_DATA_DIR, REPO_PROJECT_DIR]) {
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

function git(args) {
  execFileSync("git", args, { cwd: REPO_PROJECT_DIR, stdio: "ignore" });
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
  fs.mkdirSync(path.dirname(ACTIVE_SHADOW_FILE), { recursive: true });
  fs.writeFileSync(path.join(REPO_PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass153-repo-project" }), "utf8");
  fs.writeFileSync(path.join(ACTIVE_PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass153-active-app" }), "utf8");
  fs.writeFileSync(TARGET_FILE, "pass153 baseline repo-root file\n", "utf8");
  fs.writeFileSync(ACTIVE_SHADOW_FILE, "pass153 active shadow baseline\n", "utf8");
  git(["init"]);
  git(["config", "user.name", "Claudex QA"]);
  git(["config", "user.email", "qa@example.invalid"]);
  git(["add", "."]);
  git(["commit", "-m", "pass153 baseline"]);
  fs.writeFileSync(TARGET_FILE, "pass153 baseline repo-root file\npass153 staged-from-git-root evidence\n", "utf8");

  const activeProject = { name: "pass153-active-app", path: ACTIVE_PROJECT_DIR };
  const repoProject = { name: "pass153-repo-project", path: REPO_PROJECT_DIR };
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
      id: "pass153-session",
      title: "Pass153 git file action cwd",
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

async function clickGitFileCommand(win, fileName) {
  return win.webContents.executeJavaScript(`
    (async function() {
      const modal = document.querySelector('.command-modal');
      if (!modal) return false;
      const button = [...modal.querySelectorAll('.command-list button')]
        .find((candidate) =>
          (candidate.getAttribute('data-command-id') || '').startsWith('git-file:') &&
          (candidate.textContent || '').includes(${JSON.stringify(fileName)})
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
  if (!win) throw new Error("PASS153_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS153_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS153_ENVIRONMENT_UNSTAGED_READY", await waitFor(win, `
    (async function() {
      const env = await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(ACTIVE_PROJECT_DIR)} });
      const file = (env?.git?.files || []).find((item) => item.path === ${JSON.stringify(TARGET_RELATIVE)});
      return Boolean(env?.git?.available && env.git.root === ${JSON.stringify(REPO_PROJECT_DIR)} && file && /^\\s*M/.test(file.status || ''));
    })();
  `, 10000));
  assertStep("PASS153_OPEN_PALETTE_QUERY_GIT_FILE", await openPaletteAndQuery(win, "pass153-stage-target"));
  assertStep("PASS153_CLICK_GIT_FILE_COMMAND", await clickGitFileCommand(win, TARGET_RELATIVE));
  assertStep("PASS153_GIT_FILE_EVIDENCE_SELECTED", await waitFor(win, `
    Boolean(
      /变更/.test(document.querySelector('.workspace-context-button.active')?.textContent || '') &&
      /${TARGET_RELATIVE.replace(/\//g, "\\/")}/.test(document.querySelector('.git-selected-evidence-panel')?.textContent || '')
    )
  `, 10000));
  assertStep("PASS153_CLICK_STAGE_FILE", await win.webContents.executeJavaScript(`
    (function() {
      window.confirm = () => true;
      const panel = document.querySelector('.git-selected-evidence-panel');
      const button = panel?.querySelector('[data-git-action="stage-file"]') || [...(panel?.querySelectorAll('button') || [])]
        .find((candidate) => /暂存文件/.test(candidate.title || candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS153_STAGE_USED_GIT_ROOT", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const env = await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(ACTIVE_PROJECT_DIR)} });
      const file = (env?.git?.files || []).find((item) => item.path === ${JSON.stringify(TARGET_RELATIVE)});
      const runs = state.commandRuns || [];
      const events = state.runEvents || [];
      return Boolean(
        file && /^M/.test(file.status || '') &&
        runs.some((run) => /git add --/.test(run.command || '') && /pass153-stage-target/.test(run.command || '') && run.cwd === ${JSON.stringify(REPO_PROJECT_DIR)} && run.code === 0) &&
        events.some((event) => event.type === 'git-command' && event.status === 'ok' && event.cwd === ${JSON.stringify(REPO_PROJECT_DIR)})
      );
    })();
  `, 12000));

  console.log("PASS153_GIT_FILE_ACTION_USES_GIT_ROOT_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS153_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS153_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
