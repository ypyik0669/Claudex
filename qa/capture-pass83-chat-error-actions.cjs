const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass83-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass83-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass83-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const COMMAND_LOG = path.join(USER_DATA_DIR, "claude-command-log.jsonl");

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

function commandLogEntries() {
  try {
    return fs.readFileSync(COMMAND_LOG, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (_error) {
    return [];
  }
}

const fakeClaudeScript = `
const fs = require('fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(COMMAND_LOG)}, JSON.stringify(args) + '\\n', 'utf8');
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value) + '\\n'); }
if (args[0] === '-p') {
  out({ type: 'result', result: 'pass83 recovered assistant response', session_id: 'pass83-next-session' });
} else if (args[0] === '--version') {
  out('2.9.0 (pass83 fake)');
} else if (args[0] === 'auth') {
  out('Logged in as pass83@example.invalid');
} else if (args[0] === 'plugin' && args[1] === 'list' && args[2] === '--json') {
  out([]);
} else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args[3] === '--json') {
  out([]);
} else {
  out('pass83 ok');
}
`;

fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
const FAKE_CLAUDE_COMMAND = path.join(FAKE_BIN_DIR, "claude.cmd");
process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;

app.setPath("userData", USER_DATA_DIR);
fs.mkdirSync(PROJECT_DIR, { recursive: true });
fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass83-project" }), "utf8");
fs.writeFileSync(
  DATA_FILE,
  JSON.stringify(
    {
      version: 1,
      activeProject: { name: "pass83-project", path: PROJECT_DIR },
      projects: [{ name: "pass83-project", path: PROJECT_DIR }],
      settings: {
        provider: "anthropic",
        model: "claude-haiku-4-5-20251001",
        baseUrl: "https://api.example.invalid",
        temperature: 0.2,
        timeoutMs: 600000,
        language: "zh",
        appearance: { fontSize: "compact", density: "compact" },
        systemPrompt: "QA",
        claudeCode: { executionMode: "claude-code", claudeCommand: FAKE_CLAUDE_COMMAND, permissionMode: "default" },
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
      sessions: [
        {
          id: "pass83-session",
          title: "Pass83 error actions",
          project: "pass83-project",
          projectPath: PROJECT_DIR,
          claudeSessionId: "pass83-previous-session",
          createdAt: "2026-07-06T00:00:00.000Z",
          updatedAt: "2026-07-06T00:02:00.000Z",
          messages: [
            { role: "user", content: "pass83 reproduce failure", createdAt: "2026-07-06T00:00:00.000Z" },
            { role: "error", content: "pass83 simulated CLI failure", createdAt: "2026-07-06T00:01:00.000Z" },
          ],
        },
      ],
      automations: [],
      subagentRuns: [],
      commandRuns: [],
      runEvents: [],
      sourceRefs: [],
      browserVisits: [],
      notices: [],
    },
    null,
    2,
  ),
  "utf8",
);

require(path.join(REPO_DIR, "electron", "main.cjs"));

app.whenReady().then(async () => {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.error("PASS83_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  try {
    assertStep("PASS83_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));

    assertStep("PASS83_ERROR_ACTIONS_VISIBLE", await waitFor(win, `
      Boolean(
        document.querySelector('.message.error') &&
        document.querySelector('[data-error-action="copy"]') &&
        document.querySelector('[data-error-action="retry"]') &&
        document.querySelector('[data-error-action="terminal"]') &&
        document.querySelector('[data-error-action="interactive-claude"]') &&
        document.querySelector('[data-error-action="settings"]')
      )
    `, 8000));

    assertStep("PASS83_PATCH_CLIPBOARD", await win.webContents.executeJavaScript(`
      (function() {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText: async (text) => { window.__pass83Clipboard = String(text || ''); } },
        });
        return true;
      })();
    `));

    assertStep("PASS83_COPY_ERROR_OUTPUT", await win.webContents.executeJavaScript(`
      (async function() {
        document.querySelector('[data-error-action="copy"]')?.click();
        await new Promise((resolve) => setTimeout(resolve, 150));
        return /pass83 simulated CLI failure/.test(window.__pass83Clipboard || '');
      })();
    `));

    assertStep("PASS83_NATIVE_HANDOFF_ACTIONS_PRESENT", await win.webContents.executeJavaScript(`
      (function() {
        const terminal = document.querySelector('[data-error-action="terminal"]');
        const claude = document.querySelector('[data-error-action="interactive-claude"]');
        return Boolean(
          terminal &&
          claude &&
          /\\u6253\\u5f00\\u7ec8\\u7aef|terminal/i.test(terminal.textContent || '') &&
          /Claude/i.test(claude.textContent || '')
        );
      })();
    `));

    assertStep("PASS83_RETRY_ACTION", await waitFor(win, `
      (async function() {
        if (!window.__pass83RetryClicked) {
          window.__pass83RetryClicked = true;
          document.querySelector('[data-error-action="retry"]')?.click();
        }
        await new Promise((resolve) => setTimeout(resolve, 700));
        const state = await window.claudexDesktop.getState();
        const session = state.sessions?.find((item) => item.id === 'pass83-session');
        return Boolean(
          session?.claudeSessionId === 'pass83-next-session' &&
          session.messages?.some((message) => message.role === 'assistant' && /pass83 recovered assistant response/.test(message.content || '')) &&
          session.messages?.filter((message) => message.role === 'user' && /pass83 reproduce failure/.test(message.content || '')).length >= 2
        );
      })();
    `, 12000));

    assertStep("PASS83_RETRY_USED_RESUME", (() => {
      const chatArgs = commandLogEntries().find((args) => args[0] === "-p" && /pass83 reproduce failure/.test(args[1] || ""));
      const resumeIndex = Array.isArray(chatArgs) ? chatArgs.indexOf("--resume") : -1;
      return Boolean(chatArgs &&
        chatArgs.includes("claude-haiku-4-5-20251001") &&
        resumeIndex >= 0 &&
        chatArgs[resumeIndex + 1] === "pass83-previous-session");
    })());

    assertStep("PASS83_SETTINGS_ACTION", await win.webContents.executeJavaScript(`
      (function() {
        document.querySelector('[data-error-action="settings"]')?.click();
        return true;
      })();
    `));
    assertStep("PASS83_SETTINGS_VISIBLE", await waitFor(win, "Boolean(document.querySelector('.settings-workspace'))", 8000));

    console.log("PASS83_CHAT_ERROR_ACTIONS_DONE");
    cleanup();
    app.exit(0);
  } catch (error) {
    console.error("PASS83_CHAT_ERROR_ACTIONS_FAILED", error?.stack || error);
    cleanup();
    app.exit(1);
  }
});

setTimeout(() => {
  console.error("PASS83_CHAT_ERROR_ACTIONS_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
