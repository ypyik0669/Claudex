const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const PROJECT_PATH = path.join(__dirname, "..");
const EXE_PATH = path.join(PROJECT_PATH, "release-pass34", "win-unpacked", "Claudex.exe");
const PORT = 12634 + Math.floor(Math.random() * 500);

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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
  return result.result.value;
}

async function waitForEval(cdp, expression, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await evalInPage(cdp, expression);
    if (value) return true;
    await wait(200);
  }
  return false;
}

function assertStep(name, ok) {
  console.log(name, ok);
  if (!ok) throw new Error(`${name} failed`);
}

async function capture(cdp, name) {
  await evalInPage(cdp, "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  await wait(250);
  const screenshot = await cdp.send("Page.captureScreenshot", { format: "png" });
  const outPath = path.join(PROJECT_PATH, "qa", name);
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
        settings: {
          provider: "anthropic",
          model: "claude-sonnet-4-5-20250929",
          baseUrl: "https://api.example.com",
          language: "en",
          appearance: { fontSize: "compact", density: "compact" },
          claudeCode: { executionMode: "claude-code", claudeCommand: "claude", permissionMode: "default" },
          capabilities: {
            "project-context": true,
            "code-review": true,
            "implementation-plan": true,
            "terminal-helper": true,
            "mcp-runtime": true,
            "plugin-router": true,
            "marketplace-router": true,
            "custom-marketplaces": true,
          },
          customMarketplaces: ["https://example.com/claude-code-marketplace.json"],
        },
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
  if (!fs.existsSync(path.join(path.dirname(EXE_PATH), "resources", "app.asar"))) {
    throw new Error("Packaged app.asar is missing.");
  }
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass34-packaged-"));
  seedStore(userDataDir);

  const child = spawn(EXE_PATH, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${userDataDir}`, "--disable-gpu"], {
    cwd: path.dirname(EXE_PATH),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
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
    } catch {
      // Window bounds are best-effort in packaged smoke.
    }

    assertStep("PACKAGED_PASS34_READY", await waitForEval(cdp, "Boolean(document.querySelector('.app-grid'))", 15000));
    assertStep("PACKAGED_PASS34_DEFAULT_CALM", await waitForEval(cdp, `
      Boolean(
        !document.querySelector('.app-rail') &&
        document.querySelector('.app-grid.right-panel-hidden') &&
        getComputedStyle(document.querySelector('.tools-panel')).display === 'none' &&
        document.querySelector('.app-shell.font-compact') &&
        [...document.querySelectorAll('.workspace-context-button')].every((button) => button.getBoundingClientRect().width <= 40) &&
        Boolean(document.querySelector('.side-panel-button'))
      )
    `, 8000));
    await capture(cdp, "packaged-pass34-home.png");

    assertStep("PACKAGED_PASS34_ENVIRONMENT_CLICK", await evalInPage(cdp, `
      (function() {
        const button = [...document.querySelectorAll('.workspace-context-button')]
          .find((candidate) => (candidate.getAttribute('aria-label') || '').startsWith('环境'));
        if (!button) return false;
        button.click();
        return true;
      })();
    `));
    assertStep("PACKAGED_PASS34_ENVIRONMENT_PANEL", await waitForEval(cdp, "Boolean(document.querySelector('.bottom-work-panel') && document.querySelector('.workspace-context-button.active')?.getBoundingClientRect().width > 40)", 5000));
    await capture(cdp, "packaged-pass34-environment.png");

    assertStep("PACKAGED_PASS34_PLUGINS_CLICK", await evalInPage(cdp, `
      (function() {
        const button = [...document.querySelectorAll('.nav-stack button')]
          .find((candidate) => (candidate.textContent || '').includes('插件'));
        if (!button) return false;
        button.click();
        return true;
      })();
    `));
    assertStep("PACKAGED_PASS34_PLUGINS_SURFACE", await waitForEval(cdp, `
      Boolean(
        document.querySelector('.plugin-manager-modal') &&
        document.querySelector('.app-grid.surface-open') &&
        getComputedStyle(document.querySelector('.sidebar')).display === 'none'
      )
    `, 5000));
    await capture(cdp, "packaged-pass34-plugins.png");

    console.log("PACKAGED_PASS34_DONE");
  } finally {
    if (cdp) cdp.close();
    child.kill();
  }
}

main().catch((error) => {
  console.error("PACKAGED_PASS34_FAILED", error.stack || error);
  process.exit(1);
});
