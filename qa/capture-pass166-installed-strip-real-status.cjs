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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass166-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass166-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass166-project-"));
const SKILL_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass166-skills-"));
const COMMAND_LOG = path.join(USER_DATA_DIR, "claude-command-log.txt");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_DIR, SKILL_ROOT]) {
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

function writeSkillRegistryFixture() {
  const skillDir = path.join(SKILL_ROOT, "pass166-strip-skill");
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), `---
name: pass166 strip skill
description: Local skill registry fixture for installed strip deep links.
---

# PASS166 Strip Skill

This skill exists on disk so the capability strip is backed by a real SKILL.md file.
`, "utf8");
  process.env.CLAUDEX_SKILL_ROOTS = SKILL_ROOT;
}

function writeFakeClaude() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  const fakeScript = `
const fs = require('fs');
const args = process.argv.slice(2);
const commandLog = ${JSON.stringify(COMMAND_LOG)};
fs.appendFileSync(commandLog, args.join(' ') + '\\n', 'utf8');
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
if (args[0] === '--version') out('2.16.6 (Claude Code QA)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out({
  plugins: [
    {
      id: 'pass166-ok-plugin@pass166-market',
      name: 'pass166-ok-plugin',
      marketplace: 'pass166-market',
      version: '16.6.0',
      scope: 'user',
      enabled: true,
      status: 'enabled',
      tools: ['pass166-read-tool'],
      permissions: { filesystem: 'read' }
    },
    {
      id: 'pass166-error-plugin@pass166-market',
      name: 'pass166-error-plugin',
      marketplace: 'pass166-market',
      version: '16.6.1',
      scope: 'project',
      enabled: false,
      status: 'failed',
      error: 'pass166 plugin load failed',
      tools: ['pass166-shell-tool'],
      permissions: { bash: true }
    }
  ]
});
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins:\\n\\n  > pass166-ok-plugin@pass166-market\\n    Status: ✓ enabled\\n  > pass166-error-plugin@pass166-market\\n    Status: failed');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out({
  mcpServers: [
    { name: 'pass166-good-mcp', status: 'ok', transport: 'stdio', tools: ['pass166-mcp-read'], source: 'node good-server.js' },
    { name: 'pass166-bad-mcp', status: 'error', transport: 'stdio', tools: [], source: 'node bad-server.js', error: 'pass166 mcp failed' }
  ]
});
else if (args[0] === 'mcp' && args[1] === 'list') out('✓ pass166-good-mcp: connected · 1 tool\\n✗ pass166-bad-mcp: failed · pass166 mcp failed');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else out('pass166 fake claude command: ' + args.join(' '));
`;
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeScript, "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
  return path.join(FAKE_BIN_DIR, "claude.cmd");
}

function writeInitialStore() {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass166-project" }), "utf8");
  const fakeClaude = writeFakeClaude();
  const project = { name: "pass166-project", path: PROJECT_DIR };
  writeJson(DATA_FILE, {
    version: 1,
    activeProject: project,
    projects: [project],
    settings: {
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      baseUrl: "https://api.example.invalid",
      temperature: 0.2,
      timeoutMs: 600000,
      language: "zh",
      appearance: { fontSize: "compact", density: "compact" },
      claudeCode: { executionMode: "claude-code", claudeCommand: fakeClaude, permissionMode: "default" },
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
    sessions: [
      {
        id: "pass166-session",
        title: "Installed strip real status",
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
  assertStep("PASS166_OPEN_CAPABILITIES", await win.webContents.executeJavaScript(`
    (function() {
      const button = Array.from(document.querySelectorAll('.nav-stack button'))
        .find((candidate) => /\\u63d2\\u4ef6/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS166_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS166_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  await openCapabilities(win);
  assertStep("PASS166_STRIP_REAL_STATUS_BADGES", await waitFor(win, `
    Boolean(
      document.querySelector('.installed-capability-icon[data-capability-strip-kind="plugin"][data-capability-strip-status="enabled"][data-capability-strip-id="pass166-ok-plugin@pass166-market"]') &&
      document.querySelector('.installed-capability-icon[data-capability-strip-kind="plugin"][data-capability-strip-status="error"][data-capability-strip-id="pass166-error-plugin@pass166-market"]') &&
      document.querySelector('.installed-capability-icon[data-capability-strip-kind="mcp"][data-capability-strip-status="enabled"][data-capability-strip-id*="pass166-good-mcp"]') &&
      document.querySelector('.installed-capability-icon[data-capability-strip-kind="mcp"][data-capability-strip-status="error"][data-capability-strip-id*="pass166-bad-mcp"]') &&
      document.querySelector('.installed-capability-icon[data-capability-strip-kind="skill"][data-capability-strip-status="enabled"][data-capability-strip-id="pass166-strip-skill"]')
    )
  `, 15000));
  assertStep("PASS166_STRIP_PLUGIN_DEEP_LINK", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.installed-capability-icon[data-capability-strip-kind="plugin"][data-capability-strip-id="pass166-error-plugin@pass166-market"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS166_PLUGIN_ROW_FOCUSED", await waitFor(win, `
    (function() {
      const input = document.querySelector('.capability-search input');
      const row = document.querySelector('.structured-plugin-row.focused-capability-row[data-plugin-id="pass166-error-plugin@pass166-market"]');
      const text = row?.textContent || "";
      return Boolean(
        input?.value === 'pass166-error-plugin@pass166-market' &&
        row?.querySelector('.plugin-status-badge.error') &&
        /pass166 plugin load failed/.test(text)
      );
    })();
  `, 10000));
  assertStep("PASS166_STRIP_MCP_DEEP_LINK", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.installed-capability-icon[data-capability-strip-kind="mcp"][data-capability-strip-id*="pass166-bad-mcp"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS166_MCP_ROW_FOCUSED", await waitFor(win, `
    (function() {
      const input = document.querySelector('.capability-search input');
      const row = document.querySelector('.structured-plugin-row.focused-capability-row[data-mcp-server-id="pass166-bad-mcp"]');
      const text = row?.textContent || "";
      return Boolean(
        input?.value === 'pass166-bad-mcp' &&
        row?.querySelector('.plugin-status-badge.error') &&
        /pass166 mcp failed/.test(text)
      );
    })();
  `, 10000));
  assertStep("PASS166_STRIP_SKILL_DEEP_LINK", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.installed-capability-icon[data-capability-strip-kind="skill"][data-capability-strip-id="pass166-strip-skill"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS166_SKILL_ROW_FOCUSED", await waitFor(win, `
    (function() {
      const input = document.querySelector('.capability-search input');
      const row = document.querySelector('.skill-registry-row.focused-capability-row');
      const text = row?.textContent || "";
      return Boolean(
        input?.value === 'pass166-strip-skill' &&
        /pass166 strip skill/.test(text) &&
        /SKILL\\.md/.test(text)
      );
    })();
  `, 10000));
  assertStep("PASS166_STATUS_REFRESH_USED_CLI", /plugin list --json/.test(fs.readFileSync(COMMAND_LOG, "utf8")) && /mcp list --json/.test(fs.readFileSync(COMMAND_LOG, "utf8")));

  console.log("PASS166_INSTALLED_STRIP_REAL_STATUS_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeSkillRegistryFixture();
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS166_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS166_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
