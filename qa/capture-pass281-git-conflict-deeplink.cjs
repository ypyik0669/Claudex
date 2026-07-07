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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass281-data-"));
const GIT_PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass281-git-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const CONFLICT_FILE = "pass281-conflict.txt";
const MASTER_TOKEN = "pass281 master conflict evidence";
const OTHER_TOKEN = "pass281 other conflict evidence";

function cleanup() {
  for (const dir of [USER_DATA_DIR, GIT_PROJECT_DIR]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_error) {
      // best-effort cleanup
    }
  }
}

function git(args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: GIT_PROJECT_DIR,
    encoding: "utf8",
    windowsHide: true,
  });
  if (!options.allowFailure && result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result;
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function setupConflictProject() {
  fs.mkdirSync(GIT_PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass281-conflict-project" }), "utf8");
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, CONFLICT_FILE), "pass281 baseline\n", "utf8");
  git(["init"]);
  git(["config", "user.name", "Claudex QA"]);
  git(["config", "user.email", "qa@example.invalid"]);
  git(["add", "."]);
  git(["commit", "-m", "pass281 baseline"]);
  git(["checkout", "-b", "pass281-other"]);
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, CONFLICT_FILE), `${OTHER_TOKEN}\n`, "utf8");
  git(["add", CONFLICT_FILE]);
  git(["commit", "-m", "pass281 other edit"]);
  git(["checkout", "master"]);
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, CONFLICT_FILE), `${MASTER_TOKEN}\n`, "utf8");
  git(["add", CONFLICT_FILE]);
  git(["commit", "-m", "pass281 master edit"]);
  const merge = git(["merge", "pass281-other"], { allowFailure: true });
  if (merge.status === 0) throw new Error("Expected pass281 merge conflict");
}

function writeInitialStore() {
  setupConflictProject();
  const project = { name: "pass281-conflict-project", path: GIT_PROJECT_DIR };
  writeJson(DATA_FILE, {
    version: 1,
    activeProject: project,
    projects: [project],
    sessions: [
      {
        id: "pass281-session",
        title: "PASS281 conflict deep links",
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

async function runPaletteCommand(win, query, predicateSource) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return { ok: false, reason: 'no input' };
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 320));
      const predicate = ${predicateSource};
      const button = Array.from(document.querySelectorAll('.command-modal .command-list button'))
        .find((candidate) => predicate({
          id: candidate.getAttribute('data-command-id') || '',
          target: candidate.getAttribute('data-command-target') || '',
          summaryKind: candidate.getAttribute('data-command-git-summary-kind') || '',
          action: candidate.getAttribute('data-command-git-action') || '',
          scope: candidate.getAttribute('data-command-git-evidence-scope') || '',
          selectedKind: candidate.getAttribute('data-command-git-selected-kind') || '',
          selectedStatus: candidate.getAttribute('data-command-git-selected-status') || '',
          root: candidate.getAttribute('data-command-git-root') || '',
          selectedPath: candidate.getAttribute('data-command-git-selected-path') || '',
          text: candidate.textContent || '',
        }));
      if (!button) {
        return {
          ok: false,
          reason: 'no command',
          visible: Array.from(document.querySelectorAll('.command-modal .command-list button')).slice(0, 24).map((candidate) => ({
            id: candidate.getAttribute('data-command-id') || '',
            target: candidate.getAttribute('data-command-target') || '',
            summaryKind: candidate.getAttribute('data-command-git-summary-kind') || '',
            action: candidate.getAttribute('data-command-git-action') || '',
            text: candidate.textContent || '',
          })),
        };
      }
      const trace = {
        id: button.getAttribute('data-command-id') || '',
        target: button.getAttribute('data-command-target') || '',
        summaryKind: button.getAttribute('data-command-git-summary-kind') || '',
        action: button.getAttribute('data-command-git-action') || '',
        scope: button.getAttribute('data-command-git-evidence-scope') || '',
        selectedKind: button.getAttribute('data-command-git-selected-kind') || '',
        selectedStatus: button.getAttribute('data-command-git-selected-status') || '',
        root: button.getAttribute('data-command-git-root') || '',
        selectedPath: button.getAttribute('data-command-git-selected-path') || '',
      };
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 420));
      return { ok: true, trace };
    })();
  `);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS281_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS281_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS281_ENVIRONMENT_CONFLICT_READY", await waitFor(win, `
    (async function() {
      const env = await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(GIT_PROJECT_DIR)} });
      const file = (env?.git?.files || []).find((item) => item.path === ${JSON.stringify(CONFLICT_FILE)});
      const diff = (env?.git?.diff?.fileDiffs || []).find((item) => item.path === ${JSON.stringify(CONFLICT_FILE)});
      return Boolean(
        env?.git?.available &&
        env.git.root === ${JSON.stringify(GIT_PROJECT_DIR)} &&
        env.git.summary?.conflicted === 1 &&
        file?.conflict === true &&
        file.kind === 'conflict' &&
        /U/.test(file.status || '') &&
        diff &&
        /diff --cc ${CONFLICT_FILE}/.test(diff.text || '') &&
        /<<<<<<< HEAD/.test(diff.text || '') &&
        /${MASTER_TOKEN}/.test(diff.text || '') &&
        /${OTHER_TOKEN}/.test(diff.text || '')
      );
    })();
  `, 12000));

  const conflictSummary = await runPaletteCommand(
    win,
    "git conflict pass281",
    `(command) => command.id === 'git-summary:conflicted' && command.summaryKind === 'conflicted'`,
  );
  assertStep("PASS281_CONFLICT_BUCKET_COMMAND_TRACE", Boolean(conflictSummary?.ok && conflictSummary.trace?.target === "git-summary" && conflictSummary.trace?.summaryKind === "conflicted" && conflictSummary.trace?.root === GIT_PROJECT_DIR));
  assertStep("PASS281_CONFLICT_BUCKET_FOCUSES_CONFLICT_FILE", await waitFor(win, `
    (async function() {
      const chip = document.querySelector('.git-summary-chip[data-git-summary-kind="conflicted"]');
      const active = document.querySelector('.workspace-context-button.active')?.getAttribute('data-context-tab') || '';
      const selected = document.querySelector('.git-change-item.selected.kind-conflict')?.textContent || '';
      const list = document.querySelector('.git-change-list')?.textContent || '';
      const panel = document.querySelector('.git-selected-evidence-panel')?.textContent || '';
      const preview = document.querySelector('.git-diff-preview')?.textContent || '';
      const state = await window.claudexDesktop.getState();
      return Boolean(
        active === 'changes' &&
        chip?.getAttribute('data-git-summary-selected') === 'true' &&
        chip?.getAttribute('data-git-summary-focused') === 'true' &&
        document.activeElement === chip &&
        /${CONFLICT_FILE}/.test(selected) &&
        /UU|U/.test(selected) &&
        /${CONFLICT_FILE}/.test(list) &&
        /${CONFLICT_FILE}/.test(panel) &&
        /<<<<<<< HEAD/.test(panel) &&
        /${MASTER_TOKEN}/.test(panel) &&
        /${OTHER_TOKEN}/.test(panel) &&
        /diff --cc ${CONFLICT_FILE}/.test(preview) &&
        (state.commandRuns || []).length === 0
      );
    })();
  `, 10000));

  const conflictFile = await runPaletteCommand(
    win,
    CONFLICT_FILE,
    `(command) => command.id.startsWith('git-file:') && /${CONFLICT_FILE}/.test(command.text || '') && command.selectedKind === 'conflict'`,
  );
  assertStep("PASS281_CONFLICT_FILE_COMMAND_TRACE", Boolean(conflictFile?.ok && conflictFile.trace?.target === "git-file" && conflictFile.trace?.scope === "file" && conflictFile.trace?.selectedKind === "conflict" && /U/.test(conflictFile.trace?.selectedStatus || "") && conflictFile.trace?.selectedPath === CONFLICT_FILE));
  assertStep("PASS281_CONFLICT_FILE_FOCUSED_FROM_PALETTE", await waitFor(win, `
    (function() {
      const selected = document.querySelector('.git-change-item.selected.kind-conflict')?.textContent || '';
      const panel = document.querySelector('.git-selected-evidence-panel')?.textContent || '';
      return /${CONFLICT_FILE}/.test(selected) && /<<<<<<< HEAD/.test(panel) && /${MASTER_TOKEN}/.test(panel) && /${OTHER_TOKEN}/.test(panel);
    })();
  `, 10000));

  const copyAction = await runPaletteCommand(
    win,
    `copy evidence ${CONFLICT_FILE}`,
    `(command) => command.id.startsWith('git-file-action:copy-evidence:') && /${CONFLICT_FILE}/.test(command.text || '') && command.action === 'copy-evidence' && command.selectedKind === 'conflict'`,
  );
  assertStep("PASS281_CONFLICT_COPY_ACTION_COMMAND_TRACE", Boolean(copyAction?.ok && copyAction.trace?.target === "git-file-action" && copyAction.trace?.action === "copy-evidence" && copyAction.trace?.selectedKind === "conflict"));
  assertStep("PASS281_CONFLICT_COPY_ACTION_FOCUSED_WITHOUT_COPY", await waitFor(win, `
    (async function() {
      const panel = document.querySelector('.git-selected-evidence-panel');
      const button = panel?.querySelector('[data-git-action="copy-evidence"]');
      const state = await window.claudexDesktop.getState();
      return Boolean(
        panel?.getAttribute('data-git-focused-action') === 'copy-evidence' &&
        button?.getAttribute('data-git-action-focused') === 'true' &&
        document.activeElement === button &&
        !/\u5df2\u590d\u5236/.test(button.textContent || '') &&
        !panel.querySelector('[data-git-action="stage-file"]') &&
        !panel.querySelector('[data-git-action="unstage-file"]') &&
        (state.commandRuns || []).length === 0
      );
    })();
  `, 10000));

  const openAction = await runPaletteCommand(
    win,
    `open workspace ${CONFLICT_FILE}`,
    `(command) => command.id.startsWith('git-file-action:open-workspace-file:') && /${CONFLICT_FILE}/.test(command.text || '') && command.action === 'open-workspace-file' && command.selectedKind === 'conflict'`,
  );
  assertStep("PASS281_CONFLICT_OPEN_ACTION_COMMAND_TRACE", Boolean(openAction?.ok && openAction.trace?.target === "git-file-action" && openAction.trace?.action === "open-workspace-file" && openAction.trace?.selectedKind === "conflict"));
  assertStep("PASS281_CONFLICT_OPEN_ACTION_FOCUSED_WITHOUT_OPEN", await waitFor(win, `
    (async function() {
      const panel = document.querySelector('.git-selected-evidence-panel');
      const button = panel?.querySelector('[data-git-action="open-workspace-file"]');
      const workspaceText = document.querySelector('.tools-panel')?.textContent || '';
      const state = await window.claudexDesktop.getState();
      return Boolean(
        panel?.getAttribute('data-git-focused-action') === 'open-workspace-file' &&
        button?.getAttribute('data-git-action-focused') === 'true' &&
        document.activeElement === button &&
        !/Workspace|${CONFLICT_FILE}/.test(workspaceText) &&
        (state.commandRuns || []).length === 0
      );
    })();
  `, 10000));
  assertStep("PASS281_CONFLICT_OPEN_ACTION_CLICK_OPENS_WORKSPACE_FILE", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.git-selected-evidence-panel [data-git-action="open-workspace-file"]');
      if (!button || window.__pass281OpenClicked) return false;
      window.__pass281OpenClicked = true;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS281_CONFLICT_WORKSPACE_FILE_OPENED", await waitFor(win, `
    (async function() {
      const grid = document.querySelector('.app-grid');
      const editor = document.querySelector('.tools-panel .file-editor');
      const textarea = editor?.querySelector('textarea');
      const state = await window.claudexDesktop.getState();
      return Boolean(
        grid && !grid.classList.contains('right-panel-hidden') &&
        editor &&
        /${CONFLICT_FILE}/.test(editor.textContent || '') &&
        /<<<<<<< HEAD/.test(textarea?.value || '') &&
        /${MASTER_TOKEN}/.test(textarea?.value || '') &&
        /${OTHER_TOKEN}/.test(textarea?.value || '') &&
        (state.commandRuns || []).length === 0
      );
    })();
  `, 12000));

  console.log("PASS281_GIT_CONFLICT_DEEPLINK_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS281_FAILED", error?.stack || error);
  try {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      const debug = await win.webContents.executeJavaScript(`
        ({
          active: document.querySelector('.workspace-context-button.active')?.outerHTML || '',
          chips: Array.from(document.querySelectorAll('.git-summary-chip')).map((chip) => ({
            kind: chip.getAttribute('data-git-summary-kind') || '',
            selected: chip.getAttribute('data-git-summary-selected') || '',
            focused: chip.getAttribute('data-git-summary-focused') || '',
            active: document.activeElement === chip,
            text: chip.textContent || '',
          })),
          selected: document.querySelector('.git-change-item.selected')?.outerHTML || '',
          panel: document.querySelector('.git-selected-evidence-panel')?.textContent || '',
          preview: document.querySelector('.git-diff-preview')?.textContent || '',
          workspace: document.querySelector('.tools-panel')?.textContent || '',
          commands: Array.from(document.querySelectorAll('.command-modal .command-list button')).slice(0, 24).map((button) => ({
            id: button.getAttribute('data-command-id') || '',
            target: button.getAttribute('data-command-target') || '',
            action: button.getAttribute('data-command-git-action') || '',
            kind: button.getAttribute('data-command-git-selected-kind') || '',
            text: button.textContent || '',
          })),
        })
      `);
      console.error("PASS281_DEBUG", JSON.stringify(debug, null, 2).slice(0, 20000));
    }
  } catch (_debugError) {
    // ignore debug failures
  }
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS281_TIMEOUT");
  cleanup();
  app.exit(1);
}, 100000);
