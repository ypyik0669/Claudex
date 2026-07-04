const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const PROJECT_PATH = path.join(__dirname, "..");
const EXE_PATH = path.join(PROJECT_PATH, "release-pass19", "win-unpacked", "Claudex.exe");
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

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass19-packaged-"));
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
      console.warn("PACKAGED_PASS19_WINDOW_BOUNDS_SKIPPED", error?.message || error);
    }

    await waitForEval(cdp, "document.readyState === 'complete'", 15000);
    assertStep("PACKAGED_PASS19_READY_SONNET45", await waitForEval(cdp, `
      /claude-sonnet-4-5-20250929/i.test(document.body?.textContent || "") &&
      !/claude-sonnet-5|sonnet-5/i.test(document.body?.textContent || "")
    `, 15000));

    assertStep("PACKAGED_PASS19_DEFAULT_TOOLS_COLLAPSED", await evalInPage(cdp, `
      (function() {
        const details = ["#workspace-tool-detail", "#claude-tool-detail", "#browser-tool-detail", "#terminal-tool-detail"];
        const rows = Array.from(document.querySelectorAll("button.tool-row"));
        return details.every((selector) => !document.querySelector(selector)) &&
          rows.length >= 4 &&
          rows.every((row) => row.getAttribute("aria-expanded") === "false");
      })();
    `));

    assertStep("PACKAGED_PASS19_COMPACT_CONTEXT_VISIBLE", await waitForEval(cdp, `
      (function() {
        const card = document.querySelector(".context-summary");
        const compact = document.querySelector(".context-summary-compact");
        const details = document.querySelector(".context-summary-details");
        const text = compact?.textContent || "";
        const compactStyle = compact ? getComputedStyle(compact) : null;
        return Boolean(
          card &&
          compact &&
          compactStyle?.display !== "none" &&
          /firstParty \\/ api_key/i.test(text) &&
          /Sonnet 4\\.5/i.test(text) &&
          /claude-code-app/i.test(text) &&
          details &&
          details.open === false &&
          card.getBoundingClientRect().height < 130
        );
      })();
    `, 15000));

    await capture(cdp, "38-pass19-packaged-default-calm.png");

    assertStep("PACKAGED_PASS19_OPEN_CLAUDE_DETAIL_STILL_WORKS", await evalInPage(cdp, `
      (function() {
        const button = Array.from(document.querySelectorAll("button.tool-row")).find((item) => /Claude Code/i.test(item.textContent || ""));
        if (!button) return false;
        button.click();
        return true;
      })();
    `));

    assertStep("PACKAGED_PASS19_CLAUDE_ESCAPE_HATCH_READY", await waitForEval(cdp, `
      (function() {
        const detail = document.querySelector("#claude-tool-detail");
        const text = detail?.textContent || "";
        const input = detail?.querySelector("input");
        const interactive = Array.from(detail?.querySelectorAll("button") || []).find((button) => /Interactive Claude/i.test(button.textContent || ""));
        return Boolean(detail && input && interactive && /Claude args/.test(text) && /Auth/.test(text) && /MCP/.test(text));
      })();
    `, 5000));

    console.log("PACKAGED_PASS19_DONE");
  } finally {
    if (cdp) cdp.close();
    child.kill();
  }
}

main().catch((error) => {
  console.error("PACKAGED_PASS19_FAILED", error.stack || error);
  process.exit(1);
});
