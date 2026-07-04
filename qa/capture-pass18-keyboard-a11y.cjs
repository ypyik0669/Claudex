const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const PROJECT_PATH = path.join(__dirname, "..");
const AUDIT_DIR = path.join(PROJECT_PATH, "docs", "uiux-audit-2026-07-04-live");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass18-a11y-"));

app.setPath("userData", USER_DATA_DIR);

fs.mkdirSync(USER_DATA_DIR, { recursive: true });
fs.writeFileSync(
  path.join(USER_DATA_DIR, "desktop-data.json"),
  JSON.stringify(
    {
      version: 1,
      activeProject: { name: "claude-code-app", path: PROJECT_PATH },
      projects: [{ name: "claude-code-app", path: PROJECT_PATH }],
      sessions: [
        {
          id: "default",
          title: "New chat",
          project: "claude-code-app",
          projectPath: PROJECT_PATH,
          createdAt: "2026-07-04T04:30:00.000Z",
          updatedAt: "2026-07-04T04:30:00.000Z",
          messages: [],
        },
      ],
    },
    null,
    2,
  ),
  "utf8",
);

require(path.join(__dirname, "..", "electron", "main.cjs"));

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
    console.error("PASS18_FAILED_NO_WINDOW");
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(500);

  assertStep("PASS18_READY_MODEL", await waitFor(win, `
    Boolean(document.querySelector(".model-pill strong")?.textContent?.trim()) &&
    !/claude-sonnet-5|sonnet-5/i.test(document.body.textContent || "")
  `, 15000));

  assertStep("PASS18_SEARCH_HAS_LABEL", await win.webContents.executeJavaScript(`
    document.querySelector(".nav-search input")?.getAttribute("aria-label")?.length > 0
  `));

  assertStep("PASS18_VISIBLE_ICON_BUTTONS_NAMED", await win.webContents.executeJavaScript(`
    (function() {
      const unnamed = Array.from(document.querySelectorAll("button")).filter((button) => {
        const rect = button.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        const visibleText = (button.textContent || "").replace(/\\s+/g, " ").trim();
        if (visibleText) return false;
        return !(button.getAttribute("aria-label") || button.getAttribute("title"));
      });
      if (unnamed.length) console.log("UNNAMED_ICON_BUTTONS", unnamed.map((button) => button.className || button.outerHTML).join("\\n"));
      return unnamed.length === 0;
    })();
  `));

  assertStep("PASS18_SEARCH_SHORTCUT_FOCUSES_INPUT", await win.webContents.executeJavaScript(`
    (function() {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "F", ctrlKey: true, shiftKey: true, bubbles: true }));
      const input = document.querySelector(".nav-search input");
      return document.activeElement === input;
    })();
  `));

  const focusState = await win.webContents.executeJavaScript(`
    (async function() {
      const input = document.querySelector(".nav-search input");
      const wrapper = input?.closest(".nav-search");
      if (!input || !wrapper) return { ok: false, reason: "missing-input-or-wrapper" };
      input.focus();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const style = getComputedStyle(wrapper);
      const ok = style.boxShadow !== "none";
      return { ok, borderColor: style.borderColor, boxShadow: style.boxShadow, activeTag: document.activeElement?.tagName, activeClass: document.activeElement?.className };
    })();
  `);
  console.log("PASS18_FOCUS_STATE", JSON.stringify(focusState));
  assertStep("PASS18_FOCUS_RING_VISIBLE", focusState.ok);

  assertStep("PASS18_PROJECT_MODAL_CLOSE_NAMED", await waitFor(win, `
    (function() {
      if (!document.querySelector(".project-modal")) {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", ctrlKey: true, bubbles: true }));
      }
      const close = document.querySelector(".project-modal button.icon-only");
      return Boolean(close?.getAttribute("aria-label"));
    })();
  `, 5000));

  await wait(350);
  await shot(win, "35-pass18-keyboard-focus-source.png");

  console.log("PASS18_KEYBOARD_A11Y_DONE");
  app.exit(0);
}).catch((error) => {
  console.error("PASS18_KEYBOARD_A11Y_FAILED", error?.stack || error);
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS18_KEYBOARD_A11Y_TIMEOUT");
  app.exit(1);
}, 60000);
