const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const PROJECT_PATH = path.join(__dirname, "..");
const EXE_PATH = path.join(PROJECT_PATH, "release-pass15", "win-unpacked", "Claudex.exe");
const AUDIT_DIR = path.join(PROJECT_PATH, "docs", "uiux-audit-2026-07-04-live");
const PORT = 9523 + Math.floor(Math.random() * 500);

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

async function main() {
  if (!fs.existsSync(EXE_PATH)) throw new Error(`Missing packaged exe: ${EXE_PATH}`);
  fs.mkdirSync(AUDIT_DIR, { recursive: true });

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass15-"));
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

    await waitForEval(cdp, "document.readyState === 'complete'", 15000);
    await evalInPage(cdp, `
      window.claudexDesktop.setActiveProject(${JSON.stringify({ name: "claude-code-app", path: PROJECT_PATH })});
    `);
    await evalInPage(cdp, "location.reload(); true");
    await waitForEval(cdp, "document.readyState === 'complete'", 15000);

    assertStep("PACKAGED_PASS15_SONNET45_ONLY", await waitForEval(cdp, `
      (function() {
        const text = document.body?.textContent || "";
        return /claude-sonnet-4-5-20250929/i.test(text) &&
          !/claude-sonnet-5|sonnet-5/i.test(text);
      })();
    `, 15000));

    assertStep("PACKAGED_PASS15_CONTEXT_READY", await waitForEval(cdp, `
      (function() {
        const text = document.querySelector(".context-summary")?.textContent || "";
        return /Ready for work|可以开始工作/i.test(text) && !/Loading|加载中/i.test(text);
      })();
    `, 15000));

    assertStep("PACKAGED_PASS15_CLAUDE_OPEN", await evalInPage(cdp, `
      (function() {
        if (document.querySelector("#claude-tool-detail")) return true;
        const button = Array.from(document.querySelectorAll("button.tool-row")).find((item) => /Claude Code/i.test(item.textContent || ""));
        if (!button) return false;
        button.click();
        return true;
      })();
    `));
    assertStep("PACKAGED_PASS15_CLAUDE_AUTH", await waitForEval(cdp, `
      (function() {
        const button = Array.from(document.querySelectorAll("#claude-tool-detail .quick-command-row button")).find((item) => item.title === "auth status");
        if (!button || button.disabled) return false;
        button.click();
        return true;
      })();
    `, 15000));
    assertStep("PACKAGED_PASS15_CLAUDE_HISTORY_FIRST", await waitForEval(cdp, `
      document.querySelectorAll("#claude-tool-detail .command-history .command-output-card").length >= 1
    `, 25000));
    assertStep("PACKAGED_PASS15_CLAUDE_MCP", await waitForEval(cdp, `
      (function() {
        const button = Array.from(document.querySelectorAll("#claude-tool-detail .quick-command-row button")).find((item) => item.title === "mcp list");
        if (!button || button.disabled) return false;
        button.click();
        return true;
      })();
    `, 15000));
    assertStep("PACKAGED_PASS15_CLAUDE_TIMELINE", await waitForEval(cdp, `
      (function() {
        const detail = document.querySelector("#claude-tool-detail");
        const text = detail?.textContent || "";
        const context = document.querySelector(".context-summary")?.textContent || "";
        return /Recent runs|最近运行/.test(text) &&
          detail.querySelectorAll(".command-history .command-output-card").length >= 1 &&
          detail.querySelectorAll(".command-history-item").length >= 1 &&
          /Ready for work|可以开始工作/i.test(context) &&
          !/Loading|加载中/i.test(context);
      })();
    `, 25000));
    await capture(cdp, "29-pass15-packaged-claude-command-history.png");

    assertStep("PACKAGED_PASS15_WORKSPACE_OPEN", await evalInPage(cdp, `
      (function() {
        const button = Array.from(document.querySelectorAll("button.tool-row")).find((item) => /Workspace|工作区/i.test(item.textContent || ""));
        if (!button) return false;
        button.click();
        return true;
      })();
    `));
    assertStep("PACKAGED_PASS15_WORKSPACE_READY", await waitForEval(cdp, `
      Boolean(document.querySelector("#workspace-tool-detail .command-runner input"))
    `, 15000));
    assertStep("PACKAGED_PASS15_WORKSPACE_FILL_1", await evalInPage(cdp, `
      (function() {
        const input = document.querySelector("#workspace-tool-detail .command-runner input");
        if (!input) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        setter.call(input, "node --version");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      })();
    `));
    await wait(200);
    assertStep("PACKAGED_PASS15_WORKSPACE_RUN_1", await evalInPage(cdp, `
      (function() {
        const button = document.querySelector("#workspace-tool-detail .command-runner button");
        if (!button || button.disabled) return false;
        button.click();
        return true;
      })();
    `));
    assertStep("PACKAGED_PASS15_WORKSPACE_HISTORY_FIRST", await waitForEval(cdp, `
      (function() {
        const done = document.querySelectorAll("#workspace-tool-detail .command-history .command-output-card.ok, #workspace-tool-detail .command-history .command-output-card.error").length >= 1;
        const button = document.querySelector("#workspace-tool-detail .command-runner button");
        return done && button && !button.disabled;
      })();
    `, 15000));
    assertStep("PACKAGED_PASS15_WORKSPACE_FILL_2", await evalInPage(cdp, `
      (function() {
        const input = document.querySelector("#workspace-tool-detail .command-runner input");
        if (!input) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        setter.call(input, "node -e \\"console.log('history-ok')\\"");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      })();
    `));
    await wait(200);
    assertStep("PACKAGED_PASS15_WORKSPACE_RUN_2", await evalInPage(cdp, `
      (function() {
        const button = document.querySelector("#workspace-tool-detail .command-runner button");
        if (!button || button.disabled) return false;
        button.click();
        return true;
      })();
    `));
    assertStep("PACKAGED_PASS15_WORKSPACE_TIMELINE", await waitForEval(cdp, `
      (function() {
        const detail = document.querySelector("#workspace-tool-detail");
        const text = detail?.textContent || "";
        return /Recent runs|最近运行/.test(text) &&
          detail.querySelectorAll(".command-history .command-output-card").length >= 1 &&
          detail.querySelectorAll(".command-history-item").length >= 1;
      })();
    `, 15000));
    await capture(cdp, "30-pass15-packaged-workspace-command-history.png");

    console.log("PACKAGED_PASS15_DONE");
  } finally {
    if (cdp) cdp.close();
    child.kill();
  }
}

main().catch((error) => {
  console.error("PACKAGED_PASS15_FAILED", error.stack || error);
  process.exit(1);
});
