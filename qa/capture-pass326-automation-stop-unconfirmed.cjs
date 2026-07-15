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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass326-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass326-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const AUTOMATION_ID = "pass326-unconfirmed-automation";
const RUN_ID = "pass326-unconfirmed-run";

function cleanup() {
  for (const dir of [USER_DATA_DIR, PROJECT_DIR]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_error) {
      // best-effort cleanup
    }
  }
}

function writeInitialStore() {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass326-project" }), "utf8");
  const project = { name: "pass326-project", path: PROJECT_DIR };
  const createdAt = "2026-07-15T00:00:00.000Z";
  fs.writeFileSync(DATA_FILE, JSON.stringify({
    version: 1,
    settings: {
      provider: "ollama",
      model: "claude-haiku-4-5-20251001",
      baseUrl: "http://127.0.0.1:32600",
      temperature: 0.2,
      timeoutMs: 600000,
      language: "zh",
      appearance: { fontSize: "compact", density: "compact" },
      systemPrompt: "PASS326 QA",
      claudeCode: { executionMode: "api", permissionMode: "default" },
      capabilities: {},
      customMarketplaces: [],
      apiKeys: {},
    },
    activeProject: project,
    projects: [project],
    sessions: [
      {
        id: "pass326-session",
        title: "PASS326 unconfirmed stop",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt,
        updatedAt: createdAt,
        messages: [],
      },
    ],
    automations: [
      {
        id: AUTOMATION_ID,
        prompt: "pass326 request that ignores abort",
        enabled: false,
        status: "idle",
        project,
        threadId: "pass326-session",
        schedule: { type: "once", runAt: "" },
        history: [],
        createdAt,
        updatedAt: createdAt,
      },
    ],
    commandRuns: [],
    runEvents: [],
    notices: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
  }, null, 2), "utf8");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(win, script, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await win.webContents.executeJavaScript(script);
    if (value) return value;
    await wait(100);
  }
  return false;
}

function assertStep(name, ok) {
  console.log(name, ok);
  if (!ok) throw new Error(`${name} failed`);
}

async function runTest() {
  await wait(1400);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS326_FAILED_NO_WINDOW");

  assertStep("PASS326_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS326_START_UNABORTABLE_AUTOMATION", await waitFor(win, `
    (async function() {
      if (!window.__pass326Started) {
        window.__pass326Started = true;
        window.claudexDesktop.runAutomationNow({
          automationId: ${JSON.stringify(AUTOMATION_ID)},
          requestId: ${JSON.stringify(RUN_ID)}
        }).catch((error) => { window.__pass326RunError = String(error?.message || error); });
      }
      const state = await window.claudexDesktop.getState();
      const automation = state.automations?.find((item) => item.id === ${JSON.stringify(AUTOMATION_ID)});
      return automation?.lastRun?.id === ${JSON.stringify(RUN_ID)} && automation.lastRun.status === 'running';
    })();
  `, 10000));

  const cancelStartedAt = Date.now();
  const cancelResult = await win.webContents.executeJavaScript(`
    (async function() {
      try {
        await window.claudexDesktop.cancelAutomation({
          automationId: ${JSON.stringify(AUTOMATION_ID)},
          runId: ${JSON.stringify(RUN_ID)}
        });
        return { ok: true };
      } catch (error) {
        return { ok: false, message: String(error?.message || error) };
      }
    })();
  `);
  const cancelDurationMs = Date.now() - cancelStartedAt;
  assertStep("PASS326_STOP_TIMEOUT_REPORTED", !cancelResult.ok && /AUTOMATION_STOP_TIMEOUT/.test(cancelResult.message || ""));
  assertStep("PASS326_STOP_WAITS_FOR_CONFIRMATION_WINDOW", cancelDurationMs >= 4800);

  assertStep("PASS326_RUNNING_STATE_NOT_FALSIFIED", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      const automation = state.automations?.find((item) => item.id === ${JSON.stringify(AUTOMATION_ID)});
      const entry = automation?.history?.find((item) => item.id === ${JSON.stringify(RUN_ID)});
      const event = state.runEvents?.find((item) => item.id === ${JSON.stringify(RUN_ID)});
      return Boolean(
        automation?.status === 'running' &&
        entry?.status === 'running' &&
        !entry.endedAt &&
        entry.code === null &&
        event?.status === 'running' &&
        event.code === null
      );
    })();
  `));

  assertStep("PASS326_DELETE_REMAINS_LOCKED", await win.webContents.executeJavaScript(`
    (async function() {
      try {
        await window.claudexDesktop.deleteAutomation({ automationId: ${JSON.stringify(AUTOMATION_ID)} });
        return false;
      } catch (error) {
        return /AUTOMATION_RUNNING/.test(String(error?.message || error));
      }
    })();
  `));

  const persisted = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  const persistedAutomation = persisted.automations?.find((item) => item.id === AUTOMATION_ID);
  const persistedEntry = persistedAutomation?.history?.find((item) => item.id === RUN_ID);
  assertStep("PASS326_DISK_REMAINS_NONTERMINAL", Boolean(
    persistedAutomation?.status === "running" &&
    persistedEntry?.status === "running" &&
    !persistedEntry.endedAt &&
    persistedEntry.code === null,
  ));

  console.log("PASS326_AUTOMATION_STOP_UNCONFIRMED_DONE");
  const quitStartedAt = Date.now();
  app.once("will-quit", () => {
    const bounded = Date.now() - quitStartedAt < 12000;
    console.log("PASS326_QUIT_DRAIN_BOUNDED", bounded);
    if (!bounded) process.exitCode = 1;
    cleanup();
  });
  app.quit();
}

const originalFetch = global.fetch;
global.fetch = (url, options) => {
  if (String(url).includes("127.0.0.1:32600/api/chat")) {
    void options?.signal;
    return new Promise(() => {});
  }
  return originalFetch(url, options);
};

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS326_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS326_TIMEOUT");
  cleanup();
  app.exit(1);
}, 30000);
