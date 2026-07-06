const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

function findRepoDir() {
  const candidates = [
    process.env.CLAUDEX_REPO_DIR,
    process.cwd(),
    __dirname,
    path.join(__dirname, ".."),
  ].filter(Boolean);
  for (const candidate of candidates) {
    let current = path.resolve(candidate);
    while (current && current !== path.dirname(current)) {
      if (
        fs.existsSync(path.join(current, "package.json")) &&
        fs.existsSync(path.join(current, "electron", "main.cjs"))
      ) {
        return current;
      }
      current = path.dirname(current);
    }
  }
  throw new Error("Unable to locate Claudex repo root");
}

const REPO_DIR = findRepoDir();
process.chdir(REPO_DIR);

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass126-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass126-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass126-project-"));
const MARKETPLACE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass126-market-"));
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_DIR, MARKETPLACE_DIR]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_error) {
      // best-effort cleanup
    }
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

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

function assertStep(name, ok) {
  console.log(name, ok);
  if (!ok) throw new Error(`${name} failed`);
}

function writeFakeClaude() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  const marketplacePath = MARKETPLACE_DIR.replace(/\\/g, "\\\\");
  fs.writeFileSync(
    FAKE_CLAUDE,
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass126& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins: none& exit /b 0)",
      `if "%1"=="plugin" if "%2"=="marketplace" if "%3"=="list" if "%4"=="--json" (echo [{"name":"pass126-market","source":"path","repo":"${marketplacePath}","installLocation":"${marketplacePath}","version":"2026.7.7","status":"ready","permissions":["Read","Bash"]}]& exit /b 0)`,
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces:& echo   ^> pass126-market& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass126 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
}

function writeInitialStore() {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass126-project" }), "utf8");
  fs.mkdirSync(path.join(MARKETPLACE_DIR, ".claude-plugin"), { recursive: true });
  writeJson(path.join(MARKETPLACE_DIR, ".claude-plugin", "marketplace.json"), {
    name: "pass126-market",
    description: "PASS126 marketplace catalog fixture",
    owner: { name: "PASS126 Owner" },
    plugins: [
      {
        name: "pass126-catalog-plugin",
        version: "12.6.0",
        description: "PASS126 catalog plugin copy evidence fixture.",
        category: "qa",
        author: { name: "PASS126 QA" },
        homepage: "https://example.invalid/pass126",
        source: { source: "git-subdir", url: "https://example.invalid/pass126.git", path: "plugins/pass126", ref: "v12.6.0" },
        permissions: {
          filesystem: ["Read", "Bash"],
          network: { http: true, websocket: false },
          env: { PASS126_TOKEN: "required" },
        },
        risk: {
          localCode: "pass126 risk fixture",
          permissions: { filesystem: "read workspace", shell: true },
        },
      },
    ],
  });
  writeFakeClaude();
  const project = { name: "pass126-project", path: PROJECT_DIR };
  writeJson(DATA_FILE, {
    version: 1,
    settings: {
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      baseUrl: "https://api.example.invalid",
      temperature: 0.2,
      timeoutMs: 600000,
      language: "zh",
      appearance: { fontSize: "compact", density: "compact" },
      claudeCode: { executionMode: "claude-code", claudeCommand: FAKE_CLAUDE, permissionMode: "default" },
      capabilities: {
        "project-context": true,
        "terminal-helper": true,
        "mcp-runtime": true,
        "plugin-router": true,
        "marketplace-router": true,
      },
      customMarketplaces: [],
      apiKeys: {},
    },
    activeProject: project,
    projects: [project],
    sessions: [
      {
        id: "pass126-session",
        title: "pass126 marketplace evidence copy",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    runEvents: [],
    automations: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

async function openMarketplace(win) {
  return win.webContents.executeJavaScript(`
    (async function() {
      const pluginPattern = new RegExp("\\\\u63d2\\\\u4ef6");
      const nav = [...document.querySelectorAll('.nav-stack button')]
        .find((candidate) => pluginPattern.test(candidate.textContent || ''));
      if (!nav) return false;
      nav.click();
      await new Promise((resolve) => setTimeout(resolve, 500));
      const marketPattern = new RegExp("\\\\u5e02\\\\u573a");
      const tab = [...document.querySelectorAll('.plugin-manager-tabs button')]
        .find((candidate) => marketPattern.test(candidate.textContent || ''));
      if (!tab) return false;
      tab.click();
      await new Promise((resolve) => setTimeout(resolve, 300));
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS126_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS126_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS126_OPEN_MARKETPLACE", await openMarketplace(win));
  assertStep("PASS126_MARKETPLACE_PLUGIN_READY", await waitFor(win, `
    Boolean(
      document.querySelector('.marketplace-plugin-card[data-marketplace-plugin-id="pass126-catalog-plugin@pass126-market"]') &&
      /PASS126 QA/.test(document.querySelector('.marketplace-plugin-card[data-marketplace-plugin-id="pass126-catalog-plugin@pass126-market"]')?.textContent || '')
    )
  `, 15000));
  assertStep("PASS126_COPY_MARKETPLACE_PLUGIN_EVIDENCE_ACTION", await win.webContents.executeJavaScript(`
    (function() {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text) => { window.__pass126Clipboard = String(text || ''); } },
      });
      const card = document.querySelector('.marketplace-plugin-card[data-marketplace-plugin-id="pass126-catalog-plugin@pass126-market"]');
      const copy = card?.querySelector('[data-marketplace-plugin-action="copy-evidence"]');
      if (!copy) return false;
      copy.click();
      return true;
    })();
  `));
  assertStep("PASS126_MARKETPLACE_PLUGIN_EVIDENCE_COPIED", await waitFor(win, `
    (function() {
      const text = window.__pass126Clipboard || '';
      return /pass126-catalog-plugin@pass126-market/.test(text) &&
        /pass126-catalog-plugin/.test(text) &&
        /pass126-market/.test(text) &&
        /12\\.6\\.0/.test(text) &&
        /PASS126 QA/.test(text) &&
        /qa/.test(text) &&
        /https:\\/\\/example\\.invalid\\/pass126\\.git/.test(text) &&
        /plugins\\/pass126/.test(text) &&
        !/\\[object Object\\]/.test(text) &&
        /filesystem:Read, Bash/.test(text) &&
        /network:http/.test(text) &&
        /env:PASS126_TOKEN:required/.test(text) &&
        /Read/.test(text) &&
        /Bash/.test(text) &&
        /localCode:pass126 risk fixture/.test(text) &&
        /permissions:filesystem:read workspace/.test(text) &&
        /shell/.test(text);
    })();
  `, 5000));

  console.log("PASS126_MARKETPLACE_PLUGIN_COPY_EVIDENCE_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS126_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS126_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
