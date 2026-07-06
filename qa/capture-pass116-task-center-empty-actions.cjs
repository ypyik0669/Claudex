const fs = require("fs");
const os = require("os");
const path = require("path");
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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass116-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass116-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");

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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass116-project" }), "utf8");
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
    activeProject: { name: "pass116-project", path: PROJECT_DIR },
    projects: [{ name: "pass116-project", path: PROJECT_DIR }],
    sessions: [
      {
        id: "default",
        title: "Task center empty actions",
        project: "pass116-project",
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

async function openTaskCenter(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      if (document.querySelector('.bottom-work-panel .subagent-workbench')) return true;
      const button = [...document.querySelectorAll('.workspace-context-tabs .workspace-context-button')]
        .find((candidate) => /\\u5b50\\u4ee3\\u7406/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS116_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS116_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS116_OPEN_TASK_CENTER", await openTaskCenter(win));
  assertStep("PASS116_EMPTY_ACTIONS_VISIBLE", await waitFor(win, `
    (function() {
      const automationEmpty = document.querySelector('.automation-task-section .empty-panel');
      const subagentEmpty = document.querySelector('.subagent-run-list .empty-panel');
      const automationButton = [...(automationEmpty?.querySelectorAll('button') || [])]
        .find((button) => /\\u81ea\\u52a8\\u5316/.test(button.textContent || ''));
      const runSubagentButton = [...(subagentEmpty?.querySelectorAll('button') || [])]
        .find((button) => /\\u8fd0\\u884c\\u5b50\\u4ee3\\u7406/.test(button.textContent || ''));
      return Boolean(
        automationEmpty &&
        subagentEmpty &&
        /\\u8fd8\\u6ca1\\u6709\\u81ea\\u52a8\\u5316\\u4efb\\u52a1/.test(automationEmpty.textContent || '') &&
        /\\u8fd8\\u6ca1\\u6709\\u5b50\\u4ee3\\u7406\\u8fd0\\u884c\\u8bb0\\u5f55/.test(subagentEmpty.textContent || '') &&
        automationButton &&
        runSubagentButton
      );
    })();
  `, 10000));

  assertStep("PASS116_OPEN_AUTOMATION_FROM_EMPTY", await win.webContents.executeJavaScript(`
    (function() {
      const automationEmpty = document.querySelector('.automation-task-section .empty-panel');
      const button = [...(automationEmpty?.querySelectorAll('button') || [])]
        .find((candidate) => /\\u81ea\\u52a8\\u5316/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS116_SCHEDULED_MODAL_OPENED", await waitFor(win, `
    Boolean(
      document.querySelector('.scheduled-modal') &&
      document.querySelector('.scheduled-modal textarea') &&
      /\\u4fdd\\u5b58\\u5230\\u4e3b\\u8fdb\\u7a0b\\u672c\\u5730\\u961f\\u5217/.test(document.querySelector('.scheduled-modal')?.textContent || '')
    )
  `, 10000));
  assertStep("PASS116_CLOSE_SCHEDULED_MODAL", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.scheduled-modal header .icon-only');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS116_TASK_CENTER_RESTORED", await waitFor(win, "Boolean(document.querySelector('.bottom-work-panel .subagent-workbench'))", 10000));

  assertStep("PASS116_FOCUS_SUBAGENT_INPUT_FROM_EMPTY", await win.webContents.executeJavaScript(`
    (function() {
      const subagentEmpty = document.querySelector('.subagent-run-list .empty-panel');
      const button = [...(subagentEmpty?.querySelectorAll('button') || [])]
        .find((candidate) => /\\u8fd0\\u884c\\u5b50\\u4ee3\\u7406/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return document.activeElement === document.querySelector('.subagent-form textarea');
    })();
  `));

  console.log("PASS116_TASK_CENTER_EMPTY_ACTIONS_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS116_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS116_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
