const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const PROJECT_PATH = path.join(__dirname, "..");
const AUDIT_DIR = path.join(PROJECT_PATH, "docs", "uiux-audit-2026-07-04-live");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass16-chat-list-"));

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
          id: "empty-newest",
          title: "Claudex",
          project: "claude-code-app",
          projectPath: PROJECT_PATH,
          createdAt: "2026-07-04T03:07:35.345Z",
          updatedAt: "2026-07-04T03:07:35.345Z",
          messages: [],
        },
        {
          id: "empty-older",
          title: "Claudex",
          project: "claude-code-app",
          projectPath: PROJECT_PATH,
          createdAt: "2026-07-03T12:46:51.372Z",
          updatedAt: "2026-07-03T12:46:51.372Z",
          messages: [],
        },
        {
          id: "history-derived",
          title: "Claudex",
          project: "claude-code-app",
          projectPath: PROJECT_PATH,
          createdAt: "2026-07-02T10:00:00.000Z",
          updatedAt: "2026-07-02T10:05:00.000Z",
          messages: [
            { role: "user", content: "Refactor command runner UX so previous outputs remain visible", createdAt: "2026-07-02T10:00:00.000Z" },
            { role: "assistant", content: "Added a command history timeline.", createdAt: "2026-07-02T10:05:00.000Z" },
          ],
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
    console.error("PASS16_FAILED_NO_WINDOW");
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(500);

  assertStep("PASS16_READY", await waitFor(win, `
    document.readyState === "complete" &&
    /claude-sonnet-4-5-20250929/i.test(document.body.textContent || "") &&
    !/claude-sonnet-5|sonnet-5/i.test(document.body.textContent || "")
  `, 15000));

  assertStep("PASS16_DEDUPED_EMPTY_CLAUDEX_ROWS", await win.webContents.executeJavaScript(`
    (function() {
      const rows = Array.from(document.querySelectorAll(".thread-list .thread-item"));
      const labels = rows.map((row) => row.textContent || "");
      const threadListText = document.querySelector(".thread-list")?.textContent || "";
      return rows.length === 2 &&
        labels.some((text) => /New chat/.test(text) && /Draft/.test(text)) &&
        labels.some((text) => /Refactor command runner UX/.test(text) && /2 messages/.test(text)) &&
        !/Claudex/.test(threadListText);
    })();
  `));

  assertStep("PASS16_SEARCH_DERIVED_TITLE", await win.webContents.executeJavaScript(`
    (function() {
      const input = document.querySelector(".nav-search input");
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(input, "command runner UX");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      const rows = Array.from(document.querySelectorAll(".thread-list .thread-item"));
      return rows.length === 1 && /Refactor command runner UX/.test(rows[0].textContent || "");
    })();
  `));

  assertStep("PASS16_CLEAR_SEARCH", await win.webContents.executeJavaScript(`
    (function() {
      const input = document.querySelector(".nav-search input");
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(input, "");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return document.querySelectorAll(".thread-list .thread-item").length === 2;
    })();
  `));

  assertStep("PASS16_REUSE_EMPTY_DRAFT_ON_NEW_CHAT", await win.webContents.executeJavaScript(`
    (async function() {
      const newButton = document.querySelector(".nav-stack button");
      if (!newButton) return false;
      newButton.click();
      await new Promise((resolve) => setTimeout(resolve, 350));
      newButton.click();
      await new Promise((resolve) => setTimeout(resolve, 350));
      const rows = Array.from(document.querySelectorAll(".thread-list .thread-item"));
      const drafts = rows.filter((row) => /New chat/.test(row.textContent || "") && /Draft/.test(row.textContent || ""));
      return rows.length === 2 && drafts.length === 1;
    })();
  `));

  assertStep("PASS16_CONTEXT_READY_FOR_CAPTURE", await waitFor(win, `
    (function() {
      const text = document.querySelector(".context-summary")?.textContent || "";
      return /Ready for work|可以开始工作/i.test(text) && !/Loading|加载中/i.test(text);
    })();
  `, 20000));

  await wait(350);
  await shot(win, "31-pass16-chat-list-source.png");

  console.log("PASS16_CHAT_LIST_DONE");
  app.exit(0);
}).catch((error) => {
  console.error("PASS16_CHAT_LIST_FAILED", error?.stack || error);
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS16_CHAT_LIST_TIMEOUT");
  app.exit(1);
}, 60000);
