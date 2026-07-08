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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass284-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass284-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass284-project-"));
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const CENTER_EVENT_ID = "pass284-center-git-fail";
const PALETTE_EVENT_ID = "pass284-palette-git-fail";
const LATEST_EVENT_ID = "pass284-latest-git-ok";
const CENTER_NOTICE_ID = "pass284-center-git-notice";
const PALETTE_NOTICE_ID = "pass284-palette-git-notice";

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

function commandIdSegment(value) {
  return encodeURIComponent(String(value || "").trim()).slice(0, 120) || "item";
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function writeFakeClaude() {
  const fakeClaudeScript = `
const args = process.argv.slice(2);
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
if (args[0] === '--version') out('2.84.0 (Claude Code QA pass284)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list') out(args.includes('--json') ? [] : 'Installed plugins: none');
else if (args[0] === 'mcp' && args[1] === 'list') out({ servers: [] });
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out({ plugins: [] });
else out('fake claude command: ' + args.join(' '));
`;
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(FAKE_CLAUDE, `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function gitRunEvent({ id, status, title, detail, commandLine, stdout, stderr, code, createdAt }) {
  return {
    id,
    type: "git-command",
    status,
    title,
    detail,
    commandLine,
    cwd: PROJECT_DIR,
    stdout,
    stderr,
    code,
    createdAt,
  };
}

function commandRunForEvent(event) {
  return {
    id: event.id,
    requestId: event.id,
    kind: "git",
    command: event.commandLine,
    commandLine: event.commandLine,
    cwd: PROJECT_DIR,
    stdout: event.stdout,
    stderr: event.stderr,
    code: event.code,
    status: event.status,
    startedAt: event.createdAt,
    completedAt: event.createdAt,
    durationMs: 284,
  };
}

function gitNotice({ id, title, detail, eventId }) {
  return {
    id,
    level: "error",
    source: "git-command",
    title,
    detail,
    action: `git-run:${encodeURIComponent(eventId)}`,
    runEventId: eventId,
    projectPath: PROJECT_DIR,
    createdAt: "2026-07-08T05:30:00.000Z",
    lastSeenAt: "2026-07-08T05:30:00.000Z",
  };
}

function writeInitialStore() {
  writeFakeClaude();
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass284-project" }), "utf8");
  const project = { name: "pass284-project", path: PROJECT_DIR };
  const latestEvent = gitRunEvent({
    id: LATEST_EVENT_ID,
    status: "ok",
    title: "Git: Pass284 latest success",
    detail: "pass284 latest success should not be selected",
    commandLine: "git status --short",
    stdout: "pass284 latest success stdout",
    stderr: "",
    code: 0,
    createdAt: "2026-07-08T05:35:00.000Z",
  });
  const centerEvent = gitRunEvent({
    id: CENTER_EVENT_ID,
    status: "error",
    title: "Git: Pass284 center failure",
    detail: "pass284 center git notice failed action",
    commandLine: "git add missing-pass284-center.txt",
    stdout: "",
    stderr: "fatal: pass284 center target missing",
    code: 128,
    createdAt: "2026-07-08T05:34:00.000Z",
  });
  const paletteEvent = gitRunEvent({
    id: PALETTE_EVENT_ID,
    status: "error",
    title: "Git: Pass284 palette failure",
    detail: "pass284 palette git notice failed action",
    commandLine: "git add missing-pass284-palette.txt",
    stdout: "",
    stderr: "fatal: pass284 palette target missing",
    code: 128,
    createdAt: "2026-07-08T05:33:00.000Z",
  });
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
      claudeCode: { executionMode: "claude-code", claudeCommand: FAKE_CLAUDE, permissionMode: "plan" },
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
    sessions: [{
      id: "pass284-session",
      title: "Pass284 git notice run event focus",
      project: project.name,
      projectPath: project.path,
      createdAt: "2026-07-08T05:30:00.000Z",
      updatedAt: "2026-07-08T05:30:00.000Z",
      messages: [],
    }],
    commandRuns: [latestEvent, centerEvent, paletteEvent].map(commandRunForEvent),
    runEvents: [latestEvent, centerEvent, paletteEvent],
    notices: [
      gitNotice({
        id: CENTER_NOTICE_ID,
        title: "Pass284 center git notice",
        detail: "Pass284 center notice should open changes not outputs",
        eventId: CENTER_EVENT_ID,
      }),
      gitNotice({
        id: PALETTE_NOTICE_ID,
        title: "Pass284 palette git notice",
        detail: "Pass284 palette notice command should focus changes action",
        eventId: PALETTE_EVENT_ID,
      }),
    ],
    automations: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
  });
}

async function openNoticePanel(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      if (document.querySelector('.notice-center')) return true;
      const noticePattern = new RegExp("\\\\u901a\\\\u77e5");
      const button = [...document.querySelectorAll('.workspace-context-button')]
        .find((candidate) => noticePattern.test(candidate.textContent || candidate.getAttribute('aria-label') || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function clickNoticeAction(win, title) {
  return win.webContents.executeJavaScript(`
    (function() {
      const card = [...document.querySelectorAll('.notice-card')]
        .find((candidate) => (candidate.textContent || '').includes(${JSON.stringify(title)}));
      const button = card?.querySelector('button[data-notice-action="open"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runPaletteCommand(win, query, expectedId) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 240));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 320));
      const button = document.querySelector(${JSON.stringify(`.command-modal .command-list button[data-command-id="${expectedId}"]`)});
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function assertFocusedGitNoticeEvidence(win, name, expectedToken, unexpectedToken) {
  assertStep(name, await waitFor(win, `
    (function() {
      const activeChanges = document.querySelector('.bottom-panel-tabs button[data-bottom-tab="changes"].active');
      const activeOutputs = document.querySelector('.bottom-panel-tabs button[data-bottom-tab="outputs"].active');
      const card = document.querySelector('.git-latest-action.error');
      const timelineButton = card?.querySelector('button[data-git-action="open-timeline"]');
      const text = card?.textContent || '';
      return Boolean(
        activeChanges &&
        !activeOutputs &&
        card &&
        text.includes(${JSON.stringify(expectedToken)}) &&
        !text.includes(${JSON.stringify(unexpectedToken)}) &&
        timelineButton &&
        timelineButton.getAttribute('data-git-action-focused') === 'true' &&
        document.activeElement === timelineButton
      );
    })();
  `, 12000));
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS284_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS284_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS284_STORE_HAS_GIT_NOTICES_WITH_RUN_EVENTS", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const center = (state.notices || []).find((notice) => notice.id === ${JSON.stringify(CENTER_NOTICE_ID)});
      const palette = (state.notices || []).find((notice) => notice.id === ${JSON.stringify(PALETTE_NOTICE_ID)});
      return Boolean(
        center &&
        palette &&
        center.action === 'git-run:${encodeURIComponent(CENTER_EVENT_ID)}' &&
        palette.action === 'git-run:${encodeURIComponent(PALETTE_EVENT_ID)}' &&
        center.runEventId === ${JSON.stringify(CENTER_EVENT_ID)} &&
        palette.runEventId === ${JSON.stringify(PALETTE_EVENT_ID)}
      );
    })();
  `, 8000));

  assertStep("PASS284_OPEN_NOTICE_PANEL", await openNoticePanel(win));
  assertStep("PASS284_NOTICE_CARD_TARGETS_CHANGES", await waitFor(win, `
    (function() {
      const card = [...document.querySelectorAll('.notice-card')]
        .find((candidate) => /Pass284 center git notice/.test(candidate.textContent || ''));
      const button = card?.querySelector('button[data-notice-action="open"]');
      return Boolean(button &&
        button.getAttribute('data-notice-action-target') === 'changes' &&
        /查看变更证据/.test(button.textContent || ''));
    })();
  `, 10000));
  assertStep("PASS284_CLICK_NOTICE_CENTER_ACTION", await clickNoticeAction(win, "Pass284 center git notice"));
  await assertFocusedGitNoticeEvidence(
    win,
    "PASS284_NOTICE_CENTER_FOCUSES_TARGET_GIT_ACTION",
    "pass284 center git notice failed action",
    "pass284 latest success should not be selected",
  );

  assertStep(
    "PASS284_NOTICE_COMMAND_CLICKED",
    await runPaletteCommand(win, "Pass284 palette git notice", `notice:${commandIdSegment(PALETTE_NOTICE_ID)}`),
  );
  await assertFocusedGitNoticeEvidence(
    win,
    "PASS284_NOTICE_COMMAND_FOCUSES_TARGET_GIT_ACTION",
    "pass284 palette git notice failed action",
    "pass284 center git notice failed action",
  );
  assertStep("PASS284_GIT_NOTICE_ACTION_DID_NOT_MUTATE_COMMANDS", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      return Boolean((state.commandRuns || []).length === 3 && (state.runEvents || []).length === 3);
    })();
  `));

  console.log("PASS284_GIT_NOTICE_RUN_EVENT_FOCUS_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS284_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (function() {
          return {
            activeTab: document.querySelector('.bottom-panel-tabs button.active')?.getAttribute('data-bottom-tab') || '',
            latest: document.querySelector('.git-latest-action')?.outerHTML || '',
            focused: Array.from(document.querySelectorAll('[data-git-action-focused="true"]')).map((item) => ({
              text: item.textContent,
              attrs: Object.fromEntries(Array.from(item.attributes).map((attr) => [attr.name, attr.value])),
              active: item === document.activeElement,
            })),
            commands: Array.from(document.querySelectorAll('.command-modal .command-list button')).slice(0, 40).map((item) => ({
              id: item.getAttribute('data-command-id'),
              text: item.textContent,
              attrs: Object.fromEntries(Array.from(item.attributes).map((attr) => [attr.name, attr.value])),
            })),
            body: document.body?.textContent?.slice(0, 7000) || '',
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS284_DEBUG", JSON.stringify(debug, null, 2).slice(0, 16000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS284_TIMEOUT");
  cleanup();
  app.exit(1);
}, 120000);
