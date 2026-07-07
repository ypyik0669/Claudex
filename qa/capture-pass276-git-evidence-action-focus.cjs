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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass276-data-"));
const GIT_PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass276-git-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const TARGET_FILE = "pass276-action-hunks.txt";
const FIRST_TOKEN = "pass276 first hunk token";
const SECOND_TOKEN = "pass276 second action focus token";

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
  const baseLines = Array.from({ length: 32 }, (_item, index) => `line-${String(index + 1).padStart(2, "0")}`);
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass276-git-project" }), "utf8");
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, TARGET_FILE), `${baseLines.join("\n")}\n`, "utf8");
  runGit(["init"]);
  runGit(["config", "user.name", "Claudex QA"]);
  runGit(["config", "user.email", "qa@example.invalid"]);
  runGit(["add", "package.json", TARGET_FILE]);
  runGit(["commit", "-m", "pass276 baseline"]);
  const editedLines = baseLines.slice();
  editedLines[2] = `line-03 ${FIRST_TOKEN}`;
  editedLines[26] = `line-27 ${SECOND_TOKEN}`;
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, TARGET_FILE), `${editedLines.join("\n")}\n`, "utf8");
}

function writeInitialStore() {
  const project = { name: "pass276-git-project", path: GIT_PROJECT_DIR };
  writeJson(DATA_FILE, {
    version: 1,
    activeProject: project,
    projects: [project],
    sessions: [
      {
        id: "pass276-session",
        title: "PASS276 git evidence action focus",
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
      window.__pass276Clipboard = 'PASS276_UNTOUCHED';
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text) => { window.__pass276Clipboard = String(text || ''); } },
      });
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
            .slice(0, 12)
            .map((candidate) => ({
              id: candidate.getAttribute('data-command-id') || '',
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
        selectedHunkId: button.getAttribute('data-command-git-selected-hunk-id') || '',
        hunkIndex: button.getAttribute('data-command-git-hunk-index') || '',
        additions: button.getAttribute('data-command-git-additions') || '',
        deletions: button.getAttribute('data-command-git-deletions') || '',
      };
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 360));
      return { ok: true, trace, clipboard: window.__pass276Clipboard || '' };
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
  if (!win) throw new Error("PASS276_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS276_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS276_ENVIRONMENT_GIT_READY", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(GIT_PROJECT_DIR)} });
      const files = state?.git?.files || [];
      return Boolean(
        state?.git?.available &&
        state?.git?.root === ${JSON.stringify(GIT_PROJECT_DIR)} &&
        files.some((file) => file.path === ${JSON.stringify(TARGET_FILE)} && file.status) &&
        /${FIRST_TOKEN}/.test(state?.git?.diff?.text || '') &&
        /${SECOND_TOKEN}/.test(state?.git?.diff?.text || '')
      );
    })();
  `, 10000));

  const fileAction = await runPaletteCommand(win, `copy evidence ${TARGET_FILE}`, "git-file-action:copy-evidence:", TARGET_FILE);
  assertStep("PASS276_GIT_FILE_ACTION_COMMAND_TRACE", Boolean(fileAction?.ok &&
    fileAction.trace?.target === "git-file-action" &&
    fileAction.trace?.action === "copy-evidence" &&
    fileAction.trace?.scope === "file" &&
    fileAction.trace?.root === GIT_PROJECT_DIR &&
    fileAction.trace?.selectedPath === TARGET_FILE &&
    !fileAction.trace?.selectedHunkId &&
    fileAction.clipboard === "PASS276_UNTOUCHED"));

  assertStep("PASS276_GIT_FILE_COPY_ACTION_FOCUSED_WITHOUT_COPY", await waitFor(win, `
    (function() {
      const active = document.querySelector('.workspace-context-button.active')?.textContent || '';
      const selectedFile = document.querySelector('.git-change-item.selected')?.textContent || '';
      const panel = document.querySelector('.git-selected-evidence-panel');
      const copy = panel?.querySelector('[data-git-action="copy-evidence"]');
      return /\\u53d8\\u66f4/.test(active) &&
        /${TARGET_FILE}/.test(selectedFile) &&
        panel?.getAttribute('data-git-focused-action') === 'copy-evidence' &&
        panel?.getAttribute('data-git-evidence-scope') === 'file' &&
        copy?.getAttribute('data-git-action-focused') === 'true' &&
        copy?.getAttribute('aria-current') === 'true' &&
        document.activeElement === copy &&
        window.__pass276Clipboard === 'PASS276_UNTOUCHED';
    })();
  `, 10000));

  assertStep("PASS276_GIT_FILE_COPY_AFTER_FOCUS", await waitFor(win, `
    (async function() {
      const copy = document.querySelector('.git-selected-evidence-panel [data-git-action="copy-evidence"]');
      if (!copy) return false;
      copy.click();
      await new Promise((resolve) => setTimeout(resolve, 260));
      return /${TARGET_FILE}/.test(window.__pass276Clipboard || '') &&
        /${FIRST_TOKEN}/.test(window.__pass276Clipboard || '') &&
        /${SECOND_TOKEN}/.test(window.__pass276Clipboard || '');
    })();
  `, 5000));

  const hunkAction = await runPaletteCommand(win, `copy evidence ${SECOND_TOKEN}`, "git-hunk-action:copy-evidence:", "2.");
  assertStep("PASS276_GIT_HUNK_ACTION_COMMAND_TRACE", Boolean(hunkAction?.ok &&
    hunkAction.trace?.target === "git-hunk-action" &&
    hunkAction.trace?.action === "copy-evidence" &&
    hunkAction.trace?.scope === "hunk" &&
    hunkAction.trace?.root === GIT_PROJECT_DIR &&
    hunkAction.trace?.selectedPath === TARGET_FILE &&
    hunkAction.trace?.selectedHunkId &&
    hunkAction.trace?.hunkIndex === "2" &&
    hunkAction.trace?.additions === "1" &&
    hunkAction.trace?.deletions === "1" &&
    hunkAction.clipboard === "PASS276_UNTOUCHED"));

  assertStep("PASS276_GIT_HUNK_COPY_ACTION_FOCUSED_WITHOUT_COPY", await waitFor(win, `
    (function() {
      const active = document.querySelector('.workspace-context-button.active')?.textContent || '';
      const selectedFile = document.querySelector('.git-change-item.selected')?.textContent || '';
      const selectedHunk = document.querySelector('.git-hunk-item.selected')?.textContent || '';
      const preview = document.querySelector('.git-diff-preview')?.textContent || '';
      const panel = document.querySelector('.git-selected-evidence-panel');
      const copy = panel?.querySelector('[data-git-action="copy-evidence"]');
      return /\\u53d8\\u66f4/.test(active) &&
        /${TARGET_FILE}/.test(selectedFile) &&
        /2\\./.test(selectedHunk) &&
        /${SECOND_TOKEN}/.test(preview) &&
        !/${FIRST_TOKEN}/.test(preview) &&
        panel?.getAttribute('data-git-focused-action') === 'copy-evidence' &&
        panel?.getAttribute('data-git-evidence-scope') === 'hunk' &&
        copy?.getAttribute('data-git-action-focused') === 'true' &&
        copy?.getAttribute('aria-current') === 'true' &&
        document.activeElement === copy &&
        window.__pass276Clipboard === 'PASS276_UNTOUCHED';
    })();
  `, 10000));

  assertStep("PASS276_GIT_HUNK_COPY_AFTER_FOCUS", await waitFor(win, `
    (async function() {
      const copy = document.querySelector('.git-selected-evidence-panel [data-git-action="copy-evidence"]');
      if (!copy) return false;
      copy.click();
      await new Promise((resolve) => setTimeout(resolve, 260));
      return /Diff hunks:\\s*2/.test(window.__pass276Clipboard || '') &&
        /${SECOND_TOKEN}/.test(window.__pass276Clipboard || '') &&
        !/${FIRST_TOKEN}/.test(window.__pass276Clipboard || '') &&
        /\\u5df2\\u590d\\u5236/.test(document.querySelector('.git-selected-evidence-panel')?.textContent || '');
    })();
  `, 5000));

  console.log("PASS276_GIT_EVIDENCE_ACTION_FOCUS_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS276_FAILED", error?.stack || error);
  try {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      const debug = await win.webContents.executeJavaScript(`
        ({
          active: document.querySelector('.workspace-context-button.active')?.outerHTML || '',
          panel: document.querySelector('.git-selected-evidence-panel')?.outerHTML || '',
          selectedFile: document.querySelector('.git-change-item.selected')?.outerHTML || '',
          selectedHunk: document.querySelector('.git-hunk-item.selected')?.outerHTML || '',
          commands: Array.from(document.querySelectorAll('.command-modal .command-list button')).slice(0, 20).map((button) => ({
            id: button.getAttribute('data-command-id') || '',
            target: button.getAttribute('data-command-target') || '',
            action: button.getAttribute('data-command-git-action') || '',
            text: button.textContent || '',
          })),
          clipboard: window.__pass276Clipboard || '',
        })
      `);
      console.error("PASS276_DEBUG", JSON.stringify(debug, null, 2).slice(0, 16000));
    }
  } catch (_debugError) {
    // ignore debug failures
  }
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS276_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
