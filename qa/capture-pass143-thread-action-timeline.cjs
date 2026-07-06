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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass143-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass143-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");

function cleanup() {
  for (const dir of [USER_DATA_DIR, PROJECT_DIR]) {
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

function writeInitialStore() {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass143-project" }), "utf8");
  const project = { name: "pass143-project", path: PROJECT_DIR };
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
      claudeCode: { executionMode: "claude-code", claudeCommand: "claude", permissionMode: "default" },
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
        id: "pass143-thread",
        title: "Pass143 original thread action",
        project: project.name,
        projectPath: PROJECT_DIR,
        claudeSessionId: "pass143-claude-session",
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
        messages: [
          { role: "user", content: "pass143 thread action prompt", createdAt: "2026-07-07T00:00:00.000Z" },
          { role: "assistant", content: "pass143 thread action answer", createdAt: "2026-07-07T00:00:01.000Z" },
        ],
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

async function clickRunCommand(win, titlePattern) {
  return win.webContents.executeJavaScript(`
    (function() {
      const pattern = new RegExp(${JSON.stringify(titlePattern)});
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) =>
          (candidate.getAttribute('data-command-id') || '').startsWith('run:') &&
          pattern.test(candidate.textContent || '')
        );
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS143_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS143_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS143_INITIAL_THREAD_VISIBLE", await waitFor(win, `
    Boolean(document.querySelector('.thread-item[data-thread-id="pass143-thread"]') &&
      !document.querySelector('.run-timeline-row'))
  `, 10000));

  assertStep("PASS143_RENAME_THREAD_FROM_UI", await win.webContents.executeJavaScript(`
    (function() {
      window.prompt = () => 'Pass143 renamed thread action';
      document.querySelector('.thread-item[data-thread-id="pass143-thread"] [data-thread-action="rename"]')?.click();
      return true;
    })()
  `));
  assertStep("PASS143_RENAME_ACTION_EVENT_PERSISTED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const event = state.runEvents?.find((item) =>
        item.type === 'thread-action' &&
        item.sessionId === 'pass143-thread' &&
        /\\u91cd\\u547d\\u540d/.test(item.title || '') &&
        /Pass143 renamed thread action/.test((item.title || '') + (item.detail || '') + (item.stdout || ''))
      );
      return Boolean(event &&
        /action=rename/.test(event.stdout || '') &&
        /messageCount=2/.test(event.stdout || '') &&
        /pass143-project/.test((event.project?.name || '') + (event.detail || '')));
    })()
  `, 10000));

  assertStep("PASS143_OPEN_PALETTE_QUERY_RENAME_ACTION", await openPaletteAndQuery(win, "thread action Pass143 renamed"));
  assertStep("PASS143_RENAME_RUN_COMMAND_VISIBLE", await waitFor(win, `
    Boolean([...document.querySelectorAll('.command-modal .command-list button')].some((button) =>
      (button.getAttribute('data-command-id') || '').startsWith('run:') &&
      /Pass143 renamed thread action/.test(button.textContent || '') &&
      /\\u804a\\u5929\\uff1a\\u91cd\\u547d\\u540d/.test(button.textContent || '')
    ))
  `, 5000));
  assertStep("PASS143_CLICK_RENAME_RUN_COMMAND", await clickRunCommand(win, "Pass143 renamed thread action"));
  assertStep("PASS143_RENAME_TIMELINE_FOCUSED_WITH_FRIENDLY_TYPE", await waitFor(win, `
    (function() {
      const active = document.querySelector('.workspace-context-button.active')?.textContent || '';
      const row = document.querySelector('.run-timeline-row.selected');
      const panel = document.querySelector('.selected-run-evidence-panel');
      const rowType = row?.querySelector('.run-timeline-type-pill[data-run-event-type="thread-action"]');
      const panelType = panel?.querySelector('[data-run-event-type="thread-action"]');
      return /\\u8f93\\u51fa/.test(active) &&
        /Pass143 renamed thread action/.test(row?.textContent || '') &&
        /\\u804a\\u5929\\u64cd\\u4f5c/.test(rowType?.textContent || '') &&
        /\\u804a\\u5929\\u64cd\\u4f5c/.test(panelType?.textContent || '') &&
        /thread-action/.test(panelType?.textContent || '') &&
        /action=rename/.test(panel?.textContent || '') &&
        /pass143-thread/.test(panel?.textContent || '');
    })()
  `, 10000));
  assertStep("PASS143_RENAME_COPY_EVIDENCE_HAS_LABEL_AND_RAW", await win.webContents.executeJavaScript(`
    (async function() {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text) => {
            window.__pass143ClipboardText = String(text || '');
          },
        },
      });
      const copyButton = document.querySelector('.selected-run-evidence-panel [data-run-timeline-action="copy-evidence"]');
      if (!copyButton) return false;
      copyButton.click();
      await new Promise((resolve) => setTimeout(resolve, 250));
      const copied = window.__pass143ClipboardText || '';
      return /\\u4e8b\\u4ef6\\u7c7b\\u578b:\\s*\\u804a\\u5929\\u64cd\\u4f5c/.test(copied) &&
        /Raw \\u7c7b\\u578b:\\s*thread-action/.test(copied) &&
        /action=rename/.test(copied) &&
        /sessionId=pass143-thread/.test(copied);
    })()
  `));

  assertStep("PASS143_DELETE_THREAD_FROM_UI", await win.webContents.executeJavaScript(`
    (function() {
      window.confirm = () => true;
      document.querySelector('.thread-item[data-thread-id="pass143-thread"] [data-thread-action="delete"]')?.click();
      return true;
    })()
  `));
  assertStep("PASS143_DELETE_ACTION_EVENT_SURVIVES_SESSION_DELETE", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const deleted = !state.sessions?.some((item) => item.id === 'pass143-thread');
      const event = state.runEvents?.find((item) =>
        item.type === 'thread-action' &&
        item.sessionId === 'pass143-thread' &&
        /\\u5220\\u9664/.test(item.title || '') &&
        /action=delete/.test(item.stdout || '')
      );
      return Boolean(deleted && event &&
        /Pass143 renamed thread action/.test((event.title || '') + (event.stdout || '')) &&
        /\\u5ba1\\u8ba1\\u4e8b\\u4ef6\\u4fdd\\u7559/.test(event.detail || ''));
    })()
  `, 10000));
  assertStep("PASS143_OPEN_PALETTE_QUERY_DELETE_ACTION", await openPaletteAndQuery(win, "delete Pass143 renamed thread action"));
  assertStep("PASS143_DELETE_RUN_COMMAND_VISIBLE", await waitFor(win, `
    Boolean([...document.querySelectorAll('.command-modal .command-list button')].some((button) =>
      (button.getAttribute('data-command-id') || '').startsWith('run:') &&
      /Pass143 renamed thread action/.test(button.textContent || '') &&
      /\\u804a\\u5929\\uff1a\\u5220\\u9664/.test(button.textContent || '')
    ))
  `, 5000));
  assertStep("PASS143_CLICK_DELETE_RUN_COMMAND", await clickRunCommand(win, "删除.*Pass143 renamed thread action"));
  assertStep("PASS143_DELETE_TIMELINE_FOCUSED_AFTER_SESSION_DELETE", await waitFor(win, `
    (function() {
      const row = document.querySelector('.run-timeline-row.selected');
      const panel = document.querySelector('.selected-run-evidence-panel');
      return /\\u5220\\u9664/.test(row?.textContent || '') &&
        /Pass143 renamed thread action/.test(row?.textContent || '') &&
        /thread-action/.test(panel?.textContent || '') &&
        /action=delete/.test(panel?.textContent || '') &&
        /sessionId=pass143-thread/.test(panel?.textContent || '') &&
        /pass143-project/.test(panel?.textContent || '');
    })()
  `, 10000));

  console.log("PASS143_THREAD_ACTION_TIMELINE_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS143_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS143_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
