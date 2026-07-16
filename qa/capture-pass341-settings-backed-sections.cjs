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
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass341-settings-backed-sections-"));
const FAKE_CLAUDE = path.join(USER_DATA_DIR, "fake-claude.cmd");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");

function cleanup() {
  try {
    fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
  } catch (_error) {
    // best-effort cleanup
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

function writeInitialStore() {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.writeFileSync(
    FAKE_CLAUDE,
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake 1.0& exit /b 0)",
      "if \"%1\"==\"auth\" (echo Logged in as qa@example.invalid& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins:& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces:& exit /b 0)",
      "if \"%1\"==\"mcp\" (echo No MCP servers configured& exit /b 0)",
      "echo ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(
      {
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
        activeProject: { name: "Claudex", path: REPO_DIR },
        projects: [{ name: "Claudex", path: REPO_DIR }],
        sessions: [
          {
            id: "default",
            title: "新聊天",
            project: "Claudex",
            projectPath: REPO_DIR,
            createdAt: "2026-07-05T00:00:00.000Z",
            updatedAt: "2026-07-05T00:00:00.000Z",
            messages: [],
          },
        ],
        automations: [],
        subagentRuns: [],
        sourceRefs: [],
        browserVisits: [],
      },
      null,
      2,
    ),
    "utf8",
  );
}

async function openSettings(win) {
  await win.webContents.executeJavaScript(`
    (function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', ctrlKey: true, bubbles: true }));
      return true;
    })();
  `);
  return waitFor(win, "Boolean(document.querySelector('.settings-workspace'))", 5000);
}

async function selectSettingsSection(win, id) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.settings-nav button[data-settings-section="${id}"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function clickQuickAction(win, index = 0) {
  return win.webContents.executeJavaScript(`
    (function() {
      const action = Array.from(document.querySelectorAll('.settings-quick-actions button'))[${index}];
      if (!action) return false;
      action.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS341_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(600);

  assertStep("PASS341_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS341_SETTINGS_OPEN", await openSettings(win));
  const sections = ["general", "profile", "appearance", "configuration", "personalization", "mcp", "browser", "computer", "hooks", "connections", "git", "environments", "worktrees", "archived"];
  for (const section of sections) {
    assertStep(`PASS341_SELECT_${section.toUpperCase()}`, await selectSettingsSection(win, section));
    assertStep(`PASS341_${section.toUpperCase()}_BACKED`, await waitFor(win, `
      Boolean(
        document.querySelector('.settings-workspace') &&
        document.querySelector('.settings-nav button.active[data-settings-section="${section}"]') &&
        document.querySelector('.settings-content .settings-layout') &&
        !document.querySelector('.settings-content .settings-placeholder')
      )
    `, 10000));
  }

  assertStep("PASS341_RETURN_APPEARANCE", await selectSettingsSection(win, "appearance"));
  assertStep("PASS341_APPEARANCE_HAS_PERSISTED_CONTROLS", await waitFor(win, `
    (function() {
      return Array.from(document.querySelectorAll('.settings-content select'))
        .some((select) => select.value === 'compact');
    })()
  `, 5000));
  console.log("PASS341_SETTINGS_BACKED_SECTIONS_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS341_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS341_TIMEOUT");
  cleanup();
  app.exit(1);
}, 70000);
