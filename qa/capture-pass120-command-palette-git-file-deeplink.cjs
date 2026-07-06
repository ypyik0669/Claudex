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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass120-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass120-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const TARGET_FILE = "pass120-target.txt";
const OTHER_FILE = "pass120-other.txt";
const UNTRACKED_FILE = "pass120-untracked.txt";

function cleanup() {
  for (const dir of [USER_DATA_DIR, PROJECT_DIR]) {
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
  execFileSync("git", args, { cwd: PROJECT_DIR, stdio: "ignore" });
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
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass120-project" }), "utf8");
  fs.writeFileSync(path.join(PROJECT_DIR, TARGET_FILE), "pass120 baseline target\n", "utf8");
  fs.writeFileSync(path.join(PROJECT_DIR, OTHER_FILE), "pass120 baseline other\n", "utf8");
  git(["init"]);
  git(["config", "user.name", "Claudex QA"]);
  git(["config", "user.email", "qa@example.invalid"]);
  git(["add", "package.json", TARGET_FILE, OTHER_FILE]);
  git(["commit", "-m", "pass120 baseline"]);
  fs.writeFileSync(path.join(PROJECT_DIR, TARGET_FILE), "pass120 baseline target\npass120-target-diff-evidence\n", "utf8");
  fs.writeFileSync(path.join(PROJECT_DIR, OTHER_FILE), "pass120 baseline other\npass120-other-diff-evidence\n", "utf8");
  fs.writeFileSync(path.join(PROJECT_DIR, UNTRACKED_FILE), "pass120 untracked palette evidence\n", "utf8");
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
    activeProject: { name: "pass120-project", path: PROJECT_DIR },
    projects: [{ name: "pass120-project", path: PROJECT_DIR }],
    sessions: [
      {
        id: "default",
        title: "Command palette git file deeplink",
        project: "pass120-project",
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-06T00:00:00.000Z",
        updatedAt: "2026-07-06T00:00:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
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
      const button = [...document.querySelectorAll('.workspace-context-button, .bottom-panel-tabs button')]
        .find((candidate) => pattern.test(candidate.textContent || '') || pattern.test(candidate.getAttribute('aria-label') || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
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

async function clickGitFileCommand(win, query, fileName) {
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
  if (!win) throw new Error("PASS120_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS120_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS120_ENVIRONMENT_GIT_READY", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(PROJECT_DIR)} });
      const files = state?.git?.files || [];
      return Boolean(
        state?.git?.available &&
        files.some((file) => file.path === ${JSON.stringify(TARGET_FILE)}) &&
        files.some((file) => file.path === ${JSON.stringify(OTHER_FILE)}) &&
        files.some((file) => file.path === ${JSON.stringify(UNTRACKED_FILE)})
      );
    })();
  `, 10000));
  assertStep("PASS120_OPEN_OUTPUTS_BEFORE_DEEPLINK", await openPanel(win, "\\u8f93\\u51fa"));
  assertStep("PASS120_OUTPUTS_PANEL_ACTIVE_BEFORE_DEEPLINK", await waitFor(win, `
    Boolean(document.querySelector('.workspace-context-button.active')?.textContent?.includes('\\u8f93\\u51fa'))
  `, 5000));
  assertStep("PASS120_OPEN_PALETTE_QUERY_TARGET", await openPaletteAndQuery(win, "pass120-target"));
  assertStep("PASS120_GIT_FILE_COMMAND_VISIBLE", await waitFor(win, `
    Boolean([...document.querySelectorAll('.command-modal .command-list button')].some((button) =>
      (button.getAttribute('data-command-id') || '').startsWith('git-file:') &&
      /${TARGET_FILE}/.test(button.textContent || '') &&
      /\\u53d8\\u66f4/.test(button.textContent || '')
    ))
  `, 5000));
  assertStep("PASS120_GIT_FILE_COMMAND_SEPARATOR_CLEAN", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) =>
          (candidate.getAttribute('data-command-id') || '').startsWith('git-file:') &&
          /${TARGET_FILE}/.test(candidate.textContent || '')
        );
      const text = button?.textContent || '';
      return Boolean(button && /\\s\\u00b7\\s/.test(text) && !/\\u00c2\\u00b7/.test(text));
    })()
  `));
  assertStep("PASS120_CLICK_TARGET_GIT_COMMAND", await clickGitFileCommand(win, "pass120-target", TARGET_FILE));
  assertStep("PASS120_TARGET_FILE_FOCUSED_FROM_PALETTE", await waitFor(win, `
    (function() {
      const active = document.querySelector('.workspace-context-button.active')?.textContent || '';
      const selected = document.querySelector('.git-change-item.selected')?.textContent || '';
      const preview = document.querySelector('.git-diff-preview')?.textContent || '';
      const panel = document.querySelector('.git-selected-evidence-panel')?.textContent || '';
      return /\\u53d8\\u66f4/.test(active) &&
        /${TARGET_FILE}/.test(selected) &&
        /${TARGET_FILE}/.test(preview) &&
        /pass120-target-diff-evidence/.test(preview) &&
        !/pass120-other-diff-evidence/.test(preview) &&
        /${TARGET_FILE}/.test(panel) &&
        /pass120-target-diff-evidence/.test(panel);
    })()
  `, 10000));
  assertStep("PASS120_GIT_EVIDENCE_OPEN_WORKSPACE_VISIBLE", await waitFor(win, `
    Boolean(document.querySelector('.git-selected-evidence-panel [data-git-action="open-workspace-file"]'))
  `, 5000));
  assertStep("PASS120_CLICK_GIT_EVIDENCE_OPEN_WORKSPACE", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.git-selected-evidence-panel [data-git-action="open-workspace-file"]');
      if (!button) return false;
      button.click();
      return true;
    })()
  `));
  assertStep("PASS120_GIT_EVIDENCE_OPENED_WORKSPACE_FILE", await waitFor(win, `
    (function() {
      const textarea = document.querySelector('.file-editor textarea');
      const editor = document.querySelector('.file-editor')?.textContent || '';
      return Boolean(
        textarea &&
        textarea.getAttribute('aria-label') === ${JSON.stringify(TARGET_FILE)} &&
        textarea.value.includes('pass120-target-diff-evidence') &&
        editor.includes(${JSON.stringify(TARGET_FILE)}) &&
        !editor.includes(${JSON.stringify(OTHER_FILE)})
      );
    })()
  `, 10000));
  assertStep("PASS120_OPEN_PALETTE_QUERY_TARGET_WORKSPACE", await openPaletteAndQuery(win, "workspace open pass120-target"));
  assertStep("PASS120_GIT_OPEN_FILE_COMMAND_VISIBLE", await waitFor(win, `
    Boolean([...document.querySelectorAll('.command-modal .command-list button')].some((button) =>
      (button.getAttribute('data-command-id') || '').startsWith('git-open-file:') &&
      /${TARGET_FILE}/.test(button.textContent || '') &&
      /workspace/i.test(button.textContent || '')
    ))
  `, 5000));
  assertStep("PASS120_CLICK_TARGET_GIT_OPEN_FILE_COMMAND", await clickGitOpenFileCommand(win, TARGET_FILE));
  assertStep("PASS120_TARGET_FILE_OPENED_IN_WORKSPACE", await waitFor(win, `
    (function() {
      const textarea = document.querySelector('.file-editor textarea');
      const editor = document.querySelector('.file-editor')?.textContent || '';
      return Boolean(
        textarea &&
        textarea.getAttribute('aria-label') === ${JSON.stringify(TARGET_FILE)} &&
        textarea.value.includes('pass120-target-diff-evidence') &&
        editor.includes(${JSON.stringify(TARGET_FILE)}) &&
        !editor.includes(${JSON.stringify(OTHER_FILE)})
      );
    })()
  `, 10000));
  assertStep("PASS120_OPEN_PALETTE_QUERY_UNTRACKED", await openPaletteAndQuery(win, "pass120-untracked"));
  assertStep("PASS120_CLICK_UNTRACKED_GIT_COMMAND", await clickGitFileCommand(win, "pass120-untracked", UNTRACKED_FILE));
  assertStep("PASS120_UNTRACKED_FILE_FOCUSED_FROM_PALETTE", await waitFor(win, `
    (function() {
      const selected = document.querySelector('.git-change-item.selected')?.textContent || '';
      const preview = document.querySelector('.git-diff-preview')?.textContent || '';
      const panel = document.querySelector('.git-selected-evidence-panel')?.textContent || '';
      return /${UNTRACKED_FILE}/.test(selected) &&
        /new file mode/.test(preview) &&
        /pass120 untracked palette evidence/.test(preview) &&
        /${UNTRACKED_FILE}/.test(panel) &&
        /\\?\\?/.test(panel);
    })()
  `, 10000));

  console.log("PASS120_COMMAND_PALETTE_GIT_FILE_DEEPLINK_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS120_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS120_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
