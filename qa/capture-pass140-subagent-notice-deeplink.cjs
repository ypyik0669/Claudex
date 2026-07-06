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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass140-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass140-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass140-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_DIR]) {
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

function writeFakeClaude() {
  const fakeClaudeScript = `
const args = process.argv.slice(2);
const prompt = String(args[1] || '');
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value) + '\\n'); }
if (args[0] === '--version') out('2.9.0 (pass140 fake)');
else if (args[0] === '-p' && /pass140/.test(prompt)) {
  process.stderr.write('pass140 subagent stderr failure evidence\\n');
  out({ is_error: true, result: 'pass140 subagent failure notice evidence', session_id: 'pass140-error-session' });
  process.exit(7);
} else if (args[0] === '-p') {
  out({ result: 'pass140 generic ok', session_id: 'pass140-generic-session' });
} else {
  out('pass140 fake command: ' + args.join(' '));
}
`;
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
  return path.join(FAKE_BIN_DIR, "claude.cmd");
}

function writeInitialStore(claudeCommand) {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass140-project" }), "utf8");
  const project = { name: "pass140-project", path: PROJECT_DIR };
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
      claudeCode: { executionMode: "claude-code", claudeCommand, permissionMode: "default" },
      capabilities: {
        "project-context": true,
        "code-review": true,
        "implementation-plan": true,
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
        id: "pass140-session",
        title: "Pass140 subagent notice deeplink",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
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

async function openSubagents(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const label = '\\u5b50\\u4ee3\\u7406';
      const button = Array.from(document.querySelectorAll('.workspace-context-button, .bottom-panel-tabs button'))
        .find((item) => item.getAttribute('aria-label') === label || (item.textContent || '').includes(label));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function openNoticesPanel(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.workspace-context-button, .bottom-panel-tabs button')]
        .find((candidate) => /\\u901a\\u77e5/.test(candidate.textContent || '') || /\\u901a\\u77e5/.test(candidate.getAttribute('aria-label') || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
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

async function clickNoticeCommand(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) =>
          (candidate.getAttribute('data-command-id') || '').startsWith('notice:') &&
          /pass140 subagent failure notice evidence/.test(candidate.textContent || '')
        );
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function assertFocusedSubagent(win, stepName) {
  assertStep(stepName, await waitFor(win, `
    (function() {
      const card = document.querySelector('.subagent-run-card.error.focused-task-card[data-subagent-request-id="' + window.__pass140SubagentRequestId + '"]');
      const evidenceOpen = Array.from(card?.querySelectorAll('.subagent-evidence-details[open]') || [])
        .some((details) => /证据/.test(details.querySelector('summary')?.textContent || ''));
      const artifactsOpen = Array.from(card?.querySelectorAll('.subagent-evidence-details[open]') || [])
        .some((details) => /产物/.test(details.querySelector('summary')?.textContent || ''));
      return Boolean(
        document.querySelector('.bottom-work-panel .subagent-workbench') &&
        card &&
        evidenceOpen &&
        artifactsOpen &&
        /Notice Failure Agent/.test(card.textContent || '') &&
        /pass140 subagent failure notice evidence/.test(card.textContent || '') &&
        /pass140 subagent stderr failure evidence/.test(card.textContent || '')
      );
    })()
  `, 10000));
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS140_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS140_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS140_OPEN_SUBAGENTS", await openSubagents(win));
  assertStep("PASS140_WORKBENCH_READY", await waitFor(win, "Boolean(document.querySelector('.subagent-workbench') && document.querySelector('.subagent-form textarea'))", 10000));

  assertStep("PASS140_RUN_FAILING_SUBAGENT", await waitFor(win, `
    (async function() {
      if (!window.__pass140Clicked) {
        window.__pass140Clicked = true;
        const textarea = document.querySelector('.subagent-form textarea');
        const nickname = document.querySelector('.subagent-form input');
        const submit = document.querySelector('.subagent-form .primary-action');
        if (!textarea || !nickname || !submit) return false;
        Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(textarea, 'pass140 trigger subagent notice deeplink');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(nickname, 'Notice Failure Agent');
        nickname.dispatchEvent(new Event('input', { bubbles: true }));
        submit.click();
      }
      await new Promise((resolve) => setTimeout(resolve, 900));
      const state = await window.claudexDesktop.getState();
      const run = state.subagentRuns?.find((item) => item.nickname === 'Notice Failure Agent');
      const notice = state.notices?.find((item) =>
        item.source === 'subagent' &&
        /^subagent:/.test(item.action || '') &&
        /pass140 subagent failure notice evidence/.test((item.title || '') + (item.detail || ''))
      );
      if (run?.requestId) window.__pass140SubagentRequestId = run.requestId;
      return Boolean(
        run?.status === 'error' &&
        run.code === 7 &&
        /pass140 subagent failure notice evidence/.test(run.summary || '') &&
        /pass140 subagent stderr failure evidence/.test(run.stderr || '') &&
        notice &&
        decodeURIComponent(notice.action || '').endsWith(run.requestId)
      );
    })();
  `, 15000));

  assertStep("PASS140_OPEN_PALETTE_QUERY_NOTICE", await openPaletteAndQuery(win, "pass140 subagent failure notice evidence"));
  assertStep("PASS140_NOTICE_COMMAND_VISIBLE", await waitFor(win, `
    Boolean([...document.querySelectorAll('.command-modal .command-list button')].some((button) =>
      (button.getAttribute('data-command-id') || '').startsWith('notice:') &&
      /pass140 subagent failure notice evidence/.test(button.textContent || '') &&
      /subagent/.test(button.textContent || '')
    ))
  `, 5000));
  assertStep("PASS140_CLICK_NOTICE_COMMAND", await clickNoticeCommand(win));
  await assertFocusedSubagent(win, "PASS140_NOTICE_COMMAND_FOCUSES_SUBAGENT");

  assertStep("PASS140_OPEN_NOTICES", await openNoticesPanel(win));
  assertStep("PASS140_NOTICE_CARD_ACTION_VISIBLE", await waitFor(win, `
    Boolean([...document.querySelectorAll('.notice-card')].some((card) =>
      /pass140 subagent failure notice evidence/.test(card.textContent || '') && card.querySelector('button[data-notice-action="open"]')
    ))
  `, 5000));
  assertStep("PASS140_CLICK_NOTICE_ACTION", await win.webContents.executeJavaScript(`
    (function() {
      const card = [...document.querySelectorAll('.notice-card')]
        .find((candidate) => /pass140 subagent failure notice evidence/.test(candidate.textContent || ''));
      const button = card?.querySelector('button[data-notice-action="open"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  await assertFocusedSubagent(win, "PASS140_NOTICE_CENTER_FOCUSES_SUBAGENT");

  console.log("PASS140_SUBAGENT_NOTICE_DEEPLINK_DONE");
  cleanup();
  app.exit(0);
}

const fakeClaudeCommand = writeFakeClaude();
app.setPath("userData", USER_DATA_DIR);
writeInitialStore(fakeClaudeCommand);
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS140_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS140_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
