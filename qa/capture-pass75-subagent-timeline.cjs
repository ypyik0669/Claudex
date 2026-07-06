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
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass75-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass75-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass75-project-"));
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

const fakeClaudeScript = `
const args = process.argv.slice(2);
const prompt = String(args[1] || '');
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value) + '\\n'); }
if (args[0] === '-p' && /pass75 fail/.test(prompt)) {
  process.stderr.write('pass75-subagent-error\\n');
  out({ is_error: true, result: 'pass75-subagent-failure artifact evidence', session_id: 'pass75-error-session' });
  process.exitCode = 2;
} else if (args[0] === '-p') {
  process.stderr.write('pass75-subagent-stderr\\n');
  out({ result: 'pass75-subagent-summary artifact evidence', session_id: 'pass75-claude-session' });
} else if (args[0] === '--version') {
  out('2.9.0 (pass75 fake)');
} else {
  out({ result: 'pass75 generic ok', session_id: 'pass75-generic-session' });
}
`;

fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
const FAKE_CLAUDE_COMMAND = path.join(FAKE_BIN_DIR, "claude.cmd");
process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;

app.setPath("userData", USER_DATA_DIR);
fs.mkdirSync(PROJECT_DIR, { recursive: true });
fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass75-project" }), "utf8");

const createdAt = "2026-07-06T00:00:00.000Z";
const pass75Project = { name: "pass75-project", path: PROJECT_DIR };

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
    claudeCode: { executionMode: "claude-code", claudeCommand: FAKE_CLAUDE_COMMAND, permissionMode: "default" },
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
  },
  activeProject: pass75Project,
  projects: [pass75Project],
  sessions: [
    {
      id: "default",
      title: "\u65b0\u804a\u5929",
      project: "pass75-project",
      projectPath: PROJECT_DIR,
      createdAt,
      updatedAt: createdAt,
      messages: [],
    },
  ],
  automations: [],
  subagentRuns: [],
  runEvents: [],
});

require(path.join(REPO_DIR, "electron", "main.cjs"));

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

function persistedState() {
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

app.whenReady().then(async () => {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.error("PASS75_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  try {
    assertStep("PASS75_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
    assertStep("PASS75_SUBAGENT_IPC", await win.webContents.executeJavaScript(`
      typeof window.claudexDesktop.runSubagent === 'function' &&
      typeof window.claudexDesktop.cancelSubagent === 'function' &&
      typeof window.claudexDesktop.onSubagentStream === 'function'
    `));

    assertStep("PASS75_OPEN_SUBAGENTS", await openSubagents(win));
    assertStep("PASS75_WORKBENCH_READY", await waitFor(win, "Boolean(document.querySelector('.subagent-workbench') && document.querySelector('.subagent-form textarea'))", 10000));

    assertStep("PASS75_RUN_SUCCESS_SUBAGENT", await waitFor(win, `
      (async function() {
        if (!window.__pass75SuccessClicked) {
          window.__pass75SuccessClicked = true;
          const textarea = document.querySelector('.subagent-form textarea');
          const nickname = document.querySelector('.subagent-form input');
          const submit = document.querySelector('.subagent-form .primary-action');
          if (!textarea || !nickname || !submit) return false;
          Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(textarea, 'pass75 inspect timeline artifact evidence');
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(nickname, 'Timeline QA');
          nickname.dispatchEvent(new Event('input', { bubbles: true }));
          submit.click();
        }
        await new Promise((resolve) => setTimeout(resolve, 900));
        const state = await window.claudexDesktop.getState();
        const run = state.subagentRuns?.find((item) => item.nickname === 'Timeline QA');
        const event = state.runEvents?.find((item) => item.id === run?.requestId);
        const body = document.body.textContent || '';
        return Boolean(
          run?.status === 'done' &&
          run.code === 0 &&
          run.sessionId === 'default' &&
          /pass75-subagent-summary artifact evidence/.test(run.summary || '') &&
          /pass75-subagent-stderr/.test(run.stderr || '') &&
          run.artifacts?.length >= 3 &&
          run.artifacts.some((artifact) => artifact.label === 'Summary') &&
          run.artifacts.some((artifact) => artifact.label === 'stdout') &&
          run.artifacts.some((artifact) => artifact.label === 'stderr') &&
          event?.type === 'subagent' &&
          event.status === 'ok' &&
          document.querySelector('.subagent-run-card.done') &&
          /pass75-subagent-summary artifact evidence/.test(body) &&
          /pass75-subagent-stderr/.test(body) &&
          /\\u4ea7\\u7269:\\s*3/.test(body)
        );
      })();
    `, 12000));

    assertStep("PASS75_SUCCESS_TIMELINE_EVIDENCE", await waitFor(win, `
      (async function() {
        if (!window.__pass75OpenedOutputs) {
          window.__pass75OpenedOutputs = true;
          const open = Array.from(document.querySelectorAll('.subagent-run-foot button'))
            .find((button) => /timeline/i.test(button.textContent || ''));
          if (open) open.click();
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
        const row = Array.from(document.querySelectorAll('.run-timeline-row.ok'))
          .find((item) => /pass75-subagent-summary artifact evidence/.test(item.textContent || ''));
        if (!row) return false;
        row.querySelector('summary')?.click();
        await new Promise((resolve) => setTimeout(resolve, 150));
        const panel = document.querySelector('.selected-run-evidence-panel');
        const text = panel?.textContent || '';
        return Boolean(
          panel &&
          /subagent/.test(text) &&
          /pass75-subagent-summary artifact evidence/.test(text) &&
          /pass75-subagent-stderr/.test(text) &&
          /pass75-claude-session/.test(text) &&
          /claude\\.cmd/.test(text) &&
          /-p/.test(text) &&
          /Summary/.test(text) &&
          /stdout/.test(text) &&
          /stderr/.test(text)
        );
      })();
    `, 5000));

    assertStep("PASS75_TIMELINE_COPY_INCLUDES_ARTIFACTS", await waitFor(win, `
      (async function() {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText: async (text) => { window.__pass75Clipboard = String(text || ''); } },
        });
        const state = await window.claudexDesktop.getState();
        const run = state.subagentRuns?.find((item) => item.nickname === 'Timeline QA');
        const copy = document.querySelector('.selected-run-evidence-panel .run-timeline-actions button');
        if (!copy) return false;
        copy.click();
        await new Promise((resolve) => setTimeout(resolve, 250));
        const text = window.__pass75Clipboard || '';
        return Boolean(
          run?.id &&
          run?.requestId &&
          text.includes(run.id) &&
          text.includes(run.requestId) &&
          /Timeline QA/.test(text) &&
          /pass75 inspect timeline artifact evidence/.test(text) &&
          text.includes(${JSON.stringify(PROJECT_DIR)}) &&
          /\\u4ea7\\u7269:\\s*Summary, stdout, stderr/.test(text) &&
          /pass75-subagent-summary artifact evidence/.test(text) &&
          /pass75-subagent-stderr/.test(text)
        );
      })();
    `, 5000));

    assertStep("PASS75_REOPEN_SUBAGENTS_FOR_ERROR", await openSubagents(win));
    assertStep("PASS75_RUN_ERROR_SUBAGENT", await waitFor(win, `
      (async function() {
        if (!window.__pass75ErrorClicked) {
          window.__pass75ErrorClicked = true;
          const textarea = document.querySelector('.subagent-form textarea');
          const nickname = document.querySelector('.subagent-form input');
          const submit = document.querySelector('.subagent-form .primary-action');
          if (!textarea || !nickname || !submit) return false;
          Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(textarea, 'pass75 fail timeline artifact evidence');
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(nickname, 'Failing Timeline QA');
          nickname.dispatchEvent(new Event('input', { bubbles: true }));
          submit.click();
        }
        await new Promise((resolve) => setTimeout(resolve, 900));
        const state = await window.claudexDesktop.getState();
        const run = state.subagentRuns?.find((item) => item.nickname === 'Failing Timeline QA');
        const event = state.runEvents?.find((item) => item.id === run?.requestId);
        const body = document.body.textContent || '';
        return Boolean(
          run?.status === 'error' &&
          run.code === 2 &&
          /pass75-subagent-failure artifact evidence/.test(run.summary || '') &&
          /pass75-subagent-error/.test(run.stderr || '') &&
          run.artifacts?.length >= 3 &&
          event?.type === 'subagent' &&
          event.status === 'error' &&
          document.querySelector('.subagent-run-card.error') &&
          /pass75-subagent-failure artifact evidence/.test(body) &&
          /pass75-subagent-error/.test(body)
        );
      })();
    `, 12000));

    assertStep("PASS75_OPEN_ERROR_CARD_SELECTS_TIMELINE", await waitFor(win, `
      (async function() {
        if (!window.__pass75OpenedErrorCardTimeline) {
          const card = document.querySelector('.subagent-run-card.error');
          const open = Array.from(card?.querySelectorAll('.subagent-run-foot button') || [])
            .find((button) => /timeline/i.test(button.title || '') || /timeline/i.test(button.textContent || ''));
          if (!open) return false;
          window.__pass75OpenedErrorCardTimeline = true;
          open.click();
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
        const panel = document.querySelector('.selected-run-evidence-panel.error');
        const text = panel?.textContent || '';
        return Boolean(
          panel &&
          /subagent/.test(text) &&
          /pass75-subagent-failure artifact evidence/.test(text) &&
          /pass75-subagent-error/.test(text) &&
          /pass75-error-session/.test(text) &&
          /Failing Timeline QA/.test(text)
        );
      })();
    `, 5000));

    assertStep("PASS75_ERROR_TIMELINE_EVIDENCE", await waitFor(win, `
      (async function() {
        const row = document.querySelector('.run-timeline-row.selected.error');
        const panel = document.querySelector('.selected-run-evidence-panel.error');
        const text = panel?.textContent || '';
        return Boolean(
          row &&
          panel &&
          /subagent/.test(text) &&
          /pass75-subagent-failure artifact evidence/.test(text) &&
          /pass75-subagent-error/.test(text) &&
          /pass75-error-session/.test(text) &&
          /\\b2\\b/.test(text) &&
          /Summary/.test(text) &&
          /stdout/.test(text) &&
          /stderr/.test(text)
        );
      })();
    `, 5000));

    assertStep("PASS75_ERROR_RECOVERY_ACTIONS_VISIBLE", await waitFor(win, `
      (function() {
        const panel = document.querySelector('.selected-run-evidence-panel.error');
        return Boolean(
          panel &&
          panel.querySelector('[data-run-recovery-action="task-center"]') &&
          panel.querySelector('[data-run-recovery-action="retry-subagent"]') &&
          panel.querySelector('[data-run-recovery-action="continue-subagent"]') &&
          panel.querySelector('[data-run-recovery-action="terminal"]') &&
          panel.querySelector('[data-run-recovery-action="interactive-claude"]') &&
          /Failing Timeline QA/.test(panel.textContent || '') &&
          /pass75 fail timeline artifact evidence/.test(panel.textContent || '')
        );
      })()
    `, 5000));

    assertStep("PASS75_RETRY_SUBAGENT_FROM_SELECTED_EVIDENCE", await win.webContents.executeJavaScript(`
      (function() {
        const button = document.querySelector('.selected-run-evidence-panel [data-run-recovery-action="retry-subagent"]');
        if (!button || button.disabled) return false;
        button.click();
        return true;
      })();
    `));

    assertStep("PASS75_RETRY_SUBAGENT_FROM_SELECTED_EVIDENCE_PERSISTED", await waitFor(win, `
      (async function() {
        const state = await window.claudexDesktop.getState();
        const failingRuns = state.subagentRuns?.filter((run) =>
          run.nickname === 'Failing Timeline QA' &&
          run.status === 'error' &&
          /pass75 fail timeline artifact evidence/.test(run.task || '') &&
          /pass75-subagent-failure artifact evidence/.test(run.summary || '') &&
          /pass75-subagent-error/.test(run.stderr || '')
        ) || [];
        return Boolean(
          failingRuns.length >= 2 &&
          failingRuns.every((run) => run.project?.path === ${JSON.stringify(PROJECT_DIR)} && run.sessionId === 'default') &&
          state.runEvents?.some((event) =>
            failingRuns.some((run) => event.id === run.requestId) &&
            event.type === 'subagent' &&
            event.status === 'error'
          )
        );
      })();
    `, 12000));

    assertStep("PASS75_STORE_PERSISTED", (() => {
      const parsed = persistedState();
      const doneRun = parsed.subagentRuns?.find((item) => item.nickname === "Timeline QA");
      const errorRun = parsed.subagentRuns?.find((item) => item.nickname === "Failing Timeline QA");
      const retryErrorRuns = parsed.subagentRuns?.filter((item) => item.nickname === "Failing Timeline QA" && item.status === "error") || [];
      const doneEvent = parsed.runEvents?.find((item) => item.id === doneRun?.requestId);
      const errorEvent = parsed.runEvents?.find((item) => item.id === errorRun?.requestId);
      return parsed.subagentRuns?.length >= 3 &&
        doneRun?.status === "done" &&
        doneRun.code === 0 &&
        doneRun.artifacts?.length >= 3 &&
        errorRun?.status === "error" &&
        errorRun.code === 2 &&
        errorRun.artifacts?.length >= 3 &&
        retryErrorRuns.length >= 2 &&
        doneEvent?.type === "subagent" &&
        doneEvent.status === "ok" &&
        errorEvent?.type === "subagent" &&
        errorEvent.status === "error" &&
        /pass75-subagent-summary artifact evidence/.test(doneEvent.detail || "") &&
        /pass75-subagent-failure artifact evidence/.test(errorEvent.detail || "");
    })());

    console.log("PASS75_SUBAGENT_TIMELINE_DONE");
    cleanup();
    app.exit(0);
  } catch (error) {
    console.error(error);
    cleanup();
    app.exit(1);
  }
});

setTimeout(() => {
  console.error("PASS75_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
