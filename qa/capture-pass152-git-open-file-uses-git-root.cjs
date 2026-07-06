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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass152-data-"));
const REPO_PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass152-repo-"));
const ACTIVE_PROJECT_DIR = path.join(REPO_PROJECT_DIR, "packages", "app");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const TARGET_RELATIVE = "shared/pass152-root-target.txt";
const ACTIVE_SHADOW_RELATIVE = "shared/pass152-root-target.txt";
const TARGET_FILE = path.join(REPO_PROJECT_DIR, TARGET_RELATIVE);
const ACTIVE_SHADOW_FILE = path.join(ACTIVE_PROJECT_DIR, ACTIVE_SHADOW_RELATIVE);
const TARGET_CONTENT = "pass152 correct repo-root git changed file\n";
const ACTIVE_SHADOW_CONTENT = "pass152 wrong active-project shadow file\n";

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
  fs.writeFileSync(path.join(REPO_PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass152-repo-project" }), "utf8");
  fs.writeFileSync(path.join(ACTIVE_PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass152-active-app" }), "utf8");
  fs.writeFileSync(TARGET_FILE, "pass152 baseline repo-root git file\n", "utf8");
  fs.writeFileSync(ACTIVE_SHADOW_FILE, ACTIVE_SHADOW_CONTENT, "utf8");
  git(["init"]);
  git(["config", "user.name", "Claudex QA"]);
  git(["config", "user.email", "qa@example.invalid"]);
  git(["add", "."]);
  git(["commit", "-m", "pass152 baseline"]);
  fs.writeFileSync(TARGET_FILE, TARGET_CONTENT, "utf8");

  const activeProject = { name: "pass152-active-app", path: ACTIVE_PROJECT_DIR };
  const repoProject = { name: "pass152-repo-project", path: REPO_PROJECT_DIR };
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
    sessions: [
      {
        id: "pass152-session",
        title: "Pass152 git root workspace open",
        project: activeProject.name,
        projectPath: ACTIVE_PROJECT_DIR,
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

async function clickGitOpenFileCommand(win, fileName) {
  return win.webContents.executeJavaScript(`
    (async function() {
      const modal = document.querySelector('.command-modal');
      if (!modal) return false;
      const button = [...modal.querySelectorAll('.command-list button')]
        .find((candidate) =>
          (candidate.getAttribute('data-command-id') || '').startsWith('git-open-file:') &&
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
  if (!win) throw new Error("PASS152_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS152_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS152_ENVIRONMENT_GIT_ROOT_READY", await waitFor(win, `
    (async function() {
      const env = await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(ACTIVE_PROJECT_DIR)} });
      const files = env?.git?.files || [];
      return Boolean(
        env?.git?.available &&
        env.git.root === ${JSON.stringify(REPO_PROJECT_DIR)} &&
        /packages\\/app|packages\\\\app/.test(env.git.relativePath || '') &&
        files.some((file) => file.path === ${JSON.stringify(TARGET_RELATIVE)}) &&
        !files.some((file) => file.path === ${JSON.stringify(`packages/app/${ACTIVE_SHADOW_RELATIVE}`)})
      );
    })();
  `, 10000));
  assertStep("PASS152_OPEN_PALETTE_QUERY_GIT_WORKSPACE", await openPaletteAndQuery(win, "workspace open shared/pass152-root-target"));
  assertStep("PASS152_GIT_OPEN_FILE_COMMAND_VISIBLE", await waitFor(win, `
    Boolean([...document.querySelectorAll('.command-modal .command-list button')].some((button) =>
      (button.getAttribute('data-command-id') || '').startsWith('git-open-file:') &&
      /shared\\/pass152-root-target/.test(button.textContent || '') &&
      /workspace/i.test(button.textContent || '')
    ))
  `, 5000));
  assertStep("PASS152_CLICK_GIT_OPEN_FILE_COMMAND", await clickGitOpenFileCommand(win, TARGET_RELATIVE));
  assertStep("PASS152_GIT_OPENED_REPO_ROOT_WORKSPACE_FILE", await waitFor(win, `
    (async function() {
      const textarea = document.querySelector('.file-editor textarea');
      const editor = document.querySelector('.file-editor')?.textContent || '';
      const state = await window.claudexDesktop.getState();
      return Boolean(
        textarea &&
        textarea.getAttribute('aria-label') === ${JSON.stringify(TARGET_RELATIVE)} &&
        textarea.value.includes(${JSON.stringify(TARGET_CONTENT.trim())}) &&
        !textarea.value.includes(${JSON.stringify(ACTIVE_SHADOW_CONTENT.trim())}) &&
        editor.includes(${JSON.stringify(TARGET_RELATIVE)}) &&
        state.sourceRefs?.some((source) =>
          source.path === ${JSON.stringify(TARGET_RELATIVE)} &&
          source.project?.path === ${JSON.stringify(REPO_PROJECT_DIR)}
        )
      );
    })()
  `, 12000));

  console.log("PASS152_GIT_OPEN_FILE_USES_GIT_ROOT_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS152_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS152_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
