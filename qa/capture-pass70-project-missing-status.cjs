const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass70-data-"));
const MISSING_PROJECT = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass70-missing-"));

function cleanup() {
  for (const dir of [USER_DATA_DIR, MISSING_PROJECT]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_error) {
      // best-effort cleanup
    }
  }
}

app.setPath("userData", USER_DATA_DIR);
fs.rmSync(MISSING_PROJECT, { recursive: true, force: true });

fs.mkdirSync(USER_DATA_DIR, { recursive: true });
fs.writeFileSync(
  path.join(USER_DATA_DIR, "desktop-data.json"),
  JSON.stringify(
    {
      version: 1,
      activeProject: { name: "Missing Project", path: MISSING_PROJECT },
      projects: [{ name: "Missing Project", path: MISSING_PROJECT }],
      sessions: [
        {
          id: "default",
          title: "新聊天",
          project: "Missing Project",
          projectPath: MISSING_PROJECT,
          createdAt: "2026-07-05T00:00:00.000Z",
          updatedAt: "2026-07-05T00:00:00.000Z",
          messages: [],
        },
      ],
    },
    null,
    2,
  ),
  "utf8",
);

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

app.whenReady().then(async () => {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.error("PASS70_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS70_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));

  assertStep("PASS70_ENVIRONMENT_IPC_MISSING_PROJECT", await win.webContents.executeJavaScript(`
    (async function() {
      const env = await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(MISSING_PROJECT)} });
      return env.projectMissing === true &&
        env.projectExists === false &&
        env.requestedProjectPath === ${JSON.stringify(MISSING_PROJECT)} &&
        env.fallbackCwd &&
        env.cwd === env.fallbackCwd &&
        env.cwd !== ${JSON.stringify(MISSING_PROJECT)};
    })();
  `));

  assertStep("PASS70_UI_PROJECT_MISSING_BADGES", await waitFor(win, `
    (function() {
      const sidebarProject = document.querySelector('.project-list button.project-missing');
      const composerProject = document.querySelector('.prompt-box .project-pill.project-missing');
      const railDot = document.querySelector('.tool-rail-project-dot.missing');
      const environmentButton = Array.from(document.querySelectorAll('.workspace-context-button'))
        .find((button) => /\\u73af\\u5883/.test(button.textContent || ''));
      return /Missing Project/.test(sidebarProject?.textContent || '') &&
        /\\u8def\\u5f84\\u5931\\u6548/.test(sidebarProject?.textContent || '') &&
        Boolean(composerProject) &&
        railDot?.getAttribute('data-project-status') === 'missing' &&
        railDot?.getAttribute('role') === 'status' &&
        (railDot?.getAttribute('aria-label') || '').includes(${JSON.stringify(MISSING_PROJECT)}) &&
        /\\u8def\\u5f84\\u5931\\u6548/.test(environmentButton?.textContent || '');
    })();
  `, 10000));

  assertStep("PASS70_BOTTOM_ENVIRONMENT_WARNING", await waitFor(win, `
    (async function() {
      if (!window.__pass70EnvironmentClicked) {
        window.__pass70EnvironmentClicked = true;
        const button = Array.from(document.querySelectorAll('.workspace-context-button'))
          .find((item) => /\\u73af\\u5883/.test(item.textContent || ''));
        if (!button) return false;
        button.click();
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      const warning = document.querySelector('.bottom-work-panel .project-path-warning-inline');
      return /\\u8def\\u5f84\\u5931\\u6548/.test(warning?.textContent || '') ||
        /\\u6240\\u9009\\u9879\\u76ee\\u6587\\u4ef6\\u5939\\u4e0d\\u5b58\\u5728/.test(warning?.textContent || '');
    })();
  `, 10000));

  assertStep("PASS70_PROJECT_MODAL_RECOVERY", await waitFor(win, `
    (async function() {
      if (!window.__pass70ProjectModalOpened) {
        window.__pass70ProjectModalOpened = true;
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true }));
      }
      await new Promise((resolve) => setTimeout(resolve, 220));
      const modal = document.querySelector('.project-modal');
      const warning = modal?.querySelector('.project-modal-warning');
      const reselect = modal?.querySelector('[data-project-reselect="true"]');
      const terminal = Array.from(modal?.querySelectorAll('.project-modal-actions button') || [])
        .find((item) => /\u7ec8\u7aef/.test(item.textContent || ''));
      return Boolean(
        modal &&
        /\u8def\u5f84\u5931\u6548/.test(warning?.textContent || '') &&
        reselect &&
        terminal?.disabled
      );
    })();
  `, 10000));

  console.log("PASS70_PROJECT_MISSING_STATUS_DONE");
  cleanup();
  app.exit(0);
}).catch((error) => {
  console.error("PASS70_PROJECT_MISSING_STATUS_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS70_PROJECT_MISSING_STATUS_TIMEOUT");
  cleanup();
  app.exit(1);
}, 60000);
