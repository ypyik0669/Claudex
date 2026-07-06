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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass125-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass125-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass125-project-"));
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_DIR]) {
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
  fs.writeFileSync(
    FAKE_CLAUDE,
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass125& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo {\"plugins\":[{\"id\":\"pass125-plugin@qa-market\",\"name\":\"pass125-plugin\",\"marketplace\":\"qa-market\",\"version\":\"12.5.0\",\"scope\":\"project\",\"enabled\":false,\"source\":\"pass125 source fixture\",\"installPath\":\"C:\\\\plugins\\\\pass125\",\"tools\":[\"pass125-tool\"],\"permissions\":[\"Read\",\"Bash\"],\"status\":\"error\",\"error\":\"pass125 plugin load failed\"}]}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins:& echo   ^> pass125-plugin@qa-market& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces: none& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass125 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
}

function writeInitialStore() {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass125-project" }), "utf8");
  writeFakeClaude();
  const project = { name: "pass125-project", path: PROJECT_DIR };
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
        id: "pass125-session",
        title: "pass125 plugin evidence copy",
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

async function openCapabilities(win) {
  return win.webContents.executeJavaScript(`
    (async function() {
      const pluginPattern = new RegExp("\\\\u63d2\\\\u4ef6");
      const button = [...document.querySelectorAll('.nav-stack button')]
        .find((candidate) => pluginPattern.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 300));
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS125_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS125_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS125_OPEN_CAPABILITIES", await openCapabilities(win));
  assertStep("PASS125_PLUGIN_ROW_READY", await waitFor(win, `
    Boolean(
      document.querySelector('.plugin-manager-modal') &&
      document.querySelector('.structured-plugin-row[data-plugin-id="pass125-plugin@qa-market"]') &&
      /pass125-tool/.test(document.querySelector('.structured-plugin-row[data-plugin-id="pass125-plugin@qa-market"]')?.textContent || '')
    )
  `, 15000));
  assertStep("PASS125_COPY_PLUGIN_EVIDENCE_ACTION", await win.webContents.executeJavaScript(`
    (function() {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text) => { window.__pass125Clipboard = String(text || ''); } },
      });
      const row = document.querySelector('.structured-plugin-row[data-plugin-id="pass125-plugin@qa-market"]');
      const copy = row?.querySelector('[data-plugin-action="copy-evidence"]');
      if (!copy) return false;
      copy.click();
      return true;
    })();
  `));
  assertStep("PASS125_PLUGIN_EVIDENCE_COPIED", await waitFor(win, `
    (function() {
      const text = window.__pass125Clipboard || '';
      return /^ID: pass125-plugin@qa-market/m.test(text) &&
        /插件名: pass125-plugin/m.test(text) &&
        /12\\.5\\.0/.test(text) &&
        /project/.test(text) &&
        /error/.test(text) &&
        /pass125 plugin load failed/.test(text) &&
        /pass125 source fixture/.test(text) &&
        /C:\\\\plugins\\\\pass125/.test(text) &&
        /pass125-tool/.test(text) &&
        /Read/.test(text) &&
        /Bash/.test(text);
    })();
  `, 5000));

  console.log("PASS125_PLUGIN_ROW_COPY_EVIDENCE_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS125_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS125_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
