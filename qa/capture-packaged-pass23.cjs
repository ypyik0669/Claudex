const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const PROJECT_PATH = path.join(__dirname, "..");
const EXE_PATH = path.join(PROJECT_PATH, "release-pass23", "win-unpacked", "Claudex.exe");
const AUDIT_DIR = path.join(PROJECT_PATH, "docs", "uiux-audit-2026-07-04-live");
const PORT = 10420 + Math.floor(Math.random() * 500);

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

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass23-packaged-"));
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
      console.warn("PACKAGED_PASS23_WINDOW_BOUNDS_SKIPPED", error?.message || error);
    }

    await waitForEval(cdp, "document.readyState === 'complete'", 15000);
    assertStep("PACKAGED_PASS23_READY_SONNET45", await waitForEval(cdp, `
      /claude-sonnet-4-5-20250929/i.test(document.body?.textContent || "") &&
      !/claude-sonnet-5|sonnet-5/i.test(document.body?.textContent || "")
    `, 15000));

    assertStep("PACKAGED_PASS23_DEFAULT_MAIN_FOCUS", await waitForEval(cdp, `
      (function() {
        const grid = document.querySelector(".app-grid");
        const panel = document.querySelector(".tools-panel");
        const toggle = document.querySelector(".workspace-panel-toggle");
        const prompt = document.querySelector(".empty-state .prompt-box");
        const emptyLabel = document.querySelector(".empty-state-copy > span");
        const h1 = document.querySelector(".empty-state h1");
        if (!grid || !panel || !toggle || !prompt || !h1 || emptyLabel) return false;
        const panelStyle = getComputedStyle(panel);
        const toggleRect = toggle.getBoundingClientRect();
        const promptRect = prompt.getBoundingClientRect();
        const workspaceRect = document.querySelector(".workspace").getBoundingClientRect();
        const promptCenter = promptRect.left + promptRect.width / 2;
        const workspaceCenter = workspaceRect.left + workspaceRect.width / 2;
        return Boolean(
          grid.classList.contains("right-panel-hidden") &&
          panelStyle.display === "none" &&
          toggleRect.width > 60 &&
          /Tools/i.test(toggle.textContent || "") &&
          /What should we work on/i.test(h1.textContent || "") &&
          Math.abs(promptCenter - workspaceCenter) < 48
        );
      })();
    `, 8000));

    await capture(cdp, "52-pass23-main-focus-packaged.png");

    assertStep("PACKAGED_PASS23_OPEN_TOOLS", await evalInPage(cdp, `
      (function() {
        const toggle = document.querySelector(".workspace-panel-toggle");
        if (!toggle) return false;
        toggle.click();
        return true;
      })();
    `));

    assertStep("PACKAGED_PASS23_TOOLS_VISIBLE", await waitForEval(cdp, `
      (function() {
        const grid = document.querySelector(".app-grid");
        const panel = document.querySelector(".tools-panel");
        const panelStyle = panel ? getComputedStyle(panel) : null;
        const title = panel?.querySelector(".panel-toggle > span");
        const context = panel?.querySelector(".context-summary");
        const text = panel?.textContent || "";
        return Boolean(
          grid &&
          panel &&
          panelStyle.display !== "none" &&
          !grid.classList.contains("right-panel-hidden") &&
          title &&
          /Tools/i.test(title.textContent || "") &&
          context &&
          /Ready for work/i.test(text) &&
          /Workspace/i.test(text) &&
          /Claude Code/i.test(text)
        );
      })();
    `, 8000));

    await capture(cdp, "53-pass23-tools-open-packaged.png");

    console.log("PACKAGED_PASS23_DONE");
  } finally {
    if (cdp) cdp.close();
    child.kill();
  }
}

main().catch((error) => {
  console.error("PACKAGED_PASS23_FAILED", error.stack || error);
  process.exit(1);
});
