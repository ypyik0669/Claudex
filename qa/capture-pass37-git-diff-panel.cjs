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
const SECOND_FILE = "pass37-second.txt";
const UNTRACKED_FILE = "pass37-untracked.txt";
const BASE_CONTENT = "pass37 baseline\n";
const EDITED_CONTENT = "pass37 baseline\npass37-diff-evidence\n";
const SECOND_BASE_CONTENT = "pass37 second baseline\n";
const SECOND_EDITED_CONTENT = "pass37 second baseline\npass37-second-evidence\n";
const UNTRACKED_CONTENT = "pass37 untracked evidence\n";

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
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, SECOND_FILE), SECOND_BASE_CONTENT, "utf8");
  runGit(["init"]);
  runGit(["add", TARGET_FILE, SECOND_FILE]);
  runGit(["-c", "user.name=Claudex QA", "-c", "user.email=qa@example.invalid", "commit", "-m", "baseline"]);
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, TARGET_FILE), EDITED_CONTENT, "utf8");
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, SECOND_FILE), SECOND_EDITED_CONTENT, "utf8");
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, UNTRACKED_FILE), UNTRACKED_CONTENT, "utf8");
  runGit(["add", SECOND_FILE]);
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
  await win.webContents.executeJavaScript("window.confirm = () => true; true;");
  assertStep("PASS37_CHANGES_CLICK", await win.webContents.executeJavaScript(`
    (function() {
      const button = Array.from(document.querySelectorAll('.workspace-context-button, .bottom-panel-tabs button'))
        .find((item) => /\\u53d8\\u66f4/.test(item.textContent || '') || (item.getAttribute('aria-label') || '').includes('\\u53d8\\u66f4'));
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
      /pass37-second-evidence/.test(document.querySelector('.git-diff-preview')?.textContent || '') &&
      /pass37 untracked evidence/.test(document.querySelector('.git-diff-preview')?.textContent || '') &&
      /已暂存\\s*1/.test(document.querySelector('.git-change-summary')?.textContent || '') &&
      /未暂存\\s*1/.test(document.querySelector('.git-change-summary')?.textContent || '') &&
      /未跟踪\\s*1/.test(document.querySelector('.git-change-summary')?.textContent || '') &&
      /git status --short --branch/.test(document.querySelector('.git-change-summary')?.textContent || '') &&
      /${TARGET_FILE}/.test(document.querySelector('.git-change-list')?.textContent || '') &&
      /${SECOND_FILE}/.test(document.querySelector('.git-change-list')?.textContent || '') &&
      /${UNTRACKED_FILE}/.test(document.querySelector('.git-change-list')?.textContent || '') &&
      /\\+\\d+ -\\d+/.test(document.querySelector('.git-change-list')?.textContent || '')
    )
  `, 10000));
  assertStep("PASS37_FILE_FOCUS_CLICK", await win.webContents.executeJavaScript(`
    (function() {
      const button = Array.from(document.querySelectorAll('.git-change-item'))
        .find((item) => /${SECOND_FILE}/.test(item.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS37_FILE_FOCUS_DIFF", await waitFor(win, `
    (function() {
      const preview = document.querySelector('.git-diff-preview')?.textContent || '';
      const selected = document.querySelector('.git-change-item.selected')?.textContent || '';
      return /${SECOND_FILE}/.test(selected) &&
        /${SECOND_FILE}/.test(preview) &&
        /pass37-second-evidence/.test(preview) &&
        !/pass37-diff-evidence/.test(preview);
    })()
  `, 5000));
  assertStep("PASS37_SELECTED_EVIDENCE_PANEL", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.git-selected-evidence-panel')?.textContent || '';
      return /文件证据/.test(panel) &&
        /${SECOND_FILE}/.test(panel) &&
        /已暂存/.test(panel) &&
        /\\+1 -0/.test(panel) &&
        /pass37-second-evidence/.test(panel) &&
        /复制 Git 证据/.test(panel);
    })()
  `, 5000));
  assertStep("PASS37_COPY_GIT_EVIDENCE", await waitFor(win, `
    (async function() {
      const button = Array.from(document.querySelectorAll('.git-selected-evidence-panel button'))
        .find((item) => /复制 Git 证据/.test(item.textContent || ''));
      if (!button) return false;
      if (!window.__pass37CopiedGitEvidence) {
        window.__pass37CopiedGitEvidence = true;
        button.click();
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      return /已复制/.test(document.body.textContent || '');
    })()
  `, 5000));
  assertStep("PASS37_UNSTAGE_CLICK", await win.webContents.executeJavaScript(`
    (function() {
      const button = Array.from(document.querySelectorAll('.git-selected-evidence-panel button'))
        .find((item) => /取消暂存/.test(item.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS37_UNSTAGE_COMMAND_EVIDENCE", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const runs = state.commandRuns || [];
      const events = state.runEvents || [];
      const summary = document.querySelector('.git-change-summary')?.textContent || '';
      const panel = document.querySelector('.git-selected-evidence-panel')?.textContent || '';
      const selected = document.querySelector('.git-change-item.selected')?.textContent || '';
      return runs.some((run) => /git restore --staged/.test(run.command || '') && /${SECOND_FILE}/.test(run.command || '') && run.code === 0) &&
        events.some((event) => event.type === 'git-command' && event.status === 'ok' && /取消暂存/.test(event.title || '')) &&
        /未暂存\\s*2/.test(summary) &&
        !/已暂存\\s*1/.test(summary) &&
        /${SECOND_FILE}/.test(selected) &&
        /未暂存/.test(panel) &&
        /pass37-second-evidence/.test(panel);
    })()
  `, 10000));
  assertStep("PASS37_ALL_CHANGES_CLICK", await win.webContents.executeJavaScript(`
    (function() {
      const button = Array.from(document.querySelectorAll('.git-change-item'))
        .find((item) => /\\u5168\\u90e8\\u53d8\\u66f4/.test(item.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS37_ALL_CHANGES_DIFF", await waitFor(win, `
    (function() {
      const preview = document.querySelector('.git-diff-preview')?.textContent || '';
      return /pass37-diff-evidence/.test(preview) && /pass37-second-evidence/.test(preview) && /pass37 untracked evidence/.test(preview);
    })()
  `, 5000));
  assertStep("PASS37_UNTRACKED_FOCUS_CLICK", await win.webContents.executeJavaScript(`
    (function() {
      const button = Array.from(document.querySelectorAll('.git-change-item'))
        .find((item) => /${UNTRACKED_FILE}/.test(item.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS37_UNTRACKED_FOCUS_DIFF", await waitFor(win, `
    (function() {
      const preview = document.querySelector('.git-diff-preview')?.textContent || '';
      const selected = document.querySelector('.git-change-item.selected')?.textContent || '';
      return /${UNTRACKED_FILE}/.test(selected) &&
        /new file mode/.test(preview) &&
        /pass37 untracked evidence/.test(preview) &&
        !/pass37-diff-evidence/.test(preview) &&
        /\\+1 -0/.test(selected);
    })()
  `, 5000));
  assertStep("PASS37_UNTRACKED_EVIDENCE_PANEL", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.git-selected-evidence-panel')?.textContent || '';
      return /${UNTRACKED_FILE}/.test(panel) &&
        /未跟踪/.test(panel) &&
        /\\?\\?/.test(panel) &&
        /pass37 untracked evidence/.test(panel);
    })()
  `, 5000));
  assertStep("PASS37_STAGE_UNTRACKED_CLICK", await win.webContents.executeJavaScript(`
    (function() {
      const button = Array.from(document.querySelectorAll('.git-selected-evidence-panel button'))
        .find((item) => /暂存文件/.test(item.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS37_STAGE_COMMAND_EVIDENCE", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const runs = state.commandRuns || [];
      const events = state.runEvents || [];
      const summary = document.querySelector('.git-change-summary')?.textContent || '';
      const panel = document.querySelector('.git-selected-evidence-panel')?.textContent || '';
      const selected = document.querySelector('.git-change-item.selected')?.textContent || '';
      return runs.some((run) => /git add/.test(run.command || '') && /${UNTRACKED_FILE}/.test(run.command || '') && run.code === 0) &&
        events.some((event) => event.type === 'git-command' && event.status === 'ok' && /暂存文件/.test(event.title || '')) &&
        /已暂存\\s*1/.test(summary) &&
        /未暂存\\s*2/.test(summary) &&
        !/未跟踪\\s*1/.test(summary) &&
        /${UNTRACKED_FILE}/.test(selected) &&
        /已暂存/.test(panel) &&
        /pass37 untracked evidence/.test(panel);
    })()
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
