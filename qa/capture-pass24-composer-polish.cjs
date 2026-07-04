const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const PROJECT_PATH = path.join(__dirname, "..");
const AUDIT_DIR = path.join(PROJECT_PATH, "docs", "uiux-audit-2026-07-04-live");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass24-composer-"));

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
  await win.webContents.executeJavaScript("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  await wait(250);
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
    console.error("PASS24_FAILED_NO_WINDOW");
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(500);

  assertStep("PASS24_READY_SONNET45", await waitFor(win, `
    /claude-sonnet-4-5-20250929/i.test(document.body.textContent || "") &&
    !/claude-sonnet-5|sonnet-5/i.test(document.body.textContent || "")
  `, 15000));

  assertStep("PASS24_COMPOSER_POLISHED", await waitFor(win, `
    (function() {
      const grid = document.querySelector(".app-grid");
      const box = document.querySelector(".empty-state .prompt-box");
      const textarea = box?.querySelector("textarea");
      const project = box?.querySelector(".project-pill");
      const permissions = box?.querySelector(".permissions-pill");
      const model = box?.querySelector(".model-pill");
      const send = box?.querySelector(".send-button");
      const staleMeta = document.querySelector(".empty-state-meta");
      if (!grid || !box || !textarea || !project || !permissions || !model || !send || staleMeta) return false;
      const boxRect = box.getBoundingClientRect();
      const permissionRect = permissions.getBoundingClientRect();
      const text = document.body.textContent || "";
      return Boolean(
        grid.classList.contains("right-panel-hidden") &&
        /claude-code-app/i.test(project.textContent || "") &&
        /^Default$/i.test((permissions.textContent || "").replace(/\\s+/g, " ").trim()) &&
        permissionRect.width <= 150 &&
        /Claude Code/i.test(model.textContent || "") &&
        /Sonnet 4\\.5/i.test(model.textContent || "") &&
        boxRect.width > 560 &&
        send.disabled === true &&
        !/claude-code-app\\s*•\\s*Claude Code\\s*•\\s*Sonnet 4\\.5/i.test(text)
      );
    })();
  `, 8000));

  await shot(win, "54-pass24-composer-polish-source.png");

  assertStep("PASS24_PERMISSIONS_STILL_OPENS", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector(".prompt-box .permissions-pill");
      if (!button) return false;
      button.click();
      return true;
    })();
  `));

  assertStep("PASS24_CAPABILITIES_MODAL_READY", await waitFor(win, `
    (function() {
      const modal = document.querySelector(".capability-modal");
      const text = modal?.textContent || "";
      return Boolean(modal && /Plugins, skills, tools/i.test(text) && /Project context/i.test(text));
    })();
  `, 5000));

  console.log("PASS24_COMPOSER_POLISH_DONE");
  app.exit(0);
}).catch((error) => {
  console.error("PASS24_COMPOSER_POLISH_FAILED", error?.stack || error);
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS24_COMPOSER_POLISH_TIMEOUT");
  app.exit(1);
}, 60000);
