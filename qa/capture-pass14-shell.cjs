const path = require("path");
const fs = require("fs");
const { app, BrowserWindow } = require("electron");

require(path.join(__dirname, "..", "electron", "main.cjs"));

const PROJECT_PATH = path.join(__dirname, "..");
const AUDIT_DIR = path.join(PROJECT_PATH, "docs", "uiux-audit-2026-07-04-live");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(win, script, timeoutMs = 8000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const ok = await win.webContents.executeJavaScript(script);
    if (ok) return true;
    await wait(150);
  }
  return false;
}

async function shot(win, name) {
  const image = await win.webContents.capturePage();
  const outPath = path.join(AUDIT_DIR, name);
  fs.writeFileSync(outPath, image.toPNG());
  console.log("CAPTURED", outPath);
}

function assertStep(name, ok) {
  console.log(name, ok);
  if (!ok) throw new Error(`${name} failed`);
}

app.whenReady().then(async () => {
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.error("CAPTURE_FAILED_NO_WINDOW");
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(500);
  await win.webContents.executeJavaScript(`
    window.claudexDesktop.setActiveProject(${JSON.stringify({ name: "claude-code-app", path: PROJECT_PATH })});
  `);
  await new Promise((resolve) => {
    win.webContents.once("did-finish-load", resolve);
    win.webContents.reload();
  });
  await wait(1200);

  assertStep("SHELL_READY_SONNET45", await waitFor(win, `
    /Ready for work|已准备|可以开始工作/i.test(document.body.textContent || "") &&
    /claude-sonnet-4-5-20250929/i.test(document.body.textContent || "") &&
    !/claude-sonnet-5|sonnet-5/i.test(document.body.textContent || "")
  `, 15000));

  assertStep("SIDEBAR_PROJECTS_DEDUPED", await win.webContents.executeJavaScript(`
    (function() {
      const text = document.querySelector(".project-list")?.textContent || "";
      return /claude-code-app/.test(text) && !/local workspace/i.test(text);
    })();
  `));
  await shot(win, "21-pass14-shell-sidebar.png");

  assertStep("OPEN_PROJECT_MODAL", await win.webContents.executeJavaScript(`
    (function() {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", ctrlKey: true, bubbles: true }));
      return true;
    })();
  `));
  assertStep("PROJECT_MODAL_CLEAN", await waitFor(win, `
    (function() {
      const modal = document.querySelector(".project-modal");
      const text = modal?.textContent || "";
      const current = modal?.querySelector(".project-current");
      return Boolean(modal && current && /claude-code-app/.test(text) && !/local workspace/i.test(text));
    })();
  `, 5000));
  await wait(350);
  await shot(win, "22-pass14-project-modal.png");

  await win.webContents.executeJavaScript(`document.querySelector(".project-modal .icon-only")?.click();`);
  await wait(250);

  assertStep("OPEN_SETTINGS_MODAL", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector(".account-row button");
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("SETTINGS_MODAL_GROUPED", await waitFor(win, `
    (function() {
      const modal = document.querySelector(".settings-modal:not(.shell-modal)");
      const text = modal?.textContent || "";
      const direct = Array.from(modal?.querySelectorAll(".settings-disclosure") || []).find((item) => /Direct API|直接 API/i.test(item.textContent || ""));
      const save = modal?.querySelector(".settings-footer .primary-action");
      return Boolean(
        modal &&
        modal.querySelector(".settings-layout") &&
        modal.querySelector(".settings-summary") &&
        /Runtime|运行环境/.test(text) &&
        /Prompting|提示词/.test(text) &&
        /Storage|存储/.test(text) &&
        direct &&
        !direct.open &&
        save?.disabled
      );
    })();
  `, 5000));
  assertStep("SETTINGS_MODAL_NO_OVERFLOW", await win.webContents.executeJavaScript(`
    (function() {
      const modal = document.querySelector(".settings-modal:not(.shell-modal)");
      if (!modal) return false;
      return modal.scrollWidth <= modal.clientWidth + 1;
    })();
  `));
  await wait(350);
  await shot(win, "23-pass14-settings-modal.png");

  console.log("CAPTURE_DONE");
  app.exit(0);
}).catch((error) => {
  console.error("CAPTURE_FAILED", error?.stack || error);
  app.exit(1);
});

setTimeout(() => {
  console.error("CAPTURE_TIMEOUT");
  app.exit(1);
}, 60000);
