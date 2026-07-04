const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const PROJECT_PATH = path.join(__dirname, "..");
const AUDIT_DIR = path.join(PROJECT_PATH, "docs", "uiux-audit-2026-07-04-live");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass25-sidebar-"));

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
    console.error("PASS25_FAILED_NO_WINDOW");
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(500);

  assertStep("PASS25_READY_SONNET45", await waitFor(win, `
    /claude-sonnet-4-5-20250929/i.test(document.body.textContent || "") &&
    !/claude-sonnet-5|sonnet-5/i.test(document.body.textContent || "")
  `, 15000));

  assertStep("PASS25_SIDEBAR_CALM", await waitFor(win, `
    (function() {
      const sidebar = document.querySelector(".sidebar");
      const nav = document.querySelector(".nav-stack");
      const utilities = document.querySelector(".sidebar-utilities");
      const draft = document.querySelector(".thread-item.draft-thread");
      const account = document.querySelector(".account-row");
      const avatar = account?.querySelector(".account-avatar");
      const navText = (nav?.textContent || "").replace(/\\s+/g, " ").trim();
      const utilityButtons = [...(utilities?.querySelectorAll("button") || [])];
      const accountRect = account?.getBoundingClientRect();
      const avatarRect = avatar?.getBoundingClientRect();
      const draftText = (draft?.textContent || "").replace(/\\s+/g, " ").trim();
      return Boolean(
        sidebar &&
        nav &&
        utilities &&
        draft &&
        account &&
        /New chat/i.test(navText) &&
        !/Automations|Plugins/i.test(navText) &&
        utilityButtons.length === 2 &&
        utilityButtons.some((button) => /Automations/i.test(button.getAttribute("aria-label") || "")) &&
        utilityButtons.some((button) => /Plugins, skills, tools/i.test(button.getAttribute("aria-label") || "")) &&
        !draft.querySelector(".thread-subtitle") &&
        !draft.querySelector("time") &&
        /^New chat\\s*Draft$/i.test(draftText) &&
        accountRect.height <= 54 &&
        avatarRect.width <= 28 &&
        avatarRect.height <= 28
      );
    })();
  `, 8000));

  await shot(win, "56-pass25-sidebar-calm-source.png");

  assertStep("PASS25_AUTOMATIONS_UTILITY_OPENS", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll(".sidebar-utilities button")]
        .find((candidate) => /Automations/i.test(candidate.getAttribute("aria-label") || ""));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));

  assertStep("PASS25_AUTOMATIONS_MODAL_READY", await waitFor(win, `
    Boolean(document.querySelector(".scheduled-modal") && /Scheduled prompts/i.test(document.body.textContent || ""))
  `, 5000));

  assertStep("PASS25_CLOSE_AUTOMATIONS", await win.webContents.executeJavaScript(`
    (function() {
      const close = document.querySelector(".scheduled-modal .icon-only");
      if (!close) return false;
      close.click();
      return true;
    })();
  `));

  assertStep("PASS25_CAPABILITIES_UTILITY_OPENS", await waitFor(win, `
    !document.querySelector(".scheduled-modal")
  `, 3000) && await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll(".sidebar-utilities button")]
        .find((candidate) => /Plugins, skills, tools/i.test(candidate.getAttribute("aria-label") || ""));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));

  assertStep("PASS25_CAPABILITIES_MODAL_READY", await waitFor(win, `
    Boolean(document.querySelector(".capability-modal") && /Plugins, skills, tools/i.test(document.body.textContent || ""))
  `, 5000));

  console.log("PASS25_SIDEBAR_CALM_DONE");
  app.exit(0);
}).catch((error) => {
  console.error("PASS25_SIDEBAR_CALM_FAILED", error?.stack || error);
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS25_SIDEBAR_CALM_TIMEOUT");
  app.exit(1);
}, 60000);
