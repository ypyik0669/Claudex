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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass307-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass307-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass307-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const COMMAND_LOG = path.join(USER_DATA_DIR, "claude-command-log.txt");
const ARM_RETRY_FAILURE = path.join(USER_DATA_DIR, "arm-retry-failure.txt");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const SAFE_RUN_ID = "pass307-safe-mcp-failure";
const MCP_SERVER_NAME = "pass307-mcp";

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

function readCommandLog() {
  try {
    return fs.readFileSync(COMMAND_LOG, "utf8");
  } catch (_error) {
    return "";
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

async function waitForLogGrowth(pattern, previous, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const next = readCommandLog().slice(String(previous || "").length);
    if (pattern.test(next)) return true;
    await wait(150);
  }
  return false;
}

function assertStep(name, ok) {
  console.log(name, ok);
  if (!ok) throw new Error(`${name} failed`);
}

function writeFakeClaude() {
  const fakeClaudeScript = `
const fs = require('fs');
const args = process.argv.slice(2);
const commandLog = ${JSON.stringify(COMMAND_LOG)};
const armRetryFailure = ${JSON.stringify(ARM_RETRY_FAILURE)};
fs.appendFileSync(commandLog, args.join(' ') + '\\n', 'utf8');
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
if (args[0] === '--version') out('2.13.7 (Claude Code PASS307)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out([{ name: '${MCP_SERVER_NAME}', status: 'connected', transport: 'stdio', source: 'pass307 fixture', tools: 1, toolNames: ['pass307-tool'] }]);
else if (args[0] === 'mcp' && args[1] === 'list') {
  if (fs.existsSync(armRetryFailure)) {
    process.stderr.write('pass307 retry mcp list failed for notice recovery\\n');
    process.exit(44);
  }
  out('pass307 mcp list healthy before retry');
}
else out('pass307 fake claude command: ' + args.join(' '));
`;
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(FAKE_CLAUDE, `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function writeInitialStore() {
  writeFakeClaude();
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass307-project" }), "utf8");
  const project = { name: "pass307-project", path: PROJECT_DIR };
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
    activeProject: project,
    projects: [project],
    sessions: [
      {
        id: "pass307-session",
        title: "PASS307 safe retry failure notice recovery",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-09T03:07:00.000Z",
        updatedAt: "2026-07-09T03:07:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [
      {
        id: SAFE_RUN_ID,
        requestId: SAFE_RUN_ID,
        kind: "capability",
        command: "mcp list",
        commandLine: "mcp list",
        cwd: PROJECT_DIR,
        project,
        code: 19,
        durationMs: 91,
        stdout: "pass307 initial mcp stdout before failure",
        stderr: "pass307 initial mcp list failed before retry",
        startedAt: "2026-07-09T03:07:01.000Z",
        endedAt: "2026-07-09T03:07:02.000Z",
        capabilityContext: {
          tab: "mcp",
          kind: "mcp",
          id: MCP_SERVER_NAME,
          query: MCP_SERVER_NAME,
          action: "copy",
        },
      },
    ],
    runEvents: [],
    notices: [],
    automations: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
  });
}

async function openPaletteAndQuery(win, query) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 260));
      return true;
    })();
  `);
}

async function clickCommandById(win, id) {
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

async function clickNoticeCommand(win, noticeId) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === 'notice:' + ${JSON.stringify(noticeId)});
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function commandVisible(win, id, pattern, target = "") {
  return waitFor(win, `
    (function() {
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === ${JSON.stringify(id)});
      const text = button?.textContent || '';
      return Boolean(button &&
        (${JSON.stringify(target)} ? button.getAttribute('data-command-target') === ${JSON.stringify(target)} : true) &&
        ${pattern}.test(text));
    })();
  `, 8000);
}

async function assertSelectedRetryFailureEvidence(win, stepName) {
  assertStep(stepName, await waitFor(win, `
    (function() {
      const active = document.querySelector('.bottom-panel-tabs button[data-bottom-tab="outputs"].active') ||
        document.querySelector('.workspace-context-button.active');
      const panel = document.querySelector('.selected-run-evidence-panel.error');
      const retry = panel?.querySelector('[data-run-recovery-action="retry-capability"]');
      const text = panel?.textContent || '';
      return Boolean(active &&
        /\\u8f93\\u51fa|Outputs/i.test(active.textContent || '') &&
        panel &&
        retry &&
        retry.getAttribute('data-run-recovery-action-focused') === 'true' &&
        document.activeElement === retry &&
        panel.querySelector('[data-run-event-type="capability-cli"]') &&
        /mcp list/.test(text) &&
        /pass307 retry mcp list failed for notice recovery/.test(text));
    })();
  `, 12000));
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS307_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS307_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));

  assertStep("PASS307_OPEN_PALETTE_SAFE_RETRY", await openPaletteAndQuery(win, "retry pass307 mcp list"));
  assertStep("PASS307_SAFE_RETRY_COMMAND_VISIBLE", await commandVisible(win, `capability-recovery:retry:${SAFE_RUN_ID}`, /重试|retry/i, "outputs"));
  const beforeRetry = readCommandLog();
  assertStep("PASS307_CLICK_SAFE_RETRY_COMMAND", await clickCommandById(win, `capability-recovery:retry:${SAFE_RUN_ID}`));
  assertStep("PASS307_SAFE_RETRY_ACTION_FOCUSED", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.selected-run-evidence-panel.error');
      const retry = panel?.querySelector('[data-run-recovery-action="retry-capability"]');
      const text = panel?.textContent || '';
      return Boolean(
        panel &&
        retry &&
        retry.getAttribute('data-run-recovery-action-focused') === 'true' &&
        document.activeElement === retry &&
        /mcp list/.test(text) &&
        /pass307 initial mcp list failed before retry/.test(text) &&
        !document.querySelector('.plugin-cli-confirm')
      );
    })();
  `, 10000));
  assertStep("PASS307_SAFE_RETRY_NOT_RUN_BEFORE_EVIDENCE_RETRY", !/mcp list/.test(readCommandLog().slice(beforeRetry.length)));

  fs.writeFileSync(ARM_RETRY_FAILURE, "1", "utf8");
  assertStep("PASS307_CLICK_SAFE_EVIDENCE_RETRY", await win.webContents.executeJavaScript(`
    (function() {
      const retry = document.querySelector('.selected-run-evidence-panel [data-run-recovery-action="retry-capability"]');
      if (!retry || retry.disabled) return false;
      retry.click();
      return true;
    })();
  `));
  assertStep("PASS307_SAFE_RETRY_RAN", await waitForLogGrowth(/mcp list/, beforeRetry, 12000));
  assertStep("PASS307_SAFE_RETRY_NO_CONFIRM", await win.webContents.executeJavaScript("!document.querySelector('.plugin-cli-confirm')"));
  assertStep("PASS307_SAFE_RETRY_FAILURE_NOTICE_STATE", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const run = (state.commandRuns || []).find((item) =>
        item.kind === 'capability' &&
        item.requestId !== '${SAFE_RUN_ID}' &&
        /mcp list/.test(item.command || item.commandLine || '') &&
        item.code === 44 &&
        /pass307 retry mcp list failed for notice recovery/.test(item.stderr || '')
      );
      const runId = run?.requestId || run?.id || '';
      const event = runId ? (state.runEvents || []).find((item) => item.id === runId) : null;
      const notice = runId ? (state.notices || []).find((item) =>
        item.runEventId === runId &&
        item.action === 'capability-recovery:' + encodeURIComponent(runId)
      ) : null;
      window.__PASS307_NOTICE_ID__ = notice?.id || '';
      window.__PASS307_RETRY_RUN_ID__ = runId;
      return Boolean(run &&
        run.capabilityContext?.kind === 'mcp' &&
        run.capabilityContext?.id === '${MCP_SERVER_NAME}' &&
        event?.type === 'capability-cli' &&
        event?.status === 'error' &&
        event?.capabilityContext?.kind === 'mcp' &&
        notice &&
        notice.level === 'error' &&
        notice.source === 'plugin/mcp' &&
        notice.capabilityContext?.kind === 'mcp' &&
        /pass307 retry mcp list failed for notice recovery/.test(notice.detail || ''));
    })();
  `, 12000));

  assertStep("PASS307_OPEN_NOTICE_CENTER", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('[data-bottom-tab="notices"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS307_NOTICE_CENTER_SUMMARY_TARGETS_RETRY_RUN", await waitFor(win, `
    (function() {
      const runId = window.__PASS307_RETRY_RUN_ID__ || '';
      const button = document.querySelector('.notice-recovery-summary [data-notice-recovery-target="timeline"]');
      const centerText = document.querySelector('.notice-center')?.textContent || '';
      return Boolean(button &&
        button.getAttribute('data-notice-recovery-first-run-event-id') === runId &&
        /pass307 retry mcp list failed for notice recovery/.test(centerText));
    })();
  `, 10000));
  assertStep("PASS307_CLICK_NOTICE_CENTER_SUMMARY", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.notice-recovery-summary [data-notice-recovery-target="timeline"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  await assertSelectedRetryFailureEvidence(win, "PASS307_NOTICE_CENTER_OPENS_RETRY_FAILURE_EVIDENCE");

  assertStep("PASS307_OPEN_PALETTE_NOTICE_BUCKET", await openPaletteAndQuery(win, "notice recovery pass307 retry failed"));
  assertStep("PASS307_NOTICE_BUCKET_COMMAND_TARGETS_RETRY_RUN", await waitFor(win, `
    (function() {
      const runId = window.__PASS307_RETRY_RUN_ID__ || '';
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === 'notice-recovery:timeline');
      const text = button?.textContent || '';
      return Boolean(button &&
        button.getAttribute('data-command-target') === 'timeline' &&
        button.getAttribute('data-command-notice-recovery-first-run-event-id') === runId &&
        /^capability-recovery:/.test(button.getAttribute('data-command-notice-recovery-first-action') || '') &&
        /pass307 retry mcp list failed for notice recovery/.test(text));
    })();
  `, 10000));
  assertStep("PASS307_CLICK_NOTICE_BUCKET_COMMAND", await clickCommandById(win, "notice-recovery:timeline"));
  await assertSelectedRetryFailureEvidence(win, "PASS307_NOTICE_BUCKET_COMMAND_OPENS_RETRY_FAILURE_EVIDENCE");

  assertStep("PASS307_OPEN_PALETTE_NOTICE", await openPaletteAndQuery(win, "pass307 retry failed notice recovery"));
  assertStep("PASS307_NOTICE_COMMAND_TARGET_TIMELINE", await waitFor(win, `
    (function() {
      const noticeId = window.__PASS307_NOTICE_ID__ || '';
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === 'notice:' + noticeId);
      const text = button?.textContent || '';
      return Boolean(button &&
        button.getAttribute('data-command-target') === 'timeline' &&
        /pass307 retry mcp list failed for notice recovery/.test(text) &&
        /\\u67e5\\u770b\\u8bc1\\u636e/.test(text));
    })();
  `, 10000));
  const noticeId = await win.webContents.executeJavaScript("window.__PASS307_NOTICE_ID__ || ''");
  assertStep("PASS307_CLICK_NOTICE_COMMAND", await clickNoticeCommand(win, noticeId));
  await assertSelectedRetryFailureEvidence(win, "PASS307_NOTICE_COMMAND_OPENS_RETRY_FAILURE_EVIDENCE");

  console.log("PASS307_SAFE_RETRY_FAILURE_NOTICE_RECOVERY_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS307_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (async function() {
          return {
            noticeId: window.__PASS307_NOTICE_ID__ || '',
            retryRunId: window.__PASS307_RETRY_RUN_ID__ || '',
            commands: [...document.querySelectorAll('.command-modal .command-list button')].map((button) => ({
              id: button.getAttribute('data-command-id'),
              target: button.getAttribute('data-command-target'),
              text: button.textContent,
            })),
            selectedRun: document.querySelector('.selected-run-evidence-panel')?.textContent || '',
            notices: [...document.querySelectorAll('.notice-card')].map((card) => card.textContent),
            noticeSummary: document.querySelector('.notice-recovery-summary')?.textContent || '',
            body: document.body?.textContent?.slice(0, 7000) || '',
            state: await window.claudexDesktop.getState().catch((stateError) => ({ error: String(stateError?.message || stateError) })),
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS307_DEBUG", JSON.stringify(debug, null, 2).slice(0, 14000));
      console.error("PASS307_COMMAND_LOG", readCommandLog());
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS307_TIMEOUT");
  console.error("PASS307_COMMAND_LOG", readCommandLog());
  cleanup();
  app.exit(1);
}, 90000);
