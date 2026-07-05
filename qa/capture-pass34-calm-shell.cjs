const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const PROJECT_PATH = path.join(__dirname, "..");
const QA_DIR = path.join(PROJECT_PATH, "qa");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass34-calm-shell-"));

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
        language: "zh",
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
          title: "新聊天",
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

async function clickByAriaPrefix(win, selector, label) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll(${JSON.stringify(selector)})]
        .find((candidate) => (candidate.getAttribute('aria-label') || candidate.textContent || '').startsWith(${JSON.stringify(label)}));
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
    console.error("PASS34_FAILED_NO_WINDOW");
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(500);

  assertStep("PASS34_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid'))", 15000));
  assertStep("PASS34_RAIL_VISIBLE", await waitFor(win, "Boolean(document.querySelector('.app-rail') && document.querySelector('.rail-button[data-tool=\"workspace\"]'))", 5000));
  assertStep("PASS34_DEFAULT_RIGHT_PANEL_CLOSED", await waitFor(win, `
    Boolean(
      document.querySelector('.app-grid.right-panel-hidden') &&
      getComputedStyle(document.querySelector('.tools-panel')).display === 'none'
    )
  `, 5000));
  assertStep("PASS34_COMPACT_FONT_ACTIVE", await waitFor(win, "Boolean(document.querySelector('.app-shell.font-compact'))", 5000));
  assertStep("PASS34_CONTEXT_ICONS_COMPACT", await waitFor(win, `
    [...document.querySelectorAll('.workspace-context-button')].length === 6 &&
    [...document.querySelectorAll('.workspace-context-button')].every((button) => button.getBoundingClientRect().width <= 40)
  `, 5000));
  await shot(win, "pass34-home-calm.png");

  assertStep("PASS34_CONTEXT_CLICK", await clickByAriaPrefix(win, ".workspace-context-button", "环境"));
  assertStep("PASS34_CONTEXT_PANEL_VISIBLE", await waitFor(win, "Boolean(document.querySelector('.bottom-work-panel') && document.querySelector('.workspace-context-button.active'))", 5000));
  assertStep("PASS34_ACTIVE_CONTEXT_EXPANDS", await waitFor(win, "document.querySelector('.workspace-context-button.active')?.getBoundingClientRect().width > 40", 5000));
  await shot(win, "pass34-bottom-environment.png");

  assertStep("PASS34_TOOLS_OPEN", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.side-panel-button');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS34_TOOLS_VISIBLE", await waitFor(win, "Boolean(!document.querySelector('.app-grid.right-panel-hidden') && document.querySelector('.tools-panel'))", 5000));
  await shot(win, "pass34-tools-open.png");

  assertStep("PASS34_SETTINGS_CLICK", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.account-row button');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS34_SETTINGS_SURFACE", await waitFor(win, `
    Boolean(
      document.querySelector('.settings-workspace') &&
      document.querySelector('.app-grid.surface-open') &&
      getComputedStyle(document.querySelector('.sidebar')).display === 'none'
    )
  `, 5000));
  await shot(win, "pass34-settings-surface.png");

  assertStep("PASS34_SETTINGS_BACK", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.surface-back');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS34_APP_RETURNED", await waitFor(win, "Boolean(document.querySelector('.workspace') && document.querySelector('.sidebar'))", 5000));

  assertStep("PASS34_PLUGINS_CLICK", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.nav-stack button')]
        .find((candidate) => (candidate.textContent || '').includes('插件'));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS34_PLUGINS_SURFACE", await waitFor(win, `
    Boolean(
      document.querySelector('.plugin-manager-modal') &&
      document.querySelector('.app-grid.surface-open') &&
      getComputedStyle(document.querySelector('.sidebar')).display === 'none'
    )
  `, 5000));
  await shot(win, "pass34-plugins-surface.png");

  assertStep("PASS34_MARKETPLACE_CLICK", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.plugin-manager-tabs button')]
        .find((candidate) => (candidate.textContent || '').includes('市场'));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS34_MARKETPLACE_VISIBLE", await waitFor(win, "Boolean(document.querySelector('.marketplace-workbench') && document.querySelector('.marketplace-output'))", 5000));
  await shot(win, "pass34-marketplace-surface.png");

  console.log("PASS34_DONE");
  app.exit(0);
}).catch((error) => {
  console.error("PASS34_FAILED", error?.stack || error);
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS34_TIMEOUT");
  app.exit(1);
}, 70000);
