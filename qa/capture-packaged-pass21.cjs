const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const PROJECT_PATH = path.join(__dirname, "..");
const EXE_PATH = path.join(PROJECT_PATH, "release-pass21", "win-unpacked", "Claudex.exe");
const AUDIT_DIR = path.join(PROJECT_PATH, "docs", "uiux-audit-2026-07-04-live");
const PORT = 9870 + Math.floor(Math.random() * 500);
const SCRATCH_NAME = "_qa_pass21_packaged_review_gate.txt";
const SCRATCH_PATH = path.join(PROJECT_PATH, SCRATCH_NAME);
const ORIGINAL_CONTENT = "pass21 packaged review gate baseline\n";
const EDITED_CONTENT = `${ORIGINAL_CONTENT}reviewed packaged change\n`;

function cleanup() {
  try {
    fs.unlinkSync(SCRATCH_PATH);
  } catch (_error) {
    // already gone
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, timeoutMs = 15000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }
    await wait(200);
  }
  throw lastError || new Error(`Timed out fetching ${url}`);
}

function connectCdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();

  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
      else resolve(message.result);
    }
  });

  return new Promise((resolve, reject) => {
    ws.addEventListener("open", () => {
      resolve({
        send(method, params = {}) {
          const id = nextId++;
          ws.send(JSON.stringify({ id, method, params }));
          return new Promise((sendResolve, sendReject) => {
            pending.set(id, { resolve: sendResolve, reject: sendReject });
          });
        },
        close() {
          ws.close();
        },
      });
    });
    ws.addEventListener("error", reject, { once: true });
  });
}

async function evalInPage(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
  }
  return result.result.value;
}

async function waitForEval(cdp, expression, timeoutMs = 10000) {
  const startedAt = Date.now();
  let value = false;
  while (Date.now() - startedAt < timeoutMs) {
    value = await evalInPage(cdp, expression);
    if (value) return value;
    await wait(200);
  }
  return value;
}

function assertStep(name, ok) {
  console.log(name, ok);
  if (!ok) throw new Error(`${name} failed`);
}

async function capture(cdp, name) {
  await evalInPage(cdp, "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  await wait(250);
  const screenshot = await cdp.send("Page.captureScreenshot", { format: "png" });
  const outPath = path.join(AUDIT_DIR, name);
  fs.writeFileSync(outPath, Buffer.from(screenshot.data, "base64"));
  console.log("CAPTURED", outPath);
}

function seedStore(userDataDir) {
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(
    path.join(userDataDir, "desktop-data.json"),
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
}

async function main() {
  if (!fs.existsSync(EXE_PATH)) throw new Error(`Missing packaged exe: ${EXE_PATH}`);
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
  fs.writeFileSync(SCRATCH_PATH, ORIGINAL_CONTENT, "utf8");

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass21-packaged-"));
  seedStore(userDataDir);

  const child = spawn(
    EXE_PATH,
    [
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${userDataDir}`,
      "--disable-gpu",
    ],
    {
      cwd: path.dirname(EXE_PATH),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );

  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));

  let cdp;
  try {
    const targets = await fetchJson(`http://127.0.0.1:${PORT}/json/list`, 20000);
    const pageTarget = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
    if (!pageTarget) throw new Error("No debuggable page target found");
    cdp = await connectCdp(pageTarget.webSocketDebuggerUrl);
    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");

    try {
      const { windowId } = await cdp.send("Browser.getWindowForTarget");
      await cdp.send("Browser.setWindowBounds", {
        windowId,
        bounds: { left: 0, top: 0, width: 1480, height: 960, windowState: "normal" },
      });
      await wait(500);
    } catch (error) {
      console.warn("PACKAGED_PASS21_WINDOW_BOUNDS_SKIPPED", error?.message || error);
    }

    await waitForEval(cdp, "document.readyState === 'complete'", 15000);
    assertStep("PACKAGED_PASS21_READY_SONNET45", await waitForEval(cdp, `
      /claude-sonnet-4-5-20250929/i.test(document.body?.textContent || "") &&
      !/claude-sonnet-5|sonnet-5/i.test(document.body?.textContent || "")
    `, 15000));

    assertStep("PACKAGED_PASS21_CONTEXT_STABLE", await waitForEval(cdp, `
      (function() {
        const compact = document.querySelector(".context-summary-compact");
        const text = compact?.textContent || "";
        return Boolean(compact && /firstParty \\/ api_key/i.test(text) && /Sonnet 4\\.5/i.test(text) && /claude-code-app/i.test(text));
      })();
    `, 15000));

    assertStep("PACKAGED_PASS21_OPEN_WORKSPACE", await evalInPage(cdp, `
      (function() {
        const button = Array.from(document.querySelectorAll("button.tool-row")).find((item) => /Workspace/i.test(item.textContent || ""));
        if (!button) return false;
        button.click();
        return true;
      })();
    `));

    assertStep("PACKAGED_PASS21_SCRATCH_VISIBLE", await waitForEval(cdp, `
      Array.from(document.querySelectorAll(".file-tree .tree-item")).some((item) => item.textContent.includes(${JSON.stringify(SCRATCH_NAME)}))
    `, 15000));

    assertStep("PACKAGED_PASS21_OPEN_SCRATCH", await evalInPage(cdp, `
      (function() {
        const item = Array.from(document.querySelectorAll(".file-tree .tree-item")).find((row) => row.textContent.includes(${JSON.stringify(SCRATCH_NAME)}));
        if (!item) return false;
        item.click();
        return true;
      })();
    `));

    assertStep("PACKAGED_PASS21_FILE_OPEN", await waitForEval(cdp, `
      document.querySelector(".file-editor textarea")?.value === ${JSON.stringify(ORIGINAL_CONTENT)}
    `, 8000));

    assertStep("PACKAGED_PASS21_EDIT_FILE", await evalInPage(cdp, `
      (function() {
        const ta = document.querySelector(".file-editor textarea");
        if (!ta) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
        setter.call(ta, ${JSON.stringify(EDITED_CONTENT)});
        ta.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      })();
    `));

    assertStep("PACKAGED_PASS21_SAVE_LOCKED_BEFORE_REVIEW", await waitForEval(cdp, `
      (function() {
        const bar = document.querySelector(".editor-change-bar.needs-review");
        const text = bar?.textContent || "";
        const buttons = Array.from(bar?.querySelectorAll("button") || []);
        const review = buttons.find((button) => /^Review$/i.test((button.textContent || "").trim()));
        const save = buttons.find((button) => /^Save$/i.test((button.textContent || "").trim()));
        return Boolean(
          bar &&
          /Review required/i.test(text) &&
          /Open Review/i.test(text) &&
          review &&
          !review.disabled &&
          save &&
          save.disabled
        );
      })();
    `, 8000));

    await capture(cdp, "44-pass21-packaged-workspace-review-gate.png");

    assertStep("PACKAGED_PASS21_CLICK_REVIEW", await evalInPage(cdp, `
      (function() {
        const button = Array.from(document.querySelectorAll(".editor-change-bar button")).find((item) => /^Review$/i.test((item.textContent || "").trim()));
        if (!button) return false;
        button.click();
        return true;
      })();
    `));

    assertStep("PACKAGED_PASS21_REVIEW_READY_TO_SAVE", await waitForEval(cdp, `
      (function() {
        const pane = document.querySelector(".editor-review-pane");
        const bar = document.querySelector(".editor-change-bar");
        const text = bar?.textContent || "";
        const save = Array.from(bar?.querySelectorAll("button") || []).find((button) => /^Save$/i.test((button.textContent || "").trim()));
        const rows = Array.from(pane?.querySelectorAll(".diff-row") || []);
        return Boolean(
          pane &&
          !bar.classList.contains("needs-review") &&
          /Ready to save/i.test(text) &&
          /\\+\\d+ -\\d+/i.test(text) &&
          save &&
          !save.disabled &&
          rows.some((row) => row.classList.contains("add") && /reviewed packaged change/.test(row.textContent || ""))
        );
      })();
    `, 8000));

    await capture(cdp, "45-pass21-packaged-workspace-review-ready.png");

    assertStep("PACKAGED_PASS21_SAVE_AFTER_REVIEW", await evalInPage(cdp, `
      (function() {
        const button = Array.from(document.querySelectorAll(".editor-change-bar button")).find((item) => /^Save$/i.test((item.textContent || "").trim()) && !item.disabled);
        if (!button) return false;
        button.click();
        return true;
      })();
    `));

    assertStep("PACKAGED_PASS21_SAVED_AFTER_REVIEW", await waitForEval(cdp, `
      /Changes saved/i.test(document.querySelector(".editor-change-bar")?.textContent || "")
    `, 8000));

    assertStep("PACKAGED_PASS21_DISK_CONTENT_UPDATED", fs.readFileSync(SCRATCH_PATH, "utf8") === EDITED_CONTENT);

    console.log("PACKAGED_PASS21_DONE");
  } finally {
    if (cdp) cdp.close();
    child.kill();
    cleanup();
  }
}

main().catch((error) => {
  console.error("PACKAGED_PASS21_FAILED", error.stack || error);
  cleanup();
  process.exit(1);
});
