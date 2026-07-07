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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass278-data-"));
const REPO_PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass278-repo-"));
const REMOTE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass278-remote-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const COMMIT_FILE = "pass278-staged-commit-target.txt";
const PUSH_FILE = "pass278-local-ahead-target.txt";
const COMMIT_MESSAGE = "pass278 focused commit message";
const PUSH_MESSAGE = "pass278 local ahead for push focus";

function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: REPO_PROJECT_DIR,
    stdio: options.stdio || "pipe",
    encoding: options.encoding || "utf8",
  });
}

function gitRaw(args, options = {}) {
  return execFileSync("git", args, {
    stdio: options.stdio || "pipe",
    encoding: options.encoding || "utf8",
  });
}

function cleanup() {
  for (const dir of [USER_DATA_DIR, REPO_PROJECT_DIR, REMOTE_DIR]) {
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
  fs.mkdirSync(REPO_PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPO_PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass278-git-project" }), "utf8");
  fs.writeFileSync(path.join(REPO_PROJECT_DIR, COMMIT_FILE), "pass278 commit baseline\n", "utf8");
  fs.writeFileSync(path.join(REPO_PROJECT_DIR, PUSH_FILE), "pass278 push baseline\n", "utf8");
  gitRaw(["init", "--bare", REMOTE_DIR], { stdio: "ignore" });
  git(["init"], { stdio: "ignore" });
  git(["config", "user.name", "Claudex QA"], { stdio: "ignore" });
  git(["config", "user.email", "qa@example.invalid"], { stdio: "ignore" });
  git(["add", "."], { stdio: "ignore" });
  git(["commit", "-m", "pass278 baseline"], { stdio: "ignore" });
  git(["branch", "-M", "main"], { stdio: "ignore" });
  git(["remote", "add", "origin", REMOTE_DIR], { stdio: "ignore" });
  git(["push", "-u", "origin", "main"], { stdio: "ignore" });
  fs.writeFileSync(path.join(REPO_PROJECT_DIR, PUSH_FILE), "pass278 push baseline\npass278 ahead evidence\n", "utf8");
  git(["add", PUSH_FILE], { stdio: "ignore" });
  git(["commit", "-m", PUSH_MESSAGE], { stdio: "ignore" });
  fs.writeFileSync(path.join(REPO_PROJECT_DIR, COMMIT_FILE), "pass278 commit baseline\npass278 staged evidence\n", "utf8");
  git(["add", COMMIT_FILE], { stdio: "ignore" });
}

function writeInitialStore() {
  const project = { name: "pass278-git-project", path: REPO_PROJECT_DIR };
  writeJson(DATA_FILE, {
    version: 1,
    activeProject: project,
    projects: [project],
    sessions: [
      {
        id: "pass278-session",
        title: "PASS278 git repo action focus",
        project: project.name,
        projectPath: REPO_PROJECT_DIR,
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

async function runPaletteCommand(win, query, prefix) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.__pass278ConfirmCount = 0;
      window.confirm = () => {
        window.__pass278ConfirmCount += 1;
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
        .find((candidate) => (candidate.getAttribute('data-command-id') || '').startsWith(${JSON.stringify(prefix)}));
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
        branch: button.getAttribute('data-command-git-branch') || '',
        stagedCount: button.getAttribute('data-command-git-staged-count') || '',
        upstream: button.getAttribute('data-command-git-upstream') || '',
        sync: button.getAttribute('data-command-git-sync') || '',
      };
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 360));
      return { ok: true, trace, confirmCount: window.__pass278ConfirmCount };
    })();
  `);
}

async function setCommitMessage(win, message) {
  return win.webContents.executeJavaScript(`
    (function() {
      const input = document.querySelector('.git-repo-actions [data-git-action="commit-message"]');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(message)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
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
  if (!win) throw new Error("PASS278_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS278_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS278_ENVIRONMENT_REPO_READY", await waitFor(win, `
    (async function() {
      const env = await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(REPO_PROJECT_DIR)} });
      return Boolean(
        env?.git?.available &&
        env.git.root === ${JSON.stringify(REPO_PROJECT_DIR)} &&
        env.git.upstream &&
        Number(env.git.ahead || 0) >= 1 &&
        Number(env.git.summary?.staged || 0) >= 1
      );
    })();
  `, 10000));

  const commitInputFocus = await runPaletteCommand(win, "git commit staged", "git-repo-action:commit");
  assertStep("PASS278_COMMIT_ACTION_COMMAND_TRACE", Boolean(commitInputFocus?.ok &&
    commitInputFocus.trace?.target === "git-repo-action" &&
    commitInputFocus.trace?.action === "commit" &&
    commitInputFocus.trace?.scope === "repo" &&
    commitInputFocus.trace?.root === REPO_PROJECT_DIR &&
    Number(commitInputFocus.trace?.stagedCount || 0) >= 1 &&
    commitInputFocus.confirmCount === 0));
  assertStep("PASS278_COMMIT_ACTION_FOCUSES_MESSAGE_WITHOUT_COMMIT", await waitFor(win, `
    (async function() {
      const input = document.querySelector('.git-repo-actions [data-git-action="commit-message"]');
      const button = document.querySelector('.git-repo-actions [data-git-action="commit"]');
      const state = await window.claudexDesktop.getState();
      const env = await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(REPO_PROJECT_DIR)} });
      return Boolean(
        document.querySelector('.workspace-context-button.active')?.getAttribute('data-context-tab') === 'changes' &&
        input?.getAttribute('data-git-action-focused') === 'true' &&
        input?.getAttribute('aria-current') === 'true' &&
        document.activeElement === input &&
        button?.getAttribute('data-git-action-focused') === 'true' &&
        button.disabled &&
        window.__pass278ConfirmCount === 0 &&
        Number(env?.git?.summary?.staged || 0) >= 1 &&
        !(state.commandRuns || []).some((run) => /git commit -m/.test(run.command || ''))
      );
    })();
  `, 10000));

  assertStep("PASS278_ENTER_COMMIT_MESSAGE", await setCommitMessage(win, COMMIT_MESSAGE));
  const commitButtonFocus = await runPaletteCommand(win, "git commit staged", "git-repo-action:commit");
  assertStep("PASS278_COMMIT_BUTTON_COMMAND_TRACE", Boolean(commitButtonFocus?.ok &&
    commitButtonFocus.trace?.action === "commit" &&
    commitButtonFocus.confirmCount === 0));
  assertStep("PASS278_COMMIT_ACTION_FOCUSES_BUTTON_WITHOUT_COMMIT", await waitFor(win, `
    (async function() {
      const input = document.querySelector('.git-repo-actions [data-git-action="commit-message"]');
      const button = document.querySelector('.git-repo-actions [data-git-action="commit"]');
      const state = await window.claudexDesktop.getState();
      const env = await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(REPO_PROJECT_DIR)} });
      return Boolean(
        input?.value === ${JSON.stringify(COMMIT_MESSAGE)} &&
        input?.getAttribute('data-git-action-focused') === 'false' &&
        button?.getAttribute('data-git-action-focused') === 'true' &&
        button?.getAttribute('aria-current') === 'true' &&
        document.activeElement === button &&
        !button.disabled &&
        window.__pass278ConfirmCount === 0 &&
        Number(env?.git?.summary?.staged || 0) >= 1 &&
        !(state.commandRuns || []).some((run) => /git commit -m/.test(run.command || ''))
      );
    })();
  `, 10000));
  assertStep("PASS278_COMMIT_CLICK_REACHES_CONFIRM_ONLY", await waitFor(win, `
    (async function() {
      const button = document.querySelector('.git-repo-actions [data-git-action="commit"]');
      if (!button || button.disabled || window.__pass278CommitClicked) return false;
      window.__pass278CommitClicked = true;
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 300));
      const state = await window.claudexDesktop.getState();
      const env = await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(REPO_PROJECT_DIR)} });
      return Boolean(
        window.__pass278ConfirmCount === 1 &&
        Number(env?.git?.summary?.staged || 0) >= 1 &&
        !(state.commandRuns || []).some((run) => /git commit -m/.test(run.command || ''))
      );
    })();
  `, 5000));

  const pushFocus = await runPaletteCommand(win, "git push upstream", "git-repo-action:push");
  assertStep("PASS278_PUSH_ACTION_COMMAND_TRACE", Boolean(pushFocus?.ok &&
    pushFocus.trace?.target === "git-repo-action" &&
    pushFocus.trace?.action === "push" &&
    pushFocus.trace?.scope === "repo" &&
    pushFocus.trace?.root === REPO_PROJECT_DIR &&
    pushFocus.trace?.upstream &&
    pushFocus.confirmCount === 0));
  assertStep("PASS278_PUSH_ACTION_FOCUSES_BUTTON_WITHOUT_PUSH", await waitFor(win, `
    (async function() {
      const button = document.querySelector('.git-repo-actions [data-git-action="push"]');
      const state = await window.claudexDesktop.getState();
      const env = await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(REPO_PROJECT_DIR)} });
      return Boolean(
        button?.getAttribute('data-git-action-focused') === 'true' &&
        button?.getAttribute('aria-current') === 'true' &&
        document.activeElement === button &&
        !button.disabled &&
        window.__pass278ConfirmCount === 0 &&
        Number(env?.git?.ahead || 0) >= 1 &&
        !(state.commandRuns || []).some((run) => /^git push$/.test(run.command || ''))
      );
    })();
  `, 10000));
  assertStep("PASS278_PUSH_CLICK_REACHES_CONFIRM_ONLY", await waitFor(win, `
    (async function() {
      const button = document.querySelector('.git-repo-actions [data-git-action="push"]');
      if (!button || button.disabled || window.__pass278PushClicked) return false;
      window.__pass278PushClicked = true;
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 300));
      const state = await window.claudexDesktop.getState();
      const env = await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(REPO_PROJECT_DIR)} });
      return Boolean(
        window.__pass278ConfirmCount === 1 &&
        Number(env?.git?.ahead || 0) >= 1 &&
        !(state.commandRuns || []).some((run) => /^git push$/.test(run.command || ''))
      );
    })();
  `, 5000));

  const remoteSubject = gitRaw(["--git-dir", REMOTE_DIR, "log", "-1", "--pretty=%s", "refs/heads/main"]).trim();
  assertStep("PASS278_REMOTE_NOT_PUSHED", remoteSubject === "pass278 baseline");
  const lastLocalSubject = git(["log", "-1", "--pretty=%s"]).trim();
  assertStep("PASS278_LOCAL_COMMIT_NOT_CREATED", lastLocalSubject === PUSH_MESSAGE);

  console.log("PASS278_GIT_REPO_ACTION_FOCUS_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS278_FAILED", error?.stack || error);
  try {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      const debug = await win.webContents.executeJavaScript(`
        ({
          active: document.querySelector('.workspace-context-button.active')?.outerHTML || '',
          repoActions: document.querySelector('.git-repo-actions')?.outerHTML || '',
          commands: Array.from(document.querySelectorAll('.command-modal .command-list button')).slice(0, 20).map((button) => ({
            id: button.getAttribute('data-command-id') || '',
            target: button.getAttribute('data-command-target') || '',
            action: button.getAttribute('data-command-git-action') || '',
            text: button.textContent || '',
          })),
          confirmCount: window.__pass278ConfirmCount || 0,
        })
      `);
      console.error("PASS278_DEBUG", JSON.stringify(debug, null, 2).slice(0, 16000));
    }
  } catch (_debugError) {
    // ignore debug failures
  }
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS278_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
