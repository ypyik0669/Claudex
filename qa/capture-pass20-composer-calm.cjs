const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const PROJECT_PATH = path.join(__dirname, "..");
const AUDIT_DIR = path.join(PROJECT_PATH, "docs", "uiux-audit-2026-07-04-live");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass20-composer-"));

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
    console.error("PASS20_FAILED_NO_WINDOW");
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(500);

  assertStep("PASS20_READY_SONNET45", await waitFor(win, `
    /claude-sonnet-4-5-20250929/i.test(document.body.textContent || "") &&
    !/claude-sonnet-5|sonnet-5/i.test(document.body.textContent || "")
  `, 15000));

  assertStep("PASS20_CONTEXT_STABLE", await waitFor(win, `
    (function() {
      const compact = document.querySelector(".context-summary-compact");
      const text = compact?.textContent || "";
      return Boolean(compact && /firstParty \\/ api_key/i.test(text) && /Sonnet 4\\.5/i.test(text) && /claude-code-app/i.test(text));
    })();
  `, 15000));

  assertStep("PASS20_COMPOSER_HIERARCHY", await win.webContents.executeJavaScript(`
    (function() {
      const box = document.querySelector(".prompt-box");
      const actions = box?.querySelector(".prompt-actions");
      const textarea = box?.querySelector("textarea");
      const project = box?.querySelector(".project-pill");
      const permissions = box?.querySelector(".permissions-pill");
      const model = box?.querySelector(".model-pill");
      const send = box?.querySelector(".send-button");
      const forbiddenVoice = box?.querySelector("[title*='Voice'], [aria-label*='Voice'], [title*='语音'], [aria-label*='语音']");
      if (!box || !actions || !textarea || !project || !permissions || !model || !send || forbiddenVoice) return false;
      const boxRect = box.getBoundingClientRect();
      const actionRect = actions.getBoundingClientRect();
      const controlRects = [project, permissions, model, send].map((item) => item.getBoundingClientRect());
      const controlsFit = controlRects.every((rect) =>
        rect.width > 24 &&
        rect.left >= boxRect.left - 1 &&
        rect.right <= boxRect.right + 1 &&
        rect.top >= boxRect.top - 1 &&
        rect.bottom <= boxRect.bottom + 1
      );
      return Boolean(
        textarea.placeholder &&
        /claude-code-app/i.test(project.textContent || "") &&
        /Default(?: permissions)?/i.test(permissions.textContent || "") &&
        /Claude Code/i.test(model.textContent || "") &&
        /Sonnet 4\\.5/i.test(model.textContent || "") &&
        send.disabled === true &&
        actionRect.bottom <= boxRect.bottom + 1 &&
        controlsFit
      );
    })();
  `));

  await shot(win, "39-pass20-composer-calm-source.png");

  assertStep("PASS20_CAPABILITIES_STILL_OPENS", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector(".prompt-box .permissions-pill");
      if (!button) return false;
      button.click();
      return true;
    })();
  `));

  assertStep("PASS20_CAPABILITIES_MODAL_READY", await waitFor(win, `
    (function() {
      const modal = document.querySelector(".capability-modal");
      const text = modal?.textContent || "";
      const search = modal?.querySelector("input");
      return Boolean(modal && search && /Plugins, skills, tools/i.test(text) && /Project context/i.test(text));
    })();
  `, 5000));

  console.log("PASS20_COMPOSER_CALM_DONE");
  app.exit(0);
}).catch((error) => {
  console.error("PASS20_COMPOSER_CALM_FAILED", error?.stack || error);
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS20_COMPOSER_CALM_TIMEOUT");
  app.exit(1);
}, 60000);
