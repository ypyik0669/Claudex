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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass274-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass274-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass274-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");

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
  const fakeClaudeScript = `
const args = process.argv.slice(2);
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
if (args[0] === '--version') out('2.74.0 (Claude Code PASS274)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) {
  process.stderr.write('pass274 plugin json failed\\n');
  process.exit(21);
}
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins:\\n\\n  > pass274-installed@qa\\n    Version: 1.0.0\\n    Scope: user\\n    Status: enabled');
else if (args[0] === 'mcp' && args[1] === 'list') {
  process.stderr.write('pass274 mcp failed\\n');
  process.exit(22);
}
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) {
  process.stderr.write('pass274 marketplace json failed\\n');
  process.exit(23);
}
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') {
  process.stderr.write('pass274 marketplace failed\\n');
  process.exit(24);
}
else out('pass274 fake claude command: ' + args.join(' '));
`;
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(FAKE_CLAUDE, '@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n', "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function writeInitialStore() {
  writeFakeClaude();
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass274-project" }), "utf8");
  const project = { name: "pass274-project", path: PROJECT_DIR };
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
      claudeCode: { executionMode: "claude-code", claudeCommand: FAKE_CLAUDE, permissionMode: "plan" },
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
    sessions: [{
      id: "pass274-session",
      title: "PASS274 runtime health command trace",
      project: project.name,
      projectPath: project.path,
      createdAt: "2026-07-08T04:40:00.000Z",
      updatedAt: "2026-07-08T04:40:00.000Z",
      messages: [],
    }],
    commandRuns: [],
    runEvents: [],
    notices: [],
    automations: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
  });
}

async function paletteCommandTrace(win, query, expectedId) {
  for (let attempt = 0; attempt < 35; attempt += 1) {
    const trace = await win.webContents.executeJavaScript(`
      (async function() {
        if (!document.querySelector('.command-modal')) {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
          await new Promise((resolve) => setTimeout(resolve, 220));
        }
        const input = document.querySelector('.command-modal .command-search input');
        if (!input) return null;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, ${JSON.stringify(query)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 240));
        const button = document.querySelector(${JSON.stringify(`.command-modal .command-list button[data-command-id="${expectedId}"]`)});
        if (!button) return null;
        return {
          id: button.getAttribute('data-command-id') || '',
          target: button.getAttribute('data-command-target') || '',
          surface: button.getAttribute('data-command-runtime-health-surface') || '',
          action: button.getAttribute('data-command-runtime-health-action') || '',
          status: button.getAttribute('data-command-runtime-health-status') || '',
          known: button.getAttribute('data-command-runtime-health-known') || '',
          issueCount: button.getAttribute('data-command-runtime-health-issue-count') || '',
          headline: button.getAttribute('data-command-runtime-health-headline') || '',
          projectName: button.getAttribute('data-command-runtime-health-project-name') || '',
          projectPath: button.getAttribute('data-command-runtime-health-project-path') || '',
          healthTarget: button.getAttribute('data-command-runtime-health-target') || '',
          command: button.getAttribute('data-command-runtime-health-command') || '',
          issueLabel: button.getAttribute('data-command-runtime-health-issue-label') || '',
          issueCode: button.getAttribute('data-command-runtime-health-issue-code') || '',
          issueError: button.getAttribute('data-command-runtime-health-issue-error') || '',
          text: button.textContent || '',
        };
      })();
    `);
    if (trace) return trace;
    await wait(200);
  }
  return null;
}

function baseTraceOk(trace, expected) {
  return Boolean(
    trace &&
    trace.id === expected.id &&
    trace.surface === expected.surface &&
    trace.action === expected.action &&
    trace.status === "error" &&
    trace.known === "true" &&
    trace.issueCount === "3" &&
    trace.projectName === "pass274-project" &&
    trace.projectPath === PROJECT_DIR &&
    /3/.test(trace.headline || "")
  );
}

writeInitialStore();
app.setPath("userData", USER_DATA_DIR);
require(path.join(REPO_DIR, "electron", "main.cjs"));

async function runTest() {
  await wait(1700);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS274_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS274_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS274_STATUS_ISSUES_READY", await waitFor(win, `
    (async function() {
      const status = await window.claudexDesktop.getClaudeStatus({ projectPath: ${JSON.stringify(PROJECT_DIR)} });
      return Boolean(
        status.pluginCommand?.jsonCode === 21 &&
        status.mcpCommand?.code === 22 &&
        status.marketplaceCommand?.jsonCode === 23 &&
        /pass274 plugin json failed/.test(status.pluginCommand?.jsonStderr || status.pluginCommand?.stderr || '') &&
        /pass274 mcp failed/.test(status.mcpCommand?.stderr || '') &&
        /pass274 marketplace json failed/.test(status.marketplaceCommand?.jsonStderr || status.marketplaceCommand?.stderr || '')
      );
    })();
  `, 15000));

  const capabilityCopy = await paletteCommandTrace(win, "runtime health copy pass274 plugin", "runtime-health-action:copy");
  assertStep("PASS274_CAPABILITY_COPY_TRACE", baseTraceOk(capabilityCopy, {
    id: "runtime-health-action:copy",
    surface: "capability",
    action: "copy",
  }) && capabilityCopy.target === "runtime-health-action" && !capabilityCopy.healthTarget && !capabilityCopy.command);

  const capabilityMcp = await paletteCommandTrace(win, "runtime health issue mcp pass274", "runtime-health-issue:mcp");
  assertStep("PASS274_CAPABILITY_MCP_ISSUE_TRACE", baseTraceOk(capabilityMcp, {
    id: "runtime-health-issue:mcp",
    surface: "capability",
    action: "open-issue",
  }) && capabilityMcp.target === "runtime-health-issue" && capabilityMcp.healthTarget === "mcp" && capabilityMcp.command === "mcp list" && capabilityMcp.issueCode === "22" && /pass274 mcp failed/.test(capabilityMcp.issueError));

  const settingsCopy = await paletteCommandTrace(win, "settings runtime health copy pass274", "settings-runtime-health-action:copy");
  assertStep("PASS274_SETTINGS_COPY_TRACE", baseTraceOk(settingsCopy, {
    id: "settings-runtime-health-action:copy",
    surface: "settings",
    action: "copy",
  }) && settingsCopy.target === "settings-runtime-health-action" && !settingsCopy.healthTarget && !settingsCopy.command);

  const settingsMarketplace = await paletteCommandTrace(win, "settings runtime health marketplace pass274", "settings-runtime-health-issue:marketplace");
  assertStep("PASS274_SETTINGS_MARKETPLACE_ISSUE_TRACE", baseTraceOk(settingsMarketplace, {
    id: "settings-runtime-health-issue:marketplace",
    surface: "settings",
    action: "open-issue",
  }) && settingsMarketplace.target === "settings-runtime-health-issue" && settingsMarketplace.healthTarget === "marketplace" && settingsMarketplace.command === "plugin marketplace list --json" && settingsMarketplace.issueCode === "23" && /pass274 marketplace json failed/.test(settingsMarketplace.issueError));

  console.log("PASS274_RUNTIME_HEALTH_COMMAND_TRACE_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS274_FAILED", error?.stack || error);
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    const debug = await win.webContents.executeJavaScript(`
      (function() {
        return {
          commands: Array.from(document.querySelectorAll('.command-modal .command-list button')).slice(0, 80).map((item) => ({
            id: item.getAttribute('data-command-id'),
            text: item.textContent,
            attrs: Object.fromEntries(Array.from(item.attributes).map((attr) => [attr.name, attr.value])),
          })),
          body: document.body.textContent?.slice(0, 7000) || '',
        };
      })();
    `).catch((debugError) => ({ error: String(debugError?.stack || debugError) }));
    console.error("PASS274_DEBUG", JSON.stringify(debug, null, 2).slice(0, 30000));
  }
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS274_TIMEOUT");
  cleanup();
  app.exit(1);
}, 120000);
