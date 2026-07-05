const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass42-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass42-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const SOURCE_RELATIVE = "src/pass42-source.txt";

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

app.setPath("userData", USER_DATA_DIR);
fs.mkdirSync(path.join(PROJECT_DIR, "src"), { recursive: true });
fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass42-project" }), "utf8");
fs.writeFileSync(path.join(PROJECT_DIR, SOURCE_RELATIVE), "pass42 source evidence\n", "utf8");

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
    claudeCode: { executionMode: "claude-code", claudeCommand: "claude", permissionMode: "default" },
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
  activeProject: { name: "pass42-project", path: PROJECT_DIR },
  projects: [{ name: "pass42-project", path: PROJECT_DIR }],
  sessions: [
    {
      id: "default",
      title: "新聊天",
      project: "pass42-project",
      projectPath: PROJECT_DIR,
      createdAt: "2026-07-05T00:00:00.000Z",
      updatedAt: "2026-07-05T00:00:00.000Z",
      messages: [],
    },
  ],
  automations: [],
  subagentRuns: [],
  sourceRefs: [],
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

async function openSources(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = Array.from(document.querySelectorAll('.workspace-context-button, .bottom-panel-tabs button'))
        .find((item) => item.getAttribute('aria-label') === '来源' || /来源/.test(item.textContent || ''));
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
    console.error("PASS42_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  try {
    assertStep("PASS42_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
    assertStep("PASS42_READ_WORKSPACE_FILE_RECORDS_SOURCE", await win.webContents.executeJavaScript(`
      (async function() {
        const result = await window.claudexDesktop.readWorkspaceFile({
          projectPath: ${JSON.stringify(PROJECT_DIR)},
          relativePath: ${JSON.stringify(SOURCE_RELATIVE)}
        });
        const state = await window.claudexDesktop.getState();
        const source = state.sourceRefs?.[0];
        return Boolean(
          /pass42 source evidence/.test(result.content || '') &&
          result.sourceRef?.path === ${JSON.stringify(SOURCE_RELATIVE)} &&
          source?.path === ${JSON.stringify(SOURCE_RELATIVE)} &&
          source.project?.path === ${JSON.stringify(PROJECT_DIR)}
        );
      })();
    `));

    assertStep("PASS42_STORE_PERSISTED", (() => {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      return parsed.sourceRefs?.length === 1 &&
        parsed.sourceRefs[0].path === SOURCE_RELATIVE &&
        parsed.sourceRefs[0].project?.path === PROJECT_DIR;
    })());

    win.webContents.reload();
    await wait(1200);
    assertStep("PASS42_RELOAD_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
    assertStep("PASS42_OPEN_SOURCES", await openSources(win));
    assertStep("PASS42_SOURCES_PANEL_REAL_REF", await waitFor(win, `
      Boolean(
        document.querySelector('.source-ref-card') &&
        /pass42-source\\.txt/.test(document.body.textContent || '') &&
        /来自真实 Workspace 文件读取记录/.test(document.body.textContent || '')
      )
    `, 10000));

    console.log("PASS42_SOURCES_EVIDENCE_DONE");
    cleanup();
    app.exit(0);
  } catch (error) {
    console.error(error);
    cleanup();
    app.exit(1);
  }
});
