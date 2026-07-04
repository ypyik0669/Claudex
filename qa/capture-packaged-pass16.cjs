const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const PROJECT_PATH = path.join(__dirname, "..");
const EXE_PATH = path.join(PROJECT_PATH, "release-pass16", "win-unpacked", "Claudex.exe");
const AUDIT_DIR = path.join(PROJECT_PATH, "docs", "uiux-audit-2026-07-04-live");
const PORT = 9720 + Math.floor(Math.random() * 500);

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
            id: "empty-newest",
            title: "Claudex",
            project: "claude-code-app",
            projectPath: PROJECT_PATH,
            createdAt: "2026-07-04T03:07:35.345Z",
            updatedAt: "2026-07-04T03:07:35.345Z",
            messages: [],
          },
          {
            id: "empty-older",
            title: "Claudex",
            project: "claude-code-app",
            projectPath: PROJECT_PATH,
            createdAt: "2026-07-03T12:46:51.372Z",
            updatedAt: "2026-07-03T12:46:51.372Z",
            messages: [],
          },
          {
            id: "history-derived",
            title: "Claudex",
            project: "claude-code-app",
            projectPath: PROJECT_PATH,
            createdAt: "2026-07-02T10:00:00.000Z",
            updatedAt: "2026-07-02T10:05:00.000Z",
            messages: [
              { role: "user", content: "Refactor command runner UX so previous outputs remain visible", createdAt: "2026-07-02T10:00:00.000Z" },
              { role: "assistant", content: "Added a command history timeline.", createdAt: "2026-07-02T10:05:00.000Z" },
            ],
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

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass16-packaged-"));
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

    await waitForEval(cdp, "document.readyState === 'complete'", 15000);
    assertStep("PACKAGED_PASS16_READY", await waitForEval(cdp, `
      /claude-sonnet-4-5-20250929/i.test(document.body?.textContent || "") &&
      !/claude-sonnet-5|sonnet-5/i.test(document.body?.textContent || "")
    `, 15000));

    assertStep("PACKAGED_PASS16_DEDUPED_EMPTY_CLAUDEX_ROWS", await evalInPage(cdp, `
      (function() {
        const rows = Array.from(document.querySelectorAll(".thread-list .thread-item"));
        const labels = rows.map((row) => row.textContent || "");
        const threadListText = document.querySelector(".thread-list")?.textContent || "";
        return rows.length === 2 &&
          labels.some((text) => /New chat/.test(text) && /Draft/.test(text)) &&
          labels.some((text) => /Refactor command runner UX/.test(text) && /2 messages/.test(text)) &&
          !/Claudex/.test(threadListText);
      })();
    `));

    assertStep("PACKAGED_PASS16_REUSE_EMPTY_DRAFT_ON_NEW_CHAT", await evalInPage(cdp, `
      (async function() {
        const newButton = document.querySelector(".nav-stack button");
        if (!newButton) return false;
        newButton.click();
        await new Promise((resolve) => setTimeout(resolve, 350));
        newButton.click();
        await new Promise((resolve) => setTimeout(resolve, 350));
        const rows = Array.from(document.querySelectorAll(".thread-list .thread-item"));
        const drafts = rows.filter((row) => /New chat/.test(row.textContent || "") && /Draft/.test(row.textContent || ""));
        return rows.length === 2 && drafts.length === 1;
      })();
    `));

    assertStep("PACKAGED_PASS16_CONTEXT_READY_FOR_CAPTURE", await waitForEval(cdp, `
      (function() {
        const text = document.querySelector(".context-summary")?.textContent || "";
        return /Ready for work|可以开始工作/i.test(text) && !/Loading|加载中/i.test(text);
      })();
    `, 20000));

    await capture(cdp, "32-pass16-packaged-chat-list.png");
    console.log("PACKAGED_PASS16_DONE");
  } finally {
    if (cdp) cdp.close();
    child.kill();
  }
}

main().catch((error) => {
  console.error("PACKAGED_PASS16_FAILED", error.stack || error);
  process.exit(1);
});
