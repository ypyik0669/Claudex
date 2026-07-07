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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass272-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass272-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass272-project-"));
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
if (args[0] === '--version') out('2.72.0 (Claude Code PASS272)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) {
  process.stderr.write('pass272 plugin json failed\\n');
  process.exit(21);
}
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins:\\n\\n  > pass272-installed@qa\\n    Version: 1.0.0\\n    Scope: user\\n    Status: enabled');
else if (args[0] === 'mcp' && args[1] === 'list') {
  process.stderr.write('pass272 mcp failed\\n');
  process.exit(22);
}
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) {
  process.stderr.write('pass272 marketplace json failed\\n');
  process.exit(23);
}
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') {
  process.stderr.write('pass272 marketplace failed\\n');
  process.exit(24);
}
else out('pass272 fake claude command: ' + args.join(' '));
`;
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(FAKE_CLAUDE, '@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n', "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function writeInitialStore() {
  writeFakeClaude();
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass272-project" }), "utf8");
  const project = { name: "pass272-project", path: PROJECT_DIR };
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
      id: "pass272-session",
      title: "PASS272 runtime health action focus",
      project: project.name,
      projectPath: project.path,
      createdAt: "2026-07-08T03:30:00.000Z",
      updatedAt: "2026-07-08T03:30:00.000Z",
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

async function runPaletteCommand(win, query, expectedId) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 240));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 320));
      const button = document.querySelector(${JSON.stringify(`.command-modal .command-list button[data-command-id="${expectedId}"]`)});
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function closeCapabilitySurface(win) {
  await win.webContents.executeJavaScript(`
    (function() {
      document.querySelector('.capability-modal header .icon-only')?.click();
      return true;
    })();
  `);
  await waitFor(win, "!document.querySelector('.capability-modal')", 5000);
}

async function openAndAssertRuntimeActionFocused(win, spec) {
  assertStep(`${spec.name}_COMMAND_CLICKED`, await runPaletteCommand(win, spec.query, spec.commandId));
  assertStep(`${spec.name}_ACTION_FOCUSED_READY`, await waitFor(win, `
    (function() {
      const card = document.querySelector('.capability-modal .runtime-health-card.error');
      const action = document.querySelector(${JSON.stringify(spec.selector)});
      return Boolean(
        card &&
        /pass272 plugin json failed/.test(card.textContent || '') &&
        /pass272 mcp failed/.test(card.textContent || '') &&
        /pass272 marketplace json failed/.test(card.textContent || '') &&
        action &&
        action.getAttribute('data-runtime-health-action-focused') === 'true' &&
        action.getAttribute('aria-current') === 'true'
      );
    })();
  `, 12000));
  const state = await win.webContents.executeJavaScript(`
    (function() {
      const action = document.querySelector(${JSON.stringify(spec.selector)});
      const focused = Array.from(document.querySelectorAll('.capability-modal [data-runtime-health-action-focused="true"]'));
      const issueSelector = ${JSON.stringify(spec.issueSelector || "")};
      const issue = issueSelector ? document.querySelector(issueSelector) : null;
      return {
        actionText: action?.textContent || '',
        actionKind: action?.getAttribute('data-runtime-health-action') || action?.getAttribute('data-runtime-health-issue-action') || '',
        actionTarget: action?.getAttribute('data-runtime-health-issue-target') || '',
        actionFocused: action?.getAttribute('data-runtime-health-action-focused') || '',
        actionAria: action?.getAttribute('aria-current') || '',
        issueFocused: issue?.getAttribute('data-runtime-health-issue-focused') || '',
        issueAria: issue?.getAttribute('aria-current') || '',
        focusedCount: focused.length,
      };
    })();
  `);
  assertStep(`${spec.name}_ACTION_FOCUS_TRACE`, Boolean(
    state &&
    state.actionFocused === "true" &&
    state.actionAria === "true" &&
    state.focusedCount === 1 &&
    (!spec.expectedActionKind || state.actionKind === spec.expectedActionKind) &&
    (!spec.expectedTarget || state.actionTarget === spec.expectedTarget) &&
    (!spec.issueSelector || (state.issueFocused === "true" && state.issueAria === "true"))
  ));
  if (spec.afterFocus) await spec.afterFocus(win);
  await closeCapabilitySurface(win);
}

writeInitialStore();
app.setPath("userData", USER_DATA_DIR);
require(path.join(REPO_DIR, "electron", "main.cjs"));

async function runTest() {
  await wait(1700);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS272_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS272_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS272_STATUS_ISSUES_READY", await waitFor(win, `
    (async function() {
      const status = await window.claudexDesktop.getClaudeStatus({ projectPath: ${JSON.stringify(PROJECT_DIR)} });
      return Boolean(
        status.pluginCommand?.code === 0 &&
        status.pluginCommand?.jsonCode === 21 &&
        status.mcpCommand?.code === 22 &&
        status.marketplaceCommand?.jsonCode === 23 &&
        /pass272 plugin json failed/.test(status.pluginCommand?.jsonStderr || status.pluginCommand?.stderr || '') &&
        /pass272 mcp failed/.test(status.mcpCommand?.stderr || '') &&
        /pass272 marketplace json failed/.test(status.marketplaceCommand?.jsonStderr || status.marketplaceCommand?.stderr || '')
      );
    })();
  `, 15000));

  await openAndAssertRuntimeActionFocused(win, {
    name: "PASS272_RUNTIME_COPY",
    query: "runtime health copy pass272 plugin",
    commandId: "runtime-health-action:copy",
    selector: '.capability-modal .runtime-health-card button[data-runtime-health-action="copy"]',
    expectedActionKind: "copy",
  });

  await openAndAssertRuntimeActionFocused(win, {
    name: "PASS272_RUNTIME_PIN",
    query: "runtime health pin pass272 marketplace",
    commandId: "runtime-health-action:pin",
    selector: '.capability-modal .runtime-health-card button[data-runtime-health-action="pin"]',
    expectedActionKind: "pin",
  });

  await openAndAssertRuntimeActionFocused(win, {
    name: "PASS272_RUNTIME_MCP_ISSUE",
    query: "runtime health issue mcp pass272",
    commandId: "runtime-health-issue:mcp",
    selector: '.capability-modal .runtime-health-issue[data-runtime-health-issue-target="mcp"] button[data-runtime-health-issue-action="open"]',
    issueSelector: '.capability-modal .runtime-health-issue[data-runtime-health-issue-target="mcp"]',
    expectedActionKind: "open",
    expectedTarget: "mcp",
    afterFocus: async (focusedWin) => {
      assertStep("PASS272_RUNTIME_MCP_ISSUE_CLICK", await focusedWin.webContents.executeJavaScript(`
        (function() {
          const button = document.querySelector('.capability-modal .runtime-health-issue[data-runtime-health-issue-target="mcp"] button[data-runtime-health-issue-action="open"]');
          if (!button) return false;
          button.click();
          return true;
        })();
      `));
      assertStep("PASS272_RUNTIME_MCP_TAB_OPENED", await waitFor(focusedWin, `
        (function() {
          const active = document.querySelector('.plugin-manager-tabs button[aria-selected="true"]');
          return Boolean(active && /MCP/i.test(active.textContent || '') && document.querySelector('.structured-registry-section'));
        })();
      `, 8000));
    },
  });

  await openAndAssertRuntimeActionFocused(win, {
    name: "PASS272_RUNTIME_MARKETPLACE_ISSUE",
    query: "runtime health issue marketplace pass272",
    commandId: "runtime-health-issue:marketplace",
    selector: '.capability-modal .runtime-health-issue[data-runtime-health-issue-target="marketplace"] button[data-runtime-health-issue-action="open"]',
    issueSelector: '.capability-modal .runtime-health-issue[data-runtime-health-issue-target="marketplace"]',
    expectedActionKind: "open",
    expectedTarget: "marketplace",
  });

  console.log("PASS272_RUNTIME_HEALTH_ACTION_FOCUS_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS272_FAILED", error?.stack || error);
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    const debug = await win.webContents.executeJavaScript(`
      (function() {
        return {
          commands: Array.from(document.querySelectorAll('.command-modal .command-list button')).slice(0, 50).map((item) => ({
            id: item.getAttribute('data-command-id'),
            text: item.textContent,
            attrs: Object.fromEntries(Array.from(item.attributes).map((attr) => [attr.name, attr.value])),
          })),
          actions: Array.from(document.querySelectorAll('.capability-modal [data-runtime-health-action-focused], .capability-modal [data-runtime-health-action], .capability-modal [data-runtime-health-issue-action]')).slice(0, 50).map((item) => ({
            text: item.textContent,
            attrs: Object.fromEntries(Array.from(item.attributes).map((attr) => [attr.name, attr.value])),
          })),
          body: document.body.textContent?.slice(0, 7000) || '',
        };
      })();
    `).catch((debugError) => ({ error: String(debugError?.stack || debugError) }));
    console.error("PASS272_DEBUG", JSON.stringify(debug, null, 2).slice(0, 26000));
  }
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS272_TIMEOUT");
  cleanup();
  app.exit(1);
}, 120000);
