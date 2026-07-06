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
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass158-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass158-bin-"));
const PROJECT_A_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass158-project-a-"));
const PROJECT_B_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass158-project-b-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_A_DIR, PROJECT_B_DIR]) {
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

function writeInitialStore() {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_A_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_B_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_A_DIR, "package.json"), JSON.stringify({ name: "pass158-project-a" }), "utf8");
  fs.writeFileSync(path.join(PROJECT_B_DIR, "package.json"), JSON.stringify({ name: "pass158-project-b" }), "utf8");
  fs.writeFileSync(
    path.join(FAKE_BIN_DIR, "claude.cmd"),
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass158& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass158 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );

  const fakeClaude = path.join(FAKE_BIN_DIR, "claude.cmd");
  const createdAt = "2026-07-07T08:00:00.000Z";
  const projectA = { name: "pass158-project-a", path: PROJECT_A_DIR };
  const projectB = { name: "pass158-project-b", path: PROJECT_B_DIR };
  const automationRun = {
    id: "pass158-automation-run-a",
    trigger: "manual",
    status: "failed",
    startedAt: createdAt,
    endedAt: "2026-07-07T08:01:00.000Z",
    durationMs: 60000,
    sessionId: "session-a",
    detail: "pass158 automation detail project A evidence",
    summary: "pass158 automation summary project A evidence",
    stdout: "pass158 automation stdout project A evidence",
    stderr: "pass158 automation stderr project A evidence",
    code: 9,
  };
  const subagentRun = {
    id: "pass158-subagent-run-a",
    requestId: "pass158-subagent-request-a",
    nickname: "Pass158 Project A Agent",
    task: "pass158 subagent task project A focus",
    status: "error",
    sessionId: "session-a",
    project: projectA,
    cwd: PROJECT_A_DIR,
    command: fakeClaude,
    args: ["-p", "pass158 subagent task project A focus", "--model", "claude-haiku-4-5-20251001"],
    summary: "pass158 subagent summary project A evidence",
    stdout: "pass158 subagent stdout project A evidence",
    stderr: "pass158 subagent stderr project A evidence",
    code: 2,
    durationMs: 2400,
    startedAt: createdAt,
    endedAt: "2026-07-07T08:02:00.000Z",
    artifacts: [
      { type: "summary", label: "pass158 project A artifact", content: "pass158 artifact project A evidence", projectPath: PROJECT_A_DIR },
    ],
  };

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
      claudeCode: { executionMode: "claude-code", claudeCommand: fakeClaude, permissionMode: "default" },
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
    activeProject: projectB,
    projects: [projectB, projectA],
    sessions: [
      {
        id: "session-b",
        title: "pass158 Project B active thread",
        project: projectB.name,
        projectPath: PROJECT_B_DIR,
        createdAt,
        updatedAt: createdAt,
        messages: [],
      },
      {
        id: "session-a",
        title: "pass158 Project A task thread",
        project: projectA.name,
        projectPath: PROJECT_A_DIR,
        createdAt,
        updatedAt: createdAt,
        messages: [{ role: "user", content: "pass158 project A thread", createdAt }],
      },
    ],
    automations: [
      {
        id: "pass158-automation-a",
        prompt: "pass158 automation task project A focus",
        schedule: { type: "once", runAt: "" },
        project: projectA,
        threadId: "session-a",
        enabled: false,
        status: "failed",
        createdAt,
        updatedAt: createdAt,
        lastRun: automationRun,
        history: [automationRun],
      },
    ],
    subagentRuns: [subagentRun],
    runEvents: [],
    commandRuns: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
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
      await new Promise((resolve) => setTimeout(resolve, 180));
      return Boolean(document.querySelector('.command-modal .command-list button'));
    })();
  `);
}

async function clickPaletteCommand(win, prefix, textPattern) {
  return win.webContents.executeJavaScript(`
    (function() {
      const pattern = new RegExp(${JSON.stringify(textPattern)});
      const button = Array.from(document.querySelectorAll('.command-modal .command-list button'))
        .find((candidate) =>
          (candidate.getAttribute('data-command-id') || '').startsWith(${JSON.stringify(prefix)}) &&
          pattern.test(candidate.textContent || '')
        );
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runPaletteCommand(win, query, prefix, textPattern) {
  if (!(await openPaletteAndQuery(win, query))) return false;
  return clickPaletteCommand(win, prefix, textPattern);
}

async function assertActiveProjectB(win, stepName) {
  assertStep(stepName, await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      return state.activeProject?.path === ${JSON.stringify(PROJECT_B_DIR)};
    })();
  `, 5000));
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS158_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS158_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  await assertActiveProjectB(win, "PASS158_INITIAL_ACTIVE_PROJECT_B");

  assertStep("PASS158_AUTOMATION_TASK_COMMAND_VISIBLE", await openPaletteAndQuery(win, "pass158 automation task project A focus"));
  assertStep("PASS158_AUTOMATION_TASK_COMMAND_HAS_PROJECT_A", await waitFor(win, `
    Boolean(Array.from(document.querySelectorAll('.command-modal .command-list button')).some((button) =>
      (button.getAttribute('data-command-id') || '').startsWith('automation:') &&
      /pass158 automation task project A focus/.test(button.textContent || '') &&
      /pass158-project-a/.test(button.textContent || '') &&
      !/pass158-project-b/.test(button.textContent || '')
    ))
  `, 5000));
  assertStep("PASS158_OPEN_AUTOMATION_TASK_FOCUS", await clickPaletteCommand(win, "automation:", "pass158 automation task project A focus"));
  assertStep("PASS158_AUTOMATION_TASK_FOCUSED_PROJECT_A", await waitFor(win, `
    (function() {
      const card = document.querySelector('.automation-task-card.focused-task-card[data-automation-id="pass158-automation-a"]');
      const text = card?.textContent || '';
      return Boolean(
        document.querySelector('.bottom-work-panel .subagent-workbench') &&
        card &&
        card.querySelector('.automation-task-history[open]') &&
        card.querySelector('.automation-run-evidence-details[open]') &&
        /pass158-project-a/.test(text) &&
        /pass158 automation stdout project A evidence/.test(text) &&
        /pass158 automation stderr project A evidence/.test(text) &&
        !/pass158-project-b/.test(text)
      );
    })();
  `, 10000));
  await assertActiveProjectB(win, "PASS158_AUTOMATION_TASK_DID_NOT_SWITCH_PROJECT");

  assertStep("PASS158_AUTOMATION_RUN_TIMELINE_COMMAND", await runPaletteCommand(
    win,
    "pass158 automation stdout project A evidence",
    "automation-run:",
    "pass158 automation summary project A evidence",
  ));
  assertStep("PASS158_AUTOMATION_RUN_TIMELINE_PROJECT_A", await waitFor(win, `
    (function() {
      const selectedRow = document.querySelector('.run-timeline-row.selected')?.textContent || '';
      const panel = document.querySelector('.selected-run-evidence-panel')?.textContent || '';
      window.__pass158AutomationTimelineDebug = { selectedRow, panel };
      return Boolean(
        /pass158 automation task project A focus/.test(selectedRow) &&
        /pass158 automation detail project A evidence/.test(panel) &&
        /pass158 automation stdout project A evidence/.test(panel) &&
        /pass158 automation stderr project A evidence/.test(panel) &&
        /pass158-project-a/.test(panel) &&
        !panel.includes(${JSON.stringify(PROJECT_B_DIR)})
      );
    })();
  `, 10000));
  await assertActiveProjectB(win, "PASS158_AUTOMATION_RUN_DID_NOT_SWITCH_PROJECT");

  assertStep("PASS158_SUBAGENT_TASK_COMMAND", await runPaletteCommand(
    win,
    "pass158 subagent task project A focus",
    "subagent:",
    "Pass158 Project A Agent",
  ));
  assertStep("PASS158_SUBAGENT_TASK_FOCUSED_PROJECT_A", await waitFor(win, `
    (function() {
      const card = document.querySelector('.subagent-run-card.focused-task-card[data-subagent-run-id="pass158-subagent-run-a"]');
      const text = card?.textContent || '';
      return Boolean(
        document.querySelector('.bottom-work-panel .subagent-workbench') &&
        card &&
        card.querySelector('.subagent-evidence-details[open]') &&
        /pass158-project-a/.test(text) &&
        /pass158 subagent summary project A evidence/.test(text) &&
        /pass158 subagent stderr project A evidence/.test(text) &&
        !/pass158-project-b/.test(text)
      );
    })();
  `, 10000));
  await assertActiveProjectB(win, "PASS158_SUBAGENT_TASK_DID_NOT_SWITCH_PROJECT");

  assertStep("PASS158_SUBAGENT_RUN_TIMELINE_COMMAND", await runPaletteCommand(
    win,
    "pass158 subagent stdout project A evidence",
    "subagent-run:",
    "Pass158 Project A Agent",
  ));
  assertStep("PASS158_SUBAGENT_RUN_TIMELINE_PROJECT_A", await waitFor(win, `
    (function() {
      const selectedRow = document.querySelector('.run-timeline-row.selected')?.textContent || '';
      const panel = document.querySelector('.selected-run-evidence-panel')?.textContent || '';
      return Boolean(
        /Pass158 Project A Agent/.test(selectedRow) &&
        /pass158 subagent summary project A evidence/.test(panel) &&
        /pass158 subagent stdout project A evidence/.test(panel) &&
        /pass158 subagent stderr project A evidence/.test(panel) &&
        /pass158 artifact project A evidence/.test(panel) &&
        /pass158-project-a/.test(panel) &&
        !panel.includes(${JSON.stringify(PROJECT_B_DIR)})
      );
    })();
  `, 10000));
  await assertActiveProjectB(win, "PASS158_SUBAGENT_RUN_DID_NOT_SWITCH_PROJECT");

  console.log("PASS158_COMMAND_PALETTE_TASK_CROSS_PROJECT_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS158_COMMAND_PALETTE_TASK_CROSS_PROJECT_FAILED", error?.stack || error);
  try {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      win.webContents.executeJavaScript("window.__pass158AutomationTimelineDebug || null")
        .then((debug) => console.error("PASS158_AUTOMATION_TIMELINE_DEBUG", JSON.stringify(debug, null, 2)))
        .finally(() => {
          cleanup();
          app.exit(1);
        });
      return;
    }
  } catch (_debugError) {
    // best-effort diagnostics
  }
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS158_COMMAND_PALETTE_TASK_CROSS_PROJECT_TIMEOUT");
  cleanup();
  app.exit(1);
}, 100000);
