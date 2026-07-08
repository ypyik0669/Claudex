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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass213-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass213-project-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass213-bin-"));
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const REQUEST_ID = "workspace_pass213_cancel_recovery";
const CANCEL_COMMAND = "node -e \"let n=0;console.log('pass213 cancel recovery start');const timer=setInterval(()=>console.log('pass213 cancel recovery tick '+(++n)),120);setTimeout(()=>{clearInterval(timer);console.log('pass213 should not complete')},8000)\"";

function cleanup() {
  for (const dir of [USER_DATA_DIR, PROJECT_DIR, FAKE_BIN_DIR]) {
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

async function waitForStore(predicate, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      if (predicate(parsed)) return true;
    } catch (_error) {
      // store may be mid-write
    }
    await wait(150);
  }
  return false;
}

function assertStep(name, ok) {
  console.log(name, ok);
  if (!ok) throw new Error(`${name} failed`);
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function writeFakeClaude() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(
    FAKE_CLAUDE,
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass213& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins: none& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces: none& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass213 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function writeInitialStore() {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass213-project" }), "utf8");
  writeFakeClaude();
  const project = { name: "pass213-project", path: PROJECT_DIR };
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
      systemPrompt: "QA",
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
        id: "pass213-session",
        title: "Pass213 cancelled workspace recovery",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-08T02:13:00.000Z",
        updatedAt: "2026-07-08T02:13:00.000Z",
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

async function openOutputs(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = Array.from(document.querySelectorAll('.workspace-context-button, .bottom-panel-tabs button, button'))
        .find((item) => item.getAttribute('aria-label') === '\\u8f93\\u51fa' || /\\u8f93\\u51fa|Outputs/i.test(item.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function openPaletteWithQuery(win, query) {
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
        timeline: [...document.querySelectorAll('.run-timeline-row')].map((row) => ({
          classes: row.className,
          text: row.textContent,
        })),
        selected: document.querySelector('.selected-run-evidence-panel')?.textContent || '',
        body: document.body?.textContent?.slice(0, 6000) || '',
        state: await window.claudexDesktop.getState().catch((stateError) => ({ error: String(stateError?.message || stateError) })),
      };
    })();
  `).catch((error) => ({ error: String(error?.message || error) }));
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS213_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS213_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS213_RUN_AND_CANCEL_COMMAND", await win.webContents.executeJavaScript(`
    (async function() {
      window.__pass213RunPromise = window.claudexDesktop.runWorkspaceCommand({
        projectPath: ${JSON.stringify(PROJECT_DIR)},
        command: ${JSON.stringify(CANCEL_COMMAND)},
        requestId: ${JSON.stringify(REQUEST_ID)},
      });
      await new Promise((resolve) => setTimeout(resolve, 650));
      const cancel = await window.claudexDesktop.cancelWorkspaceCommand({ requestId: ${JSON.stringify(REQUEST_ID)} });
      const result = await window.__pass213RunPromise;
      return Boolean(cancel?.cancelled && result?.cancelled && result?.code === 130);
    })();
  `));
  assertStep("PASS213_CANCEL_PERSISTED_BEFORE_RELOAD", await waitForStore((parsed) => {
    const run = parsed.commandRuns?.find((item) => item.id === REQUEST_ID || item.requestId === REQUEST_ID);
    const event = parsed.runEvents?.find((item) => item.id === REQUEST_ID);
    return Boolean(
      run &&
      run.kind === "workspace" &&
      run.cancelled === true &&
      run.code === 130 &&
      /pass213 cancel recovery start/.test(run.stdout || "") &&
      /\u547d\u4ee4\u5df2\u53d6\u6d88/.test(run.stderr || "") &&
      event &&
      event.type === "workspace-command" &&
      event.status === "cancelled" &&
      event.code === 130 &&
      /pass213 cancel recovery start/.test(event.stdout || "") &&
      /\u547d\u4ee4\u5df2\u53d6\u6d88/.test(event.stderr || "") &&
      /pass213 cancel recovery/.test(event.commandLine || "")
    );
  }, 10000));

  win.webContents.reload();
  await wait(1200);
  assertStep("PASS213_RELOAD_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS213_RESTORED_STATE_AFTER_RELOAD", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const run = state.commandRuns?.find((item) => item.id === ${JSON.stringify(REQUEST_ID)} || item.requestId === ${JSON.stringify(REQUEST_ID)});
      const event = state.runEvents?.find((item) => item.id === ${JSON.stringify(REQUEST_ID)});
      return Boolean(
        run &&
        run.cancelled === true &&
        run.code === 130 &&
        event &&
        event.status === 'cancelled' &&
        event.type === 'workspace-command' &&
        /pass213 cancel recovery start/.test(run.stdout || '') &&
        /pass213 cancel recovery start/.test(event.stdout || '')
      );
    })();
  `, 10000));

  assertStep("PASS213_OPEN_OUTPUTS_AFTER_RELOAD", await openOutputs(win));
  assertStep("PASS213_TIMELINE_RECOVERED_CANCELLED_ROW", await waitFor(win, `
    (function() {
      const row = [...document.querySelectorAll('.run-timeline-row.cancelled')]
        .find((item) => /pass213 cancel recovery/.test(item.textContent || ''));
      const text = document.querySelector('.bottom-work-panel')?.textContent || '';
      return Boolean(row &&
        row.querySelector('[data-run-event-type="workspace-command"]') &&
        /pass213 cancel recovery start/.test(text) &&
        (/\\u547d\\u4ee4\\u5df2\\u53d6\\u6d88|\\u547d\\u4ee4\\u5df2\\u505c\\u6b62/.test(text)));
    })();
  `, 10000));

  assertStep("PASS213_OPEN_PALETTE_RUN_LINK", await openPaletteWithQuery(win, "pass213 cancel recovery timeline"));
  assertStep("PASS213_PALETTE_RUN_LINK_TARGETS_TIMELINE", await waitFor(win, `
    (function() {
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === 'run:' + ${JSON.stringify(REQUEST_ID)});
      const text = button?.textContent || '';
      return Boolean(button &&
        /\\u67e5\\u770b timeline/.test(text) &&
        /pass213 cancel recovery/.test(text));
    })();
  `, 8000));
  assertStep("PASS213_CLICK_PALETTE_RUN_LINK", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === 'run:' + ${JSON.stringify(REQUEST_ID)});
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS213_SELECTED_EVIDENCE_RECOVERED", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.selected-run-evidence-panel.cancelled');
      const retry = panel?.querySelector('[data-run-recovery-action="retry-workspace"]');
      const text = panel?.textContent || '';
      return Boolean(panel &&
        panel.querySelector('[data-run-event-type="workspace-command"]') &&
        retry &&
        retry.getAttribute('data-run-recovery-action-focused') === 'true' &&
        document.activeElement === retry &&
        /pass213 cancel recovery start/.test(text) &&
        /workspace_pass213_cancel_recovery/.test(text) &&
        /130/.test(text) &&
        (/\\u547d\\u4ee4\\u5df2\\u53d6\\u6d88|\\u547d\\u4ee4\\u5df2\\u505c\\u6b62/.test(text)));
    })();
  `, 10000));

  assertStep("PASS213_COPY_RECOVERED_EVIDENCE", await win.webContents.executeJavaScript(`
    (async function() {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text) => { window.__pass213Clipboard = String(text || ''); } },
      });
      const copy = document.querySelector('.selected-run-evidence-panel.cancelled [data-run-timeline-action="copy-evidence"]');
      if (!copy) return false;
      copy.click();
      await new Promise((resolve) => setTimeout(resolve, 250));
      return /pass213 cancel recovery start/.test(window.__pass213Clipboard || '') &&
        /workspace_pass213_cancel_recovery/.test(window.__pass213Clipboard || '') &&
        /130/.test(window.__pass213Clipboard || '') &&
        (/\\u547d\\u4ee4\\u5df2\\u53d6\\u6d88|\\u547d\\u4ee4\\u5df2\\u505c\\u6b62/.test(window.__pass213Clipboard || ''));
    })();
  `));

  console.log("PASS213_WORKSPACE_COMMAND_CANCEL_RECOVERY_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS213_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      const debug = await debugSnapshot(win);
      console.error("PASS213_DEBUG", JSON.stringify(debug, null, 2).slice(0, 12000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS213_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
