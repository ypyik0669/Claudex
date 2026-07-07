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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass279-data-"));
const GIT_PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass279-git-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const STAGED_FILE = "pass279-staged.txt";
const UNSTAGED_FILE = "pass279-unstaged.txt";
const UNTRACKED_FILE = "pass279-untracked.txt";
const STAGED_TOKEN = "pass279 staged bucket evidence";
const UNSTAGED_TOKEN = "pass279 unstaged bucket evidence";
const UNTRACKED_TOKEN = "pass279 untracked bucket evidence";

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
  return execFileSync("git", args, {
    cwd: GIT_PROJECT_DIR,
    stdio: options.stdio || "pipe",
    encoding: options.encoding || "utf8",
  });
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function setupGitProject() {
  fs.mkdirSync(GIT_PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass279-git-project" }), "utf8");
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, STAGED_FILE), "pass279 staged baseline\n", "utf8");
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, UNSTAGED_FILE), "pass279 unstaged baseline\n", "utf8");
  git(["init"], { stdio: "ignore" });
  git(["config", "user.name", "Claudex QA"], { stdio: "ignore" });
  git(["config", "user.email", "qa@example.invalid"], { stdio: "ignore" });
  git(["add", "."], { stdio: "ignore" });
  git(["commit", "-m", "pass279 baseline"], { stdio: "ignore" });
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, STAGED_FILE), `pass279 staged baseline\n${STAGED_TOKEN}\n`, "utf8");
  git(["add", STAGED_FILE], { stdio: "ignore" });
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, UNSTAGED_FILE), `pass279 unstaged baseline\n${UNSTAGED_TOKEN}\n`, "utf8");
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, UNTRACKED_FILE), `${UNTRACKED_TOKEN}\n`, "utf8");
}

function writeInitialStore() {
  const project = { name: "pass279-git-project", path: GIT_PROJECT_DIR };
  writeJson(DATA_FILE, {
    version: 1,
    activeProject: project,
    projects: [project],
    sessions: [
      {
        id: "pass279-session",
        title: "PASS279 git summary bucket deeplink",
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

async function runPaletteCommand(win, query, id) {
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
      const button = Array.from(document.querySelectorAll('.command-modal .command-list button'))
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === ${JSON.stringify(id)});
      if (!button) {
        return {
          ok: false,
          reason: 'no command',
          visible: Array.from(document.querySelectorAll('.command-modal .command-list button')).slice(0, 20).map((candidate) => ({
            id: candidate.getAttribute('data-command-id') || '',
            target: candidate.getAttribute('data-command-target') || '',
            kind: candidate.getAttribute('data-command-git-summary-kind') || '',
            text: candidate.textContent || '',
          })),
        };
      }
      const trace = {
        id: button.getAttribute('data-command-id') || '',
        target: button.getAttribute('data-command-target') || '',
        scope: button.getAttribute('data-command-git-evidence-scope') || '',
        action: button.getAttribute('data-command-git-action') || '',
        kind: button.getAttribute('data-command-git-summary-kind') || '',
        count: button.getAttribute('data-command-git-summary-count') || '',
        root: button.getAttribute('data-command-git-root') || '',
        branch: button.getAttribute('data-command-git-branch') || '',
      };
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 420));
      return { ok: true, trace };
    })();
  `);
}

async function assertBucketFocused(win, kind, fileName, token) {
  return waitFor(win, `
    (async function() {
      const chip = document.querySelector('.git-summary-chip[data-git-summary-kind="${kind}"]');
      const activeTab = document.querySelector('.workspace-context-button.active')?.getAttribute('data-context-tab') || '';
      const selected = document.querySelector('.git-change-item.selected')?.textContent || '';
      const list = document.querySelector('.git-change-list')?.textContent || '';
      const panel = document.querySelector('.git-selected-evidence-panel')?.textContent || '';
      const preview = document.querySelector('.git-diff-preview')?.textContent || '';
      const state = await window.claudexDesktop.getState();
      return Boolean(
        activeTab === 'changes' &&
        chip?.getAttribute('data-git-summary-selected') === 'true' &&
        chip?.getAttribute('data-git-summary-focused') === 'true' &&
        chip?.getAttribute('aria-pressed') === 'true' &&
        document.activeElement === chip &&
        selected.includes(${JSON.stringify(fileName)}) &&
        list.includes(${JSON.stringify(fileName)}) &&
        panel.includes(${JSON.stringify(fileName)}) &&
        panel.includes(${JSON.stringify(token)}) &&
        preview.includes(${JSON.stringify(token)}) &&
        (state.commandRuns || []).length === 0
      );
    })();
  `, 10000);
}

setupGitProject();
app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS279_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS279_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS279_ENVIRONMENT_BUCKETS_READY", await waitFor(win, `
    (async function() {
      const env = await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(GIT_PROJECT_DIR)} });
      const files = env?.git?.files || [];
      return Boolean(
        env?.git?.available &&
        env.git.root === ${JSON.stringify(GIT_PROJECT_DIR)} &&
        Number(env.git.summary?.staged || 0) >= 1 &&
        Number(env.git.summary?.unstaged || 0) >= 1 &&
        Number(env.git.summary?.untracked || 0) >= 1 &&
        files.some((file) => file.path === ${JSON.stringify(STAGED_FILE)} && file.staged) &&
        files.some((file) => file.path === ${JSON.stringify(UNSTAGED_FILE)} && file.unstaged) &&
        files.some((file) => file.path === ${JSON.stringify(UNTRACKED_FILE)} && file.untracked) &&
        /${STAGED_TOKEN}/.test(env.git.diff?.text || '') &&
        /${UNSTAGED_TOKEN}/.test(env.git.diff?.text || '') &&
        /${UNTRACKED_TOKEN}/.test(env.git.diff?.text || '')
      );
    })();
  `, 12000));

  const staged = await runPaletteCommand(win, "git summary staged pass279", "git-summary:staged");
  assertStep("PASS279_STAGED_BUCKET_COMMAND_TRACE", Boolean(staged?.ok && staged.trace?.target === "git-summary" && staged.trace?.scope === "summary" && staged.trace?.action === "filter:staged" && staged.trace?.kind === "staged" && staged.trace?.root === GIT_PROJECT_DIR && Number(staged.trace?.count || 0) >= 1));
  assertStep("PASS279_STAGED_BUCKET_FOCUSED", await assertBucketFocused(win, "staged", STAGED_FILE, STAGED_TOKEN));

  const unstaged = await runPaletteCommand(win, "git summary unstaged pass279", "git-summary:unstaged");
  assertStep("PASS279_UNSTAGED_BUCKET_COMMAND_TRACE", Boolean(unstaged?.ok && unstaged.trace?.target === "git-summary" && unstaged.trace?.scope === "summary" && unstaged.trace?.action === "filter:unstaged" && unstaged.trace?.kind === "unstaged" && unstaged.trace?.root === GIT_PROJECT_DIR && Number(unstaged.trace?.count || 0) >= 1));
  assertStep("PASS279_UNSTAGED_BUCKET_FOCUSED", await assertBucketFocused(win, "unstaged", UNSTAGED_FILE, UNSTAGED_TOKEN));

  const untracked = await runPaletteCommand(win, "git summary untracked pass279", "git-summary:untracked");
  assertStep("PASS279_UNTRACKED_BUCKET_COMMAND_TRACE", Boolean(untracked?.ok && untracked.trace?.target === "git-summary" && untracked.trace?.scope === "summary" && untracked.trace?.action === "filter:untracked" && untracked.trace?.kind === "untracked" && untracked.trace?.root === GIT_PROJECT_DIR && Number(untracked.trace?.count || 0) >= 1));
  assertStep("PASS279_UNTRACKED_BUCKET_FOCUSED", await assertBucketFocused(win, "untracked", UNTRACKED_FILE, UNTRACKED_TOKEN));

  assertStep("PASS279_BUCKET_CLICK_TOGGLES_FILTER_OFF", await waitFor(win, `
    (async function() {
      const chip = document.querySelector('.git-summary-chip[data-git-summary-kind="untracked"]');
      if (!chip) return false;
      if (!window.__pass279UntrackedChipClicked) {
        window.__pass279UntrackedChipClicked = true;
        chip.click();
        return false;
      }
      const all = document.querySelector('.git-change-item.selected')?.textContent || '';
      const panel = document.querySelector('.git-selected-evidence-panel')?.textContent || '';
      const preview = document.querySelector('.git-diff-preview')?.textContent || '';
      const state = await window.claudexDesktop.getState();
      return chip.getAttribute('data-git-summary-selected') === 'false' &&
        chip.getAttribute('data-git-summary-focused') === 'false' &&
        /Σ|All|全部/.test(all) &&
        panel.includes(${JSON.stringify(STAGED_TOKEN)}) &&
        panel.includes(${JSON.stringify(UNSTAGED_TOKEN)}) &&
        panel.includes(${JSON.stringify(UNTRACKED_TOKEN)}) &&
        preview.includes(${JSON.stringify(STAGED_TOKEN)}) &&
        preview.includes(${JSON.stringify(UNSTAGED_TOKEN)}) &&
        preview.includes(${JSON.stringify(UNTRACKED_TOKEN)}) &&
        (state.commandRuns || []).length === 0;
    })();
  `, 5000));

  console.log("PASS279_GIT_SUMMARY_BUCKET_DEEPLINK_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS279_FAILED", error?.stack || error);
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
          selected: document.querySelector('.git-change-item.selected')?.textContent || '',
          panel: document.querySelector('.git-selected-evidence-panel')?.textContent || '',
          preview: document.querySelector('.git-diff-preview')?.textContent || '',
          commands: Array.from(document.querySelectorAll('.command-modal .command-list button')).slice(0, 20).map((button) => ({
            id: button.getAttribute('data-command-id') || '',
            target: button.getAttribute('data-command-target') || '',
            kind: button.getAttribute('data-command-git-summary-kind') || '',
            text: button.textContent || '',
          })),
        })
      `);
      console.error("PASS279_DEBUG", JSON.stringify(debug, null, 2).slice(0, 16000));
    }
  } catch (_debugError) {
    // ignore debug failures
  }
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS279_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
