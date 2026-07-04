const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const PROJECT_PATH = path.join(__dirname, "..");
const EXE_PATH = path.join(PROJECT_PATH, "release-pass14", "win-unpacked", "Claudex.exe");
const AUDIT_DIR = path.join(PROJECT_PATH, "docs", "uiux-audit-2026-07-04-live");
const PORT = 9423 + Math.floor(Math.random() * 500);

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

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass14-"));
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

    assertStep("PACKAGED_PASS14_SONNET45_ONLY", await waitForEval(cdp, `
      (function() {
        const text = document.body?.textContent || "";
        return /Ready for work|已准备|可以开始工作/i.test(text) &&
          /claude-sonnet-4-5-20250929/i.test(text) &&
          !/claude-sonnet-5|sonnet-5/i.test(text);
      })();
    `, 15000));

    assertStep("PACKAGED_PASS14_SIDEBAR_DEDUPED", await evalInPage(cdp, `
      (function() {
        const text = document.querySelector(".project-list")?.textContent || "";
        return /claude-code-app/.test(text) && !/local workspace/i.test(text);
      })();
    `));
    await capture(cdp, "24-pass14-packaged-shell.png");

    assertStep("PACKAGED_PASS14_PROJECT_MODAL_OPEN", await evalInPage(cdp, `
      (function() {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", ctrlKey: true, bubbles: true }));
        return true;
      })();
    `));
    assertStep("PACKAGED_PASS14_PROJECT_MODAL_CLEAN", await waitForEval(cdp, `
      (function() {
        const modal = document.querySelector(".project-modal");
        const text = modal?.textContent || "";
        const current = modal?.querySelector(".project-current");
        return Boolean(modal && current && /claude-code-app/.test(text) && !/local workspace/i.test(text));
      })();
    `, 5000));
    await wait(350);
    await capture(cdp, "25-pass14-packaged-project-modal.png");

    await evalInPage(cdp, `document.querySelector(".project-modal .icon-only")?.click(); true;`);
    await wait(250);

    assertStep("PACKAGED_PASS14_SETTINGS_OPEN", await evalInPage(cdp, `
      (function() {
        const button = document.querySelector(".account-row button");
        if (!button) return false;
        button.click();
        return true;
      })();
    `));
    assertStep("PACKAGED_PASS14_SETTINGS_GROUPED", await waitForEval(cdp, `
      (function() {
        const modal = document.querySelector(".settings-modal:not(.shell-modal)");
        const text = modal?.textContent || "";
        const direct = Array.from(modal?.querySelectorAll(".settings-disclosure") || []).find((item) => /Direct API|直接 API/i.test(item.textContent || ""));
        const save = modal?.querySelector(".settings-footer .primary-action");
        return Boolean(
          modal &&
          modal.querySelector(".settings-layout") &&
          modal.querySelector(".settings-summary") &&
          /Runtime|运行环境/.test(text) &&
          /Prompting|提示词/.test(text) &&
          /Storage|存储/.test(text) &&
          direct &&
          !direct.open &&
          save?.disabled
        );
      })();
    `, 5000));

    const metrics = await evalInPage(cdp, `
      (function() {
        const page = document.documentElement;
        const modal = document.querySelector(".settings-modal:not(.shell-modal)");
        return {
          ok: Boolean(page.scrollWidth <= page.clientWidth + 1 && modal && modal.scrollWidth <= modal.clientWidth + 1),
          pageClientWidth: page.clientWidth,
          pageScrollWidth: page.scrollWidth,
          modalClientWidth: modal?.clientWidth,
          modalScrollWidth: modal?.scrollWidth
        };
      })();
    `);
    console.log("PACKAGED_PASS14_SETTINGS_METRICS", JSON.stringify(metrics));
    assertStep("PACKAGED_PASS14_SETTINGS_NO_OVERFLOW", metrics.ok);
    await wait(350);
    await capture(cdp, "26-pass14-packaged-settings-modal.png");

    console.log("PACKAGED_PASS14_DONE");
  } finally {
    if (cdp) cdp.close();
    child.kill();
  }
}

main().catch((error) => {
  console.error("PACKAGED_PASS14_FAILED", error.stack || error);
  process.exit(1);
});
