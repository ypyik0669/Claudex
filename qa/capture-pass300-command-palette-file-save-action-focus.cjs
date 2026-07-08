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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass300-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass300-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FILE_NAME = "pass300-command-palette-save.txt";
const ORIGINAL_CONTENT = "pass300 original\n";
const EDITED_CONTENT = "pass300 original\npass300 command palette file-save focused workspace action\n";

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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass300-project" }), "utf8");
  fs.writeFileSync(path.join(PROJECT_DIR, FILE_NAME), ORIGINAL_CONTENT, "utf8");
  const project = { name: "pass300-project", path: PROJECT_DIR };
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
        id: "pass300-session",
        title: "Pass300 command palette file save action focus",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-08T00:00:00.000Z",
        updatedAt: "2026-07-08T00:00:00.000Z",
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

async function openWorkspace(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = Array.from(document.querySelectorAll("button.tool-row"))
        .find((item) => /Workspace|\\u5de5\\u4f5c\\u533a/i.test(item.textContent || ""));
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
      await new Promise((resolve) => setTimeout(resolve, 240));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 320));
      return true;
    })();
  `);
}

async function clickFileSaveRunCommand(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) =>
          (candidate.getAttribute('data-command-id') || '').startsWith('run:') &&
          /${FILE_NAME}/.test(candidate.textContent || '')
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
  if (!win) throw new Error("PASS300_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS300_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS300_OPEN_WORKSPACE", await openWorkspace(win));
  assertStep("PASS300_FILE_VISIBLE", await waitFor(win, `
    Array.from(document.querySelectorAll(".file-tree .tree-item")).some((item) => item.textContent.includes(${JSON.stringify(FILE_NAME)}))
  `, 15000));
  assertStep("PASS300_OPEN_FILE", await win.webContents.executeJavaScript(`
    (function() {
      const item = Array.from(document.querySelectorAll(".file-tree .tree-item")).find((row) => row.textContent.includes(${JSON.stringify(FILE_NAME)}));
      if (!item) return false;
      item.click();
      return true;
    })();
  `));
  assertStep("PASS300_FILE_OPENED", await waitFor(win, `
    document.querySelector(".file-editor textarea")?.value === ${JSON.stringify(ORIGINAL_CONTENT)}
  `, 8000));
  assertStep("PASS300_EDIT_FILE", await win.webContents.executeJavaScript(`
    (function() {
      const textarea = document.querySelector(".file-editor textarea");
      if (!textarea) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
      setter.call(textarea, ${JSON.stringify(EDITED_CONTENT)});
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })();
  `));
  assertStep("PASS300_REVIEW_FILE", await waitFor(win, `
    (function() {
      const button = Array.from(document.querySelectorAll(".editor-change-bar button"))
        .find((item) => /^(Review|\\u5ba1\\u67e5)$/i.test((item.textContent || "").trim()));
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `, 8000));
  assertStep("PASS300_SAVE_FILE", await waitFor(win, `
    (function() {
      const button = Array.from(document.querySelectorAll(".editor-change-bar button"))
        .find((item) => /^(Save|\\u4fdd\\u5b58)$/i.test((item.textContent || "").trim()) && !item.disabled);
      if (!button) return false;
      button.click();
      return true;
    })();
  `, 8000));
  assertStep("PASS300_SAVED_TO_DISK", await waitFor(win, `
    /Changes saved|\\u6539\\u52a8\\u5df2\\u4fdd\\u5b58/i.test(document.querySelector(".editor-change-bar")?.textContent || "")
  `, 10000));
  assertStep("PASS300_DISK_CONTENT_UPDATED", fs.readFileSync(path.join(PROJECT_DIR, FILE_NAME), "utf8") === EDITED_CONTENT);
  assertStep("PASS300_FILE_SAVE_EVENT_PERSISTED_WITH_WORKSPACE_ACTION", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const event = (state.runEvents || []).find((item) => item.type === 'file-save' && item.status === 'ok' && item.path === ${JSON.stringify(FILE_NAME)});
      return Boolean(event && event.action && event.action.startsWith('workspace:file:') && event.cwd === ${JSON.stringify(PROJECT_DIR)});
    })();
  `, 10000));

  assertStep("PASS300_OPEN_PALETTE_FILE_SAVE_RUN", await openPaletteAndQuery(win, FILE_NAME));
  assertStep("PASS300_FILE_SAVE_RUN_COMMAND_VISIBLE", await waitFor(win, `
    Boolean([...document.querySelectorAll('.command-modal .command-list button')].some((button) =>
      (button.getAttribute('data-command-id') || '').startsWith('run:') &&
      /${FILE_NAME}/.test(button.textContent || '')
    ))
  `, 8000));
  assertStep("PASS300_CLICK_FILE_SAVE_RUN_COMMAND", await clickFileSaveRunCommand(win));
  assertStep("PASS300_FILE_SAVE_RECOVERY_ACTION_FOCUSED", await waitFor(win, `
    (function() {
      const active = document.querySelector('.workspace-context-button.active')?.textContent || '';
      const panel = document.querySelector('.selected-run-evidence-panel');
      const action = panel?.querySelector('[data-run-recovery-action="open-workspace-file"]');
      const text = panel?.textContent || '';
      return /\\u8f93\\u51fa|Outputs/i.test(active) &&
        Boolean(panel && action) &&
        panel.querySelector('[data-run-event-type="file-save"]') &&
        /${FILE_NAME}/.test(text) &&
        action.getAttribute('data-run-recovery-action-focused') === 'true' &&
        document.activeElement === action;
    })();
  `, 12000));
  assertStep("PASS300_CLICK_FOCUSED_OPEN_WORKSPACE", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.selected-run-evidence-panel [data-run-recovery-action="open-workspace-file"][data-run-recovery-action-focused="true"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS300_COMMAND_RUN_ACTION_OPENED_WORKSPACE_FILE", await waitFor(win, `
    (function() {
      const activeTool = document.querySelector('.tool-row.active')?.textContent || '';
      const textarea = document.querySelector('.workspace-detail textarea[aria-label=${JSON.stringify(FILE_NAME)}]');
      return /Workspace|\\u5de5\\u4f5c\\u533a/.test(activeTool) &&
        Boolean(textarea) &&
        textarea.value.includes('pass300 command palette file-save focused workspace action');
    })();
  `, 12000));

  console.log("PASS300_COMMAND_PALETTE_FILE_SAVE_ACTION_FOCUS_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS300_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (async function() {
          return {
            commands: [...document.querySelectorAll('.command-modal .command-list button')].map((button) => ({
              id: button.getAttribute('data-command-id'),
              target: button.getAttribute('data-command-target'),
              text: button.textContent,
            })),
            panel: document.querySelector('.selected-run-evidence-panel')?.textContent || '',
            actions: [...document.querySelectorAll('[data-run-recovery-action]')].map((button) => ({
              action: button.getAttribute('data-run-recovery-action'),
              focused: button.getAttribute('data-run-recovery-action-focused'),
              active: document.activeElement === button,
              text: button.textContent,
            })),
            workspace: document.querySelector('.file-editor')?.textContent || '',
            state: await window.claudexDesktop.getState().catch((stateError) => ({ error: String(stateError?.message || stateError) })),
            body: document.body?.textContent?.slice(0, 6000) || '',
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS300_DEBUG", JSON.stringify(debug, null, 2).slice(0, 12000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS300_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
