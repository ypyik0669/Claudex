const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const PROJECT_PATH = path.join(__dirname, "..");
const AUDIT_DIR = path.join(PROJECT_PATH, "docs", "uiux-audit-2026-07-04-live");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass19-calm-"));

app.setPath("userData", USER_DATA_DIR);

fs.mkdirSync(USER_DATA_DIR, { recursive: true });
fs.writeFileSync(
  path.join(USER_DATA_DIR, "desktop-data.json"),
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

require(path.join(__dirname, "..", "electron", "main.cjs"));

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(win, script, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const ok = await win.webContents.executeJavaScript(script);
    if (ok) return true;
    await wait(150);
  }
  return false;
}

async function shot(win, name) {
  const image = await win.webContents.capturePage();
  const outPath = path.join(AUDIT_DIR, name);
  fs.writeFileSync(outPath, image.toPNG());
  console.log("CAPTURED", outPath);
}

function assertStep(name, ok) {
  console.log(name, ok);
  if (!ok) throw new Error(`${name} failed`);
}

app.whenReady().then(async () => {
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.error("PASS19_FAILED_NO_WINDOW");
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(500);

  assertStep("PASS19_READY_SONNET45", await waitFor(win, `
    /claude-sonnet-4-5-20250929/i.test(document.body.textContent || "") &&
    !/claude-sonnet-5|sonnet-5/i.test(document.body.textContent || "")
  `, 15000));

  assertStep("PASS19_DEFAULT_TOOLS_COLLAPSED", await win.webContents.executeJavaScript(`
    (function() {
      const details = ["#workspace-tool-detail", "#claude-tool-detail", "#browser-tool-detail", "#terminal-tool-detail"];
      const rows = Array.from(document.querySelectorAll("button.tool-row"));
      return details.every((selector) => !document.querySelector(selector)) &&
        rows.length >= 4 &&
        rows.every((row) => row.getAttribute("aria-expanded") === "false");
    })();
  `));

  assertStep("PASS19_COMPACT_CONTEXT_VISIBLE", await waitFor(win, `
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

  await shot(win, "37-pass19-default-calm-source.png");

  assertStep("PASS19_OPEN_CLAUDE_DETAIL_STILL_WORKS", await win.webContents.executeJavaScript(`
    (function() {
      const button = Array.from(document.querySelectorAll("button.tool-row")).find((item) => /Claude Code/i.test(item.textContent || ""));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));

  assertStep("PASS19_CLAUDE_ESCAPE_HATCH_READY", await waitFor(win, `
    (function() {
      const detail = document.querySelector("#claude-tool-detail");
      const text = detail?.textContent || "";
      const input = detail?.querySelector("input");
      const interactive = Array.from(detail?.querySelectorAll("button") || []).find((button) => /Interactive Claude/i.test(button.textContent || ""));
      return Boolean(detail && input && interactive && /Claude args/.test(text) && /Auth/.test(text) && /MCP/.test(text));
    })();
  `, 5000));

  console.log("PASS19_DEFAULT_CALM_DONE");
  app.exit(0);
}).catch((error) => {
  console.error("PASS19_DEFAULT_CALM_FAILED", error?.stack || error);
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS19_DEFAULT_CALM_TIMEOUT");
  app.exit(1);
}, 60000);
