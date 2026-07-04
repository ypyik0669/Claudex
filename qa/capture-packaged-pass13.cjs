const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const PROJECT_PATH = path.join(__dirname, "..");
const EXE_PATH = path.join(PROJECT_PATH, "release-pass13", "win-unpacked", "Claudex.exe");
const AUDIT_DIR = path.join(PROJECT_PATH, "docs", "uiux-audit-2026-07-04-live");
const PORT = 9323 + Math.floor(Math.random() * 500);

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

function assertStep(name, ok) {
  console.log(name, ok);
  if (!ok) throw new Error(`${name} failed`);
}

async function main() {
  if (!fs.existsSync(EXE_PATH)) throw new Error(`Missing packaged exe: ${EXE_PATH}`);
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass13-"));
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
      const windowInfo = await cdp.send("Browser.getWindowForTarget", { targetId: pageTarget.id });
      await cdp.send("Browser.setWindowBounds", {
        windowId: windowInfo.windowId,
        bounds: { left: 0, top: 0, width: 1480, height: 960, windowState: "normal" },
      });
    } catch (error) {
      console.log("WINDOW_BOUNDS_SKIPPED", error.message);
    }

    await waitForEval(cdp, "document.readyState === 'complete'", 15000);
    await evalInPage(cdp, `
      window.claudexDesktop.setActiveProject(${JSON.stringify({ name: "claude-code-app", path: PROJECT_PATH })});
    `);
    await evalInPage(cdp, "location.reload(); true");
    await waitForEval(cdp, "document.readyState === 'complete'", 15000);

    assertStep("PACKAGED_CONTEXT_READY", await waitForEval(cdp, `
      (function() {
        const text = document.body?.textContent || "";
        return /Ready for work|已准备/i.test(text) &&
          /claude-sonnet-4-5-20250929/i.test(text) &&
          !/claude-sonnet-5|sonnet-5/i.test(text);
      })();
    `, 15000));

    assertStep("PACKAGED_EMPTY_STATE", await evalInPage(cdp, `
      (function() {
        const empty = document.querySelector(".empty-state");
        const text = empty?.textContent || "";
        return Boolean(empty && /What should we work on\\?|今天要做什么/.test(text) && /Sonnet 4\\.5/.test(text));
      })();
    `));

    assertStep("PACKAGED_CLAUDE_DEFAULT_EMPTY", await evalInPage(cdp, `
      (function() {
        const detail = document.querySelector("#claude-tool-detail");
        const input = detail?.querySelector("input");
        const button = Array.from(detail?.querySelectorAll("button") || []).find((item) => /Run Claude|运行 Claude/i.test(item.textContent || ""));
        return Boolean(detail && input && input.value === "" && button?.disabled);
      })();
    `));

    assertStep("PACKAGED_OPEN_WORKSPACE", await evalInPage(cdp, `
      (function() {
        const button = Array.from(document.querySelectorAll("button.tool-row")).find((item) => /Workspace|工作区/i.test(item.textContent || ""));
        if (!button) return false;
        button.click();
        return true;
      })();
    `));

    assertStep("PACKAGED_WORKSPACE_TREE", await waitForEval(cdp, `
      (function() {
        const detail = document.querySelector("#workspace-tool-detail");
        const text = detail?.textContent || "";
        const input = detail?.querySelector(".command-runner input");
        const button = detail?.querySelector(".command-runner button");
        return Boolean(detail && /src/.test(text) && !/release-pass\\d+/i.test(text) && input && input.value === "" && button?.disabled);
      })();
    `, 10000));

    const metrics = await evalInPage(cdp, `
      (function() {
        const page = document.documentElement;
        const group = document.querySelector(".tool-group");
        const button = document.querySelector("#workspace-tool-detail .command-runner button");
        const groupRect = group?.getBoundingClientRect();
        const buttonRect = button?.getBoundingClientRect();
        const ok = Boolean(
          page.scrollWidth <= page.clientWidth + 1 &&
          group &&
          group.scrollWidth <= group.clientWidth + 1 &&
          button &&
          buttonRect.right <= groupRect.right + 1
        );
        return {
          ok,
          pageClientWidth: page.clientWidth,
          pageScrollWidth: page.scrollWidth,
          groupClientWidth: group?.clientWidth,
          groupScrollWidth: group?.scrollWidth,
          groupRight: groupRect?.right,
          buttonRight: buttonRect?.right
        };
      })();
    `);
    console.log("PACKAGED_RIGHT_PANEL_METRICS", JSON.stringify(metrics));
    assertStep("PACKAGED_NO_RIGHT_PANEL_OVERFLOW", metrics.ok);

    const screenshot = await cdp.send("Page.captureScreenshot", { format: "png" });
    const outPath = path.join(AUDIT_DIR, "20-pass13-packaged-workspace.png");
    fs.writeFileSync(outPath, Buffer.from(screenshot.data, "base64"));
    console.log("CAPTURED", outPath);
    console.log("PACKAGED_PASS13_DONE");
  } finally {
    if (cdp) cdp.close();
    child.kill();
  }
}

main().catch((error) => {
  console.error("PACKAGED_PASS13_FAILED", error.stack || error);
  process.exit(1);
});
