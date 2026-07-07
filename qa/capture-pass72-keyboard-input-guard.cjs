const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass72-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass72-project-"));
const FILE_NAME = "guard.txt";

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

fs.writeFileSync(path.join(PROJECT_DIR, FILE_NAME), "pass72 keyboard guard\n", "utf8");
fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass72" }), "utf8");
fs.mkdirSync(USER_DATA_DIR, { recursive: true });
fs.writeFileSync(
  path.join(USER_DATA_DIR, "desktop-data.json"),
  JSON.stringify(
    {
      version: 1,
      activeProject: { name: "Keyboard Guard", path: PROJECT_DIR },
      projects: [{ name: "Keyboard Guard", path: PROJECT_DIR }],
      settings: {
        model: "claude-haiku-4-5-20251001",
      },
      sessions: [
        {
          id: "default",
          title: "新聊天",
          project: "Keyboard Guard",
          projectPath: PROJECT_DIR,
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
    console.error("PASS72_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS72_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));

  assertStep("PASS72_COMPOSER_GLOBAL_SHORTCUTS_GUARDED", await win.webContents.executeJavaScript(`
    (async function() {
      const textarea = document.querySelector('.prompt-box textarea');
      if (!textarea) return false;
      textarea.focus();
      const results = [];
      for (const key of ['p', 't']) {
        const event = new KeyboardEvent('keydown', { key, code: 'Key' + key.toUpperCase(), ctrlKey: true, bubbles: true, cancelable: true });
        const notCancelled = textarea.dispatchEvent(event);
        await new Promise((resolve) => setTimeout(resolve, 120));
        results.push({
          key,
          prevented: event.defaultPrevented || notCancelled === false,
          projectModal: Boolean(document.querySelector('.project-modal')),
          commandModal: Boolean(document.querySelector('.command-modal')),
          rightPanelOpen: !document.querySelector('.app-grid')?.classList.contains('right-panel-hidden'),
        });
      }
      return results.every((item) => item.prevented && !item.projectModal && !item.commandModal && !item.rightPanelOpen);
    })();
  `));

  assertStep("PASS72_COMPOSER_COMMAND_PALETTE_ALLOWED", await waitFor(win, `
    (async function() {
      if (!window.__pass72ComposerPalette) {
        window.__pass72ComposerPalette = true;
        const textarea = document.querySelector('.prompt-box textarea');
        if (!textarea) return false;
        textarea.focus();
        const event = new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, bubbles: true, cancelable: true });
        window.__pass72ComposerPalettePrevented = !textarea.dispatchEvent(event) || event.defaultPrevented;
      }
      await new Promise((resolve) => setTimeout(resolve, 120));
      return window.__pass72ComposerPalettePrevented === true &&
        Boolean(document.querySelector('.command-modal .command-search input'));
    })();
  `, 5000));

  assertStep("PASS72_CLOSE_COMPOSER_COMMAND_PALETTE", await win.webContents.executeJavaScript(`
    (function() {
      document.querySelector('.command-modal .command-search input')
        ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      return true;
    })();
  `));

  assertStep("PASS72_COMPOSER_SHORTCUT_HELP_ALLOWED", await waitFor(win, `
    (async function() {
      if (!window.__pass72ComposerHelp) {
        window.__pass72ComposerHelp = true;
        const textarea = document.querySelector('.prompt-box textarea');
        if (!textarea) return false;
        textarea.focus();
        const event = new KeyboardEvent('keydown', { key: '/', code: 'Slash', ctrlKey: true, bubbles: true, cancelable: true });
        window.__pass72ComposerHelpPrevented = !textarea.dispatchEvent(event) || event.defaultPrevented;
      }
      await new Promise((resolve) => setTimeout(resolve, 120));
      return window.__pass72ComposerHelpPrevented === true &&
        Boolean(document.querySelector('.modal-container[aria-label="键盘快捷键"]'));
    })();
  `, 5000));

  assertStep("PASS72_CLOSE_SHORTCUT_HELP", await win.webContents.executeJavaScript(`
    (function() {
      const close = document.querySelector('.modal-container[aria-label="键盘快捷键"] .modal-header button');
      close?.click();
      return true;
    })();
  `));

  assertStep("PASS72_OPEN_WORKSPACE_FILE", await waitFor(win, `
    (async function() {
      if (!window.__pass72WorkspaceOpened) {
        window.__pass72WorkspaceOpened = true;
        document.querySelector('.rail-button[data-tool="workspace"]')?.click();
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
      const row = Array.from(document.querySelectorAll('.file-tree .tree-item')).find((item) => item.textContent.includes(${JSON.stringify(FILE_NAME)}));
      if (!row) return false;
      if (!document.querySelector('.file-editor textarea')) row.click();
      await new Promise((resolve) => setTimeout(resolve, 400));
      return Boolean(document.querySelector('.file-editor textarea'));
    })();
  `, 15000));

  assertStep("PASS72_EDITOR_GLOBAL_SHORTCUTS_GUARDED", await win.webContents.executeJavaScript(`
    (async function() {
      const textarea = document.querySelector('.file-editor textarea');
      if (!textarea) return false;
      textarea.focus();
      const results = [];
      for (const key of ['p', 't']) {
        const event = new KeyboardEvent('keydown', { key, code: 'Key' + key.toUpperCase(), ctrlKey: true, bubbles: true, cancelable: true });
        const notCancelled = textarea.dispatchEvent(event);
        await new Promise((resolve) => setTimeout(resolve, 120));
        results.push({
          key,
          prevented: event.defaultPrevented || notCancelled === false,
          projectModal: Boolean(document.querySelector('.project-modal')),
          commandModal: Boolean(document.querySelector('.command-modal')),
          browserSelected: Boolean(document.querySelector('.tool-row.active[aria-controls="browser-tool-detail"]')),
        });
      }
      return results.every((item) => item.prevented && !item.projectModal && !item.commandModal && !item.browserSelected);
    })();
  `));

  assertStep("PASS72_EDITOR_COMMAND_PALETTE_ALLOWED", await waitFor(win, `
    (async function() {
      if (!window.__pass72EditorPalette) {
        window.__pass72EditorPalette = true;
        const textarea = document.querySelector('.file-editor textarea');
        if (!textarea) return false;
        textarea.focus();
        const event = new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, bubbles: true, cancelable: true });
        window.__pass72EditorPalettePrevented = !textarea.dispatchEvent(event) || event.defaultPrevented;
      }
      await new Promise((resolve) => setTimeout(resolve, 120));
      return window.__pass72EditorPalettePrevented === true &&
        Boolean(document.querySelector('.command-modal .command-search input'));
    })();
  `, 5000));

  assertStep("PASS72_CLOSE_EDITOR_COMMAND_PALETTE", await win.webContents.executeJavaScript(`
    (function() {
      document.querySelector('.command-modal .command-search input')
        ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      return true;
    })();
  `));

  assertStep("PASS72_EDITOR_SHORTCUT_HELP_ALLOWED", await waitFor(win, `
    (async function() {
      if (!window.__pass72EditorHelp) {
        window.__pass72EditorHelp = true;
        const textarea = document.querySelector('.file-editor textarea');
        if (!textarea) return false;
        textarea.focus();
        const event = new KeyboardEvent('keydown', { key: '/', code: 'Slash', ctrlKey: true, bubbles: true, cancelable: true });
        window.__pass72EditorHelpPrevented = !textarea.dispatchEvent(event) || event.defaultPrevented;
      }
      await new Promise((resolve) => setTimeout(resolve, 120));
      return window.__pass72EditorHelpPrevented === true &&
        Boolean(document.querySelector('.modal-container[aria-label="键盘快捷键"]'));
    })();
  `, 5000));

  console.log("PASS72_KEYBOARD_INPUT_GUARD_DONE");
  cleanup();
  app.exit(0);
}).catch((error) => {
  console.error("PASS72_KEYBOARD_INPUT_GUARD_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS72_KEYBOARD_INPUT_GUARD_TIMEOUT");
  cleanup();
  app.exit(1);
}, 70000);
