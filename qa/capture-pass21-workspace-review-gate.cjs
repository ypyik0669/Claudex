const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const PROJECT_PATH = path.join(__dirname, "..");
const AUDIT_DIR = path.join(PROJECT_PATH, "docs", "uiux-audit-2026-07-04-live");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass21-workspace-"));
const SCRATCH_NAME = "_qa_pass21_review_gate.txt";
const SCRATCH_PATH = path.join(PROJECT_PATH, SCRATCH_NAME);
const ORIGINAL_CONTENT = "pass21 review gate baseline\n";
const EDITED_CONTENT = `${ORIGINAL_CONTENT}reviewed change\n`;

app.setPath("userData", USER_DATA_DIR);

function cleanup() {
  try {
    fs.unlinkSync(SCRATCH_PATH);
  } catch (_error) {
    // already gone
  }
}

fs.writeFileSync(SCRATCH_PATH, ORIGINAL_CONTENT, "utf8");
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
  await win.webContents.executeJavaScript(`
    new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  `);
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
    console.error("PASS21_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(500);

  assertStep("PASS21_READY_MODEL", await waitFor(win, `
    Boolean(document.querySelector(".model-pill strong")?.textContent?.trim()) &&
    !/claude-sonnet-5|sonnet-5/i.test(document.body.textContent || "")
  `, 15000));

  assertStep("PASS21_CONTEXT_STABLE", await waitFor(win, `
    (function() {
      const compact = document.querySelector(".context-summary-compact");
      const text = compact?.textContent || "";
      return Boolean(compact && /claude-code-app/i.test(text));
    })();
  `, 15000));

  assertStep("PASS21_OPEN_WORKSPACE", await win.webContents.executeJavaScript(`
    (function() {
      const button = Array.from(document.querySelectorAll("button.tool-row")).find((item) => /Workspace|工作区/i.test(item.textContent || ""));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));

  assertStep("PASS21_SCRATCH_VISIBLE", await waitFor(win, `
    Array.from(document.querySelectorAll(".file-tree .tree-item")).some((item) => item.textContent.includes(${JSON.stringify(SCRATCH_NAME)}))
  `, 15000));

  assertStep("PASS21_OPEN_SCRATCH", await win.webContents.executeJavaScript(`
    (function() {
      const item = Array.from(document.querySelectorAll(".file-tree .tree-item")).find((row) => row.textContent.includes(${JSON.stringify(SCRATCH_NAME)}));
      if (!item) return false;
      item.click();
      return true;
    })();
  `));

  assertStep("PASS21_FILE_OPEN", await waitFor(win, `
    document.querySelector(".file-editor textarea")?.value === ${JSON.stringify(ORIGINAL_CONTENT)}
  `, 8000));

  assertStep("PASS21_EDIT_FILE", await win.webContents.executeJavaScript(`
    (function() {
      const ta = document.querySelector(".file-editor textarea");
      if (!ta) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
      setter.call(ta, ${JSON.stringify(EDITED_CONTENT)});
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })();
  `));

  assertStep("PASS21_SAVE_LOCKED_BEFORE_REVIEW", await waitFor(win, `
    (function() {
      const bar = document.querySelector(".editor-change-bar.needs-review");
      const text = bar?.textContent || "";
      const buttons = Array.from(bar?.querySelectorAll("button") || []);
      const review = buttons.find((button) => /^(Review|审查)$/i.test((button.textContent || "").trim()));
      const save = buttons.find((button) => /^(Save|保存)$/i.test((button.textContent || "").trim()));
      return Boolean(
        bar &&
        /Review required|需要先审查/i.test(text) &&
        /Open Review|审查视图|查看改动/i.test(text) &&
        review &&
        !review.disabled &&
        save &&
        save.disabled
      );
    })();
  `, 8000));

  await shot(win, "41-pass21-workspace-review-gate-source.png");

  assertStep("PASS21_CLICK_REVIEW", await win.webContents.executeJavaScript(`
    (function() {
      const button = Array.from(document.querySelectorAll(".editor-change-bar button")).find((item) => /^(Review|审查)$/i.test((item.textContent || "").trim()));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));

  const reviewReady = await waitFor(win, `
    (function() {
      const pane = document.querySelector(".editor-review-pane");
      const bar = document.querySelector(".editor-change-bar");
      const text = bar?.textContent || "";
      const save = Array.from(bar?.querySelectorAll("button") || []).find((button) => /^(Save|保存)$/i.test((button.textContent || "").trim()));
      const rows = Array.from(pane?.querySelectorAll(".diff-row") || []);
      return Boolean(
        pane &&
        !bar.classList.contains("needs-review") &&
        /Ready to save|可以保存/i.test(text) &&
        /\\+\\d+ -\\d+/i.test(text) &&
        save &&
        !save.disabled &&
        rows.some((row) => row.classList.contains("add") && /reviewed change/.test(row.textContent || ""))
      );
    })();
  `, 8000);
  if (!reviewReady) {
    console.log("PASS21_REVIEW_DEBUG", await win.webContents.executeJavaScript(`
      (function() {
        const pane = document.querySelector(".editor-review-pane");
        const bar = document.querySelector(".editor-change-bar");
        return {
          hasPane: Boolean(pane),
          barClass: bar?.className || "",
          barText: bar?.textContent || "",
          buttons: Array.from(bar?.querySelectorAll("button") || []).map((button) => ({
            text: (button.textContent || "").trim(),
            disabled: button.disabled,
            title: button.title,
          })),
          rows: Array.from(pane?.querySelectorAll(".diff-row") || []).map((row) => ({
            className: row.className,
            text: row.textContent,
          })).slice(0, 10),
        };
      })();
    `));
  }
  assertStep("PASS21_REVIEW_READY_TO_SAVE", reviewReady);

  await shot(win, "42-pass21-workspace-review-ready-source.png");

  assertStep("PASS21_SAVE_AFTER_REVIEW", await win.webContents.executeJavaScript(`
    (function() {
      const button = Array.from(document.querySelectorAll(".editor-change-bar button")).find((item) => /^(Save|保存)$/i.test((item.textContent || "").trim()) && !item.disabled);
      if (!button) return false;
      button.click();
      return true;
    })();
  `));

  assertStep("PASS21_SAVED_AFTER_REVIEW", await waitFor(win, `
    /Changes saved|改动已保存/i.test(document.querySelector(".editor-change-bar")?.textContent || "")
  `, 8000));

  assertStep("PASS21_DISK_CONTENT_UPDATED", fs.readFileSync(SCRATCH_PATH, "utf8") === EDITED_CONTENT);

  await shot(win, "43-pass21-workspace-review-saved-source.png");

  console.log("PASS21_WORKSPACE_REVIEW_GATE_DONE");
  cleanup();
  app.exit(0);
}).catch((error) => {
  console.error("PASS21_WORKSPACE_REVIEW_GATE_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS21_WORKSPACE_REVIEW_GATE_TIMEOUT");
  cleanup();
  app.exit(1);
}, 60000);
