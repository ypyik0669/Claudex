const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

function findRepoDir() {
  const candidates = [
    process.env.CLAUDEX_REPO_DIR,
    process.cwd(),
    __dirname,
    path.join(__dirname, ".."),
  ].filter(Boolean);
  for (const candidate of candidates) {
    let current = path.resolve(candidate);
    while (current && current !== path.dirname(current)) {
      if (
        fs.existsSync(path.join(current, "package.json")) &&
        fs.existsSync(path.join(current, "electron", "main.cjs"))
      ) {
        return current;
      }
      current = path.dirname(current);
    }
  }
  throw new Error("Unable to locate Claudex repo root");
}

const REPO_DIR = findRepoDir();
process.chdir(REPO_DIR);
const AUDIT_DIR = path.join(REPO_DIR, "docs", "uiux-audit-2026-07-04-live");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass21-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass21-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const SCRATCH_NAME = "_qa_pass21_review_gate.txt";
const SCRATCH_PATH = path.join(PROJECT_DIR, SCRATCH_NAME);
const ORIGINAL_CONTENT = "pass21 review gate baseline\n";
const EDITED_CONTENT = `${ORIGINAL_CONTENT}reviewed change\n`;

app.setPath("userData", USER_DATA_DIR);

function cleanup() {
  for (const dir of [USER_DATA_DIR, PROJECT_DIR]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_error) {
      // best-effort cleanup
    }
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

fs.mkdirSync(PROJECT_DIR, { recursive: true });
fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass21-review-project" }), "utf8");
fs.writeFileSync(SCRATCH_PATH, ORIGINAL_CONTENT, "utf8");
writeJson(DATA_FILE, {
  version: 1,
  settings: {
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    baseUrl: "https://api.example.invalid",
    temperature: 0.2,
    timeoutMs: 600000,
    language: "zh",
    appearance: { fontSize: "compact", density: "compact" },
    claudeCode: { executionMode: "claude-code", claudeCommand: "claude", permissionMode: "default" },
    capabilities: {
      "project-context": true,
      "terminal-helper": true,
      "mcp-runtime": true,
      "plugin-router": true,
      "marketplace-router": true,
    },
    customMarketplaces: [],
    apiKeys: {},
  },
  activeProject: { name: "pass21-review-project", path: PROJECT_DIR },
  projects: [{ name: "pass21-review-project", path: PROJECT_DIR }],
  sessions: [
    {
      id: "default",
      title: "Pass21 review gate",
      project: "pass21-review-project",
      projectPath: PROJECT_DIR,
      createdAt: "2026-07-04T05:00:00.000Z",
      updatedAt: "2026-07-04T05:00:00.000Z",
      messages: [],
    },
  ],
  automations: [],
  subagentRuns: [],
  commandRuns: [],
  runEvents: [],
  sourceRefs: [],
  browserVisits: [],
  notices: [],
});

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

  assertStep("PASS21_TEST_MODEL_HAIKU_45", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop?.getState?.();
      return state?.settings?.model === "claude-haiku-4-5-20251001" &&
        /haiku|claude-haiku-4-5-20251001/i.test(document.querySelector(".model-pill")?.textContent || document.body.textContent || "");
    })();
  `, 15000));

  assertStep("PASS21_CONTEXT_STABLE", await waitFor(win, `
    (function() {
      const compact = document.querySelector(".context-summary-compact");
      const text = compact?.textContent || "";
      return Boolean(compact && /pass21-review-project/i.test(text));
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

  assertStep("PASS21_DISK_UNCHANGED_BEFORE_REVIEW", fs.readFileSync(SCRATCH_PATH, "utf8") === ORIGINAL_CONTENT);
  assertStep("PASS21_NO_FILE_SAVE_EVENT_BEFORE_REVIEW", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      return !(state.runEvents || []).some((event) => event.type === "file-save");
    })();
  `));

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
