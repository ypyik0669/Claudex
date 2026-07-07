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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass217-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass217-bin-"));
const PROJECT_A_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass217-project-a-"));
const PROJECT_B_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass217-project-b-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");

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

function writeFakeClaude() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  const fakeScript = `
const args = process.argv.slice(2);
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
if (args[0] === '--version') out('2.10.7 (Claude Code PASS217)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out({ plugins: [] });
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out({ servers: [] });
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else out('pass217 fake claude command: ' + args.join(' '));
`;
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeScript, "utf8");
  fs.writeFileSync(FAKE_CLAUDE, '@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n', "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function makeAutomation(index, project, sessionId) {
  const padded = String(index).padStart(2, "0");
  const isTarget = index === 21;
  const run = {
    id: `pass217-automation-run-${index}`,
    trigger: "manual",
    status: "failed",
    startedAt: `2026-07-07T09:${padded}:00.000Z`,
    endedAt: `2026-07-07T09:${padded}:04.000Z`,
    durationMs: 4000 + index,
    sessionId,
    code: 17,
    detail: isTarget ? "pass217 deep automation 21 detail evidence" : `pass217 filler automation ${index} detail`,
    summary: isTarget ? "pass217 deep automation 21 summary evidence" : `pass217 filler automation ${index} summary`,
    stdout: isTarget ? "pass217 deep automation 21 stdout evidence" : `pass217 filler automation ${index} stdout`,
    stderr: isTarget ? "pass217 deep automation 21 stderr evidence" : `pass217 filler automation ${index} stderr`,
  };
  return {
    id: `pass217-automation-${index}`,
    prompt: isTarget ? "pass217 deep automation 21 focus command palette" : `pass217 filler automation ${index}`,
    schedule: { type: "once", runAt: "" },
    project,
    threadId: sessionId,
    enabled: false,
    status: "failed",
    createdAt: "2026-07-07T09:00:00.000Z",
    updatedAt: run.endedAt,
    lastRun: run,
    history: [run],
  };
}

function makeSubagentRun(index, project, sessionId) {
  const padded = String(index).padStart(2, "0");
  const isTarget = index === 21;
  return {
    id: `pass217-subagent-run-${index}`,
    requestId: `pass217-subagent-request-${index}`,
    nickname: isTarget ? "Pass217 Deep Agent 21" : `Pass217 Filler Agent ${index}`,
    task: isTarget ? "pass217 deep subagent 21 focus command palette" : `pass217 filler subagent ${index}`,
    status: "error",
    sessionId,
    project,
    cwd: project.path,
    command: FAKE_CLAUDE,
    args: ["-p", isTarget ? "pass217 deep subagent 21 focus command palette" : `pass217 filler subagent ${index}`, "--model", "claude-haiku-4-5-20251001"],
    summary: isTarget ? "pass217 deep subagent 21 summary evidence" : `pass217 filler subagent ${index} summary`,
    stdout: isTarget ? "pass217 deep subagent 21 stdout evidence" : `pass217 filler subagent ${index} stdout`,
    stderr: isTarget ? "pass217 deep subagent 21 stderr evidence" : `pass217 filler subagent ${index} stderr`,
    code: 2,
    durationMs: 3000 + index,
    startedAt: `2026-07-07T10:${padded}:00.000Z`,
    endedAt: `2026-07-07T10:${padded}:03.000Z`,
    artifacts: [
      {
        type: "summary",
        label: isTarget ? "pass217 deep subagent 21 artifact" : `pass217 filler artifact ${index}`,
        content: isTarget ? "pass217 deep subagent 21 artifact evidence" : `pass217 filler artifact ${index}`,
        projectPath: project.path,
      },
    ],
  };
}

function writeInitialStore() {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_A_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_B_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_A_DIR, "package.json"), JSON.stringify({ name: "pass217-project-a" }), "utf8");
  fs.writeFileSync(path.join(PROJECT_B_DIR, "package.json"), JSON.stringify({ name: "pass217-project-b" }), "utf8");
  writeFakeClaude();

  const projectA = { name: "pass217-project-a", path: PROJECT_A_DIR };
  const projectB = { name: "pass217-project-b", path: PROJECT_B_DIR };
  const createdAt = "2026-07-07T09:00:00.000Z";
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
    activeProject: projectB,
    projects: [projectB, projectA],
    sessions: [
      {
        id: "session-b",
        title: "pass217 active project B thread",
        project: projectB.name,
        projectPath: PROJECT_B_DIR,
        createdAt,
        updatedAt: createdAt,
        messages: [],
      },
      {
        id: "session-a",
        title: "pass217 deep task project A thread",
        project: projectA.name,
        projectPath: PROJECT_A_DIR,
        createdAt,
        updatedAt: createdAt,
        messages: [{ role: "user", content: "pass217 project A thread", createdAt }],
      },
    ],
    automations: Array.from({ length: 21 }, (_value, index) => makeAutomation(index + 1, projectA, "session-a")),
    subagentRuns: Array.from({ length: 21 }, (_value, index) => makeSubagentRun(index + 1, projectA, "session-a")),
    commandRuns: [],
    runEvents: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
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
      const result = Array.from(document.querySelectorAll('.command-modal .command-list button'))
        .map((button) => ({ id: button.getAttribute('data-command-id') || '', text: button.textContent || '' }));
      window.__pass217LastCommands = result;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return result;
    })();
  `);
}

async function waitForPaletteCommand(win, query, expectedId, textPattern, timeoutMs = 10000) {
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
      const button = Array.from(document.querySelectorAll('.command-modal .command-list button'))
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === ${JSON.stringify(expectedId)});
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
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
  if (!win) throw new Error("PASS217_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS217_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS217_STORE_HAS_DEEP_TASKS", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      return Boolean(
        state.automations?.length === 21 &&
        state.subagentRuns?.length === 21 &&
        state.automations[20]?.id === 'pass217-automation-21' &&
        state.subagentRuns[20]?.id === 'pass217-subagent-run-21'
      );
    })();
  `));
  await assertActiveProjectB(win, "PASS217_INITIAL_ACTIVE_PROJECT_B");

  assertStep("PASS217_DEEP_AUTOMATION_TASK_COMMAND_SEARCHABLE", await waitForPaletteCommand(
    win,
    "pass217 deep automation 21 focus",
    "automation:pass217-automation-21",
    "pass217 deep automation 21 focus",
  ));
  assertStep("PASS217_DEEP_AUTOMATION_RECOVERY_COMMAND_SEARCHABLE", await waitForPaletteCommand(
    win,
    "run now pass217 deep automation 21",
    "automation-recovery:run-now:pass217-automation-21",
    "pass217 deep automation 21 focus",
  ));
  assertStep("PASS217_OPEN_DEEP_AUTOMATION_TASK_FOCUS", await runPaletteCommand(
    win,
    "pass217 deep automation 21 focus",
    "automation:pass217-automation-21",
  ));
  assertStep("PASS217_DEEP_AUTOMATION_CARD_FOCUSED", await waitFor(win, `
    (function() {
      const card = document.querySelector('.automation-task-card.focused-task-card[data-automation-id="pass217-automation-21"]');
      const text = card?.textContent || '';
      window.__pass217AutomationCardDebug = { text, hasCard: Boolean(card) };
      return Boolean(
        document.querySelector('.bottom-work-panel .subagent-workbench') &&
        card &&
        card.querySelector('.automation-task-history[open]') &&
        card.querySelector('.automation-run-evidence-details[open]') &&
        /pass217 deep automation 21 focus command palette/.test(text) &&
        /pass217 deep automation 21 stdout evidence/.test(text) &&
        /pass217 deep automation 21 stderr evidence/.test(text) &&
        /pass217-project-a/.test(text) &&
        !/pass217-project-b/.test(text)
      );
    })();
  `, 10000));
  await assertActiveProjectB(win, "PASS217_AUTOMATION_TASK_DID_NOT_SWITCH_PROJECT");

  assertStep("PASS217_DEEP_AUTOMATION_RUN_COMMAND_SEARCHABLE", await waitForPaletteCommand(
    win,
    "pass217 deep automation 21 stdout",
    "automation-run:pass217-automation-run-21",
    "pass217 deep automation 21 summary evidence",
  ));
  assertStep("PASS217_OPEN_DEEP_AUTOMATION_RUN_TIMELINE", await runPaletteCommand(
    win,
    "pass217 deep automation 21 stdout",
    "automation-run:pass217-automation-run-21",
  ));
  assertStep("PASS217_DEEP_AUTOMATION_RUN_TIMELINE_FOCUSED", await waitFor(win, `
    (function() {
      const selectedRow = document.querySelector('.run-timeline-row.selected')?.textContent || '';
      const panel = document.querySelector('.selected-run-evidence-panel')?.textContent || '';
      return Boolean(
        /pass217 deep automation 21 focus command palette/.test(selectedRow) &&
        /pass217 deep automation 21 detail evidence/.test(panel) &&
        /pass217 deep automation 21 stdout evidence/.test(panel) &&
        /pass217 deep automation 21 stderr evidence/.test(panel) &&
        /pass217-project-a/.test(panel) &&
        !panel.includes(${JSON.stringify(PROJECT_B_DIR)})
      );
    })();
  `, 10000));
  await assertActiveProjectB(win, "PASS217_AUTOMATION_RUN_DID_NOT_SWITCH_PROJECT");

  assertStep("PASS217_DEEP_SUBAGENT_TASK_COMMAND_SEARCHABLE", await waitForPaletteCommand(
    win,
    "pass217 deep subagent 21 focus",
    "subagent:pass217-subagent-run-21",
    "Pass217 Deep Agent 21",
  ));
  assertStep("PASS217_DEEP_SUBAGENT_RECOVERY_COMMAND_SEARCHABLE", await waitForPaletteCommand(
    win,
    "retry pass217 deep subagent 21",
    "subagent-recovery:retry:pass217-subagent-run-21",
    "Pass217 Deep Agent 21",
  ));
  assertStep("PASS217_OPEN_DEEP_SUBAGENT_TASK_FOCUS", await runPaletteCommand(
    win,
    "pass217 deep subagent 21 focus",
    "subagent:pass217-subagent-run-21",
  ));
  assertStep("PASS217_DEEP_SUBAGENT_CARD_FOCUSED", await waitFor(win, `
    (function() {
      const card = document.querySelector('.subagent-run-card.focused-task-card[data-subagent-run-id="pass217-subagent-run-21"]');
      const text = card?.textContent || '';
      return Boolean(
        document.querySelector('.bottom-work-panel .subagent-workbench') &&
        card &&
        card.querySelector('.subagent-evidence-details[open]') &&
        /Pass217 Deep Agent 21/.test(text) &&
        /pass217 deep subagent 21 summary evidence/.test(text) &&
        /pass217 deep subagent 21 stderr evidence/.test(text) &&
        /pass217 deep subagent 21 artifact evidence/.test(text) &&
        /pass217-project-a/.test(text) &&
        !/pass217-project-b/.test(text)
      );
    })();
  `, 10000));
  await assertActiveProjectB(win, "PASS217_SUBAGENT_TASK_DID_NOT_SWITCH_PROJECT");

  assertStep("PASS217_DEEP_SUBAGENT_RUN_COMMAND_SEARCHABLE", await waitForPaletteCommand(
    win,
    "pass217 deep subagent 21 stdout",
    "subagent-run:pass217-subagent-request-21",
    "Pass217 Deep Agent 21",
  ));
  assertStep("PASS217_OPEN_DEEP_SUBAGENT_RUN_TIMELINE", await runPaletteCommand(
    win,
    "pass217 deep subagent 21 stdout",
    "subagent-run:pass217-subagent-request-21",
  ));
  assertStep("PASS217_DEEP_SUBAGENT_RUN_TIMELINE_FOCUSED", await waitFor(win, `
    (function() {
      const selectedRow = document.querySelector('.run-timeline-row.selected')?.textContent || '';
      const panel = document.querySelector('.selected-run-evidence-panel')?.textContent || '';
      return Boolean(
        /Pass217 Deep Agent 21/.test(selectedRow) &&
        /pass217 deep subagent 21 summary evidence/.test(panel) &&
        /pass217 deep subagent 21 stdout evidence/.test(panel) &&
        /pass217 deep subagent 21 stderr evidence/.test(panel) &&
        /pass217 deep subagent 21 artifact evidence/.test(panel) &&
        /pass217-project-a/.test(panel) &&
        !panel.includes(${JSON.stringify(PROJECT_B_DIR)})
      );
    })();
  `, 10000));
  await assertActiveProjectB(win, "PASS217_SUBAGENT_RUN_DID_NOT_SWITCH_PROJECT");

  console.log("PASS217_COMMAND_PALETTE_DEEP_TASK_WORKBENCH_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS217_COMMAND_PALETTE_DEEP_TASK_WORKBENCH_FAILED", error?.stack || error);
  try {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      win.webContents.executeJavaScript("({ commands: window.__pass217LastCommands || null, automationCard: window.__pass217AutomationCardDebug || null })")
        .then((debug) => console.error("PASS217_DEBUG", JSON.stringify(debug, null, 2)))
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
  console.error("PASS217_COMMAND_PALETTE_DEEP_TASK_WORKBENCH_TIMEOUT");
  cleanup();
  app.exit(1);
}, 110000);
