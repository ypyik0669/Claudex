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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass119-data-"));
const GIT_ROOT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass119-root-"));
const PROJECT_DIR = path.join(GIT_ROOT_DIR, "packages", "pass119-app");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const PROJECT_RELATIVE = "packages/pass119-app";

function cleanup() {
  for (const dir of [USER_DATA_DIR, GIT_ROOT_DIR]) {
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
  fs.writeFileSync(path.join(GIT_ROOT_DIR, "README.md"), "pass119 root\n", "utf8");
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass119-app" }), "utf8");
  execFileSync("git", ["init"], { cwd: GIT_ROOT_DIR, stdio: "ignore" });
  fs.writeFileSync(path.join(PROJECT_DIR, "pass119-change.txt"), "pass119 local environment evidence\n", "utf8");
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
    activeProject: { name: "pass119-app", path: PROJECT_DIR },
    projects: [{ name: "pass119-app", path: PROJECT_DIR }],
    sessions: [
      {
        id: "default",
        title: "Environment local deeplink",
        project: "pass119-app",
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

async function clickEnvironmentRow(win, labelPattern) {
  return win.webContents.executeJavaScript(`
    (function() {
      const pattern = new RegExp(${JSON.stringify(labelPattern)});
      const row = [...document.querySelectorAll('.environment-card .environment-row')]
        .find((candidate) => pattern.test(candidate.textContent || ''));
      if (!row || row.disabled) return false;
      row.click();
      return true;
    })();
  `);
}

async function openChangesPanel(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.workspace-context-button')]
        .find((candidate) => /\\u53d8\\u66f4/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS119_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS119_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS119_ENVIRONMENT_RELATIVE_READY", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(PROJECT_DIR)} });
      return Boolean(state?.git?.available && state.git.root === ${JSON.stringify(GIT_ROOT_DIR)} && state.git.relativePath === ${JSON.stringify(PROJECT_RELATIVE)});
    })();
  `, 10000));
  assertStep("PASS119_OPEN_ENVIRONMENT_CARD", await openWorkspaceToolAndEnvironment(win));
  assertStep("PASS119_CLICK_LOCAL_ROW", await clickEnvironmentRow(win, "\\u672c\\u5730"));
  assertStep("PASS119_LOCAL_ROW_OPENED_ENVIRONMENT_PANEL", await waitFor(win, `
    Boolean(
      document.querySelector('.workspace-context-button.active')?.textContent?.includes('\\u73af\\u5883') &&
      document.querySelector('.bottom-work-panel') &&
      (document.querySelector('.bottom-work-panel')?.textContent || '').includes(${JSON.stringify(PROJECT_RELATIVE)})
    )
  `, 10000));
  assertStep("PASS119_SWITCH_TO_CHANGES_PANEL", await openChangesPanel(win));
  assertStep("PASS119_CHANGES_PANEL_ACTIVE_BEFORE_RELATIVE_CLICK", await waitFor(win, `
    Boolean(document.querySelector('.workspace-context-button.active')?.textContent?.includes('\\u53d8\\u66f4'))
  `, 5000));
  assertStep("PASS119_CLICK_RELATIVE_ROW", await clickEnvironmentRow(win, "\\u9879\\u76ee\\u76f8\\u5bf9\\u8def\\u5f84"));
  assertStep("PASS119_RELATIVE_ROW_OPENED_ENVIRONMENT_PANEL", await waitFor(win, `
    Boolean(
      document.querySelector('.workspace-context-button.active')?.textContent?.includes('\\u73af\\u5883') &&
      document.querySelector('.bottom-work-panel') &&
      (document.querySelector('.bottom-work-panel')?.textContent || '').includes(${JSON.stringify(PROJECT_RELATIVE)})
    )
  `, 10000));

  console.log("PASS119_ENVIRONMENT_LOCAL_DEEPLINK_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS119_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS119_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
