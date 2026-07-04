const path = require("path");
const fs = require("fs");
const { app, BrowserWindow } = require("electron");

require(path.join(__dirname, "..", "electron", "main.cjs"));

const PROJECT_PATH = path.join(__dirname, "..");
const AUDIT_DIR = path.join(PROJECT_PATH, "docs", "uiux-audit-2026-07-04");
const SCRATCH_NAME = "_qa_pass5_editor_flow.txt";
const SCRATCH_PATH = path.join(PROJECT_PATH, SCRATCH_NAME);

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

async function clickByText(win, selector, text) {
  return await win.webContents.executeJavaScript(`
    (function() {
      const els = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
      const el = els.find((item) => (item.textContent || "").includes(${JSON.stringify(text)}));
      if (!el || el.disabled) return false;
      el.click();
      return true;
    })();
  `);
}

function assertStep(name, ok) {
  console.log(name, ok);
  if (!ok) {
    throw new Error(`${name} failed`);
  }
}

async function clickTool(win, pattern) {
  return await win.webContents.executeJavaScript(`
    (function() {
      const re = new RegExp(${JSON.stringify(pattern)}, "i");
      const button = Array.from(document.querySelectorAll("button.tool-row")).find((item) => re.test(item.textContent || ""));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

function cleanup() {
  try {
    fs.unlinkSync(SCRATCH_PATH);
  } catch (error) {
    // already removed
  }
}

app.whenReady().then(async () => {
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
  fs.writeFileSync(SCRATCH_PATH, "first line\nsecond line\n", "utf8");

  await wait(1800);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.error("CAPTURE_FAILED_NO_WINDOW");
    cleanup();
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

  assertStep("OPEN_WORKSPACE", await clickTool(win, "Workspace|工作区"));
  assertStep("WAIT_WORKSPACE", await waitFor(win, `document.querySelector(".workspace-detail") !== null`, 10000));
  await wait(1200);

  assertStep("OPEN_FILE", await win.webContents.executeJavaScript(`
    (function() {
      const rows = Array.from(document.querySelectorAll(".tree-item"));
      const row = rows.find((item) => (item.getAttribute("title") || item.textContent || "").includes(${JSON.stringify(SCRATCH_NAME)}));
      if (!row) return false;
      row.click();
      return true;
    })();
  `));
  assertStep("WAIT_TEXTAREA", await waitFor(win, `document.querySelector(".file-editor textarea") !== null`, 10000));
  await wait(300);

  assertStep("EDIT_FILE", await win.webContents.executeJavaScript(`
    (function() {
      const textarea = document.querySelector(".file-editor textarea");
      if (!textarea) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
      setter.call(textarea, textarea.value.replace("second line", "second line edited") + "third line added\\n");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })();
  `));
  await wait(500);
  await shot(win, "21-pass5-editor-unsaved.png");

  assertStep("OPEN_REVIEW", await clickByText(win, ".compact-segmented button, .editor-change-actions button", "Review"));
  assertStep("WAIT_REVIEW", await waitFor(win, `document.querySelector(".editor-review-pane .diff-row") !== null`, 5000));
  await wait(300);
  await shot(win, "22-pass5-editor-review.png");

  assertStep("FOCUS_SAVE", await win.webContents.executeJavaScript(`
    (function() {
      const buttons = Array.from(document.querySelectorAll(".editor-change-actions button"));
      const save = buttons.find((item) => (item.textContent || "").includes("Save"));
      if (!save) return false;
      save.focus();
      return document.activeElement === save;
    })();
  `));
  await wait(300);
  await shot(win, "23-pass5-editor-save-focus.png");

  assertStep("SAVE_FILE", await clickByText(win, ".editor-change-actions button", "Save"));
  assertStep("WAIT_SAVED", await waitFor(win, `document.querySelector(".editor-change-bar.saved") !== null`, 10000));
  await wait(500);
  await shot(win, "24-pass5-editor-saved.png");

  console.log("CAPTURE_DONE");
  cleanup();
  app.exit(0);
}).catch((error) => {
  console.error("CAPTURE_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("CAPTURE_TIMEOUT");
  cleanup();
  app.exit(1);
}, 60000);
