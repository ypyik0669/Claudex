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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass159-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass159-bin-"));
const PROJECT_A_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass159-project-a-"));
const PROJECT_B_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass159-project-b-"));
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
  fs.writeFileSync(path.join(PROJECT_A_DIR, "package.json"), JSON.stringify({ name: "pass159-project-a" }), "utf8");
  fs.writeFileSync(path.join(PROJECT_B_DIR, "package.json"), JSON.stringify({ name: "pass159-project-b" }), "utf8");
  fs.writeFileSync(
    path.join(FAKE_BIN_DIR, "claude.cmd"),
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass159& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass159 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );

  const fakeClaude = path.join(FAKE_BIN_DIR, "claude.cmd");
  const createdAt = "2026-07-07T09:00:00.000Z";
  const projectA = { name: "pass159-project-a", path: PROJECT_A_DIR };
  const projectB = { name: "pass159-project-b", path: PROJECT_B_DIR };
  const automationRun = {
    id: "pass159-automation-run-a",
    trigger: "scheduled",
    status: "failed",
    startedAt: createdAt,
    endedAt: "2026-07-07T09:01:00.000Z",
    durationMs: 60000,
    sessionId: "session-a",
    detail: "pass159 automation detail project A notice evidence",
    summary: "pass159 automation summary project A notice evidence",
    stdout: "pass159 automation stdout project A notice evidence",
    stderr: "pass159 automation stderr project A notice evidence",
    code: 9,
  };
  const subagentRun = {
    id: "pass159-subagent-run-a",
    requestId: "pass159-subagent-request-a",
    nickname: "Pass159 Project A Agent",
    task: "pass159 subagent task project A notice focus",
    status: "error",
    sessionId: "session-a",
    project: projectA,
    cwd: PROJECT_A_DIR,
    command: fakeClaude,
    args: ["-p", "pass159 subagent task project A notice focus", "--model", "claude-haiku-4-5-20251001"],
    summary: "pass159 subagent summary project A notice evidence",
    stdout: "pass159 subagent stdout project A notice evidence",
    stderr: "pass159 subagent stderr project A notice evidence",
    code: 2,
    durationMs: 2400,
    startedAt: createdAt,
    endedAt: "2026-07-07T09:02:00.000Z",
    artifacts: [
      {
        type: "summary",
        label: "pass159 project A artifact",
        content: "pass159 artifact project A notice evidence",
        projectPath: PROJECT_A_DIR,
      },
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
        title: "pass159 Project B active thread",
        project: projectB.name,
        projectPath: PROJECT_B_DIR,
        createdAt,
        updatedAt: createdAt,
        messages: [],
      },
      {
        id: "session-a",
        title: "pass159 Project A task thread",
        project: projectA.name,
        projectPath: PROJECT_A_DIR,
        createdAt,
        updatedAt: createdAt,
        messages: [{ role: "user", content: "pass159 project A thread", createdAt }],
      },
    ],
    automations: [
      {
        id: "pass159-automation-a",
        prompt: "pass159 automation task project A notice focus",
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
    notices: [
      {
        id: "pass159-automation-notice",
        key: "pass159:automation",
        level: "error",
        source: "automation",
        title: "Pass159 automation notice project A",
        detail: "pass159 automation stdout project A notice evidence",
        action: "automation:pass159-automation-a",
        project: projectA,
        sessionId: "session-a",
        count: 1,
        createdAt: "2026-07-07T09:03:00.000Z",
        lastSeenAt: "2026-07-07T09:03:00.000Z",
      },
      {
        id: "pass159-subagent-notice",
        key: "pass159:subagent",
        level: "error",
        source: "subagent",
        title: "Pass159 subagent notice project A",
        detail: "pass159 subagent stdout project A notice evidence",
        action: "subagent:pass159-subagent-request-a",
        project: projectA,
        sessionId: "session-a",
        count: 1,
        createdAt: "2026-07-07T09:04:00.000Z",
        lastSeenAt: "2026-07-07T09:04:00.000Z",
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
      await new Promise((resolve) => setTimeout(resolve, 180));
      return Boolean(document.querySelector('.command-modal .command-list button'));
    })();
  `);
}

async function clickNoticeCommand(win, textPattern) {
  return win.webContents.executeJavaScript(`
    (function() {
      const pattern = new RegExp(${JSON.stringify(textPattern)});
      const button = Array.from(document.querySelectorAll('.command-modal .command-list button'))
        .find((candidate) =>
          (candidate.getAttribute('data-command-id') || '').startsWith('notice:') &&
          pattern.test(candidate.textContent || '')
        );
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function openNoticesPanel(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = Array.from(document.querySelectorAll('.workspace-context-button, .bottom-panel-tabs button'))
        .find((candidate) =>
          /\\u901a\\u77e5/.test(candidate.textContent || '') ||
          /\\u901a\\u77e5/.test(candidate.getAttribute('aria-label') || '')
        );
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function clickNoticeCenterAction(win, textPattern) {
  assertStep(`PASS159_OPEN_NOTICES_${textPattern}`, await openNoticesPanel(win));
  assertStep(`PASS159_NOTICE_CARD_VISIBLE_${textPattern}`, await waitFor(win, `
    (function() {
      const pattern = new RegExp(${JSON.stringify(textPattern)});
      return Boolean(Array.from(document.querySelectorAll('.notice-card')).some((card) =>
        pattern.test(card.textContent || '') && card.querySelector('button[data-notice-action="open"]')
      ));
    })();
  `, 5000));
  return win.webContents.executeJavaScript(`
    (function() {
      const pattern = new RegExp(${JSON.stringify(textPattern)});
      const card = Array.from(document.querySelectorAll('.notice-card'))
        .find((candidate) => pattern.test(candidate.textContent || ''));
      const button = card?.querySelector('button[data-notice-action="open"]');
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

async function assertFocusedAutomation(win, stepName) {
  assertStep(stepName, await waitFor(win, `
    (function() {
      const card = document.querySelector('.automation-task-card.focused-task-card[data-automation-id="pass159-automation-a"]');
      const text = card?.textContent || '';
      return Boolean(
        document.querySelector('.bottom-work-panel .subagent-workbench') &&
        card &&
        card.querySelector('.automation-task-history[open]') &&
        card.querySelector('.automation-run-evidence-details[open]') &&
        /pass159-project-a/.test(text) &&
        /pass159 automation task project A notice focus/.test(text) &&
        /pass159 automation stdout project A notice evidence/.test(text) &&
        /pass159 automation stderr project A notice evidence/.test(text) &&
        !/pass159-project-b/.test(text) &&
        !text.includes(${JSON.stringify(PROJECT_B_DIR)})
      );
    })();
  `, 10000));
}

async function assertFocusedSubagent(win, stepName) {
  assertStep(stepName, await waitFor(win, `
    (function() {
      const card = document.querySelector('.subagent-run-card.focused-task-card[data-subagent-request-id="pass159-subagent-request-a"]');
      const text = card?.textContent || '';
      return Boolean(
        document.querySelector('.bottom-work-panel .subagent-workbench') &&
        card &&
        card.querySelector('.subagent-evidence-details[open]') &&
        /pass159-project-a/.test(text) &&
        /Pass159 Project A Agent/.test(text) &&
        /pass159 subagent summary project A notice evidence/.test(text) &&
        /pass159 subagent stderr project A notice evidence/.test(text) &&
        /pass159 artifact project A notice evidence/.test(text) &&
        !/pass159-project-b/.test(text) &&
        !text.includes(${JSON.stringify(PROJECT_B_DIR)})
      );
    })();
  `, 10000));
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS159_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS159_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  await assertActiveProjectB(win, "PASS159_INITIAL_ACTIVE_PROJECT_B");

  assertStep("PASS159_AUTOMATION_NOTICE_COMMAND_VISIBLE", await openPaletteAndQuery(win, "Pass159 automation notice project A"));
  assertStep("PASS159_AUTOMATION_NOTICE_COMMAND_HAS_PROJECT_A", await waitFor(win, `
    Boolean(Array.from(document.querySelectorAll('.command-modal .command-list button')).some((button) =>
      (button.getAttribute('data-command-id') || '').startsWith('notice:') &&
      /Pass159 automation notice project A/.test(button.textContent || '') &&
      /pass159-project-a/.test(button.textContent || '') &&
      !/pass159-project-b/.test(button.textContent || '')
    ))
  `, 5000));
  assertStep("PASS159_CLICK_AUTOMATION_NOTICE_COMMAND", await clickNoticeCommand(win, "Pass159 automation notice project A"));
  await assertFocusedAutomation(win, "PASS159_AUTOMATION_NOTICE_COMMAND_FOCUSES_PROJECT_A");
  await assertActiveProjectB(win, "PASS159_AUTOMATION_NOTICE_COMMAND_DID_NOT_SWITCH_PROJECT");

  assertStep("PASS159_CLICK_AUTOMATION_NOTICE_CENTER_ACTION", await clickNoticeCenterAction(win, "Pass159 automation notice project A"));
  await assertFocusedAutomation(win, "PASS159_AUTOMATION_NOTICE_CENTER_FOCUSES_PROJECT_A");
  await assertActiveProjectB(win, "PASS159_AUTOMATION_NOTICE_CENTER_DID_NOT_SWITCH_PROJECT");

  assertStep("PASS159_SUBAGENT_NOTICE_COMMAND_VISIBLE", await openPaletteAndQuery(win, "Pass159 subagent notice project A"));
  assertStep("PASS159_SUBAGENT_NOTICE_COMMAND_HAS_PROJECT_A", await waitFor(win, `
    Boolean(Array.from(document.querySelectorAll('.command-modal .command-list button')).some((button) =>
      (button.getAttribute('data-command-id') || '').startsWith('notice:') &&
      /Pass159 subagent notice project A/.test(button.textContent || '') &&
      /pass159-project-a/.test(button.textContent || '') &&
      !/pass159-project-b/.test(button.textContent || '')
    ))
  `, 5000));
  assertStep("PASS159_CLICK_SUBAGENT_NOTICE_COMMAND", await clickNoticeCommand(win, "Pass159 subagent notice project A"));
  await assertFocusedSubagent(win, "PASS159_SUBAGENT_NOTICE_COMMAND_FOCUSES_PROJECT_A");
  await assertActiveProjectB(win, "PASS159_SUBAGENT_NOTICE_COMMAND_DID_NOT_SWITCH_PROJECT");

  assertStep("PASS159_CLICK_SUBAGENT_NOTICE_CENTER_ACTION", await clickNoticeCenterAction(win, "Pass159 subagent notice project A"));
  await assertFocusedSubagent(win, "PASS159_SUBAGENT_NOTICE_CENTER_FOCUSES_PROJECT_A");
  await assertActiveProjectB(win, "PASS159_SUBAGENT_NOTICE_CENTER_DID_NOT_SWITCH_PROJECT");

  console.log("PASS159_NOTICE_TASK_CROSS_PROJECT_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS159_NOTICE_TASK_CROSS_PROJECT_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS159_NOTICE_TASK_CROSS_PROJECT_TIMEOUT");
  cleanup();
  app.exit(1);
}, 100000);
