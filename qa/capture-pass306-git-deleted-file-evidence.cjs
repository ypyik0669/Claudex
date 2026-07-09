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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass306-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass306-project-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass306-bin-"));
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const TARGET_FILE = "pass306-deleted.txt";
const TARGET_CONTENT = "pass306 delete evidence line\npass306 deleted diff body\n";

function cleanup() {
  for (const dir of [USER_DATA_DIR, PROJECT_DIR, FAKE_BIN_DIR]) {
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

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: PROJECT_DIR,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result;
}

function writeFakeClaude() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(
    FAKE_CLAUDE,
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass306& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins: none& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces: none& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass306 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function setupGitProject() {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass306-project" }), "utf8");
  fs.writeFileSync(path.join(PROJECT_DIR, TARGET_FILE), TARGET_CONTENT, "utf8");
  runGit(["init"]);
  runGit(["config", "user.name", "Claudex QA"]);
  runGit(["config", "user.email", "qa@example.invalid"]);
  runGit(["add", "package.json", TARGET_FILE]);
  runGit(["commit", "-m", "pass306 baseline"]);
  fs.unlinkSync(path.join(PROJECT_DIR, TARGET_FILE));
}

function writeInitialStore() {
  writeFakeClaude();
  setupGitProject();
  const project = { name: "pass306-project", path: PROJECT_DIR };
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
      claudeCode: { executionMode: "claude-code", claudeCommand: FAKE_CLAUDE, permissionMode: "default" },
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
        id: "pass306-session",
        title: "Pass306 git deleted file evidence",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-09T00:00:00.000Z",
        updatedAt: "2026-07-09T00:00:00.000Z",
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
      const button = document.querySelector('.workspace-context-button[data-context-tab="changes"], .bottom-panel-tabs button[data-bottom-tab="changes"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function openPaletteAndQuery(win, query) {
  return win.webContents.executeJavaScript(`
    (async function() {
      if (!document.querySelector('.command-modal')) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 220));
      }
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 260));
      return true;
    })();
  `);
}

async function clickGitFileCommand(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) =>
          (candidate.getAttribute('data-command-id') || '').startsWith('git-file:') &&
          /${TARGET_FILE}/.test(candidate.textContent || '')
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
  if (!win) throw new Error("PASS306_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS306_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS306_ENVIRONMENT_DELETED_READY", await waitFor(win, `
    (async function() {
      const env = await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(PROJECT_DIR)} });
      const file = (env?.git?.files || []).find((item) => item.path === ${JSON.stringify(TARGET_FILE)});
      const fileDiff = (env?.git?.diff?.fileDiffs || []).find((item) => item.path === ${JSON.stringify(TARGET_FILE)});
      const diff = env?.git?.diff?.text || '';
      return Boolean(
        env?.git?.available &&
        env.git.root === ${JSON.stringify(PROJECT_DIR)} &&
        env.git.summary?.deleted === 1 &&
        env.git.summary?.unstaged === 1 &&
        file &&
        file.kind === 'deleted' &&
        file.status === 'D' &&
        file.unstaged === true &&
        file.hasDiff === true &&
        fileDiff &&
        fileDiff.deletions >= 2 &&
        /deleted file mode/.test(diff) &&
        /-pass306 delete evidence line/.test(diff)
      );
    })();
  `, 12000));

  assertStep("PASS306_OPEN_CHANGES", await openChanges(win));
  assertStep("PASS306_DELETED_SUMMARY_FILTER_SELECTS_FILE", await waitFor(win, `
    (function() {
      const summary = document.querySelector('.git-summary-chip.deleted[data-git-summary-kind="deleted"]');
      if (!summary) return false;
      if (summary.getAttribute('data-git-summary-selected') !== 'true') summary.click();
      const selected = document.querySelector('.git-change-item.selected.kind-deleted');
      const preview = document.querySelector('.git-diff-preview')?.textContent || '';
      return Boolean(
        summary.getAttribute('data-git-summary-count') === '1' &&
        summary.getAttribute('data-git-summary-selected') === 'true' &&
        selected &&
        /${TARGET_FILE}/.test(selected.textContent || '') &&
        /deleted file mode/.test(preview) &&
        /-pass306 delete evidence line/.test(preview)
      );
    })();
  `, 10000));

  assertStep("PASS306_OPEN_PALETTE_DELETED_FILE", await openPaletteAndQuery(win, TARGET_FILE));
  assertStep("PASS306_DELETED_GIT_FILE_COMMAND_VISIBLE_BUT_OPEN_WORKSPACE_ABSENT", await waitFor(win, `
    (function() {
      const buttons = [...document.querySelectorAll('.command-modal .command-list button')];
      const gitFile = buttons.find((button) =>
        (button.getAttribute('data-command-id') || '').startsWith('git-file:') &&
        /${TARGET_FILE}/.test(button.textContent || '') &&
        button.getAttribute('data-command-git-selected-kind') === 'deleted'
      );
      const openWorkspace = buttons.find((button) =>
        (button.getAttribute('data-command-id') || '').startsWith('git-open-file:') &&
        /${TARGET_FILE}/.test(button.textContent || '')
      );
      return Boolean(gitFile && !openWorkspace);
    })();
  `, 8000));

  assertStep("PASS306_CLICK_DELETED_GIT_FILE_COMMAND", await clickGitFileCommand(win));
  assertStep("PASS306_DELETED_EVIDENCE_SELECTED_WITHOUT_OPEN_WORKSPACE", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.git-selected-evidence-panel');
      const panelText = panel?.textContent || '';
      const preview = document.querySelector('.git-diff-preview')?.textContent || '';
      const selected = document.querySelector('.git-change-item.selected.kind-deleted')?.textContent || '';
      return Boolean(
        panel &&
        panel.classList.contains('kind-deleted') &&
        panel.getAttribute('data-git-evidence-scope') === 'file' &&
        panel.getAttribute('data-git-root') === ${JSON.stringify(PROJECT_DIR)} &&
        panel.getAttribute('data-git-selected-path') === ${JSON.stringify(TARGET_FILE)} &&
        panel.getAttribute('data-git-selected-kind') === 'deleted' &&
        panel.getAttribute('data-git-selected-status') === 'D' &&
        /${TARGET_FILE}/.test(selected) &&
        /D/.test(panelText) &&
        /deleted file mode/.test(preview) &&
        /-pass306 delete evidence line/.test(preview) &&
        !panel.querySelector('[data-git-action="open-workspace-file"]') &&
        panel.querySelector('[data-git-action="stage-file"]') &&
        panel.querySelector('[data-git-action="copy-evidence"]')
      );
    })();
  `, 10000));

  assertStep("PASS306_COPY_DELETED_GIT_EVIDENCE", await win.webContents.executeJavaScript(`
    (async function() {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text) => { window.__pass306Clipboard = String(text || ''); } },
      });
      const copy = document.querySelector('.git-selected-evidence-panel [data-git-action="copy-evidence"]');
      if (!copy) return false;
      copy.click();
      await new Promise((resolve) => setTimeout(resolve, 250));
      const copied = window.__pass306Clipboard || '';
      return /${TARGET_FILE}/.test(copied) &&
        /status: D/.test(copied) &&
        /deleted file mode/.test(copied) &&
        /-pass306 delete evidence line/.test(copied);
    })();
  `));

  console.log("PASS306_GIT_DELETED_FILE_EVIDENCE_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS306_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (async function() {
          return {
            commands: [...document.querySelectorAll('.command-modal .command-list button')].map((button) => ({
              id: button.getAttribute('data-command-id'),
              text: button.textContent,
            })),
            summary: document.querySelector('.git-change-summary')?.textContent || '',
            selected: document.querySelector('.git-selected-evidence-panel')?.outerHTML || '',
            preview: document.querySelector('.git-diff-preview')?.textContent || '',
            env: await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(PROJECT_DIR)} }).catch((envError) => ({ error: String(envError?.message || envError) })),
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS306_DEBUG", JSON.stringify(debug, null, 2).slice(0, 14000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS306_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
