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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass149-data-"));
const ACTIVE_PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass149-active-"));
const TARGET_PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass149-target-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass149-bin-"));
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FILE_NAME = "pass149-shared.txt";
const ACTIVE_CONTENT = "pass149 active project wrong file\n";
const TARGET_CONTENT = "pass149 target project correct workspace action\n";
const NOTICE_ID = "pass149-cross-project-workspace-action";

function cleanup() {
  for (const dir of [USER_DATA_DIR, ACTIVE_PROJECT_DIR, TARGET_PROJECT_DIR, FAKE_BIN_DIR]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_error) {
      // best-effort cleanup
    }
  }
}

function writeFakeClaude() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(
    FAKE_CLAUDE,
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass149& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins: none& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces: none& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass149 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function writeInitialStore() {
  writeFakeClaude();
  fs.mkdirSync(ACTIVE_PROJECT_DIR, { recursive: true });
  fs.mkdirSync(TARGET_PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(ACTIVE_PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass149-active-project" }), "utf8");
  fs.writeFileSync(path.join(TARGET_PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass149-target-project" }), "utf8");
  fs.writeFileSync(path.join(ACTIVE_PROJECT_DIR, FILE_NAME), ACTIVE_CONTENT, "utf8");
  fs.writeFileSync(path.join(TARGET_PROJECT_DIR, FILE_NAME), TARGET_CONTENT, "utf8");
  const activeProject = { name: "pass149-active-project", path: ACTIVE_PROJECT_DIR };
  const targetProject = { name: "pass149-target-project", path: TARGET_PROJECT_DIR };
  writeJson(DATA_FILE, {
    version: 1,
    activeProject,
    projects: [activeProject, targetProject],
    sessions: [
      {
        id: "pass149-session",
        title: "Pass149 workspace action project path",
        project: activeProject.name,
        projectPath: ACTIVE_PROJECT_DIR,
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
        messages: [],
      },
    ],
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
    commandRuns: [],
    runEvents: [],
    notices: [
      {
        id: NOTICE_ID,
        key: "pass149:workspace-action",
        level: "error",
        source: "workspace-file",
        title: "Pass149 cross project workspace action",
        detail: "Open the target project file, not the active project file.",
        action: `workspace:file:${encodeURIComponent(FILE_NAME)}|project=${encodeURIComponent(TARGET_PROJECT_DIR)}|label=${encodeURIComponent(targetProject.name)}`,
        project: targetProject,
        sessionId: "pass149-session",
        count: 1,
        createdAt: "2026-07-07T00:00:01.000Z",
        lastSeenAt: "2026-07-07T00:00:01.000Z",
      },
    ],
    automations: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
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

async function openPanel(win, labelPattern) {
  return win.webContents.executeJavaScript(`
    (function() {
      const pattern = new RegExp(${JSON.stringify(labelPattern)});
      const button = [...document.querySelectorAll('.workspace-context-button, .bottom-panel-tabs button')]
        .find((candidate) => pattern.test(candidate.textContent || '') || pattern.test(candidate.getAttribute('aria-label') || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS149_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS149_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS149_NOTICE_STATE_READY", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      return Boolean(
        state.activeProject?.path === ${JSON.stringify(ACTIVE_PROJECT_DIR)} &&
        state.notices?.some((notice) =>
          notice.id === ${JSON.stringify(NOTICE_ID)} &&
          /workspace:file:/.test(notice.action || '') &&
          /project=/.test(notice.action || '')
        )
      );
    })();
  `, 10000));
  assertStep("PASS149_OPEN_NOTICES", await openPanel(win, "\\u901a\\u77e5|Notice"));
  assertStep("PASS149_NOTICE_ACTION_VISIBLE", await waitFor(win, `
    Boolean([...document.querySelectorAll('.notice-card')].some((card) =>
      /Pass149 cross project workspace action/.test(card.textContent || '') &&
      card.querySelector('[data-notice-action="open"]')
    ))
  `, 5000));
  assertStep("PASS149_CLICK_NOTICE_ACTION", await win.webContents.executeJavaScript(`
    (function() {
      const card = [...document.querySelectorAll('.notice-card')]
        .find((item) => /Pass149 cross project workspace action/.test(item.textContent || ''));
      const button = card?.querySelector('[data-notice-action="open"]');
      if (!button) return false;
      button.click();
      return true;
    })()
  `));
  assertStep("PASS149_NOTICE_OPENED_TARGET_PROJECT_FILE", await waitFor(win, `
    (async function() {
      const activeTool = document.querySelector('.tool-row.active')?.textContent || '';
      const textarea = document.querySelector('.workspace-detail textarea[aria-label=${JSON.stringify(FILE_NAME)}]');
      const editor = document.querySelector('.file-editor')?.textContent || '';
      const state = await window.claudexDesktop.getState();
      return /Workspace|\\u5de5\\u4f5c\\u533a/.test(activeTool) &&
        Boolean(textarea) &&
        textarea.value.includes(${JSON.stringify(TARGET_CONTENT.trim())}) &&
        !textarea.value.includes(${JSON.stringify(ACTIVE_CONTENT.trim())}) &&
        editor.includes(${JSON.stringify(FILE_NAME)}) &&
        state.sourceRefs?.some((source) =>
          source.path === ${JSON.stringify(FILE_NAME)} &&
          source.project?.path === ${JSON.stringify(TARGET_PROJECT_DIR)}
        );
    })()
  `, 12000));

  console.log("PASS149_WORKSPACE_ACTION_PROJECT_PATH_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS149_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS149_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
