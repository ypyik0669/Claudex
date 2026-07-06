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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass118-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass118-project-"));
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass118-project" }), "utf8");
  execFileSync("git", ["init"], { cwd: PROJECT_DIR, stdio: "ignore" });
  fs.writeFileSync(path.join(PROJECT_DIR, "pass118-change.txt"), "pass118 git evidence\n", "utf8");
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
    activeProject: { name: "pass118-project", path: PROJECT_DIR },
    projects: [{ name: "pass118-project", path: PROJECT_DIR }],
    sessions: [
      {
        id: "default",
        title: "Environment changes deeplink",
        project: "pass118-project",
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

async function openWorkspaceToolAndEnvironment(win) {
  return win.webContents.executeJavaScript(`
    (async function() {
      const rail = document.querySelector('.rail-button[data-tool="workspace"]');
      if (!rail) return false;
      rail.click();
      await new Promise((resolve) => setTimeout(resolve, 300));
      const details = document.querySelector('.environment-status-details');
      if (!details) return false;
      if (!details.open) details.querySelector('summary')?.click();
      await new Promise((resolve) => setTimeout(resolve, 200));
      return Boolean(document.querySelector('.environment-card .environment-row'));
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS118_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS118_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS118_ENVIRONMENT_GIT_READY", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(PROJECT_DIR)} });
      return Boolean(state?.git?.available && state.git.changes >= 1 && /pass118-change/.test(state.git.raw || ''));
    })();
  `, 10000));
  assertStep("PASS118_OPEN_ENVIRONMENT_CARD", await openWorkspaceToolAndEnvironment(win));
  assertStep("PASS118_CLICK_ENVIRONMENT_CHANGES_ROW", await win.webContents.executeJavaScript(`
    (function() {
      const row = [...document.querySelectorAll('.environment-card .environment-row')]
        .find((candidate) => /\\u53d8\\u66f4/.test(candidate.textContent || ''));
      if (!row) return false;
      row.click();
      return true;
    })();
  `));
  assertStep("PASS118_CHANGES_PANEL_OPENED_FROM_ENVIRONMENT", await waitFor(win, `
    Boolean(
      document.querySelector('.workspace-context-button.active')?.textContent?.includes('\\u53d8\\u66f4') &&
      document.querySelector('.bottom-work-panel') &&
      /pass118-change\\.txt/.test(document.querySelector('.bottom-work-panel')?.textContent || '') &&
      document.querySelector('.git-selected-evidence-panel')
    )
  `, 10000));

  console.log("PASS118_ENVIRONMENT_CHANGES_DEEPLINK_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS118_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS118_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
