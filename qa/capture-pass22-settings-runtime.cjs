const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const PROJECT_PATH = path.join(__dirname, "..");
const AUDIT_DIR = path.join(PROJECT_PATH, "docs", "uiux-audit-2026-07-04-live");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass22-settings-"));

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
  await win.webContents.executeJavaScript("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  await wait(250);
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
    console.error("PASS22_FAILED_NO_WINDOW");
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(500);

  assertStep("PASS22_READY_SONNET45", await waitFor(win, `
    /claude-sonnet-4-5-20250929/i.test(document.body.textContent || "") &&
    !/claude-sonnet-5|sonnet-5/i.test(document.body.textContent || "")
  `, 15000));

  assertStep("PASS22_OPEN_SETTINGS", await win.webContents.executeJavaScript(`
    (function() {
      const footerSettings = Array.from(document.querySelectorAll("button")).find((button) =>
        /Settings|设置/i.test(button.getAttribute("aria-label") || button.getAttribute("title") || "")
      );
      if (!footerSettings) return false;
      footerSettings.click();
      return true;
    })();
  `));

  assertStep("PASS22_SETTINGS_DEFAULT_RUNTIME", await waitFor(win, `
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

  await shot(win, "46-pass22-settings-runtime-source.png");

  assertStep("PASS22_SWITCH_DIRECT_API", await win.webContents.executeJavaScript(`
    (function() {
      const selects = Array.from(document.querySelectorAll(".runtime-control-grid select"));
      const execution = selects.find((select) => Array.from(select.options).some((option) => option.value === "api"));
      if (!execution) return false;
      execution.value = "api";
      execution.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })();
  `));

  assertStep("PASS22_DIRECT_API_ACTIVE", await waitFor(win, `
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

  await shot(win, "47-pass22-settings-direct-api-source.png");

  console.log("PASS22_SETTINGS_RUNTIME_DONE");
  app.exit(0);
}).catch((error) => {
  console.error("PASS22_SETTINGS_RUNTIME_FAILED", error?.stack || error);
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS22_SETTINGS_RUNTIME_TIMEOUT");
  app.exit(1);
}, 60000);
