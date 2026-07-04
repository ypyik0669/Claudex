const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const PROJECT_PATH = path.join(__dirname, "..");
const EXE_PATH = path.join(PROJECT_PATH, "release-pass22", "win-unpacked", "Claudex.exe");
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

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass22-packaged-"));
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
      console.warn("PACKAGED_PASS22_WINDOW_BOUNDS_SKIPPED", error?.message || error);
    }

    await waitForEval(cdp, "document.readyState === 'complete'", 15000);
    assertStep("PACKAGED_PASS22_READY_SONNET45", await waitForEval(cdp, `
      /claude-sonnet-4-5-20250929/i.test(document.body?.textContent || "") &&
      !/claude-sonnet-5|sonnet-5/i.test(document.body?.textContent || "")
    `, 15000));

    assertStep("PACKAGED_PASS22_OPEN_SETTINGS", await evalInPage(cdp, `
      (function() {
        const footerSettings = Array.from(document.querySelectorAll("button")).find((button) =>
          /Settings|设置/i.test(button.getAttribute("aria-label") || button.getAttribute("title") || "")
        );
        if (!footerSettings) return false;
        footerSettings.click();
        return true;
      })();
    `));

    assertStep("PACKAGED_PASS22_SETTINGS_DEFAULT_RUNTIME", await waitForEval(cdp, `
      (function() {
        const modal = document.querySelector(".settings-modal");
        const runtime = modal?.querySelector(".settings-runtime-card");
        const direct = modal?.querySelector(".settings-disclosure.inactive");
        const advanced = modal?.querySelector(".settings-inline-disclosure");
        const text = modal?.textContent || "";
        const controls = modal?.querySelectorAll(".runtime-control-grid label") || [];
        return Boolean(
          modal &&
          runtime &&
          direct &&
          direct.open === false &&
          advanced &&
          advanced.open === false &&
          controls.length === 3 &&
          /Runtime, auth, and local preferences/i.test(text) &&
          /Active runtime/i.test(text) &&
          /Claude Code mode/i.test(text) &&
          /firstParty \\/ api_key/i.test(text) &&
          /claude-sonnet-4-5-20250929/i.test(text) &&
          /Inactive until Execution is Direct API/i.test(text)
        );
      })();
    `, 8000));

    await capture(cdp, "48-pass22-packaged-settings-runtime.png");

    assertStep("PACKAGED_PASS22_SWITCH_DIRECT_API", await evalInPage(cdp, `
      (function() {
        const selects = Array.from(document.querySelectorAll(".runtime-control-grid select"));
        const execution = selects.find((select) => Array.from(select.options).some((option) => option.value === "api"));
        if (!execution) return false;
        execution.value = "api";
        execution.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      })();
    `));

    assertStep("PACKAGED_PASS22_DIRECT_API_ACTIVE", await waitForEval(cdp, `
      (function() {
      const modal = document.querySelector(".settings-modal");
      const direct = modal?.querySelector(".settings-disclosure");
      const text = modal?.textContent || "";
      const inlineDisclosures = Array.from(modal?.querySelectorAll(".settings-inline-disclosure") || []);
      const advancedClaude = inlineDisclosures.find((details) => /Advanced Claude Code/i.test(details.textContent || ""));
      const advancedApi = inlineDisclosures.find((details) => /Advanced API options/i.test(details.textContent || ""));
      return Boolean(
        direct &&
        direct.open === true &&
        !direct.classList.contains("inactive") &&
        !advancedClaude &&
        advancedApi &&
        advancedApi.open === false &&
        /Only used when Execution is set to Direct API/i.test(text) &&
        /Provider/i.test(text) &&
        /Base URL/i.test(text) &&
          /API key/i.test(text)
        );
      })();
    `, 5000));

    await capture(cdp, "49-pass22-packaged-settings-direct-api.png");

    console.log("PACKAGED_PASS22_DONE");
  } finally {
    if (cdp) cdp.close();
    child.kill();
  }
}

main().catch((error) => {
  console.error("PACKAGED_PASS22_FAILED", error.stack || error);
  process.exit(1);
});
