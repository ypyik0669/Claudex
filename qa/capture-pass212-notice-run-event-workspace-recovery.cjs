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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass212-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass212-bin-"));
const ACTIVE_PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass212-active-"));
const EVIDENCE_PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass212-evidence-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const EVENT_ID = "pass212-persisted-file-event";
const NOTICE_ID = "pass212-persisted-notice";
const FILE_RELATIVE = "evidence/PASS212.md";
const ACTIVE_CONTENT = "PASS212 active project duplicate should not be opened.";
const EVIDENCE_CONTENT = "PASS212 persisted notice evidence opened the target project file.";

function encodeActionPart(value) {
  return encodeURIComponent(String(value || ""));
}

function workspaceFileAction(pathValue, projectPath, projectLabel) {
  return [
    `workspace:file:${encodeActionPart(pathValue)}`,
    `project=${encodeActionPart(projectPath)}`,
    `label=${encodeActionPart(projectLabel)}`,
  ].join("|");
}

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, ACTIVE_PROJECT_DIR, EVIDENCE_PROJECT_DIR]) {
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
  fs.writeFileSync(
    FAKE_CLAUDE,
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass212& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins: none& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces: none& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo pass212-mcp: connected & exit /b 0)",
      "echo pass212 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function writeProjectFiles() {
  fs.mkdirSync(path.join(ACTIVE_PROJECT_DIR, "evidence"), { recursive: true });
  fs.mkdirSync(path.join(EVIDENCE_PROJECT_DIR, "evidence"), { recursive: true });
  fs.writeFileSync(path.join(ACTIVE_PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass212-active" }), "utf8");
  fs.writeFileSync(path.join(EVIDENCE_PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass212-evidence" }), "utf8");
  fs.writeFileSync(path.join(ACTIVE_PROJECT_DIR, FILE_RELATIVE), ACTIVE_CONTENT, "utf8");
  fs.writeFileSync(path.join(EVIDENCE_PROJECT_DIR, FILE_RELATIVE), EVIDENCE_CONTENT, "utf8");
}

function writeInitialStore() {
  writeFakeClaude();
  writeProjectFiles();
  const activeProject = { name: "pass212-active", path: ACTIVE_PROJECT_DIR };
  const evidenceProject = { name: "pass212-evidence", path: EVIDENCE_PROJECT_DIR };
  const action = workspaceFileAction(FILE_RELATIVE, EVIDENCE_PROJECT_DIR, evidenceProject.name);
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
    activeProject,
    projects: [activeProject, evidenceProject],
    sessions: [
      {
        id: "pass212-session",
        title: "PASS212 persisted notice recovery",
        project: activeProject.name,
        projectPath: ACTIVE_PROJECT_DIR,
        createdAt: "2026-07-08T02:12:00.000Z",
        updatedAt: "2026-07-08T02:12:00.000Z",
        messages: [],
      },
    ],
    runEvents: [
      {
        id: EVENT_ID,
        type: "file-save",
        status: "error",
        title: "PASS212 persisted workspace evidence",
        detail: "Persisted notice should reopen timeline evidence and target workspace file.",
        commandLine: "",
        cwd: EVIDENCE_PROJECT_DIR,
        path: FILE_RELATIVE,
        action,
        stdout: `Target file: ${FILE_RELATIVE}\n${EVIDENCE_CONTENT}`,
        stderr: "PASS212 persisted notice stderr marker",
        project: evidenceProject,
        sessionId: "pass212-session",
        createdAt: "2026-07-08T02:12:01.000Z",
      },
    ],
    notices: [
      {
        id: NOTICE_ID,
        key: "pass212:persisted-notice",
        level: "error",
        source: "file-save",
        title: "PASS212 persisted notice",
        detail: "Open persisted runEvent evidence, then open the target file.",
        action,
        runEventId: EVENT_ID,
        sessionId: "pass212-session",
        project: activeProject,
        createdAt: "2026-07-08T02:12:02.000Z",
      },
    ],
    commandRuns: [],
    automations: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
  });
}

async function openPaletteWithQuery(win, query) {
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
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS212_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS212_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS212_PERSISTED_STATE_READY", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const event = (state.runEvents || []).find((item) => item.id === ${JSON.stringify(EVENT_ID)});
      const notice = (state.notices || []).find((item) => item.id === ${JSON.stringify(NOTICE_ID)});
      return Boolean(event && notice &&
        event.action && event.action.startsWith('workspace:file:') &&
        event.path === ${JSON.stringify(FILE_RELATIVE)} &&
        notice.runEventId === ${JSON.stringify(EVENT_ID)});
    })();
  `, 10000));

  assertStep("PASS212_OPEN_PALETTE_NOTICE", await openPaletteWithQuery(win, "pass212 persisted notice target file"));
  assertStep("PASS212_NOTICE_COMMAND_TARGET_TIMELINE", await waitFor(win, `
    (function() {
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === 'notice:' + ${JSON.stringify(NOTICE_ID)});
      const text = button?.textContent || '';
      return Boolean(button &&
        button.getAttribute('data-command-target') === 'timeline' &&
        /PASS212 persisted notice/.test(text) &&
        /\u67e5\u770b\u8bc1\u636e/.test(text));
    })();
  `, 8000));
  assertStep("PASS212_CLICK_NOTICE_COMMAND", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === 'notice:' + ${JSON.stringify(NOTICE_ID)});
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS212_NOTICE_OPENS_PERSISTED_EVIDENCE", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.selected-run-evidence-panel.error');
      const text = panel?.textContent || '';
      return Boolean(panel &&
        panel.querySelector('[data-run-event-type="file-save"]') &&
        /PASS212 persisted workspace evidence/.test(text) &&
        /PASS212 persisted notice stderr marker/.test(text) &&
        document.querySelector('.selected-run-evidence-panel.error [data-run-recovery-action="open-workspace-file"]'));
    })();
  `, 12000));
  assertStep("PASS212_NOTICE_WORKSPACE_ACTION_FOCUSED", await waitFor(win, `
    (function() {
      const action = document.querySelector('.selected-run-evidence-panel.error [data-run-recovery-action="open-workspace-file"]');
      return Boolean(action &&
        action.getAttribute('data-run-recovery-action-focused') === 'true' &&
        document.activeElement === action);
    })();
  `, 8000));
  assertStep("PASS212_CLICK_OPEN_WORKSPACE", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.selected-run-evidence-panel.error [data-run-recovery-action="open-workspace-file"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS212_OPENED_EVIDENCE_PROJECT_FILE", await waitFor(win, `
    (async function() {
      const activeTool = document.querySelector('.tool-row.active')?.textContent || '';
      const editor = document.querySelector('.file-editor');
      const textarea = editor?.querySelector('textarea');
      const head = editor?.querySelector('.editor-head')?.textContent || '';
      const state = await window.claudexDesktop.getState();
      return /Workspace|\u5de5\u4f5c\u533a/.test(activeTool) &&
        /PASS212\.md/.test(head) &&
        /claudex-pass212-evidence/.test(head) &&
        textarea?.value.includes(${JSON.stringify(EVIDENCE_CONTENT)}) &&
        !textarea?.value.includes(${JSON.stringify(ACTIVE_CONTENT)}) &&
        state.sourceRefs?.some((ref) =>
          ref.path === ${JSON.stringify(FILE_RELATIVE)} &&
          /claudex-pass212-evidence/.test(ref.project?.path || '')
        );
    })();
  `, 12000));

  console.log("PASS212_NOTICE_RUN_EVENT_WORKSPACE_RECOVERY_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS212_FAILED", error?.stack || error);
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
              text: button.textContent,
            })),
            workspace: document.querySelector('.file-editor')?.textContent || '',
            body: document.body?.textContent?.slice(0, 6000) || '',
            state: await window.claudexDesktop.getState().catch((stateError) => ({ error: String(stateError?.message || stateError) })),
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS212_DEBUG", JSON.stringify(debug, null, 2).slice(0, 12000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS212_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
