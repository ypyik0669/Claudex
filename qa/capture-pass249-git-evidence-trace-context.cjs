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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass249-data-"));
const GIT_PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass249-git-"));
const TARGET_FILE = "pass249-trace-hunks.txt";
const TARGET_TOKEN = "pass249 git evidence trace token";

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
  for (const dir of [GIT_PROJECT_DIR, USER_DATA_DIR]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_error) {
      // best-effort cleanup
    }
  }
}

function setupGitProject() {
  const baseLines = Array.from({ length: 30 }, (_item, index) => `line-${String(index + 1).padStart(2, "0")}`);
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, TARGET_FILE), `${baseLines.join("\n")}\n`, "utf8");
  runGit(["init"]);
  runGit(["config", "user.name", "Claudex QA"]);
  runGit(["config", "user.email", "qa@example.invalid"]);
  runGit(["add", TARGET_FILE]);
  runGit(["commit", "-m", "baseline"]);
  const editedLines = baseLines.slice();
  editedLines[2] = "line-03 pass249 first hunk";
  editedLines[24] = `line-25 ${TARGET_TOKEN}`;
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, TARGET_FILE), `${editedLines.join("\n")}\n`, "utf8");
}

function writeInitialStore() {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(USER_DATA_DIR, "desktop-data.json"),
    JSON.stringify(
      {
        version: 1,
        activeProject: { name: "pass249-git-project", path: GIT_PROJECT_DIR },
        projects: [{ name: "pass249-git-project", path: GIT_PROJECT_DIR }],
        sessions: [
          {
            id: "pass249-session",
            title: "PASS249 git trace context",
            project: "pass249-git-project",
            projectPath: GIT_PROJECT_DIR,
            createdAt: "2026-07-08T04:49:00.000Z",
            updatedAt: "2026-07-08T04:49:00.000Z",
            messages: [],
          },
        ],
        settings: {
          model: "claude-haiku-4-5-20251001",
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
        commandRuns: [],
        runEvents: [],
        automations: [],
        subagentRuns: [],
        sourceRefs: [],
        browserVisits: [],
        notices: [],
      },
      null,
      2,
    ),
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

async function openChanges(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.workspace-context-button[data-context-tab="changes"]')
        || Array.from(document.querySelectorAll('.bottom-panel-tabs button, button'))
          .find((item) => /变更|Changes/i.test(item.textContent || '') || /变更/.test(item.getAttribute('aria-label') || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

setupGitProject();
app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS249_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS249_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS249_OPEN_CHANGES", await openChanges(win));
  assertStep("PASS249_SELECT_FILE", await waitFor(win, `
    (function() {
      const fileButton = Array.from(document.querySelectorAll('.git-change-item'))
        .find((item) => /${TARGET_FILE}/.test(item.textContent || ''));
      if (!fileButton) return false;
      if (!fileButton.classList.contains('selected')) fileButton.click();
      const panel = document.querySelector('.git-selected-evidence-panel');
      return Boolean(
        panel &&
        fileButton.getAttribute('data-git-evidence-scope') === 'file' &&
        fileButton.getAttribute('data-git-root') === ${JSON.stringify(GIT_PROJECT_DIR)} &&
        fileButton.getAttribute('data-git-selected-path') === ${JSON.stringify(TARGET_FILE)} &&
        fileButton.getAttribute('data-git-selected-kind') &&
        fileButton.getAttribute('data-git-selected-status') &&
        fileButton.getAttribute('data-git-selected-hunk-id') === '' &&
        fileButton.getAttribute('data-git-selected-hunk-file') === ${JSON.stringify(TARGET_FILE)} &&
        panel.getAttribute('data-git-evidence-scope') === 'file' &&
        panel.getAttribute('data-git-root') === ${JSON.stringify(GIT_PROJECT_DIR)} &&
        panel.getAttribute('data-git-selected-path') === ${JSON.stringify(TARGET_FILE)} &&
        panel.getAttribute('data-git-selected-kind') &&
        panel.getAttribute('data-git-selected-status') &&
        panel.getAttribute('data-git-selected-hunk-id') === '' &&
        panel.getAttribute('data-git-selected-hunk-file') === ${JSON.stringify(TARGET_FILE)}
      );
    })();
  `, 10000));
  assertStep("PASS249_SELECT_TARGET_HUNK_TRACE", await waitFor(win, `
    (function() {
      const target = Array.from(document.querySelectorAll('.git-hunk-item'))
        .find((item) => /${TARGET_TOKEN}/.test(item.textContent || '') || /2\\./.test(item.textContent || ''));
      if (!target) return false;
      if (!target.classList.contains('selected')) target.click();
      const panel = document.querySelector('.git-selected-evidence-panel');
      const selectedHunk = document.querySelector('.git-hunk-item.selected');
      const preview = document.querySelector('.git-diff-preview')?.textContent || '';
      const text = panel?.textContent || '';
      const hunkId = selectedHunk?.getAttribute('data-git-selected-hunk-id') || '';
      return Boolean(
        selectedHunk &&
        panel &&
        hunkId &&
        selectedHunk.getAttribute('data-git-evidence-scope') === 'hunk' &&
        selectedHunk.getAttribute('data-git-root') === ${JSON.stringify(GIT_PROJECT_DIR)} &&
        selectedHunk.getAttribute('data-git-selected-path') === ${JSON.stringify(TARGET_FILE)} &&
        selectedHunk.getAttribute('data-git-selected-kind') &&
        selectedHunk.getAttribute('data-git-selected-status') &&
        selectedHunk.getAttribute('data-git-selected-hunk-file') === ${JSON.stringify(TARGET_FILE)} &&
        panel.getAttribute('data-git-evidence-scope') === 'hunk' &&
        panel.getAttribute('data-git-root') === ${JSON.stringify(GIT_PROJECT_DIR)} &&
        panel.getAttribute('data-git-selected-path') === ${JSON.stringify(TARGET_FILE)} &&
        panel.getAttribute('data-git-selected-hunk-id') === hunkId &&
        panel.getAttribute('data-git-selected-kind') &&
        panel.getAttribute('data-git-selected-status') &&
        panel.getAttribute('data-git-selected-hunk-file') === ${JSON.stringify(TARGET_FILE)} &&
        /证据范围/.test(text) &&
        /选中 hunk ID/.test(text) &&
        /${TARGET_TOKEN}/.test(preview) &&
        !/pass249 first hunk/.test(preview)
      );
    })();
  `, 10000));
  assertStep("PASS249_COPY_TRACE_CONTEXT", await win.webContents.executeJavaScript(`
    (function() {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text) => { window.__pass249Clipboard = String(text || ''); } },
      });
      const copy = document.querySelector('.git-selected-evidence-panel [data-git-action="copy-evidence"]');
      if (!copy) return false;
      copy.click();
      return true;
    })();
  `));
  assertStep("PASS249_COPIED_TRACE_CONTEXT", await waitFor(win, `
    (function() {
      const text = window.__pass249Clipboard || '';
      const panel = document.querySelector('.git-selected-evidence-panel')?.textContent || '';
      return /证据范围: 选中 hunk/.test(text) &&
        /选中文件: ${TARGET_FILE}/.test(text) &&
        /选中 hunk ID:/.test(text) &&
        /Git 根目录: /.test(text) &&
        /${TARGET_TOKEN}/.test(text) &&
        !/pass249 first hunk/.test(text) &&
        /已复制/.test(panel);
    })();
  `, 5000));

  console.log("PASS249_GIT_EVIDENCE_TRACE_CONTEXT_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch((error) => {
  console.error("PASS249_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (function() {
          return {
            panel: document.querySelector('.git-selected-evidence-panel')?.outerHTML || '',
            selectedHunk: document.querySelector('.git-hunk-item.selected')?.outerHTML || '',
            clipboard: window.__pass249Clipboard || '',
            preview: document.querySelector('.git-diff-preview')?.textContent || '',
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS249_DEBUG", JSON.stringify(debug, null, 2).slice(0, 12000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS249_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
