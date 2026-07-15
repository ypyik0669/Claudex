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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass327-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass327-project-"));
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
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass327-project" }), "utf8");
  const project = { name: "pass327-project", path: PROJECT_DIR };
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(
      {
        version: 1,
        settings: {
          provider: "anthropic",
          model: "claude-haiku-4-5-20251001",
          language: "zh",
          appearance: { fontSize: "compact", density: "compact" },
          claudeCode: { executionMode: "claude-code", claudeCommand: "claude", permissionMode: "default" },
          capabilities: {},
          customMarketplaces: [],
          apiKeys: {},
        },
        activeProject: project,
        projects: [project],
        sessions: [
          {
            id: "pass327-thread",
            title: "PASS327 responsive tool panel",
            project: project.name,
            projectPath: project.path,
            createdAt: "2026-07-15T00:00:00.000Z",
            updatedAt: "2026-07-15T00:00:01.000Z",
            archived: false,
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
      },
      null,
      2,
    ),
    "utf8",
  );
}

async function responsiveLayout(win, expectedWidth) {
  return win.webContents.executeJavaScript(`
    (function() {
      const grid = document.querySelector('.app-grid');
      const sidebar = document.querySelector('.sidebar');
      const workspace = document.querySelector('.workspace');
      const tools = document.querySelector('.tools-panel');
      const composer = document.querySelector('.prompt-box');
      if (!grid || !sidebar || !workspace || !tools || !composer) return { ok: false, reason: 'missing-element' };
      const workspaceBox = workspace.getBoundingClientRect();
      const toolsBox = tools.getBoundingClientRect();
      const composerBox = composer.getBoundingClientRect();
      const sidebarDisplay = getComputedStyle(sidebar).display;
      const toolsDisplay = getComputedStyle(tools).display;
      return {
        ok: !grid.classList.contains('right-panel-hidden') &&
          sidebarDisplay === 'none' &&
          toolsDisplay !== 'none' &&
          toolsBox.width >= 340 &&
          toolsBox.right <= window.innerWidth + 1 &&
          workspaceBox.width >= 560 &&
          workspaceBox.right <= toolsBox.left + 1 &&
          composerBox.left >= workspaceBox.left &&
          composerBox.right <= workspaceBox.right + 1 &&
          document.documentElement.scrollWidth <= window.innerWidth &&
          window.innerWidth === ${Number(expectedWidth)},
        innerWidth: window.innerWidth,
        sidebarDisplay,
        toolsDisplay,
        workspace: { left: Math.round(workspaceBox.left), right: Math.round(workspaceBox.right), width: Math.round(workspaceBox.width) },
        tools: { left: Math.round(toolsBox.left), right: Math.round(toolsBox.right), width: Math.round(toolsBox.width) },
        composer: { left: Math.round(composerBox.left), right: Math.round(composerBox.right), width: Math.round(composerBox.width) },
        scrollWidth: document.documentElement.scrollWidth,
      };
    })();
  `);
}

async function openPanelAtWidth(win, width, name) {
  win.setContentSize(width, 820);
  await wait(500);
  assertStep(`${name}_CLOSED_RAIL_AND_SIDEBAR`, await waitFor(win, `
    (function() {
      const sidebar = document.querySelector('.sidebar');
      return Boolean(
        document.querySelector('.app-grid.right-panel-hidden') &&
        document.querySelector('.tool-rail') &&
        sidebar && getComputedStyle(sidebar).display !== 'none'
      );
    })();
  `, 5000));
  assertStep(`${name}_OPEN_CLICK`, await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.tool-rail [data-tool="workspace"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep(`${name}_OPEN_STATE`, await waitFor(win, "Boolean(!document.querySelector('.app-grid.right-panel-hidden') && document.querySelector('#workspace-tool-detail'))", 5000));
  const layout = await responsiveLayout(win, width);
  console.log(`${name}_LAYOUT`, layout);
  assertStep(`${name}_PANEL_VISIBLE_WITHOUT_OCCLUSION`, layout?.ok);
  assertStep(`${name}_CLOSE_CLICK`, await win.webContents.executeJavaScript(`
    (function() {
      const buttons = Array.from(document.querySelectorAll('.tools-panel .panel-toggle button'));
      const close = buttons[buttons.length - 1];
      if (!close) return false;
      close.click();
      return true;
    })();
  `));
  assertStep(`${name}_CLOSE_RESTORES_RAIL_AND_SIDEBAR`, await waitFor(win, `
    (function() {
      const sidebar = document.querySelector('.sidebar');
      return Boolean(
        document.querySelector('.app-grid.right-panel-hidden') &&
        document.querySelector('.tool-rail') &&
        sidebar && getComputedStyle(sidebar).display !== 'none'
      );
    })();
  `, 5000));
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS327_FAILED_NO_WINDOW");
  assertStep("PASS327_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  await openPanelAtWidth(win, 1024, "PASS327_MIN_WIDTH");
  await openPanelAtWidth(win, 1240, "PASS327_BREAKPOINT");
  console.log("PASS327_RESPONSIVE_TOOL_PANEL_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS327_RESPONSIVE_TOOL_PANEL_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS327_RESPONSIVE_TOOL_PANEL_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
