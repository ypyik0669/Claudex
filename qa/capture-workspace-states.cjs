const path = require("path");
const fs = require("fs");
const { app, BrowserWindow } = require("electron");

require(path.join(__dirname, "..", "electron", "main.cjs"));

const SCRATCH_NAME = "_qa_scratch_state_test.txt";
const SCRATCH_PATH = path.join(__dirname, "..", SCRATCH_NAME);
fs.writeFileSync(SCRATCH_PATH, "qa scratch file for workspace state capture\n");

const SCRATCH2_NAME = "_qa_scratch_state_test2.txt";
const SCRATCH2_PATH = path.join(__dirname, "..", SCRATCH2_NAME);
fs.writeFileSync(SCRATCH2_PATH, "qa scratch file 2, will be deleted to force a real read error\n");

function cleanup() {
  try {
    fs.unlinkSync(SCRATCH_PATH);
  } catch (e) {
    // already gone
  }
  try {
    fs.unlinkSync(SCRATCH2_PATH);
  } catch (e) {
    // already gone
  }
}

function shot(win, name) {
  return win.webContents.capturePage().then((image) => {
    const outPath = path.join(__dirname, `state-${name}.png`);
    fs.writeFileSync(outPath, image.toPNG());
    console.log("CAPTURED", name, outPath);
  });
}

function clickByText(win, selector, text) {
  return win.webContents.executeJavaScript(`
    (function() {
      const els = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
      const el = els.find((e) => e.textContent && e.textContent.includes(${JSON.stringify(text)}));
      if (el) { el.click(); return true; }
      return false;
    })();
  `);
}

app.whenReady().then(async () => {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.error("CAPTURE_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await new Promise((resolve) => setTimeout(resolve, 500));

  const clickedProject = await clickByText(win, "button, [role=button], li, div", "claude-code-app");
  console.log("CLICKED_PROJECT", clickedProject);
  await new Promise((resolve) => setTimeout(resolve, 400));

  const clickedWorkspace = await clickByText(win, "button", "Workspace");
  console.log("CLICKED_WORKSPACE", clickedWorkspace);
  await new Promise((resolve) => setTimeout(resolve, 50));
  await shot(win, "workspace-loading");

  await new Promise((resolve) => setTimeout(resolve, 1200));
  await shot(win, "workspace-tree-loaded");

  const clickedFile = await win.webContents.executeJavaScript(`
    (function() {
      const rows = Array.from(document.querySelectorAll("button, div, span, li"));
      const el = rows.find((e) => e.textContent && e.textContent.trim() === ${JSON.stringify(SCRATCH_NAME)});
      if (el) { el.click(); return true; }
      return false;
    })();
  `);
  console.log("CLICKED_FILE", clickedFile);
  await new Promise((resolve) => setTimeout(resolve, 60));
  await shot(win, "workspace-opening-file");
  await new Promise((resolve) => setTimeout(resolve, 800));
  await shot(win, "workspace-file-open");

  const typedChar = await win.webContents.executeJavaScript(`
    (function() {
      const ta = document.querySelector(".file-editor textarea");
      if (!ta) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
      setter.call(ta, ta.value + " edited");
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })();
  `);
  console.log("TYPED_CHAR", typedChar);
  await new Promise((resolve) => setTimeout(resolve, 400));
  await shot(win, "workspace-unsaved");

  const clickedSave = await clickByText(win, "button", "Save");
  console.log("CLICKED_SAVE", clickedSave);
  await new Promise((resolve) => setTimeout(resolve, 30));
  await shot(win, "workspace-saving");
  await new Promise((resolve) => setTimeout(resolve, 500));
  await shot(win, "workspace-save-success");
  await new Promise((resolve) => setTimeout(resolve, 1600));
  await shot(win, "workspace-save-idle-again");

  fs.unlinkSync(SCRATCH2_PATH);
  console.log("DELETED_SCRATCH2_FROM_DISK");

  const clickedScratch2 = await win.webContents.executeJavaScript(`
    (function() {
      const rows = Array.from(document.querySelectorAll("button, div, span, li"));
      const el = rows.find((e) => e.textContent && e.textContent.trim() === ${JSON.stringify(SCRATCH2_NAME)});
      if (el) { el.click(); return true; }
      return false;
    })();
  `);
  console.log("CLICKED_SCRATCH2", clickedScratch2);
  await new Promise((resolve) => setTimeout(resolve, 900));
  await shot(win, "workspace-open-error-real");

  const typedCommand = await win.webContents.executeJavaScript(`
    (function() {
      const input = document.querySelector('.command-runner input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(input, "this-command-does-not-exist-xyz");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })();
  `);
  console.log("TYPED_COMMAND", typedCommand);
  await new Promise((resolve) => setTimeout(resolve, 200));

  const clickedRun = await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector(".command-runner button");
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
  console.log("CLICKED_RUN", clickedRun);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await shot(win, "workspace-command-error");

  console.log("CAPTURE_DONE");
  cleanup();
  app.exit(0);
});

setTimeout(() => {
  console.error("CAPTURE_TIMEOUT");
  cleanup();
  app.exit(1);
}, 30000);
