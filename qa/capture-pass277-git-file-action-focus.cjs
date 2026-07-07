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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass277-data-"));
const GIT_PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass277-git-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const OPEN_FILE = "pass277-open-target.txt";
const STAGE_FILE = "pass277-stage-target.txt";
const UNSTAGE_FILE = "pass277-unstage-target.txt";
const OPEN_CONTENT = "pass277 open workspace action content\n";
const STAGE_CONTENT = "pass277 stage focus content\n";
const UNSTAGE_CONTENT = "pass277 unstage focus content\n";

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

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function setupGitProject() {
  fs.mkdirSync(GIT_PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass277-git-project" }), "utf8");
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, OPEN_FILE), "pass277 open baseline\n", "utf8");
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, STAGE_FILE), "pass277 stage baseline\n", "utf8");
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, UNSTAGE_FILE), "pass277 unstage baseline\n", "utf8");
  runGit(["init"]);
  runGit(["config", "user.name", "Claudex QA"]);
  runGit(["config", "user.email", "qa@example.invalid"]);
  runGit(["add", "."]);
  runGit(["commit", "-m", "pass277 baseline"]);
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, OPEN_FILE), OPEN_CONTENT, "utf8");
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, STAGE_FILE), STAGE_CONTENT, "utf8");
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, UNSTAGE_FILE), UNSTAGE_CONTENT, "utf8");
  runGit(["add", UNSTAGE_FILE]);
}

function writeInitialStore() {
  const project = { name: "pass277-git-project", path: GIT_PROJECT_DIR };
  writeJson(DATA_FILE, {
    version: 1,
    activeProject: project,
    projects: [project],
    sessions: [
      {
        id: "pass277-session",
        title: "PASS277 git file action focus",
        project: project.name,
        projectPath: GIT_PROJECT_DIR,
        createdAt: "2026-07-08T00:00:00.000Z",
        updatedAt: "2026-07-08T00:00:00.000Z",
        messages: [],
      },
    ],
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

async function runPaletteCommand(win, query, prefix, textToken) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.__pass277ConfirmCount = 0;
      window.confirm = () => {
        window.__pass277ConfirmCount += 1;
        return false;
      };
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return { ok: false, reason: 'no input' };
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 320));
      const button = Array.from(document.querySelectorAll('.command-modal .command-list button'))
        .find((candidate) =>
          (candidate.getAttribute('data-command-id') || '').startsWith(${JSON.stringify(prefix)}) &&
          (candidate.textContent || '').includes(${JSON.stringify(textToken)})
        );
      if (!button) {
        return {
          ok: false,
          reason: 'no command',
          visible: Array.from(document.querySelectorAll('.command-modal .command-list button'))
            .slice(0, 16)
            .map((candidate) => ({
              id: candidate.getAttribute('data-command-id') || '',
              target: candidate.getAttribute('data-command-target') || '',
              action: candidate.getAttribute('data-command-git-action') || '',
              text: candidate.textContent || '',
            })),
        };
      }
      const trace = {
        id: button.getAttribute('data-command-id') || '',
        target: button.getAttribute('data-command-target') || '',
        action: button.getAttribute('data-command-git-action') || '',
        scope: button.getAttribute('data-command-git-evidence-scope') || '',
        root: button.getAttribute('data-command-git-root') || '',
        selectedPath: button.getAttribute('data-command-git-selected-path') || '',
        selectedKind: button.getAttribute('data-command-git-selected-kind') || '',
        selectedStatus: button.getAttribute('data-command-git-selected-status') || '',
      };
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 360));
      return { ok: true, trace, confirmCount: window.__pass277ConfirmCount };
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
  if (!win) throw new Error("PASS277_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS277_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS277_ENVIRONMENT_GIT_READY", await waitFor(win, `
    (async function() {
      const env = await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(GIT_PROJECT_DIR)} });
      const files = env?.git?.files || [];
      const openFile = files.find((file) => file.path === ${JSON.stringify(OPEN_FILE)});
      const stageFile = files.find((file) => file.path === ${JSON.stringify(STAGE_FILE)});
      const unstageFile = files.find((file) => file.path === ${JSON.stringify(UNSTAGE_FILE)});
      return Boolean(
        env?.git?.available &&
        env.git.root === ${JSON.stringify(GIT_PROJECT_DIR)} &&
        openFile && /^\\s*M/.test(openFile.status || '') &&
        stageFile && /^\\s*M/.test(stageFile.status || '') &&
        unstageFile && /^M/.test(unstageFile.status || '')
      );
    })();
  `, 10000));

  const openAction = await runPaletteCommand(win, `open workspace ${OPEN_FILE}`, "git-file-action:open-workspace-file:", OPEN_FILE);
  assertStep("PASS277_OPEN_ACTION_COMMAND_TRACE", Boolean(openAction?.ok &&
    openAction.trace?.target === "git-file-action" &&
    openAction.trace?.action === "open-workspace-file" &&
    openAction.trace?.scope === "file" &&
    openAction.trace?.root === GIT_PROJECT_DIR &&
    openAction.trace?.selectedPath === OPEN_FILE &&
    openAction.confirmCount === 0));
  assertStep("PASS277_OPEN_ACTION_FOCUSED_WITHOUT_OPEN", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const panel = document.querySelector('.git-selected-evidence-panel');
      const button = panel?.querySelector('[data-git-action="open-workspace-file"]');
      return Boolean(
        panel?.getAttribute('data-git-focused-action') === 'open-workspace-file' &&
        panel?.getAttribute('data-git-selected-path') === ${JSON.stringify(OPEN_FILE)} &&
        button?.getAttribute('data-git-action-focused') === 'true' &&
        button?.getAttribute('aria-current') === 'true' &&
        document.activeElement === button &&
        !document.querySelector('.file-editor textarea') &&
        !(state.sourceRefs || []).some((source) => source.path === ${JSON.stringify(OPEN_FILE)}) &&
        window.__pass277ConfirmCount === 0
      );
    })();
  `, 10000));
  assertStep("PASS277_OPEN_ACTION_CLICK_OPENS_WORKSPACE_FILE", await waitFor(win, `
    (async function() {
      const button = document.querySelector('.git-selected-evidence-panel [data-git-action="open-workspace-file"]');
      if (!button || window.__pass277OpenedFileClicked) return false;
      window.__pass277OpenedFileClicked = true;
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 420));
      const textarea = document.querySelector('.file-editor textarea');
      const state = await window.claudexDesktop.getState();
      return Boolean(
        textarea &&
        textarea.getAttribute('aria-label') === ${JSON.stringify(OPEN_FILE)} &&
        textarea.value.includes(${JSON.stringify(OPEN_CONTENT.trim())}) &&
        (state.sourceRefs || []).some((source) => source.path === ${JSON.stringify(OPEN_FILE)} && source.project?.path === ${JSON.stringify(GIT_PROJECT_DIR)})
      );
    })();
  `, 10000));

  const stageAction = await runPaletteCommand(win, `stage ${STAGE_FILE}`, "git-file-action:stage-file:", STAGE_FILE);
  assertStep("PASS277_STAGE_ACTION_COMMAND_TRACE", Boolean(stageAction?.ok &&
    stageAction.trace?.target === "git-file-action" &&
    stageAction.trace?.action === "stage-file" &&
    stageAction.trace?.scope === "file" &&
    stageAction.trace?.root === GIT_PROJECT_DIR &&
    stageAction.trace?.selectedPath === STAGE_FILE &&
    stageAction.confirmCount === 0));
  assertStep("PASS277_STAGE_ACTION_FOCUSED_WITHOUT_MUTATION", await waitFor(win, `
    (async function() {
      const panel = document.querySelector('.git-selected-evidence-panel');
      const button = panel?.querySelector('[data-git-action="stage-file"]');
      const state = await window.claudexDesktop.getState();
      const env = await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(GIT_PROJECT_DIR)} });
      const file = (env?.git?.files || []).find((item) => item.path === ${JSON.stringify(STAGE_FILE)});
      return Boolean(
        panel?.getAttribute('data-git-focused-action') === 'stage-file' &&
        panel?.getAttribute('data-git-selected-path') === ${JSON.stringify(STAGE_FILE)} &&
        button?.getAttribute('data-git-action-focused') === 'true' &&
        button?.getAttribute('aria-current') === 'true' &&
        document.activeElement === button &&
        window.__pass277ConfirmCount === 0 &&
        file && /^\\s*M/.test(file.status || '') &&
        !(state.commandRuns || []).some((run) => /git add --/.test(run.command || ''))
      );
    })();
  `, 10000));
  assertStep("PASS277_STAGE_CLICK_REACHES_CONFIRM_ONLY", await waitFor(win, `
    (async function() {
      const button = document.querySelector('.git-selected-evidence-panel [data-git-action="stage-file"]');
      if (!button || window.__pass277StageClicked) return false;
      window.__pass277StageClicked = true;
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 260));
      const state = await window.claudexDesktop.getState();
      const env = await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(GIT_PROJECT_DIR)} });
      const file = (env?.git?.files || []).find((item) => item.path === ${JSON.stringify(STAGE_FILE)});
      return Boolean(
        window.__pass277ConfirmCount === 1 &&
        file && /^\\s*M/.test(file.status || '') &&
        !(state.commandRuns || []).some((run) => /git add --/.test(run.command || '') && /pass277-stage-target/.test(run.command || ''))
      );
    })();
  `, 5000));

  const unstageAction = await runPaletteCommand(win, `unstage ${UNSTAGE_FILE}`, "git-file-action:unstage-file:", UNSTAGE_FILE);
  assertStep("PASS277_UNSTAGE_ACTION_COMMAND_TRACE", Boolean(unstageAction?.ok &&
    unstageAction.trace?.target === "git-file-action" &&
    unstageAction.trace?.action === "unstage-file" &&
    unstageAction.trace?.scope === "file" &&
    unstageAction.trace?.root === GIT_PROJECT_DIR &&
    unstageAction.trace?.selectedPath === UNSTAGE_FILE &&
    unstageAction.confirmCount === 0));
  assertStep("PASS277_UNSTAGE_ACTION_FOCUSED_WITHOUT_MUTATION", await waitFor(win, `
    (async function() {
      const panel = document.querySelector('.git-selected-evidence-panel');
      const button = panel?.querySelector('[data-git-action="unstage-file"]');
      const state = await window.claudexDesktop.getState();
      const env = await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(GIT_PROJECT_DIR)} });
      const file = (env?.git?.files || []).find((item) => item.path === ${JSON.stringify(UNSTAGE_FILE)});
      return Boolean(
        panel?.getAttribute('data-git-focused-action') === 'unstage-file' &&
        panel?.getAttribute('data-git-selected-path') === ${JSON.stringify(UNSTAGE_FILE)} &&
        button?.getAttribute('data-git-action-focused') === 'true' &&
        button?.getAttribute('aria-current') === 'true' &&
        document.activeElement === button &&
        window.__pass277ConfirmCount === 0 &&
        file && /^M/.test(file.status || '') &&
        !(state.commandRuns || []).some((run) => /git restore --staged --/.test(run.command || ''))
      );
    })();
  `, 10000));
  assertStep("PASS277_UNSTAGE_CLICK_REACHES_CONFIRM_ONLY", await waitFor(win, `
    (async function() {
      const button = document.querySelector('.git-selected-evidence-panel [data-git-action="unstage-file"]');
      if (!button || window.__pass277UnstageClicked) return false;
      window.__pass277UnstageClicked = true;
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 260));
      const state = await window.claudexDesktop.getState();
      const env = await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(GIT_PROJECT_DIR)} });
      const file = (env?.git?.files || []).find((item) => item.path === ${JSON.stringify(UNSTAGE_FILE)});
      return Boolean(
        window.__pass277ConfirmCount === 1 &&
        file && /^M/.test(file.status || '') &&
        !(state.commandRuns || []).some((run) => /git restore --staged --/.test(run.command || '') && /pass277-unstage-target/.test(run.command || ''))
      );
    })();
  `, 5000));

  console.log("PASS277_GIT_FILE_ACTION_FOCUS_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS277_FAILED", error?.stack || error);
  try {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      const debug = await win.webContents.executeJavaScript(`
        ({
          active: document.querySelector('.workspace-context-button.active')?.outerHTML || '',
          panel: document.querySelector('.git-selected-evidence-panel')?.outerHTML || '',
          selectedFile: document.querySelector('.git-change-item.selected')?.outerHTML || '',
          editor: document.querySelector('.file-editor')?.outerHTML || '',
          commands: Array.from(document.querySelectorAll('.command-modal .command-list button')).slice(0, 20).map((button) => ({
            id: button.getAttribute('data-command-id') || '',
            target: button.getAttribute('data-command-target') || '',
            action: button.getAttribute('data-command-git-action') || '',
            text: button.textContent || '',
          })),
          confirmCount: window.__pass277ConfirmCount || 0,
        })
      `);
      console.error("PASS277_DEBUG", JSON.stringify(debug, null, 2).slice(0, 16000));
    }
  } catch (_debugError) {
    // ignore debug failures
  }
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS277_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
