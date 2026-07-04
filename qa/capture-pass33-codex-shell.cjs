const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const PROJECT_PATH = path.join(__dirname, "..");
const QA_DIR = path.join(PROJECT_PATH, "qa");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass33-codex-shell-"));

app.setPath("userData", USER_DATA_DIR);

fs.mkdirSync(USER_DATA_DIR, { recursive: true });
fs.writeFileSync(
  path.join(USER_DATA_DIR, "desktop-data.json"),
  JSON.stringify(
    {
      version: 1,
      settings: {
        provider: "anthropic",
        model: "claude-sonnet-4-5-20250929",
        baseUrl: "https://api.example.com",
        temperature: 0.2,
        timeoutMs: 600000,
        language: "en",
        appearance: { fontSize: "compact", density: "compact" },
        claudeCode: {
          executionMode: "claude-code",
          claudeCommand: "claude",
          permissionMode: "default",
        },
        capabilities: {
          "project-context": true,
          "code-review": true,
          "implementation-plan": true,
          "terminal-helper": true,
          "mcp-runtime": true,
          "plugin-router": true,
          "marketplace-router": true,
          "custom-marketplaces": true,
        },
        customMarketplaces: ["https://example.com/claude-code-marketplace.json"],
      },
      activeProject: { name: "claude-code-app", path: PROJECT_PATH },
      projects: [{ name: "claude-code-app", path: PROJECT_PATH }],
      sessions: [
        {
          id: "default",
          title: "New chat",
          project: "claude-code-app",
          projectPath: PROJECT_PATH,
          createdAt: "2026-07-04T05:00:00.000Z",
          updatedAt: "2026-07-04T05:00:00.000Z",
          messages: [],
        },
      ],
    },
    null,
    2,
  ),
  "utf8",
);

require(path.join(PROJECT_PATH, "electron", "main.cjs"));

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

async function shot(win, name) {
  await win.webContents.executeJavaScript("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  await wait(250);
  const image = await win.webContents.capturePage();
  const outPath = path.join(QA_DIR, name);
  fs.writeFileSync(outPath, image.toPNG());
  console.log("CAPTURED", outPath);
}

function assertStep(name, ok) {
  console.log(name, ok);
  if (!ok) throw new Error(`${name} failed`);
}

async function clickContextTab(win, label) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.workspace-context-button')]
        .find((candidate) => (candidate.textContent || '').includes(${JSON.stringify(label)}));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

app.whenReady().then(async () => {
  fs.mkdirSync(QA_DIR, { recursive: true });
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.error("PASS33_FAILED_NO_WINDOW");
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(500);

  assertStep("PASS33_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid'))", 15000));
  assertStep("PASS33_RAIL", await waitFor(win, "Boolean(document.querySelector('.app-rail') && document.querySelector('.workspace-context-tabs'))", 5000));
  await shot(win, "pass33-home-rail-context.png");

  assertStep("PASS33_COLLAPSE", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.sidebar-collapse-button');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS33_RAIL_REMAINS", await waitFor(win, "Boolean(document.querySelector('.app-grid.sidebar-hidden') && document.querySelector('.app-rail'))", 5000));
  await shot(win, "pass33-sidebar-rail-only.png");
  await win.webContents.executeJavaScript(`document.querySelector('.workspace-left-actions button')?.click()`);
  await waitFor(win, "Boolean(!document.querySelector('.app-grid.sidebar-hidden'))", 5000);

  assertStep("PASS33_ENVIRONMENT_PANEL", await clickContextTab(win, "环境"));
  assertStep("PASS33_ENVIRONMENT_VISIBLE", await waitFor(win, "Boolean(document.querySelector('.bottom-work-panel') && document.querySelector('.bottom-panel-body'))", 5000));
  await shot(win, "pass33-bottom-environment.png");

  assertStep("PASS33_CHANGES_PANEL", await clickContextTab(win, "变更"));
  assertStep("PASS33_CHANGES_VISIBLE", await waitFor(win, "Boolean(document.querySelector('.git-status-preview'))", 5000));
  await shot(win, "pass33-bottom-changes.png");

  assertStep("PASS33_SOURCES_PANEL", await clickContextTab(win, "来源"));
  assertStep("PASS33_SOURCES_VISIBLE", await waitFor(win, "Boolean(document.querySelector('.bottom-work-panel') && /文件/.test(document.body.textContent || ''))", 5000));
  await shot(win, "pass33-bottom-sources.png");

  assertStep("PASS33_SUBAGENTS_PANEL", await clickContextTab(win, "子代理"));
  assertStep("PASS33_SUBAGENTS_VISIBLE", await waitFor(win, "Boolean(document.querySelector('.bottom-work-panel') && /没有运行中的子代理/.test(document.body.textContent || ''))", 5000));
  await shot(win, "pass33-bottom-subagents.png");

  console.log("PASS33_DONE");
  app.exit(0);
}).catch((error) => {
  console.error("PASS33_FAILED", error?.stack || error);
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS33_TIMEOUT");
  app.exit(1);
}, 70000);
