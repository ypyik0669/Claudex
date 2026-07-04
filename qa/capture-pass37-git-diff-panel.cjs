const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { app, BrowserWindow } = require("electron");

const PROJECT_PATH = path.join(__dirname, "..");
const QA_DIR = path.join(PROJECT_PATH, "qa");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass37-data-"));
const GIT_PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass37-git-"));
const TARGET_FILE = "pass37-target.txt";
const BASE_CONTENT = "pass37 baseline\n";
const EDITED_CONTENT = "pass37 baseline\npass37-diff-evidence\n";

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
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, TARGET_FILE), BASE_CONTENT, "utf8");
  runGit(["init"]);
  runGit(["add", TARGET_FILE]);
  runGit(["-c", "user.name=Claudex QA", "-c", "user.email=qa@example.invalid", "commit", "-m", "baseline"]);
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, TARGET_FILE), EDITED_CONTENT, "utf8");
}

function cleanup() {
  try {
    fs.rmSync(GIT_PROJECT_DIR, { recursive: true, force: true });
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
      activeProject: { name: "pass37-git-project", path: GIT_PROJECT_DIR },
      projects: [{ name: "pass37-git-project", path: GIT_PROJECT_DIR }],
      sessions: [
        {
          id: "default",
          title: "Git diff panel",
          project: "pass37-git-project",
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
    console.error("PASS37_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS37_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid'))", 15000));
  assertStep("PASS37_CHANGES_CLICK", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelectorAll('.workspace-context-button')[2];
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS37_DIFF_VISIBLE", await waitFor(win, `
    Boolean(
      document.querySelector('.git-diff-preview') &&
      document.querySelector('.git-diff-row.meta') &&
      document.querySelector('.git-diff-row.hunk') &&
      document.querySelector('.git-diff-row.add') &&
      /diff --git/.test(document.querySelector('.git-diff-preview')?.textContent || '') &&
      /pass37-diff-evidence/.test(document.querySelector('.git-diff-preview')?.textContent || '') &&
      /${TARGET_FILE}/.test(document.querySelector('.git-change-list')?.textContent || '')
    )
  `, 10000));
  await shot(win, "pass37-git-diff-panel.png");

  console.log("PASS37_DONE");
  cleanup();
  app.exit(0);
}).catch((error) => {
  console.error("PASS37_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS37_TIMEOUT");
  cleanup();
  app.exit(1);
}, 70000);
