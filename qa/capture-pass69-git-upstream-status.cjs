const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { app, BrowserWindow } = require("electron");

const PROJECT_PATH = path.join(__dirname, "..");
const QA_DIR = path.join(PROJECT_PATH, "qa");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass69-data-"));
const GIT_PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass69-git-"));
const REMOTE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass69-remote-"));
const TARGET_FILE = "pass69-target.txt";

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

function setupGitProject() {
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, TARGET_FILE), "pass69 baseline\n", "utf8");
  runGit(["init"]);
  runGit(["config", "user.name", "Claudex QA"]);
  runGit(["config", "user.email", "qa@example.invalid"]);
  runGit(["add", TARGET_FILE]);
  runGit(["commit", "-m", "baseline"]);
  const remote = spawnSync("git", ["init", "--bare", REMOTE_DIR], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (remote.status !== 0) {
    throw new Error(`git init --bare failed: ${remote.stderr || remote.stdout}`);
  }
  runGit(["remote", "add", "origin", REMOTE_DIR]);
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, TARGET_FILE), "pass69 baseline\npass69 dirty\n", "utf8");
}

function cleanup() {
  try {
    fs.rmSync(GIT_PROJECT_DIR, { recursive: true, force: true });
  } catch (_error) {
    // best-effort cleanup
  }
  try {
    fs.rmSync(REMOTE_DIR, { recursive: true, force: true });
  } catch (_error) {
    // best-effort cleanup
  }
  try {
    fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
  } catch (_error) {
    // best-effort cleanup
  }
}

setupGitProject();
app.setPath("userData", USER_DATA_DIR);

fs.mkdirSync(USER_DATA_DIR, { recursive: true });
fs.writeFileSync(
  path.join(USER_DATA_DIR, "desktop-data.json"),
  JSON.stringify(
    {
      version: 1,
      activeProject: { name: "pass69-no-upstream", path: GIT_PROJECT_DIR },
      projects: [{ name: "pass69-no-upstream", path: GIT_PROJECT_DIR }],
      sessions: [
        {
          id: "default",
          title: "Git upstream status",
          project: "pass69-no-upstream",
          projectPath: GIT_PROJECT_DIR,
          createdAt: "2026-07-05T00:00:00.000Z",
          updatedAt: "2026-07-05T00:00:00.000Z",
          messages: [],
        },
      ],
    },
    null,
    2,
  ),
  "utf8",
);

require(path.join(PROJECT_PATH, "electron", "main.cjs"));

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

async function shot(win, name) {
  await win.webContents.executeJavaScript("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  await wait(250);
  const image = await win.webContents.capturePage();
  const outPath = path.join(QA_DIR, name);
  fs.writeFileSync(outPath, image.toPNG());
  console.log("CAPTURED", outPath);
}

function assertStep(name, ok) {
  console.log(name, ok);
  if (!ok) throw new Error(`${name} failed`);
}

app.whenReady().then(async () => {
  fs.mkdirSync(QA_DIR, { recursive: true });
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.error("PASS69_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS69_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid'))", 15000));
  assertStep("PASS69_CHANGES_CLICK", await win.webContents.executeJavaScript(`
    (function() {
      const button = Array.from(document.querySelectorAll('.workspace-context-button, .bottom-panel-tabs button'))
        .find((item) => /\\u53d8\\u66f4/.test(item.textContent || '') || (item.getAttribute('aria-label') || '').includes('\\u53d8\\u66f4'));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS69_NO_UPSTREAM_VISIBLE", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.git-selected-evidence-panel')?.textContent || '';
      const repoActions = document.querySelector('.git-repo-actions')?.textContent || '';
      const header = document.querySelector('.bottom-panel-grid')?.textContent || '';
      return /无 upstream/.test(panel) &&
        /origin/.test(panel) &&
        /无 upstream/.test(header) &&
        /无 upstream，先在终端设置远端/.test(repoActions);
    })()
  `, 10000));
  assertStep("PASS69_PUSH_DISABLED_WITH_REASON", await win.webContents.executeJavaScript(`
    (function() {
      const button = Array.from(document.querySelectorAll('.git-repo-action-buttons button'))
        .find((item) => /推送分支/.test(item.textContent || ''));
      return Boolean(button && button.disabled && /无 upstream/.test(button.title || ''));
    })();
  `));
  assertStep("PASS69_ENVIRONMENT_UPSTREAM_STATUS", await waitFor(win, `
    (function() {
      const rows = document.querySelector('.environment-card')?.textContent || '';
      return /提交或推送/.test(rows) && /无 upstream/.test(rows);
    })()
  `, 5000));
  await shot(win, "pass69-git-upstream-status.png");

  console.log("PASS69_DONE");
  cleanup();
  app.exit(0);
}).catch((error) => {
  console.error("PASS69_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS69_TIMEOUT");
  cleanup();
  app.exit(1);
}, 70000);
