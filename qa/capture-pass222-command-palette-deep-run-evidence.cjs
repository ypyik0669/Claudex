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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass222-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass222-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass222-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const TARGET_RUN_EVENT_ID = "pass222-run-event-17";
const TARGET_COMMAND_RUN_ID = "pass222-command-run-17";
const TARGET_RUN_EVENT_TOKEN = "pass222 deep stored run event 17 evidence token";
const TARGET_COMMAND_RUN_TOKEN = "pass222 deep fallback command run 17 evidence token";

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_DIR]) {
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
      "if \"%1\"==\"--version\" (echo claude fake pass222& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins: none& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces: none& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo {\"servers\":[]}& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass222 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function makeRunEvent(index, project) {
  const padded = String(index).padStart(2, "0");
  const minute = String(60 - index).padStart(2, "0");
  const isTarget = index === 17;
  return {
    id: `pass222-run-event-${index}`,
    type: "workspace-command",
    status: isTarget ? "error" : "ok",
    title: isTarget ? "pass222 deep stored run event 17" : `pass222 filler stored run event ${padded}`,
    detail: isTarget ? TARGET_RUN_EVENT_TOKEN : `pass222 filler event ${padded} detail`,
    commandLine: isTarget ? "node pass222-deep-run-event-17.js" : `node pass222-filler-${padded}.js`,
    cwd: project.path,
    code: isTarget ? 17 : 0,
    durationMs: 1200 + index,
    stdout: isTarget ? `${TARGET_RUN_EVENT_TOKEN} stdout` : `pass222 filler event ${padded} stdout`,
    stderr: isTarget ? `${TARGET_RUN_EVENT_TOKEN} stderr` : "",
    project,
    sessionId: "pass222-session",
    createdAt: `2026-07-08T03:${minute}:00.000Z`,
  };
}

function makeCommandRun(index, project) {
  const padded = String(index).padStart(2, "0");
  const minute = String(40 - index).padStart(2, "0");
  const isTarget = index === 17;
  return {
    id: `pass222-command-run-${index}`,
    requestId: `pass222-command-run-${index}`,
    kind: "workspace",
    command: isTarget ? "node pass222-deep-command-run-17.js" : `node pass222-command-filler-${padded}.js`,
    cwd: project.path,
    project,
    code: isTarget ? 7 : 0,
    durationMs: 2200 + index,
    stdout: isTarget ? `${TARGET_COMMAND_RUN_TOKEN} stdout` : `pass222 filler command ${padded} stdout`,
    stderr: isTarget ? `${TARGET_COMMAND_RUN_TOKEN} stderr` : "",
    createdAt: `2026-07-08T02:${minute}:00.000Z`,
    startedAt: `2026-07-08T02:${minute}:00.000Z`,
    endedAt: `2026-07-08T02:${minute}:01.000Z`,
  };
}

function writeInitialStore() {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass222-project" }), "utf8");
  writeFakeClaude();

  const project = { name: "pass222-project", path: PROJECT_DIR };
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
        id: "pass222-session",
        title: "PASS222 deep run evidence",
        project: project.name,
        projectPath: project.path,
        createdAt: "2026-07-08T02:22:00.000Z",
        updatedAt: "2026-07-08T02:22:00.000Z",
        messages: [],
      },
    ],
    runEvents: Array.from({ length: 17 }, (_value, index) => makeRunEvent(index + 1, project)),
    commandRuns: Array.from({ length: 17 }, (_value, index) => makeCommandRun(index + 1, project)),
    notices: [],
    automations: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
  });
}

async function paletteCommands(win, query) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return null;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));
      const result = [...document.querySelectorAll('.command-modal .command-list button')].map((button) => ({
        id: button.getAttribute('data-command-id') || '',
        group: button.getAttribute('data-command-group') || '',
        text: button.textContent || '',
      }));
      window.__pass222Commands = result;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return result;
    })();
  `);
}

async function waitForCommand(win, query, expectedId, textPattern, timeoutMs = 12000) {
  const pattern = textPattern ? new RegExp(textPattern) : null;
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const commands = await paletteCommands(win, query);
    if (Array.isArray(commands) && commands.some((command) => command.id === expectedId && (!pattern || pattern.test(command.text || "")))) return true;
    await wait(180);
  }
  return false;
}

async function runPaletteCommand(win, query, expectedId) {
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
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === ${JSON.stringify(expectedId)});
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS222_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  const runCommandId = `run:${encodeURIComponent(TARGET_RUN_EVENT_ID)}`;
  const commandRunCommandId = `command-run:${encodeURIComponent(TARGET_COMMAND_RUN_ID)}`;

  assertStep("PASS222_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS222_STORE_HAS_DEEP_EVIDENCE", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      return state.runEvents?.length === 17 &&
        state.commandRuns?.length === 17 &&
        state.runEvents[16]?.id === ${JSON.stringify(TARGET_RUN_EVENT_ID)} &&
        state.commandRuns[16]?.id === ${JSON.stringify(TARGET_COMMAND_RUN_ID)};
    })();
  `));

  assertStep("PASS222_DEEP_RUN_EVENT_COMMAND_SEARCHABLE", await waitForCommand(
    win,
    TARGET_RUN_EVENT_TOKEN,
    runCommandId,
    TARGET_RUN_EVENT_TOKEN,
  ));
  assertStep("PASS222_OPEN_DEEP_RUN_EVENT_TIMELINE", await runPaletteCommand(
    win,
    TARGET_RUN_EVENT_TOKEN,
    runCommandId,
  ));
  assertStep("PASS222_DEEP_RUN_EVENT_FOCUSED", await waitFor(win, `
    (function() {
      const row = document.querySelector('.run-timeline-row.selected.error')?.textContent || '';
      const panel = document.querySelector('.selected-run-evidence-panel.error')?.textContent || '';
      return /pass222 deep stored run event 17/.test(row) &&
        /${TARGET_RUN_EVENT_TOKEN}/.test(panel) &&
        /node pass222-deep-run-event-17\\.js/.test(panel) &&
        /pass222-project/.test(panel);
    })();
  `, 12000));

  assertStep("PASS222_DEEP_COMMAND_RUN_COMMAND_SEARCHABLE", await waitForCommand(
    win,
    TARGET_COMMAND_RUN_TOKEN,
    commandRunCommandId,
    null,
  ));
  assertStep("PASS222_OPEN_DEEP_COMMAND_RUN_TIMELINE", await runPaletteCommand(
    win,
    TARGET_COMMAND_RUN_TOKEN,
    commandRunCommandId,
  ));
  assertStep("PASS222_DEEP_COMMAND_RUN_FOCUSED", await waitFor(win, `
    (function() {
      const row = document.querySelector('.run-timeline-row.selected.error')?.textContent || '';
      const panel = document.querySelector('.selected-run-evidence-panel.error')?.textContent || '';
      return /pass222-deep-command-run-17\\.js/.test(row) &&
        /${TARGET_COMMAND_RUN_TOKEN}/.test(panel) &&
        /node pass222-deep-command-run-17\\.js/.test(panel) &&
        /pass222-project/.test(panel);
    })();
  `, 12000));

  console.log("PASS222_COMMAND_PALETTE_DEEP_RUN_EVIDENCE_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS222_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (async function() {
          return {
            commands: window.__pass222Commands || [],
            selectedRow: document.querySelector('.run-timeline-row.selected')?.textContent || '',
            panel: document.querySelector('.selected-run-evidence-panel')?.textContent || '',
            timelineRows: [...document.querySelectorAll('.run-timeline-row')].map((row) => row.textContent),
            state: await window.claudexDesktop.getState().catch((stateError) => ({ error: String(stateError?.message || stateError) })),
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS222_DEBUG", JSON.stringify(debug, null, 2).slice(0, 12000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS222_TIMEOUT");
  cleanup();
  app.exit(1);
}, 100000);
