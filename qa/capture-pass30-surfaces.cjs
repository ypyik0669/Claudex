const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const PROJECT_PATH = path.join(__dirname, "..");
const QA_DIR = path.join(PROJECT_PATH, "qa");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass30-surfaces-"));

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

app.whenReady().then(async () => {
  fs.mkdirSync(QA_DIR, { recursive: true });
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.error("PASS30_FAILED_NO_WINDOW");
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(500);

  assertStep("PASS30_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid'))", 15000));
  await shot(win, "pass30-home.png");

  assertStep("PASS30_BOTTOM_PANEL", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.workspace-top-button[aria-label="Bottom panel"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS30_BOTTOM_VISIBLE", await waitFor(win, "Boolean(document.querySelector('.bottom-work-panel'))", 5000));
  await shot(win, "pass30-bottom-panel.png");

  assertStep("PASS30_SETTINGS_OPEN", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.account-row button');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS30_SETTINGS_SURFACE", await waitFor(win, "Boolean(document.querySelector('.settings-surface') && document.querySelector('.app-grid.surface-open'))", 5000));
  await shot(win, "pass30-settings-general.png");

  assertStep("PASS30_APPEARANCE_OPEN", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.settings-nav button')].find((candidate) => /Appearance/i.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS30_APPEARANCE_CONTROLS", await waitFor(win, `
    (function() {
      const text = document.querySelector('.settings-content')?.textContent || '';
      return /Font size/i.test(text) && /Density/i.test(text) && /Interface language/i.test(text);
    })();
  `, 5000));
  await shot(win, "pass30-settings-appearance.png");

  assertStep("PASS30_BACK", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.surface-back');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS30_PLUGINS_OPEN", await waitFor(win, "Boolean(!document.querySelector('.settings-surface'))", 5000) && await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.nav-stack button')].find((candidate) => /Plugins/i.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS30_PLUGINS_SURFACE", await waitFor(win, "Boolean(document.querySelector('.plugin-manager-modal.surface-panel') && document.querySelector('.installed-capability-strip'))", 5000));
  await shot(win, "pass30-plugins-surface.png");

  console.log("PASS30_DONE");
  app.exit(0);
}).catch((error) => {
  console.error("PASS30_FAILED", error?.stack || error);
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS30_TIMEOUT");
  app.exit(1);
}, 60000);
