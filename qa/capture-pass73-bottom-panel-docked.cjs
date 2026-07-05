const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass73-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass73-project-"));

function cleanup() {
  for (const dir of [USER_DATA_DIR, PROJECT_DIR]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_error) {
      // best-effort cleanup
    }
  }
}

app.setPath("userData", USER_DATA_DIR);

fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass73" }), "utf8");
fs.writeFileSync(path.join(PROJECT_DIR, "README.md"), "# pass73\n", "utf8");
fs.mkdirSync(USER_DATA_DIR, { recursive: true });
fs.writeFileSync(
  path.join(USER_DATA_DIR, "desktop-data.json"),
  JSON.stringify(
    {
      version: 1,
      activeProject: { name: "Bottom Panel Dock", path: PROJECT_DIR },
      projects: [{ name: "Bottom Panel Dock", path: PROJECT_DIR }],
      settings: {
        model: "claude-haiku-4-5-20251001",
        language: "zh",
        appearance: { fontSize: "compact", density: "compact" },
      },
      sessions: [
        {
          id: "default",
          title: "Bottom panel dock QA",
          project: "Bottom Panel Dock",
          projectPath: PROJECT_DIR,
          createdAt: "2026-07-05T00:00:00.000Z",
          updatedAt: "2026-07-05T00:01:00.000Z",
          messages: [
            {
              role: "user",
              content: "验证底部证据面板不要遮挡 composer。",
              createdAt: "2026-07-05T00:00:00.000Z",
            },
            {
              role: "assistant",
              content: "已保留一条消息，让多轮 composer 固定在底部。",
              createdAt: "2026-07-05T00:01:00.000Z",
            },
          ],
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

async function assertDockedLayout(win, name, inputValue) {
  const result = await win.webContents.executeJavaScript(`
    (function() {
      const panel = document.querySelector('.bottom-work-panel');
      const body = document.querySelector('.bottom-panel-body');
      const composer = document.querySelector('.composer-dock .prompt-box');
      const textarea = document.querySelector('.composer-dock textarea');
      if (!panel || !body || !composer || !textarea) {
        return { ok: false, reason: 'missing-element' };
      }
      const panelStyle = getComputedStyle(panel);
      const bodyStyle = getComputedStyle(body);
      const composerBox = composer.getBoundingClientRect();
      const panelBox = panel.getBoundingClientRect();
      const textareaBox = textarea.getBoundingClientRect();
      const dockedBelowComposer = composerBox.bottom <= panelBox.top + 1;
      const textareaVisible = textareaBox.width > 0 &&
        textareaBox.height > 0 &&
        textareaBox.bottom <= window.innerHeight &&
        textareaBox.top >= 0;
      textarea.focus();
      const focused = document.activeElement === textarea;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter.call(textarea, ${JSON.stringify(inputValue)});
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      return {
        ok: panelStyle.position !== 'absolute' &&
          bodyStyle.overflowY !== 'visible' &&
          dockedBelowComposer &&
          textareaVisible &&
          focused &&
          textarea.value === ${JSON.stringify(inputValue)},
        position: panelStyle.position,
        bodyOverflowY: bodyStyle.overflowY,
        composerBottom: Math.round(composerBox.bottom),
        panelTop: Math.round(panelBox.top),
        textareaVisible,
        focused,
        value: textarea.value,
      };
    })();
  `);
  console.log(name, result);
  if (!result?.ok) throw new Error(`${name} failed: ${JSON.stringify(result)}`);
}

async function clickBottomTab(win, label) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = Array.from(document.querySelectorAll('.bottom-panel-tabs button:not(.icon-only)'))
        .find((candidate) => (candidate.textContent || '').includes(${JSON.stringify(label)}));
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
    console.error("PASS73_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS73_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && document.querySelector('.composer-dock .prompt-box'))", 15000));
  assertStep("PASS73_OPEN_ENVIRONMENT_PANEL", await win.webContents.executeJavaScript(`
    (function() {
      const environment = document.querySelector('.workspace-context-button');
      if (!environment) return false;
      environment.click();
      return true;
    })();
  `));
  assertStep("PASS73_BOTTOM_PANEL_VISIBLE", await waitFor(win, "Boolean(document.querySelector('.bottom-work-panel'))", 5000));
  await assertDockedLayout(win, "PASS73_ENVIRONMENT_DOCKED", "pass73 environment input");

  assertStep("PASS73_SWITCH_CHANGES", await clickBottomTab(win, "变更"));
  assertStep("PASS73_CHANGES_ACTIVE", await waitFor(win, `
    Boolean(
      document.querySelector('.bottom-work-panel') &&
      Array.from(document.querySelectorAll('.bottom-panel-tabs button.active'))
        .some((button) => (button.textContent || '').includes('变更'))
    )
  `, 5000));
  await assertDockedLayout(win, "PASS73_CHANGES_DOCKED", "pass73 changes input");

  assertStep("PASS73_SWITCH_OUTPUTS", await clickBottomTab(win, "输出"));
  assertStep("PASS73_OUTPUTS_ACTIVE", await waitFor(win, `
    Boolean(
      document.querySelector('.bottom-work-panel') &&
      Array.from(document.querySelectorAll('.bottom-panel-tabs button.active'))
        .some((button) => (button.textContent || '').includes('输出'))
    )
  `, 5000));
  await assertDockedLayout(win, "PASS73_OUTPUTS_DOCKED", "pass73 outputs input");

  console.log("PASS73_BOTTOM_PANEL_DOCKED_DONE");
  cleanup();
  app.exit(0);
}).catch((error) => {
  console.error("PASS73_BOTTOM_PANEL_DOCKED_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS73_BOTTOM_PANEL_DOCKED_TIMEOUT");
  cleanup();
  app.exit(1);
}, 70000);
