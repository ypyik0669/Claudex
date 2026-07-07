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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass211-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass211-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass211-project-"));
const SKILL_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass211-skills-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const SKILL_ID = "pass211-skill-workspace-link";
const SKILL_RELATIVE = path.join(SKILL_ID, "SKILL.md");
const SKILL_RELATIVE_SLASH = SKILL_RELATIVE.replace(/\\/g, "/");
const SKILL_FILE = path.join(SKILL_ROOT, SKILL_RELATIVE);
const SKILL_BODY = "This PASS211 body proves timeline evidence opens the real SKILL.md file.";

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_DIR, SKILL_ROOT]) {
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
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(SKILL_FILE), { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass211-project" }), "utf8");
  fs.writeFileSync(
    SKILL_FILE,
    [
      "---",
      `name: ${SKILL_ID}`,
      "description: PASS211 unique timeline workspace evidence",
      "---",
      "",
      "# PASS211 Skill",
      "",
      SKILL_BODY,
      "",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    FAKE_CLAUDE,
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass211& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins: none& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces: none& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo pass211-mcp: connected & exit /b 0)",
      "echo pass211 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
  process.env.CLAUDEX_SKILL_ROOTS = SKILL_ROOT;

  const project = { name: "pass211-project", path: PROJECT_DIR };
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
    activeProject: project,
    projects: [project],
    sessions: [
      {
        id: "pass211-session",
        title: "PASS211 skill evidence workspace",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-08T02:11:00.000Z",
        updatedAt: "2026-07-08T02:11:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    runEvents: [],
    notices: [],
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

async function clickCommand(win, query, expectedId) {
  await openPaletteWithQuery(win, query);
  return win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === ${JSON.stringify(expectedId)});
      if (!button || button.getAttribute('data-command-target') !== 'timeline') return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS211_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  const pinId = `capability-skill-pin:${encodeURIComponent(SKILL_ID)}`;

  assertStep("PASS211_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS211_CLICK_SKILL_PIN", await clickCommand(win, "pin evidence pass211 timeline workspace", pinId));
  assertStep("PASS211_SKILL_EVENT_PERSISTS_WORKSPACE_ACTION", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const event = (state.runEvents || []).find((item) =>
        item.type === 'skill-registry' &&
        /pass211-skill-workspace-link/.test(item.title || '') &&
        /PASS211 unique timeline workspace evidence/.test(item.stdout || '')
      );
      window.__PASS211_EVENT_ID__ = event?.id || '';
      return Boolean(event &&
        event.action && event.action.startsWith('workspace:file:') &&
        /pass211-skill-workspace-link/.test(decodeURIComponent(event.action)) &&
        /SKILL\.md/.test(decodeURIComponent(event.action)) &&
        event.path === ${JSON.stringify(SKILL_RELATIVE_SLASH)});
    })();
  `, 10000));
  assertStep("PASS211_OPEN_WORKSPACE_ACTION_VISIBLE", await waitFor(win, `
    Boolean(document.querySelector('.selected-run-evidence-panel.ok [data-run-recovery-action="open-workspace-file"]'))
  `, 8000));
  assertStep("PASS211_CLICK_OPEN_WORKSPACE", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.selected-run-evidence-panel.ok [data-run-recovery-action="open-workspace-file"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS211_SKILL_FILE_OPENED_IN_WORKSPACE", await waitFor(win, `
    (async function() {
      const activeTool = document.querySelector('.tool-row.active')?.textContent || '';
      const editor = document.querySelector('.file-editor');
      const textarea = editor?.querySelector('textarea');
      const head = editor?.querySelector('.editor-head')?.textContent || '';
      const state = await window.claudexDesktop.getState();
      return /Workspace|\u5de5\u4f5c\u533a/.test(activeTool) &&
        /SKILL\.md/.test(head) &&
        /pass211-skill-workspace-link[\\/]SKILL\.md/.test(head) &&
        /claudex-pass211-skills/.test(head) &&
        textarea?.value.includes(${JSON.stringify(SKILL_BODY)}) &&
        state.sourceRefs?.some((ref) =>
          ref.path === ${JSON.stringify(SKILL_RELATIVE_SLASH)} &&
          /claudex-pass211-skills/.test(ref.project?.path || '')
        );
    })();
  `, 12000));

  console.log("PASS211_SKILL_EVIDENCE_WORKSPACE_ACTION_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS211_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (async function() {
          return {
            eventId: window.__PASS211_EVENT_ID__ || '',
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
      console.error("PASS211_DEBUG", JSON.stringify(debug, null, 2).slice(0, 12000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS211_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
