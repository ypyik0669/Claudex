const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow, clipboard } = require("electron");

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
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass338-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass338-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass338-project-"));
const MARKETPLACE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass338-market-"));
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

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function writeInitialStore() {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.mkdirSync(path.join(MARKETPLACE_DIR, ".claude-plugin"), { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass338-project" }), "utf8");
  writeJson(path.join(MARKETPLACE_DIR, ".claude-plugin", "marketplace.json"), {
    name: "pass338-market-source",
    description: "PASS338 marketplace catalog fixture",
    owner: { name: "PASS338 Owner" },
    plugins: [
      {
        name: "pass338-catalog-plugin",
        version: "8.6.0",
        description: "PASS338 catalog plugin can be deep linked from the command palette.",
        category: "qa",
        author: { name: "PASS338 QA" },
        source: { source: "git", url: "https://example.invalid/pass338.git", path: "plugins/catalog" },
        permissions: ["Read", "Bash"],
      },
    ],
  });
  fs.writeFileSync(
    FAKE_CLAUDE,
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass338& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo {\"plugins\":[{\"id\":\"pass338-plugin@qa-market\",\"name\":\"pass338-plugin\",\"marketplace\":\"qa-market\",\"version\":\"8.6.1\",\"scope\":\"project\",\"enabled\":true,\"source\":\"pass338 local fixture\",\"tools\":[\"pass338-tool\"],\"permissions\":[\"Read\"]}]}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins:& echo   ^> pass338-plugin@qa-market& exit /b 0)",
      `if "%1"=="plugin" if "%2"=="marketplace" if "%3"=="list" if "%4"=="--json" (echo [{"name":"pass338-market-source","source":"path","repo":"${MARKETPLACE_DIR.replace(/\\/g, "\\\\")}","installLocation":"${MARKETPLACE_DIR.replace(/\\/g, "\\\\")}","version":"2026.7.6","status":"ready","permissions":["Read","Bash"]}]& exit /b 0)`,
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces:& echo   ^> pass338-market-source& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo âœ“ pass338-mcp: connected Â· 3 tools Â· stdio Â· C:\\\\mcp\\\\pass338-server.cjs& exit /b 0)",
      "echo pass338 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );

  const project = { name: "pass338-project", path: PROJECT_DIR };
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
      systemPrompt: "QA",
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
        id: "pass338-session",
        title: "pass338 work thread",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-06T00:00:00.000Z",
        updatedAt: "2026-07-06T00:00:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [{
      id: "pass338-secret-run",
      requestId: "pass338-secret-run",
      kind: "workspace",
      command: "echo diagnostic-token",
      commandLine: "echo diagnostic-token",
      cwd: PROJECT_DIR,
      project,
      startedAt: "2026-07-06T00:00:00.000Z",
      endedAt: "2026-07-06T00:00:01.000Z",
      code: 1,
      stdout: "diagnostic marker Bearer supersecret338token",
      stderr: "API_KEY=supersecret338key",
    }, {
      id: "pass338-secret-capability-run",
      requestId: "pass338-secret-capability-run",
      kind: "capability",
      command: "claude plugin list",
      commandLine: "claude plugin list",
      cwd: PROJECT_DIR,
      project,
      startedAt: "2026-07-06T00:00:00.000Z",
      endedAt: "2026-07-06T00:00:01.000Z",
      code: 1,
      stdout: "capability diagnostic Bearer supersecret338capability",
      stderr: "Authorization: supersecret338authorization",
    }],
    runEvents: [],
    automations: [{
      id: "pass338-automation",
      prompt: "pass338 automation task",
      project,
      threadId: "pass338-session",
      status: "failed",
      enabled: true,
      schedule: { type: "manual" },
      history: [{
        id: "pass338-automation-run",
        status: "failed",
        trigger: "manual",
        stdout: "automation diagnostic Bearer supersecret338automation",
        stderr: "TOKEN=supersecret338automationtoken",
        code: 1,
        endedAt: "2026-07-06T00:00:01.000Z",
      }],
    }],
    subagentRuns: [{
      id: "pass338-subagent-run",
      requestId: "pass338-subagent-run",
      nickname: "pass338 subagent",
      task: "pass338 subagent task",
      status: "error",
      project,
      cwd: PROJECT_DIR,
      stdout: "subagent diagnostic Bearer supersecret338subagent",
      stderr: "API_KEY=supersecret338subagentkey",
      code: 1,
      endedAt: "2026-07-06T00:00:01.000Z",
    }],
  });
}

async function paletteCommands(win, query) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return null;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 180));
      const result = Array.from(document.querySelectorAll('.command-modal .command-list button'))
        .map((button) => ({
          id: button.getAttribute('data-command-id') || '',
          target: button.getAttribute('data-command-target') || '',
          text: button.textContent || '',
        }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return result;
    })();
  `);
}

async function runPaletteCommand(win, query, expectedId = "") {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 180));
      const buttons = Array.from(document.querySelectorAll('.command-modal .command-list button'));
      const expectedId = ${JSON.stringify(expectedId)};
      const button = expectedId
        ? buttons.find((candidate) => (candidate.getAttribute('data-command-id') || '').includes(expectedId))
        : buttons[0];
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function waitForPaletteCommand(win, query, predicate, timeoutMs = 12000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const commands = await paletteCommands(win, query);
    if (Array.isArray(commands) && commands.some((command) => predicate(command))) return true;
    await wait(180);
  }
  return false;
}

async function waitForClipboard(patterns, timeoutMs = 6000) {
  const checks = Array.isArray(patterns) ? patterns : [patterns];
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const text = clipboard.readText() || "";
    if (checks.every((pattern) => (pattern instanceof RegExp ? pattern.test(text) : text.includes(String(pattern))))) {
      return true;
    }
    await wait(120);
  }
  console.error("PASS338_CLIPBOARD_DEBUG", clipboard.readText());
  return false;
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS338_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(600);

  assertStep("PASS338_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));

  assertStep("PASS338_PLUGIN_COPY_COMMAND_SEARCHABLE", await waitForPaletteCommand(
    win,
    "copy evidence pass338-tool",
    (command) => command.id.includes("capability-plugin-copy:pass338-plugin%40qa-market") &&
      command.target === "clipboard" &&
      /pass338-plugin@qa-market/.test(command.text || "") &&
      /复制证据|copy/i.test(command.text || ""),
  ));
  clipboard.writeText("");
  assertStep("PASS338_COPY_PLUGIN_EVIDENCE", await runPaletteCommand(win, "copy evidence pass338-tool", "capability-plugin-copy:pass338-plugin%40qa-market"));
  assertStep("PASS338_PLUGIN_EVIDENCE_CLIPBOARD", await waitForClipboard([
    /ID: pass338-plugin@qa-market/,
    /pass338-tool/,
    /pass338 local fixture/,
    /Read/,
  ]));

  assertStep("PASS338_MCP_COPY_COMMAND_SEARCHABLE", await waitForPaletteCommand(
    win,
    "copy evidence pass338-mcp",
    (command) => command.id.includes("capability-mcp-copy:pass338-mcp") &&
      command.target === "clipboard" &&
      /pass338-mcp/.test(command.text || "") &&
      /复制证据|copy/i.test(command.text || ""),
  ));
  clipboard.writeText("");
  assertStep("PASS338_COPY_MCP_EVIDENCE", await runPaletteCommand(win, "copy evidence pass338-mcp", "capability-mcp-copy:pass338-mcp"));
  assertStep("PASS338_MCP_EVIDENCE_CLIPBOARD", await waitForClipboard([
    /pass338-mcp/,
    /pass338-server\.cjs/,
    /stdio/,
    /3/,
  ]));

  assertStep("PASS338_MARKETPLACE_PLUGIN_COPY_COMMAND_SEARCHABLE", await waitForPaletteCommand(
    win,
    "copy evidence pass338-catalog-plugin",
    (command) => command.id.includes("capability-marketplace-plugin-copy:pass338-catalog-plugin%40pass338-market-source") &&
      command.target === "clipboard" &&
      /pass338-catalog-plugin/.test(command.text || "") &&
      /复制证据|copy/i.test(command.text || ""),
  ));
  clipboard.writeText("");
  assertStep("PASS338_COPY_MARKETPLACE_PLUGIN_EVIDENCE", await runPaletteCommand(win, "copy evidence pass338-catalog-plugin", "capability-marketplace-plugin-copy:pass338-catalog-plugin%40pass338-market-source"));
  assertStep("PASS338_MARKETPLACE_PLUGIN_EVIDENCE_CLIPBOARD", await waitForClipboard([
    /pass338-catalog-plugin@pass338-market-source/,
    /PASS338 catalog plugin/,
    /PASS338 QA/,
    /Read, Bash|Read.*Bash/s,
  ]));

  assertStep("PASS338_MARKETPLACE_SOURCE_COPY_COMMAND_SEARCHABLE", await waitForPaletteCommand(
    win,
    "copy evidence pass338-market-source",
    (command) => command.id.includes("capability-marketplace-source-copy:pass338-market-source") &&
      command.target === "clipboard" &&
      /pass338-market-source/.test(command.text || "") &&
      /复制证据|copy/i.test(command.text || ""),
  ));
  clipboard.writeText("");
  assertStep("PASS338_COPY_MARKETPLACE_SOURCE_EVIDENCE", await runPaletteCommand(win, "copy evidence pass338-market-source", "capability-marketplace-source-copy:pass338-market-source"));
  assertStep("PASS338_MARKETPLACE_SOURCE_EVIDENCE_CLIPBOARD", await waitForClipboard([
    /pass338-market-source/,
    /2026\.7\.6/,
    /ready/,
    new RegExp(MARKETPLACE_DIR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  ]));

  assertStep("PASS338_REDACTED_OUTPUT_STILL_SEARCHABLE", await waitForPaletteCommand(
    win,
    "diagnostic marker",
    (command) => command.id.includes("command-run:pass338-secret-run"),
  ));
  const capabilityCommands = await paletteCommands(win, "capability diagnostic");
  assertStep("PASS338_REDACTED_CAPABILITY_COPY_COMMAND", Array.isArray(capabilityCommands) && capabilityCommands.some((command) => command.id.includes("capability-recovery:copy") && command.target === "clipboard"));
  clipboard.writeText("");
  assertStep("PASS338_COPY_REDACTED_CAPABILITY_EVIDENCE", await runPaletteCommand(
    win,
    "capability diagnostic",
    "capability-recovery:copy:pass338-secret-capability-run",
  ));
  assertStep("PASS338_REDACTED_CAPABILITY_EVIDENCE_CLIPBOARD", await waitForClipboard([/capability diagnostic/, /\[REDACTED\]/]));
  assertStep("PASS338_CAPABILITY_SECRET_NOT_COPIED", !/supersecret338capability|supersecret338authorization/.test(clipboard.readText() || ""));

  assertStep("PASS338_AUTOMATION_COPY_COMMAND_REDACTED", await waitForPaletteCommand(
    win,
    "automation diagnostic",
    (command) => command.id.includes("automation-history-copy:pass338-automation-run") && command.target === "clipboard",
  ));
  clipboard.writeText("");
  assertStep("PASS338_COPY_AUTOMATION_EVIDENCE_REDACTED", await runPaletteCommand(win, "automation diagnostic", "automation-history-copy:pass338-automation-run"));
  assertStep("PASS338_AUTOMATION_EVIDENCE_REDACTED", await waitForClipboard([/automation diagnostic/, /\[REDACTED\]/]));
  assertStep("PASS338_AUTOMATION_SECRET_NOT_COPIED", !/supersecret338automation/.test(clipboard.readText() || ""));

  const subagentCommands = await paletteCommands(win, "subagent diagnostic");
  assertStep("PASS338_SUBAGENT_COPY_COMMAND_REDACTED", Array.isArray(subagentCommands) && subagentCommands.some((command) => command.id.includes("subagent-recovery:copy") && command.target === "clipboard"));
  clipboard.writeText("");
  assertStep("PASS338_COPY_SUBAGENT_EVIDENCE_REDACTED", await runPaletteCommand(win, "subagent diagnostic", "subagent-recovery:copy:pass338-subagent-run"));
  assertStep("PASS338_SUBAGENT_EVIDENCE_REDACTED", await waitForClipboard([/subagent diagnostic/, /\[REDACTED\]/]));
  assertStep("PASS338_SUBAGENT_SECRET_NOT_COPIED", !/supersecret338subagent/.test(clipboard.readText() || ""));

  const automationSecretCommands = await paletteCommands(win, "supersecret338automation");
  assertStep("PASS338_AUTOMATION_SECRET_NOT_PALETTE_SEARCHABLE", Array.isArray(automationSecretCommands) && !automationSecretCommands.some((command) => command.id.includes("pass338-automation")));
  const subagentSecretCommands = await paletteCommands(win, "supersecret338subagent");
  assertStep("PASS338_SUBAGENT_SECRET_NOT_PALETTE_SEARCHABLE", Array.isArray(subagentSecretCommands) && !subagentSecretCommands.some((command) => command.id.includes("pass338-subagent-run")));

  const secretCommands = await paletteCommands(win, "supersecret338token");
  assertStep("PASS338_SECRET_NOT_PALETTE_SEARCHABLE", Array.isArray(secretCommands) && !secretCommands.some((command) => command.id.includes("pass338-secret-run")));
  const keyCommands = await paletteCommands(win, "supersecret338key");
  assertStep("PASS338_API_KEY_NOT_PALETTE_SEARCHABLE", Array.isArray(keyCommands) && !keyCommands.some((command) => command.id.includes("pass338-secret-run")));

  console.log("PASS338_COMMAND_PALETTE_CAPABILITY_EVIDENCE_COPY_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS338_COMMAND_PALETTE_CAPABILITY_EVIDENCE_COPY_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS338_COMMAND_PALETTE_CAPABILITY_EVIDENCE_COPY_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
