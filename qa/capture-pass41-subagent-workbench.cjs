const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass41-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass41-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass41-project-"));
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
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value) + '\\n'); }
if (args[0] === '-p') {
  out({ result: 'pass41-subagent-ok: ' + args[1], session_id: 'pass41-claude-session' });
} else if (args[0] === '--version') {
  out('2.9.0 (pass41 fake)');
} else {
  out({ result: 'pass41 generic ok', session_id: 'pass41-claude-session' });
}
`;

fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
const FAKE_CLAUDE_COMMAND = path.join(FAKE_BIN_DIR, "claude.cmd");
process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;

app.setPath("userData", USER_DATA_DIR);
fs.mkdirSync(PROJECT_DIR, { recursive: true });
fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass41-project" }), "utf8");

writeJson(DATA_FILE, {
  version: 1,
  settings: {
    provider: "anthropic",
    model: "claude-sonnet-4-5-20250929",
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
  activeProject: { name: "pass41-project", path: PROJECT_DIR },
  projects: [{ name: "pass41-project", path: PROJECT_DIR }],
  sessions: [
    {
      id: "default",
      title: "新聊天",
      project: "pass41-project",
      projectPath: PROJECT_DIR,
      createdAt: "2026-07-05T00:00:00.000Z",
      updatedAt: "2026-07-05T00:00:00.000Z",
      messages: [],
    },
  ],
  automations: [],
  subagentRuns: [],
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
      const button = Array.from(document.querySelectorAll('.workspace-context-button, .bottom-panel-tabs button'))
        .find((item) => item.getAttribute('aria-label') === '子代理' || /子代理/.test(item.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

app.whenReady().then(async () => {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.error("PASS41_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  try {
    assertStep("PASS41_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
    assertStep("PASS41_SUBAGENT_IPC", await win.webContents.executeJavaScript(`
      typeof window.claudexDesktop.runSubagent === 'function' &&
      typeof window.claudexDesktop.cancelSubagent === 'function' &&
      typeof window.claudexDesktop.onSubagentStream === 'function'
    `));

    assertStep("PASS41_OPEN_SUBAGENTS", await openSubagents(win));
    assertStep("PASS41_WORKBENCH_READY", await waitFor(win, `
      Boolean(document.querySelector('.subagent-workbench') && /Claude Code CLI/.test(document.body.textContent || ''))
    `, 10000));

    assertStep("PASS41_RUN_SUBAGENT", await waitFor(win, `
      (async function() {
        if (!window.__pass41RunClicked) {
          window.__pass41RunClicked = true;
          const textarea = document.querySelector('.subagent-form textarea');
          const nickname = document.querySelector('.subagent-form input');
          const submit = document.querySelector('.subagent-form .primary-action');
          if (!textarea || !nickname || !submit) return false;
          Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(textarea, 'pass41 inspect subagent evidence');
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(nickname, 'QA Subagent');
          nickname.dispatchEvent(new Event('input', { bubbles: true }));
          submit.click();
        }
        await new Promise((resolve) => setTimeout(resolve, 900));
        const state = await window.claudexDesktop.getState();
        const run = state.subagentRuns?.[0];
        return Boolean(
          run &&
          run.status === 'done' &&
          run.nickname === 'QA Subagent' &&
          /pass41 inspect subagent evidence/.test(run.task || '') &&
          /pass41-subagent-ok/.test(run.summary || '') &&
          run.artifacts?.some((artifact) => artifact.type === 'summary' && /pass41-subagent-ok/.test(artifact.content || '')) &&
          /pass41-subagent-ok/.test(document.body.textContent || '') &&
          document.querySelector('.subagent-run-card.done') &&
          document.querySelector('.subagent-evidence-stack') &&
          document.querySelector('.subagent-evidence-details') &&
          /产物: 2/.test(document.body.textContent || '')
        );
      })();
    `, 12000));

    assertStep("PASS41_STORE_PERSISTED", (() => {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      return parsed.subagentRuns?.length === 1 &&
        parsed.subagentRuns[0].status === "done" &&
        /pass41-subagent-ok/.test(parsed.subagentRuns[0].summary || "") &&
        parsed.subagentRuns[0].artifacts?.length >= 2;
    })());

    assertStep("PASS41_COPY_SUBAGENT_EVIDENCE", await win.webContents.executeJavaScript(`
      (async function() {
        const copy = Array.from(document.querySelectorAll('.subagent-run-foot button'))
          .find((button) => /复制证据/.test(button.textContent || ''));
        if (!copy) return false;
        copy.click();
        await new Promise((resolve) => setTimeout(resolve, 250));
        return /已复制/.test(document.body.textContent || '');
      })();
    `));

    assertStep("PASS41_OPEN_TIMELINE_FROM_SUBAGENT", await waitFor(win, `
      (async function() {
        const open = Array.from(document.querySelectorAll('.subagent-run-foot button'))
          .find((button) => /timeline/.test(button.textContent || ''));
        if (!open) return false;
        open.click();
        await new Promise((resolve) => setTimeout(resolve, 250));
        return Boolean(document.querySelector('.run-timeline-row.ok') && /pass41-subagent-ok/.test(document.body.textContent || ''));
      })();
    `, 5000));

    assertStep("PASS41_REOPEN_SUBAGENTS_FOR_RETRY", await openSubagents(win));
    assertStep("PASS41_RETRY_SUBAGENT", await waitFor(win, `
      (async function() {
        if (!window.__pass41RetryClicked) {
          window.__pass41RetryClicked = true;
          const retry = Array.from(document.querySelectorAll('.subagent-run-foot button'))
            .find((button) => /重试子代理/.test(button.textContent || ''));
          if (!retry) return false;
          retry.click();
        }
        await new Promise((resolve) => setTimeout(resolve, 900));
        const state = await window.claudexDesktop.getState();
        return Boolean(
          state.subagentRuns?.length >= 2 &&
          state.subagentRuns[0].status === 'done' &&
          /pass41 inspect subagent evidence/.test(state.subagentRuns[0].task || '') &&
          /pass41-subagent-ok/.test(state.subagentRuns[0].summary || '') &&
          document.querySelectorAll('.subagent-run-card.done').length >= 2
        );
      })();
    `, 12000));

    assertStep("PASS41_TIMELINE_EVIDENCE", await waitFor(win, `
      (async function() {
        const outputs = Array.from(document.querySelectorAll('.bottom-panel-tabs button'))
          .find((item) => /输出/.test(item.textContent || ''));
        if (!outputs) return false;
        outputs.click();
        await new Promise((resolve) => setTimeout(resolve, 250));
        return Boolean(document.querySelector('.run-timeline-row.ok') && /pass41-subagent-ok/.test(document.body.textContent || ''));
      })();
    `, 5000));

    win.webContents.reload();
    await wait(1200);
    assertStep("PASS41_RELOAD_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
    assertStep("PASS41_REOPEN_SUBAGENTS", await openSubagents(win));
    assertStep("PASS41_RELOAD_PERSISTED_UI", await waitFor(win, `
      Boolean(
        document.querySelectorAll('.subagent-run-card.done').length >= 2 &&
        document.querySelector('.subagent-evidence-stack') &&
        /pass41-subagent-ok/.test(document.body.textContent || '') &&
        /产物:/.test(document.body.textContent || '')
      )
    `, 10000));

    console.log("PASS41_SUBAGENT_WORKBENCH_DONE");
    cleanup();
    app.exit(0);
  } catch (error) {
    console.error(error);
    cleanup();
    app.exit(1);
  }
});
