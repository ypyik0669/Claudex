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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass214-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass214-project-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass214-bin-"));
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const OLD_FILE = "pass214-old-name.txt";
const NEW_FILE = "pass214-new-name.txt";
const BASE_CONTENT = ["line1", "line2", "line3", "line4", "line5", ""].join("\n");
const RENAMED_CONTENT = ["line1", "line2", "line3", "line4", "line5", "line6 pass214 rename evidence", ""].join("\n");

function cleanup() {
  for (const dir of [USER_DATA_DIR, PROJECT_DIR, FAKE_BIN_DIR]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_error) {
      // best-effort cleanup
    }
  }
}

function git(args) {
  execFileSync("git", args, { cwd: PROJECT_DIR, stdio: "ignore" });
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
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

function writeFakeClaude() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(
    FAKE_CLAUDE,
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass214& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins: none& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces: none& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass214 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function writeInitialStore() {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass214-project" }), "utf8");
  fs.writeFileSync(path.join(PROJECT_DIR, OLD_FILE), BASE_CONTENT, "utf8");
  git(["init"]);
  git(["config", "user.name", "Claudex QA"]);
  git(["config", "user.email", "qa@example.invalid"]);
  git(["add", "package.json", OLD_FILE]);
  git(["commit", "-m", "pass214 baseline"]);
  git(["mv", OLD_FILE, NEW_FILE]);
  fs.writeFileSync(path.join(PROJECT_DIR, NEW_FILE), RENAMED_CONTENT, "utf8");
  git(["add", NEW_FILE]);
  writeFakeClaude();
  const project = { name: "pass214-project", path: PROJECT_DIR };
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
        id: "pass214-session",
        title: "Pass214 git rename evidence",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-08T02:14:00.000Z",
        updatedAt: "2026-07-08T02:14:00.000Z",
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
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));
      return true;
    })();
  `);
}

async function debugSnapshot(win) {
  if (!win) return null;
  return win.webContents.executeJavaScript(`
    (async function() {
      return {
        commands: [...document.querySelectorAll('.command-modal .command-list button')].map((button) => ({
          id: button.getAttribute('data-command-id'),
          target: button.getAttribute('data-command-target'),
          text: button.textContent,
        })),
        changes: document.querySelector('.bottom-work-panel')?.textContent || '',
        selected: document.querySelector('.git-selected-evidence-panel')?.textContent || '',
        diff: document.querySelector('.git-diff-preview')?.textContent || '',
        env: await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(PROJECT_DIR)} }).catch((error) => ({ error: String(error?.message || error) })),
      };
    })();
  `).catch((error) => ({ error: String(error?.message || error) }));
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS214_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS214_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS214_RENAME_ENVIRONMENT_READY", await waitFor(win, `
    (async function() {
      const env = await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(PROJECT_DIR)} });
      const file = (env?.git?.files || []).find((item) => item.path === ${JSON.stringify(NEW_FILE)});
      const diff = env?.git?.diff?.text || '';
      return Boolean(
        env?.git?.available &&
        env.git.summary?.renamed === 1 &&
        env.git.summary?.staged === 1 &&
        file &&
        file.kind === 'renamed' &&
        file.status === 'R' &&
        file.previousPath === ${JSON.stringify(OLD_FILE)} &&
        file.hasDiff === true &&
        /rename from pass214-old-name/.test(diff) &&
        /rename to pass214-new-name/.test(diff) &&
        /pass214 rename evidence/.test(diff)
      );
    })();
  `, 12000));

  assertStep("PASS214_OPEN_CHANGES", await openChanges(win));
  assertStep("PASS214_RENAMED_CHANGE_VISIBLE", await waitFor(win, `
    (function() {
      const item = [...document.querySelectorAll('.git-change-item')]
        .find((candidate) => /${NEW_FILE}/.test(candidate.textContent || ''));
      const summary = document.querySelector('.git-change-summary')?.textContent || '';
      const diff = document.querySelector('.git-diff-preview')?.textContent || '';
      return Boolean(
        item &&
        item.classList.contains('kind-renamed') &&
        /${OLD_FILE}/.test(item.textContent || '') &&
        /${NEW_FILE}/.test(item.textContent || '') &&
        /\\u91cd\\u547d\\u540d\\s*1/.test(summary) &&
        /rename from pass214-old-name/.test(diff) &&
        /rename to pass214-new-name/.test(diff)
      );
    })();
  `, 10000));

  assertStep("PASS214_OPEN_PALETTE_OLD_PATH", await openPaletteAndQuery(win, OLD_FILE));
  assertStep("PASS214_PALETTE_FINDS_RENAMED_FILE_BY_OLD_PATH", await waitFor(win, `
    (function() {
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) =>
          (candidate.getAttribute('data-command-id') || '').startsWith('git-file:') &&
          /${NEW_FILE}/.test(candidate.textContent || '') &&
          /\\u91cd\\u547d\\u540d/.test(candidate.textContent || '')
        );
      return Boolean(button);
    })();
  `, 8000));
  assertStep("PASS214_CLICK_RENAMED_FILE_COMMAND", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) =>
          (candidate.getAttribute('data-command-id') || '').startsWith('git-file:') &&
          /${NEW_FILE}/.test(candidate.textContent || '')
        );
      if (!button) return false;
      button.click();
      return true;
    })();
  `));

  assertStep("PASS214_RENAMED_EVIDENCE_SELECTED", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.git-selected-evidence-panel');
      const panelText = panel?.textContent || '';
      const preview = document.querySelector('.git-diff-preview')?.textContent || '';
      const selected = document.querySelector('.git-change-item.selected')?.textContent || '';
      return Boolean(
        panel &&
        panel.classList.contains('kind-renamed') &&
        /${NEW_FILE}/.test(selected) &&
        /\\u91cd\\u547d\\u540d/.test(panelText) &&
        /\\u539f\\u8def\\u5f84/.test(panelText) &&
        /${OLD_FILE}/.test(panelText) &&
        /${NEW_FILE}/.test(panelText) &&
        /R/.test(panelText) &&
        /rename from pass214-old-name/.test(preview) &&
        /rename to pass214-new-name/.test(preview) &&
        /pass214 rename evidence/.test(preview) &&
        panel.querySelector('[data-git-action="open-workspace-file"]') &&
        panel.querySelector('[data-git-action="unstage-file"]')
      );
    })();
  `, 10000));

  assertStep("PASS214_COPY_RENAMED_GIT_EVIDENCE", await win.webContents.executeJavaScript(`
    (async function() {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text) => { window.__pass214Clipboard = String(text || ''); } },
      });
      const copy = document.querySelector('.git-selected-evidence-panel [data-git-action="copy-evidence"]');
      if (!copy) return false;
      copy.click();
      await new Promise((resolve) => setTimeout(resolve, 250));
      const copied = window.__pass214Clipboard || '';
      return /\\u91cd\\u547d\\u540d/.test(copied) &&
        /\\u539f\\u8def\\u5f84: ${OLD_FILE}/.test(copied) &&
        /${NEW_FILE}/.test(copied) &&
        /status: R/.test(copied) &&
        /rename from pass214-old-name/.test(copied) &&
        /rename to pass214-new-name/.test(copied) &&
        /pass214 rename evidence/.test(copied);
    })();
  `));

  console.log("PASS214_GIT_RENAME_EVIDENCE_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS214_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      const debug = await debugSnapshot(win);
      console.error("PASS214_DEBUG", JSON.stringify(debug, null, 2).slice(0, 12000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS214_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
