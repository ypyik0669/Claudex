const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

function findRepoDir() {
  const candidates = [process.env.CLAUDEX_REPO_DIR, process.cwd(), __dirname, path.join(__dirname, "..")].filter(Boolean);
  for (const candidate of candidates) {
    let current = path.resolve(candidate);
    while (current && current !== path.dirname(current)) {
      if (fs.existsSync(path.join(current, "package.json")) && fs.existsSync(path.join(current, "electron", "main.cjs"))) {
        return current;
      }
      current = path.dirname(current);
    }
  }
  throw new Error("Unable to locate Claudex repo root");
}

const REPO_DIR = findRepoDir();
process.chdir(REPO_DIR);

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass328-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass328-project-"));

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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass328-project" }), "utf8");
  const project = { name: "pass328-project", path: PROJECT_DIR };
  fs.writeFileSync(
    path.join(USER_DATA_DIR, "desktop-data.json"),
    JSON.stringify({
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
      sessions: [{
        id: "pass328-thread",
        title: "PASS328 tool rail semantics",
        project: project.name,
        projectPath: project.path,
        createdAt: "2026-07-15T00:00:00.000Z",
        updatedAt: "2026-07-15T00:00:01.000Z",
        archived: false,
        messages: [],
      }],
      commandRuns: [],
      runEvents: [],
      automations: [],
      subagentRuns: [],
      sourceRefs: [],
      browserVisits: [],
      notices: [],
    }, null, 2),
    "utf8",
  );
}

async function railSemantics(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const rail = document.querySelector('.tool-rail');
      const capability = rail?.querySelector('button[data-tool="capabilities"]');
      const footerButtons = Array.from(rail?.querySelectorAll('.tool-rail-footer button') || []);
      const projectStatus = rail?.querySelector('.tool-rail-project-dot');
      return {
        ok: Boolean(
          rail &&
          capability &&
          capability.getAttribute('aria-label') &&
          footerButtons.length === 1 &&
          footerButtons[0].getAttribute('aria-label') &&
          projectStatus?.getAttribute('role') === 'status' &&
          projectStatus?.getAttribute('aria-label') &&
          projectStatus?.getAttribute('data-project-status') === 'ready'
        ),
        capabilityLabel: capability?.getAttribute('aria-label') || '',
        footerLabels: footerButtons.map((button) => button.getAttribute('aria-label') || ''),
        projectStatus: projectStatus?.outerHTML || '',
      };
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS328_FAILED_NO_WINDOW");
  win.setContentSize(1480, 900);
  await wait(500);

  assertStep("PASS328_READY", await waitFor(win, "Boolean(document.querySelector('.tool-rail') && window.claudexDesktop)", 15000));
  const semantics = await railSemantics(win);
  console.log("PASS328_SEMANTICS", semantics);
  assertStep("PASS328_SINGLE_CAPABILITY_ENTRY_AND_PROJECT_STATUS", semantics?.ok);
  assertStep("PASS328_CAPABILITY_DEEPLINK", await win.webContents.executeJavaScript(`
    (function() {
      const capability = document.querySelector('.tool-rail button[data-tool="capabilities"]');
      if (!capability) return false;
      capability.click();
      return true;
    })();
  `));
  assertStep("PASS328_CAPABILITY_SURFACE", await waitFor(win, "Boolean(document.querySelector('.plugin-manager-modal') && document.querySelector('.plugin-manager-tabs button.active'))", 5000));
  console.log("PASS328_TOOL_RAIL_SEMANTICS_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS328_TOOL_RAIL_SEMANTICS_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS328_TOOL_RAIL_SEMANTICS_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
