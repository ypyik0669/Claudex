const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass304-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass304-project-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass304-bin-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");

function cleanup() {
  for (const dir of [USER_DATA_DIR, PROJECT_DIR, FAKE_BIN_DIR]) {
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

function writeFakeClaude() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  const fakeScript = `
const args = process.argv.slice(2);
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
if (args[0] === '--version') out('2.30.4 (Claude Code QA)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else out('pass304 fake claude command: ' + args.join(' '));
`;
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeScript, "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
  return path.join(FAKE_BIN_DIR, "claude.cmd");
}

function writeInitialStore() {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass304-rail-dock" }, null, 2), "utf8");
  fs.writeFileSync(path.join(PROJECT_DIR, "README.md"), "# pass304 rail dock\n", "utf8");
  execFileSync("git", ["init"], { cwd: PROJECT_DIR, stdio: "ignore" });
  const fakeClaude = writeFakeClaude();
  const project = { name: "pass304-rail-dock", path: PROJECT_DIR };
  const createdAt = "2026-07-09T00:00:00.000Z";
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(
      {
        version: 1,
        settings: {
          provider: "anthropic",
          model: "claude-haiku-4-5-20251001",
          baseUrl: "https://api.example.invalid",
          temperature: 0.2,
          timeoutMs: 600000,
          language: "zh",
          appearance: { fontSize: "compact", density: "compact" },
          claudeCode: {
            executionMode: "claude-code",
            claudeCommand: fakeClaude,
            permissionMode: "default",
          },
          capabilities: {
            "project-context": true,
            "terminal-helper": true,
            "mcp-runtime": true,
            "plugin-router": true,
            "marketplace-router": true,
          },
          apiKeys: {},
          customMarketplaces: [],
        },
        activeProject: project,
        projects: [project],
        sessions: [
          {
            id: "pass304-session",
            title: "Rail bottom panel composer dock",
            project: project.name,
            projectPath: PROJECT_DIR,
            createdAt,
            updatedAt: "2026-07-09T00:01:00.000Z",
            messages: [
              { role: "user", content: "PASS304 rail opens evidence panels.", createdAt },
              { role: "assistant", content: "Composer remains usable above docked evidence panels.", createdAt: "2026-07-09T00:01:00.000Z" },
            ],
          },
        ],
        automations: [
          {
            id: "pass304-automation",
            prompt: "PASS304 scheduled automation state",
            status: "scheduled",
            nextRun: "2026-07-10T00:00:00.000Z",
            createdAt,
            project,
          },
        ],
        subagentRuns: [
          {
            id: "pass304-subagent",
            requestId: "pass304-subagent-request",
            nickname: "PASS304 dock agent",
            task: "PASS304 subagent rail state",
            status: "completed",
            project,
            startedAt: createdAt,
            endedAt: "2026-07-09T00:02:00.000Z",
            artifacts: [],
          },
        ],
        commandRuns: [],
        runEvents: [],
        sourceRefs: [],
        browserVisits: [],
        notices: [
          {
            id: "pass304-notice",
            level: "warning",
            source: "qa",
            title: "PASS304 rail notice",
            detail: "Notice rail opens a docked bottom panel without covering composer.",
            createdAt,
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );
}

async function assertRailBottomPanelDock(win, toolId, expectedTab, beforeValue, afterValue) {
  assertStep(`PASS304_CLICK_RAIL_${toolId.toUpperCase()}`, await win.webContents.executeJavaScript(`
    (function() {
      const textarea = document.querySelector('.composer-dock textarea');
      const button = document.querySelector('.rail-button[data-tool="${toolId}"]');
      if (!textarea || !button) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter.call(textarea, ${JSON.stringify(beforeValue)});
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      button.click();
      return true;
    })();
  `));
  assertStep(`PASS304_${toolId.toUpperCase()}_BOTTOM_TAB`, await waitFor(win, `
    Boolean(
      document.querySelector('.app-grid.right-panel-hidden') &&
      document.querySelector('.app-rail') &&
      document.querySelector('.bottom-work-panel') &&
      document.querySelector('.bottom-panel-tabs button.active[data-bottom-tab="${expectedTab}"]')
    )
  `, 10000));
  const result = await win.webContents.executeJavaScript(`
    (function() {
      const grid = document.querySelector('.app-grid');
      const rail = document.querySelector('.app-rail');
      const panel = document.querySelector('.bottom-work-panel');
      const body = document.querySelector('.bottom-panel-body');
      const composer = document.querySelector('.composer-dock .prompt-box');
      const textarea = document.querySelector('.composer-dock textarea');
      if (!grid || !rail || !panel || !body || !composer || !textarea) {
        return { ok: false, reason: 'missing-element' };
      }
      const panelStyle = getComputedStyle(panel);
      const bodyStyle = getComputedStyle(body);
      const composerBox = composer.getBoundingClientRect();
      const panelBox = panel.getBoundingClientRect();
      const textareaBox = textarea.getBoundingClientRect();
      const draftPreserved = textarea.value === ${JSON.stringify(beforeValue)};
      textarea.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter.call(textarea, ${JSON.stringify(afterValue)});
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      const dockedBelowComposer = composerBox.bottom <= panelBox.top + 1;
      const textareaVisible = textareaBox.width > 0 &&
        textareaBox.height > 0 &&
        textareaBox.bottom <= window.innerHeight &&
        textareaBox.top >= 0;
      return {
        ok: grid.classList.contains('right-panel-hidden') &&
          panelStyle.position !== 'absolute' &&
          bodyStyle.overflowY !== 'visible' &&
          dockedBelowComposer &&
          textareaVisible &&
          draftPreserved &&
          document.activeElement === textarea &&
          textarea.value === ${JSON.stringify(afterValue)},
        position: panelStyle.position,
        bodyOverflowY: bodyStyle.overflowY,
        composerBottom: Math.round(composerBox.bottom),
        panelTop: Math.round(panelBox.top),
        textareaVisible,
        draftPreserved,
        focused: document.activeElement === textarea,
        value: textarea.value,
      };
    })();
  `);
  console.log(`PASS304_${toolId.toUpperCase()}_DOCKED`, result);
  if (!result?.ok) throw new Error(`PASS304_${toolId.toUpperCase()}_DOCKED failed: ${JSON.stringify(result)}`);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS304_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS304_READY", await waitFor(win, `
    Boolean(
      document.querySelector('.app-grid.right-panel-hidden') &&
      document.querySelector('.app-rail') &&
      document.querySelector('.composer-dock .prompt-box') &&
      window.claudexDesktop
    )
  `, 15000));
  assertStep("PASS304_RAIL_ACTIONS_PRESENT", await waitFor(win, `
    ['environment', 'notices', 'automations', 'subagents'].every((id) =>
      Boolean(document.querySelector('.rail-button[data-tool="' + id + '"]'))
    )
  `, 10000));

  await assertRailBottomPanelDock(win, "environment", "environment", "pass304 environment draft", "pass304 environment after dock");
  await assertRailBottomPanelDock(win, "notices", "notices", "pass304 notices draft", "pass304 notices after dock");
  await assertRailBottomPanelDock(win, "automations", "subagents", "pass304 automation draft", "pass304 automation after dock");
  await assertRailBottomPanelDock(win, "subagents", "subagents", "pass304 subagent draft", "pass304 subagent after dock");

  console.log("PASS304_RAIL_BOTTOM_PANEL_COMPOSER_DOCK_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("appData", USER_DATA_DIR);
app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS304_FAILED", error?.stack || error);
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    const debug = await win.webContents.executeJavaScript(`
      (function() {
        return {
          grid: document.querySelector('.app-grid')?.className || '',
          activeBottomTab: document.querySelector('.bottom-panel-tabs button.active')?.getAttribute('data-bottom-tab') || '',
          panel: document.querySelector('.bottom-work-panel')?.outerHTML?.slice(0, 3000) || '',
          composer: document.querySelector('.composer-dock textarea')?.value || '',
          body: document.body.textContent.slice(0, 4000),
        };
      })();
    `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
    console.error("PASS304_DEBUG", JSON.stringify(debug, null, 2).slice(0, 12000));
  }
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS304_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
