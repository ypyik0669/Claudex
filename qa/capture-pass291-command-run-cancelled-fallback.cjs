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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass291-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass291-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const REQUEST_ID = "pass291-command-request";
const NOTICE_ID = "pass291-notice";
const COMMAND = "node -e \"console.log('pass291 cancelled fallback stdout'); setTimeout(() => {}, 60000)\"";

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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass291-project" }), "utf8");
  const project = { name: "pass291-project", path: PROJECT_DIR };
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
    activeProject: project,
    projects: [project],
    sessions: [
      {
        id: "pass291-session",
        title: "Cancelled command run fallback",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-08T00:00:00.000Z",
        updatedAt: "2026-07-08T00:00:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [
      {
        id: "pass291-command-run",
        requestId: REQUEST_ID,
        kind: "workspace",
        command: COMMAND,
        commandLine: COMMAND,
        cwd: PROJECT_DIR,
        project,
        code: 130,
        durationMs: 2910,
        stdout: "pass291 cancelled fallback stdout\n",
        stderr: "pass291 cancellation signal\n",
        cancelled: true,
        startedAt: "2026-07-08T00:01:00.000Z",
        endedAt: "2026-07-08T00:01:02.910Z",
      },
    ],
    runEvents: [],
    automations: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [
      {
        id: NOTICE_ID,
        key: "pass291-command-run-cancelled",
        level: "warning",
        source: "workspace-command",
        title: "Pass291 cancelled command-run notice",
        detail: "pass291 notice opens cancelled fallback evidence",
        action: `command-run:${encodeURIComponent(REQUEST_ID)}`,
        project,
        count: 1,
        createdAt: "2026-07-08T00:02:00.000Z",
        lastSeenAt: "2026-07-08T00:02:00.000Z",
      },
    ],
  });
}

async function openPaletteAndQuery(win, query) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      return true;
    })();
  `);
}

async function clickCommand(win, id) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === ${JSON.stringify(id)});
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function openPanel(win, label) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.workspace-context-button, .bottom-panel-tabs button, button')]
        .find((item) => item.getAttribute('aria-label') === ${JSON.stringify(label)} || (item.textContent || '').includes(${JSON.stringify(label)}));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function assertCancelledRetryFocused(win, step) {
  assertStep(step, await waitFor(win, `
    (function() {
      const active = document.querySelector('.bottom-panel-tabs button.active')?.textContent || '';
      const panel = document.querySelector('.selected-run-evidence-panel.cancelled');
      const retry = panel?.querySelector('[data-run-recovery-action="retry-workspace"]');
      const text = panel?.textContent || '';
      return /\\u8f93\\u51fa/.test(active) &&
        /pass291 cancelled fallback stdout/.test(text) &&
        /pass291 cancellation signal/.test(text) &&
        /${REQUEST_ID}/.test(text) &&
        /node -e/.test(text) &&
        /130/.test(text) &&
        retry &&
        retry.getAttribute('data-run-recovery-action-focused') === 'true' &&
        document.activeElement === retry &&
        panel.querySelector('[data-run-recovery-action="terminal"]');
    })();
  `, 10000));
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS291_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS291_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS291_INITIAL_CANCELLED_FALLBACK_STATE", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const run = state.commandRuns?.find((item) => item.requestId === ${JSON.stringify(REQUEST_ID)});
      return Boolean(
        run &&
        run.kind === 'workspace' &&
        run.code === 130 &&
        run.cancelled === true &&
        state.notices?.some((item) => item.id === ${JSON.stringify(NOTICE_ID)} && item.action === 'command-run:' + encodeURIComponent(${JSON.stringify(REQUEST_ID)})) &&
        (state.runEvents || []).length === 0
      );
    })();
  `, 10000));

  assertStep("PASS291_OPEN_PALETTE_QUERY_COMMAND_RUN", await openPaletteAndQuery(win, "pass291 cancelled fallback"));
  assertStep("PASS291_COMMAND_RUN_COMMAND_VISIBLE", await waitFor(win, `
    Boolean([...document.querySelectorAll('.command-modal .command-list button')].some((button) =>
      (button.getAttribute('data-command-id') || '') === 'command-run:${REQUEST_ID}' &&
      /pass291 cancelled fallback/.test(button.textContent || '') &&
      /timeline/i.test(button.textContent || '')
    ))
  `, 5000));
  assertStep("PASS291_CLICK_COMMAND_RUN_COMMAND", await clickCommand(win, `command-run:${REQUEST_ID}`));
  await assertCancelledRetryFocused(win, "PASS291_COMMAND_RUN_CANCELLED_RETRY_FOCUSED");

  assertStep("PASS291_OPEN_PALETTE_QUERY_NOTICE", await openPaletteAndQuery(win, "pass291 cancelled command-run notice"));
  assertStep("PASS291_NOTICE_COMMAND_VISIBLE", await waitFor(win, `
    Boolean([...document.querySelectorAll('.command-modal .command-list button')].some((button) =>
      (button.getAttribute('data-command-id') || '') === 'notice:${NOTICE_ID}' &&
      button.getAttribute('data-command-target') === 'timeline' &&
      /Pass291 cancelled command-run notice/.test(button.textContent || '') &&
      /pass291 notice opens cancelled/.test(button.textContent || '')
    ))
  `, 5000));
  assertStep("PASS291_CLICK_NOTICE_COMMAND", await clickCommand(win, `notice:${NOTICE_ID}`));
  await assertCancelledRetryFocused(win, "PASS291_NOTICE_COMMAND_CANCELLED_RETRY_FOCUSED");

  assertStep("PASS291_OPEN_NOTICES", await openPanel(win, "通知"));
  assertStep("PASS291_NOTICE_CENTER_ACTION_TARGETS_TIMELINE", await waitFor(win, `
    (function() {
      const card = [...document.querySelectorAll('.notice-card')]
        .find((item) => /Pass291 cancelled command-run notice/.test(item.textContent || ''));
      const action = card?.querySelector('[data-notice-action="open"]');
      return Boolean(
        card &&
        action &&
        action.getAttribute('data-notice-action-target') === 'timeline' &&
        /\\u8bc1\\u636e|Evidence|Action|\\u64cd\\u4f5c/.test(action.textContent || '')
      );
    })();
  `, 10000));
  assertStep("PASS291_CLICK_NOTICE_CENTER_ACTION", await win.webContents.executeJavaScript(`
    (function() {
      const card = [...document.querySelectorAll('.notice-card')]
        .find((item) => /Pass291 cancelled command-run notice/.test(item.textContent || ''));
      const action = card?.querySelector('[data-notice-action="open"]');
      if (!action) return false;
      action.click();
      return true;
    })();
  `));
  await assertCancelledRetryFocused(win, "PASS291_NOTICE_CENTER_CANCELLED_RETRY_FOCUSED");

  assertStep("PASS291_CANCELLED_DEEPLINK_DID_NOT_MUTATE_STATE", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      return (state.commandRuns || []).length === 1 &&
        (state.runEvents || []).length === 0 &&
        (state.notices || []).length === 1 &&
        state.commandRuns[0]?.requestId === ${JSON.stringify(REQUEST_ID)} &&
        state.commandRuns[0]?.cancelled === true;
    })();
  `, 10000));

  console.log("PASS291_COMMAND_RUN_CANCELLED_FALLBACK_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS291_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (async function() {
          return {
            activePanel: document.querySelector('.bottom-panel-tabs button.active')?.textContent || '',
            selectedPanel: document.querySelector('.selected-run-evidence-panel')?.outerHTML || '',
            notice: document.querySelector('.notice-card')?.outerHTML || '',
            commands: [...document.querySelectorAll('.command-modal .command-list button')].map((button) => ({
              id: button.getAttribute('data-command-id') || '',
              target: button.getAttribute('data-command-target') || '',
              text: button.textContent || '',
            })),
            state: await window.claudexDesktop.getState().catch((stateError) => ({ error: String(stateError?.message || stateError) })),
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS291_DEBUG", JSON.stringify(debug, null, 2).slice(0, 12000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS291_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
