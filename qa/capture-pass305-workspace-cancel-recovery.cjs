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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass305-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass305-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const CANCEL_COMMAND = "node -e \"setTimeout(() => console.log('pass305 should not finish'), 8000)\"";
const RECOVERY_COMMAND = "node -e \"console.log('pass305 after cancel ok')\"";

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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass305-project" }, null, 2), "utf8");
  fs.writeFileSync(path.join(PROJECT_DIR, "README.md"), "# pass305 workspace cancel recovery\n", "utf8");
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
    activeProject: { name: "pass305-project", path: PROJECT_DIR },
    projects: [{ name: "pass305-project", path: PROJECT_DIR }],
    sessions: [
      {
        id: "default",
        title: "Workspace cancel recovery",
        project: "pass305-project",
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-09T00:00:00.000Z",
        updatedAt: "2026-07-09T00:00:00.000Z",
        messages: [
          { role: "user", content: "PASS305 verify command cancel recovers runner.", createdAt: "2026-07-09T00:00:00.000Z" },
        ],
      },
    ],
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
    (function() {
      const rail = document.querySelector('.rail-button[data-tool="workspace"]');
      if (rail) {
        rail.click();
        return true;
      }
      const row = Array.from(document.querySelectorAll('button.tool-row'))
        .find((item) => /Workspace|\\u5de5\\u4f5c\\u533a/.test(item.textContent || ''));
      if (!row) return false;
      row.click();
      return true;
    })();
  `);
}

async function setCommand(win, command) {
  return win.webContents.executeJavaScript(`
    (function() {
      const input = document.querySelector('#workspace-tool-detail .command-runner input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(command)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })();
  `);
}

async function clickRunnerButton(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('#workspace-tool-detail .command-runner button');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `);
}

async function debugState(win) {
  return win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState().catch((error) => ({ error: String(error?.message || error) }));
      return {
        commandRuns: (state.commandRuns || []).slice(0, 5),
        runEvents: (state.runEvents || []).slice(0, 8),
        runner: document.querySelector('#workspace-tool-detail .command-runner')?.outerHTML || '',
        outputs: document.querySelector('.bottom-work-panel')?.textContent?.slice(0, 3000) || '',
        body: document.body.textContent.slice(0, 4000),
      };
    })();
  `).catch((error) => ({ error: String(error?.message || error) }));
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS305_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS305_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS305_OPEN_WORKSPACE", await openWorkspace(win));
  assertStep("PASS305_WORKSPACE_READY", await waitFor(win, "Boolean(document.querySelector('#workspace-tool-detail .command-runner input'))", 15000));

  assertStep("PASS305_START_LONG_COMMAND", await setCommand(win, CANCEL_COMMAND));
  assertStep("PASS305_CLICK_RUN_LONG_COMMAND", await clickRunnerButton(win));
  assertStep("PASS305_CANCEL_BUTTON_READY", await waitFor(win, `
    Boolean(
      document.querySelector('#workspace-tool-detail .command-runner input:disabled') &&
      /\\u505c\\u6b62\\u547d\\u4ee4/.test(document.querySelector('#workspace-tool-detail .command-runner button')?.textContent || '')
    )
  `, 5000));
  assertStep("PASS305_CLICK_CANCEL", await clickRunnerButton(win));
  assertStep("PASS305_RUNNER_RECOVERED_AFTER_CANCEL", await waitFor(win, `
    (async function() {
      const input = document.querySelector('#workspace-tool-detail .command-runner input');
      const button = document.querySelector('#workspace-tool-detail .command-runner button');
      const state = await window.claudexDesktop.getState();
      const cancelRun = (state.commandRuns || []).find((run) => /pass305 should not finish/.test(run.commandLine || run.command || ''));
      const cancelEvent = (state.runEvents || []).find((event) => event.type === 'workspace-command' && /pass305 should not finish/.test(event.commandLine || event.title || ''));
      const staleRunning = (state.runEvents || []).some((event) =>
        event.status === 'running' &&
        /pass305 should not finish/.test(event.commandLine || event.title || '')
      );
      return Boolean(
        input &&
        !input.disabled &&
        button &&
        !button.disabled &&
        /\\u8fd0\\u884c/.test(button.textContent || '') &&
        cancelRun?.cancelled === true &&
        cancelRun?.code === 130 &&
        cancelEvent?.status === 'cancelled' &&
        cancelEvent?.code === 130 &&
        !staleRunning &&
        document.querySelector('#workspace-tool-detail .command-output-card.cancelled')
      );
    })();
  `, 12000));

  assertStep("PASS305_SET_RECOVERY_COMMAND", await setCommand(win, RECOVERY_COMMAND));
  assertStep("PASS305_RUN_RECOVERY_COMMAND", await clickRunnerButton(win));
  assertStep("PASS305_RECOVERY_COMMAND_OK", await waitFor(win, `
    (async function() {
      const input = document.querySelector('#workspace-tool-detail .command-runner input');
      const button = document.querySelector('#workspace-tool-detail .command-runner button');
      const state = await window.claudexDesktop.getState();
      const okRun = (state.commandRuns || []).find((run) => /pass305 after cancel ok/.test(run.stdout || ''));
      const okEvent = (state.runEvents || []).find((event) => event.type === 'workspace-command' && /pass305 after cancel ok/.test(event.commandLine || event.title || ''));
      const staleRunning = (state.runEvents || []).some((event) =>
        event.status === 'running' &&
        (/pass305 should not finish/.test(event.commandLine || event.title || '') || /pass305 after cancel ok/.test(event.commandLine || event.title || ''))
      );
      return Boolean(
        input &&
        !input.disabled &&
        button &&
        !button.disabled &&
        okRun &&
        okRun.code === 0 &&
        /pass305 after cancel ok/.test(okRun.stdout || '') &&
        okEvent &&
        okEvent.status === 'ok' &&
        okEvent.code === 0 &&
        !staleRunning &&
        /pass305 after cancel ok/.test(document.querySelector('#workspace-tool-detail .command-history')?.textContent || '')
      );
    })();
  `, 12000));

  assertStep("PASS305_OUTPUTS_SHOW_CANCEL_AND_RECOVERY", await waitFor(win, `
    (async function() {
      const button = Array.from(document.querySelectorAll('.workspace-context-button, .bottom-panel-tabs button'))
        .find((item) => /\\u8f93\\u51fa/.test(item.textContent || '') || (item.getAttribute('aria-label') || '').includes('\\u8f93\\u51fa'));
      if (!button) return false;
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 250));
      const timelineText = document.querySelector('.run-timeline')?.textContent || '';
      const evidenceText = document.querySelector('.bottom-work-panel .command-history')?.textContent || '';
      const cancelledRow = Array.from(document.querySelectorAll('.run-timeline-row.cancelled'))
        .find((row) => /pass305 should not finish/.test(row.textContent || ''));
      const okRow = Array.from(document.querySelectorAll('.run-timeline-row.ok'))
        .find((row) => /pass305 after cancel ok/.test(row.textContent || '') || /退出码: 0/.test(row.textContent || ''));
      return Boolean(
        cancelledRow &&
        okRow &&
        /\\u547d\\u4ee4\\u5df2\\u505c\\u6b62|\\u547d\\u4ee4\\u5df2\\u53d6\\u6d88/.test(timelineText) &&
        /pass305 should not finish/.test(evidenceText) &&
        /pass305 after cancel ok/.test(evidenceText)
      );
    })();
  `, 10000));

  assertStep("PASS305_STORE_HAS_CANCELLED_AND_OK_NO_RUNNING", (() => {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    const cancelRun = (parsed.commandRuns || []).find((run) => /pass305 should not finish/.test(run.commandLine || run.command || ""));
    const okRun = (parsed.commandRuns || []).find((run) => /pass305 after cancel ok/.test(run.stdout || ""));
    const cancelEvent = (parsed.runEvents || []).find((event) => event.type === "workspace-command" && /pass305 should not finish/.test(event.commandLine || event.title || ""));
    const okEvent = (parsed.runEvents || []).find((event) => event.type === "workspace-command" && /pass305 after cancel ok/.test(event.commandLine || event.title || ""));
    const staleRunning = (parsed.runEvents || []).some((event) =>
      event.status === "running" &&
      (/pass305 should not finish/.test(event.commandLine || event.title || "") || /pass305 after cancel ok/.test(event.commandLine || event.title || ""))
    );
    return Boolean(
      cancelRun?.cancelled === true &&
      cancelRun?.code === 130 &&
      okRun?.code === 0 &&
      /pass305 after cancel ok/.test(okRun?.stdout || "") &&
      cancelEvent?.status === "cancelled" &&
      okEvent?.status === "ok" &&
      !staleRunning
    );
  })());

  console.log("PASS305_WORKSPACE_CANCEL_RECOVERY_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("appData", USER_DATA_DIR);
app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS305_FAILED", error?.stack || error);
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    const debug = await debugState(win);
    console.error("PASS305_DEBUG", JSON.stringify(debug, null, 2).slice(0, 14000));
  }
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS305_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
