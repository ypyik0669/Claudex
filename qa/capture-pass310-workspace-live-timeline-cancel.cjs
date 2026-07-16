const fs = require("fs");
const os = require("os");
const path = require("path");

for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", (error) => {
    if (error?.code !== "EPIPE") throw error;
  });
}

const { app, BrowserWindow } = require("electron");

function findRepoDir() {
  const candidates = [process.env.CLAUDEX_REPO_DIR, process.cwd(), __dirname, path.join(__dirname, "..")] .filter(Boolean);
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
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass310-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass310-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const LIVE_COMMAND = "node -e \"process.stdout.write('pass310 stdout live\\n'); process.stderr.write('pass310 stderr live\\n'); setInterval(() => {}, 1000)\"";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function cleanup() {
  for (const dir of [USER_DATA_DIR, PROJECT_DIR]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_error) {
      // Best-effort cleanup for Windows file-handle races.
    }
  }
}

async function exitWithCleanup(code) {
  let windows = [];
  try {
    windows = typeof BrowserWindow?.getAllWindows === "function" ? BrowserWindow.getAllWindows() : [];
  } catch (_error) {
    // Electron may already be tearing down after a failed boot.
  }

  for (const win of windows) {
    try {
      if (!win || (typeof win.isDestroyed === "function" && win.isDestroyed())) continue;
      if (!win.webContents || (typeof win.webContents.isDestroyed === "function" && win.webContents.isDestroyed())) continue;
      if (typeof win.webContents.executeJavaScript !== "function") continue;
      await win.webContents.executeJavaScript(`
        (async function() {
          const desktop = window.claudexDesktop;
          if (!desktop || typeof desktop.getState !== 'function') return;
          const state = await desktop.getState();
          if (typeof desktop.cancelWorkspaceCommand !== 'function') return;
          const requestIds = Array.from(new Set((state.runEvents || [])
            .filter((event) => event?.type === 'workspace-command' && event?.status === 'running')
            .map((event) => event?.requestId || event?.id)
            .filter(Boolean)));
          for (const requestId of requestIds) {
            try {
              await desktop.cancelWorkspaceCommand({ requestId });
            } catch (_error) {
              // Best-effort cancellation during teardown.
            }
          }
        })()
      `);
    } catch (_error) {
      // A renderer may disappear while cleanup is in progress.
    }
  }

  await wait(350);

  try {
    const currentWindows = typeof BrowserWindow?.getAllWindows === "function" ? BrowserWindow.getAllWindows() : [];
    windows = Array.from(new Set([...windows, ...currentWindows]));
  } catch (_error) {
    // Fall back to the windows captured before cancellation.
  }
  for (const win of windows) {
    try {
      if (win && (typeof win.isDestroyed !== "function" || !win.isDestroyed()) && typeof win.destroy === "function") {
        win.destroy();
      }
    } catch (_error) {
      // Best-effort window teardown.
    }
  }
  await wait(250);
  cleanup();
  try {
    if (typeof app?.exit === "function") app.exit(code);
  } catch (_error) {
    process.exitCode = code;
  }
}

async function waitFor(win, script, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await win.webContents.executeJavaScript(script);
    if (value) return value;
    await wait(120);
  }
  return false;
}

async function waitForStore(predicate, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const state = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      if (predicate(state)) return true;
    } catch (_error) {
      // The store may be between atomic writes.
    }
    await wait(120);
  }
  return false;
}

function assertStep(name, ok) {
  console.log(name, ok);
  if (!ok) throw new Error(`${name} failed`);
}

function writeInitialStore() {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass310-project" }), "utf8");
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
    activeProject: { name: "pass310-project", path: PROJECT_DIR },
    projects: [{ name: "pass310-project", path: PROJECT_DIR }],
    sessions: [{
      id: "default",
      title: "PASS310 workspace live timeline cancel",
      project: "pass310-project",
      projectPath: PROJECT_DIR,
      createdAt: "2026-07-14T00:00:00.000Z",
      updatedAt: "2026-07-14T00:00:00.000Z",
      messages: [],
    }],
    automations: [],
    subagentRuns: [],
    commandRuns: [],
    runEvents: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

async function openWorkspace(win) {
  return win.webContents.executeJavaScript(`
    (() => {
      const panel = document.querySelector('.tools-panel');
      if (!panel || getComputedStyle(panel).display === 'none') {
        const rail = document.querySelector('.tool-rail-button[data-tool="workspace"]');
        if (!rail) return false;
        rail.click();
        return true;
      }
      const button = Array.from(document.querySelectorAll('button.tool-row')).find((item) =>
        /Workspace|\u5de5\u4f5c\u533a/.test(item.textContent || '')
      );
      if (!button) return false;
      if (button.getAttribute('aria-expanded') !== 'true') button.click();
      return true;
    })()
  `);
}

async function setCommand(win) {
  return win.webContents.executeJavaScript(`
    (() => {
      const input = document.querySelector('#workspace-tool-detail .command-runner input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(LIVE_COMMAND)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()
  `);
}

async function clickRunnerButton(win) {
  return win.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector('#workspace-tool-detail .command-runner button');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })()
  `);
}

async function openOutputs(win) {
  return win.webContents.executeJavaScript(`
    (() => {
      if (document.querySelector('.bottom-work-panel .run-timeline')) return true;
      const button = Array.from(document.querySelectorAll('.workspace-context-tabs .workspace-context-button'))[1];
      if (!button) return false;
      button.click();
      return true;
    })()
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS310_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(600);

  assertStep("PASS310_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS310_HAIKU_45", await win.webContents.executeJavaScript(`
    window.claudexDesktop.getState().then((state) => state.settings?.model === 'claude-haiku-4-5-20251001')
  `));
  assertStep("PASS310_OPEN_WORKSPACE", await openWorkspace(win));
  assertStep("PASS310_WORKSPACE_VISIBLE", await waitFor(win, `
    (() => {
      const panel = document.querySelector('.tools-panel');
      return Boolean(panel && getComputedStyle(panel).display !== 'none' && document.querySelector('#workspace-tool-detail .command-runner input'));
    })()
  `, 15000));
  assertStep("PASS310_SET_COMMAND", await setCommand(win));
  assertStep("PASS310_RUN_COMMAND", await clickRunnerButton(win));
  assertStep("PASS310_SIDE_STREAM_LIVE", await waitFor(win, `
    (() => {
      const text = document.querySelector('#workspace-tool-detail .command-output-card.live')?.textContent || '';
      return /pass310 stdout live/.test(text) && /pass310 stderr live/.test(text);
    })()
  `, 10000));
  assertStep("PASS310_OPEN_OUTPUTS", await openOutputs(win));

  const runningEventId = await waitFor(win, `
    (() => {
      const rows = Array.from(document.querySelectorAll('.run-timeline-row.running'));
      const row = rows.find((item) => /pass310 stdout live|setInterval/.test(item.textContent || ''));
      return row?.getAttribute('data-run-event-id') || false;
    })()
  `, 10000);
  assertStep("PASS310_RUNNING_ROW_PRESENT", Boolean(runningEventId));
  assertStep("PASS310_RUNNING_ROW_LIVE_STDOUT_STDERR", await waitFor(win, `
    (() => {
      const row = Array.from(document.querySelectorAll('.run-timeline-row.running'))
        .find((item) => item.getAttribute('data-run-event-id') === ${JSON.stringify(runningEventId)});
      if (!row) return false;
      row.open = true;
      const evidence = row.querySelector('.run-timeline-evidence');
      const visibleOutputs = Array.from(row.querySelectorAll('.subagent-output')).filter((item) => item.getBoundingClientRect().height > 0);
      return Boolean(
        evidence && evidence.getBoundingClientRect().height > 0 &&
        visibleOutputs.some((item) => /pass310 stdout live/.test(item.textContent || '')) &&
        visibleOutputs.some((item) => /pass310 stderr live/.test(item.textContent || ''))
      );
    })()
  `, 10000));
  assertStep("PASS310_RUNNING_ROW_SINGLE_ID", await win.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('.run-timeline-row'))
      .filter((item) => item.getAttribute('data-run-event-id') === ${JSON.stringify(runningEventId)}).length === 1
  `));
  assertStep("PASS310_RUNTIME_METADATA_PERSISTED", await waitForStore((state) => {
    const event = (state.runEvents || []).find((item) => item.id === runningEventId);
    return Boolean(
      event?.runtimeOwner && Number(event.runtimePid) > 0 &&
      event.runtimeCommand && event.runtimeStartedAt &&
      !/pass310 stdout live|setInterval/.test(event.runtimeCommand || "")
    );
  }, 10000));
  assertStep("PASS310_RUNTIME_RECOVERY_STATE_SANITIZED", await win.webContents.executeJavaScript(`
    window.claudexDesktop.getState().then((state) => {
      const event = (state.runEvents || []).find((item) => item.id === ${JSON.stringify(runningEventId)});
      return event?.runtimeRecoveryPending === true && !event.runtimeOwner && !event.runtimePid &&
        !event.runtimeCommand && !event.runtimeExecutable && !event.runtimeStartedAt;
    })
  `));

  assertStep("PASS310_CANCEL_BUTTON_READY", await waitFor(win, `
    Boolean(document.querySelector('#workspace-tool-detail .command-runner button:not(:disabled)'))
  `, 5000));
  assertStep("PASS310_CANCEL_CLICKED", await clickRunnerButton(win));
  assertStep("PASS310_SAME_ROW_CANCELLED", await waitFor(win, `
    (() => {
      const rows = Array.from(document.querySelectorAll('.run-timeline-row'))
        .filter((item) => item.getAttribute('data-run-event-id') === ${JSON.stringify(runningEventId)});
      const row = rows[0];
      if (!row) return false;
      row.open = true;
      return rows.length === 1 && row.classList.contains('cancelled') &&
        /pass310 stdout live/.test(row.textContent || '') && /pass310 stderr live/.test(row.textContent || '');
    })()
  `, 15000));
  assertStep("PASS310_RUNNER_RECOVERED", await waitFor(win, `
    !document.querySelector('#workspace-tool-detail .command-output-card.live') &&
    Boolean(document.querySelector('#workspace-tool-detail .command-output-card.cancelled'))
  `, 15000));
  assertStep("PASS310_CANCELLED_STATE_PERSISTED", await waitForStore((state) => {
    const runs = (state.commandRuns || []).filter((run) => (run.requestId || run.id) === runningEventId);
    const events = (state.runEvents || []).filter((event) => event.id === runningEventId);
    return runs.length === 1 && events.length === 1 &&
      runs[0].cancelled === true && runs[0].code === 130 &&
      /pass310 stdout live/.test(runs[0].stdout || "") && /pass310 stderr live/.test(runs[0].stderr || "") &&
      events[0].status === "cancelled" && events[0].code === 130 &&
      !events[0].runtimeOwner && !events[0].runtimePid && !events[0].runtimeCommand && !events[0].runtimeStartedAt &&
      /pass310 stdout live/.test(events[0].stdout || "") && /pass310 stderr live/.test(events[0].stderr || "");
  }, 15000));

  console.log("PASS310_WORKSPACE_LIVE_TIMELINE_CANCEL_DONE");
  await exitWithCleanup(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS310_FAILED", error?.stack || error);
  void exitWithCleanup(1);
});

setTimeout(() => {
  console.error("PASS310_TIMEOUT");
  void exitWithCleanup(1);
}, 120000);
