const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const PROJECT_PATH = path.join(__dirname, "..");
const EXE_PATH = path.join(PROJECT_PATH, "release-pass20", "win-unpacked", "Claudex.exe");
const AUDIT_DIR = path.join(PROJECT_PATH, "docs", "uiux-audit-2026-07-04-live");
const PORT = 9870 + Math.floor(Math.random() * 500);

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

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass20-packaged-"));
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
      console.warn("PACKAGED_PASS20_WINDOW_BOUNDS_SKIPPED", error?.message || error);
    }

    await waitForEval(cdp, "document.readyState === 'complete'", 15000);
    assertStep("PACKAGED_PASS20_READY_SONNET45", await waitForEval(cdp, `
      /claude-sonnet-4-5-20250929/i.test(document.body?.textContent || "") &&
      !/claude-sonnet-5|sonnet-5/i.test(document.body?.textContent || "")
    `, 15000));

    assertStep("PACKAGED_PASS20_CONTEXT_STABLE", await waitForEval(cdp, `
      (function() {
        const compact = document.querySelector(".context-summary-compact");
        const text = compact?.textContent || "";
        return Boolean(compact && /firstParty \\/ api_key/i.test(text) && /Sonnet 4\\.5/i.test(text) && /claude-code-app/i.test(text));
      })();
    `, 15000));

    assertStep("PACKAGED_PASS20_COMPOSER_HIERARCHY", await evalInPage(cdp, `
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
          /Default permissions/i.test(permissions.textContent || "") &&
          /Claude Code/i.test(model.textContent || "") &&
          /Sonnet 4\\.5/i.test(model.textContent || "") &&
          send.disabled === true &&
          actionRect.bottom <= boxRect.bottom + 1 &&
          controlsFit
        );
      })();
    `));

    await capture(cdp, "40-pass20-packaged-composer-calm.png");

    assertStep("PACKAGED_PASS20_CAPABILITIES_STILL_OPENS", await evalInPage(cdp, `
      (function() {
        const button = document.querySelector(".prompt-box .permissions-pill");
        if (!button) return false;
        button.click();
        return true;
      })();
    `));

    assertStep("PACKAGED_PASS20_CAPABILITIES_MODAL_READY", await waitForEval(cdp, `
      (function() {
        const modal = document.querySelector(".capability-modal");
        const text = modal?.textContent || "";
        const search = modal?.querySelector("input");
        return Boolean(modal && search && /Plugins, skills, tools/i.test(text) && /Project context/i.test(text));
      })();
    `, 5000));

    console.log("PACKAGED_PASS20_DONE");
  } finally {
    if (cdp) cdp.close();
    child.kill();
  }
}

main().catch((error) => {
  console.error("PACKAGED_PASS20_FAILED", error.stack || error);
  process.exit(1);
});
