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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass302-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass302-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass302-project-"));
const MARKETPLACE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass302-market-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const UPDATE_MARKER = path.join(USER_DATA_DIR, "pass302-marketplace-update-attempted.txt");
const MARKETPLACE_NAME = "pass302-market";

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

async function waitForMarker(timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (fs.existsSync(UPDATE_MARKER)) return true;
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
const fs = require('fs');
const marketplaceDir = ${JSON.stringify(MARKETPLACE_DIR)};
const updateMarker = ${JSON.stringify(UPDATE_MARKER)};
const args = process.argv.slice(2);
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
const marketplaceJson = [{
  name: '${MARKETPLACE_NAME}',
  source: 'path',
  repo: marketplaceDir,
  installLocation: marketplaceDir,
  version: '2026.7.10-pass302',
  status: 'ready',
  permissions: ['Read', 'Bash']
}];
if (args[0] === '--version') out('3.02.0 (Claude Code PASS302)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out({ plugins: [] });
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out({ servers: [] });
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out(marketplaceJson);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces:\\n\\n  > ${MARKETPLACE_NAME}\\n    Source: Path (' + marketplaceDir + ')');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'update') {
  fs.writeFileSync(updateMarker, args.join(' '), 'utf8');
  process.stderr.write('PASS302 marketplace update failed for ${MARKETPLACE_NAME}\\n');
  process.exitCode = 2;
}
else out('pass302 fake claude command: ' + args.join(' '));
`;
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(FAKE_CLAUDE, '@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n', "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function writeInitialStore() {
  writeFakeClaude();
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass302-project" }), "utf8");
  writeJson(path.join(MARKETPLACE_DIR, ".claude-plugin", "marketplace.json"), {
    name: MARKETPLACE_NAME,
    description: "PASS302 marketplace source recovery fixture",
    owner: { name: "PASS302 Owner" },
    plugins: [],
  });
  const project = { name: "pass302-project", path: PROJECT_DIR };
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
    sessions: [{
      id: "pass302-session",
      title: "PASS302 marketplace source recovery",
      project: project.name,
      projectPath: PROJECT_DIR,
      createdAt: "2026-07-10T00:00:00.000Z",
      updatedAt: "2026-07-10T00:00:00.000Z",
      messages: [],
    }],
    commandRuns: [],
    runEvents: [],
    automations: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

async function runPaletteCommandById(win, query, expectedId) {
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

async function paletteCommandByPrefix(win, query, prefix, click = false) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 240));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return null;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 360));
      const buttons = [...document.querySelectorAll('.command-modal .command-list button')];
      const button = buttons
        .find((candidate) => (candidate.getAttribute('data-command-id') || '').startsWith(${JSON.stringify(prefix)}));
      const result = button ? {
        id: button.getAttribute('data-command-id') || '',
        target: button.getAttribute('data-command-target') || '',
        kind: button.getAttribute('data-command-capability-kind') || '',
        capabilityId: button.getAttribute('data-command-capability-id') || '',
        action: button.getAttribute('data-command-capability-action') || '',
        text: button.textContent || '',
      } : {
        id: '',
        target: '',
        kind: '',
        capabilityId: '',
        action: '',
        text: '',
        visible: buttons.slice(0, 12).map((candidate) => ({
          id: candidate.getAttribute('data-command-id') || '',
          target: candidate.getAttribute('data-command-target') || '',
          text: candidate.textContent || '',
        })),
      };
      if (button && ${click ? "true" : "false"}) {
        button.click();
      } else {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      }
      await new Promise((resolve) => setTimeout(resolve, 160));
      return result;
    })();
  `);
}

writeInitialStore();
app.setPath("userData", USER_DATA_DIR);
require(path.join(REPO_DIR, "electron", "main.cjs"));

async function runTest() {
  await wait(1700);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS302_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  const updateCommandId = `capability-marketplace-source-action:update:${encodeURIComponent(MARKETPLACE_NAME).slice(0, 120)}`;
  const sourceSelector = `.capability-modal [data-marketplace-source-id="${MARKETPLACE_NAME}"]`;
  const updateSelector = `${sourceSelector} [data-marketplace-source-action="update"]`;
  const retrySelector = `${sourceSelector} [data-marketplace-source-action="retry"]`;

  assertStep("PASS302_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS302_STATUS_READY", await waitFor(win, `
    (async function() {
      const status = await window.claudexDesktop.getClaudeStatus({ projectPath: ${JSON.stringify(PROJECT_DIR)} });
      return Boolean(status.marketplaces?.some((item) => item.name === ${JSON.stringify(MARKETPLACE_NAME)} && /2026\\.7\\.10-pass302/.test(item.version || '')));
    })();
  `, 15000));

  assertStep("PASS302_UPDATE_COMMAND_CLICKED", await runPaletteCommandById(win, "update source pass302-market", updateCommandId));
  assertStep("PASS302_CONFIRM_VISIBLE_WITH_SOURCE_REVIEW", await waitFor(win, `
    Boolean(
      document.querySelector('.plugin-cli-confirm') &&
      /plugin marketplace update/.test(document.querySelector('.plugin-cli-confirm')?.textContent || '') &&
      /pass302-market/.test(document.querySelector('.plugin-cli-confirm')?.textContent || '')
    )
  `, 5000));
  assertStep("PASS302_CONFIRM_ACTION_READY", await waitFor(win, `
    (function() {
      const button = document.querySelector('.plugin-cli-confirm .danger-action');
      return Boolean(button && !button.disabled);
    })();
  `, 10000));
  assertStep("PASS302_CONFIRM_CLICKED", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.plugin-cli-confirm .danger-action');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS302_UPDATE_ATTEMPTED", await waitForMarker(10000));
  assertStep("PASS302_FAILED_COMMAND_RUN_PERSISTED_WITH_CONTEXT", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      return Boolean((state.commandRuns || []).some((run) =>
        run.kind === 'capability' &&
        run.code === 2 &&
        String(run.command || run.commandLine || '').includes('plugin marketplace update') &&
        run.capabilityContext?.kind === 'marketplace-source' &&
        run.capabilityContext?.id === ${JSON.stringify(MARKETPLACE_NAME)} &&
        run.capabilityContext?.action === 'update'
      ));
    })();
  `, 10000));
  assertStep("PASS302_INITIAL_CAPABILITY_SURFACE_CLOSED", await win.webContents.executeJavaScript(`
    (function() {
      const close = document.querySelector('.capability-modal .icon-only');
      if (!close) return true;
      close.click();
      return true;
    })();
  `));
  await wait(250);

  assertStep("PASS302_SELECTED_EVIDENCE_RECOVERY_TRACE", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.selected-run-evidence-panel');
      const contextButton = panel?.querySelector('[data-run-recovery-action="open-capability-context"]');
      const retryButton = panel?.querySelector('[data-run-recovery-action="retry-capability"]');
      const matches = (button) => Boolean(
        button &&
        button.getAttribute('data-run-recovery-event-id')?.startsWith('capability_') &&
        button.getAttribute('data-run-recovery-source') === 'command' &&
        button.getAttribute('data-run-recovery-capability-tab') === 'marketplace' &&
        button.getAttribute('data-run-recovery-capability-kind') === 'marketplace-source' &&
        button.getAttribute('data-run-recovery-capability-id') === ${JSON.stringify(MARKETPLACE_NAME)} &&
        button.getAttribute('data-run-recovery-capability-action') === 'update'
      );
      return matches(contextButton) && matches(retryButton);
    })();
  `, 10000));
  assertStep("PASS302_SELECTED_EVIDENCE_RETRY_CLICKED", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.selected-run-evidence-panel [data-run-recovery-action="retry-capability"]');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS302_SELECTED_EVIDENCE_RETRY_CONFIRM_VISIBLE", await waitFor(win, `
    Boolean(
      document.querySelector('.capability-modal [data-marketplace-source-id="${MARKETPLACE_NAME}"]') &&
      document.querySelector('.plugin-cli-confirm') &&
      /plugin marketplace update/.test(document.querySelector('.plugin-cli-confirm')?.textContent || '') &&
      /pass302-market/.test(document.querySelector('.plugin-cli-confirm')?.textContent || '')
    )
  `, 10000));
  assertStep("PASS302_SELECTED_EVIDENCE_RETRY_CONFIRM_CLOSED", await win.webContents.executeJavaScript(`
    (function() {
      const close = document.querySelector('.capability-modal .icon-only');
      if (!close) return false;
      close.click();
      return true;
    })();
  `));
  await wait(250);

  const recoveryQuery = "\u91cd\u8bd5";
  const retryAttrs = await paletteCommandByPrefix(win, recoveryQuery, "capability-recovery:retry:", false);
  assertStep("PASS302_RECOVERY_RETRY_COMMAND_TRACE", Boolean(
    retryAttrs &&
    retryAttrs.target === "capabilities" &&
    retryAttrs.kind === "marketplace-source" &&
    retryAttrs.capabilityId === MARKETPLACE_NAME &&
    retryAttrs.action === "update"
  ));
  assertStep("PASS302_RECOVERY_RETRY_COMMAND_CLICKED", Boolean(await paletteCommandByPrefix(win, recoveryQuery, "capability-recovery:retry:", true)));
  assertStep("PASS302_RECOVERY_RETRY_SOURCE_FOCUSED", await waitFor(win, `
    (function() {
      const activeTab = document.querySelector('.plugin-manager-tabs button.active')?.textContent || '';
      const row = document.querySelector(${JSON.stringify(sourceSelector)});
      const action = document.querySelector(${JSON.stringify(retrySelector)});
      return Boolean(
        /\\u5e02\\u573a/.test(activeTab) &&
        row &&
        row.getAttribute('data-capability-focused') === 'true' &&
        action &&
        action.getAttribute('data-capability-action-focused') === 'true' &&
        action.getAttribute('data-capability-action') === 'retry' &&
        /pass302-market/.test(row.textContent || '')
      );
    })();
  `, 10000));

  console.log("PASS302_MARKETPLACE_SOURCE_RECOVERY_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS302_FAILED", error?.stack || error);
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    const debug = await win.webContents.executeJavaScript(`
      (function() {
        return {
          commands: Array.from(document.querySelectorAll('.command-modal .command-list button')).slice(0, 60).map((item) => ({
            id: item.getAttribute('data-command-id'),
            target: item.getAttribute('data-command-target'),
            kind: item.getAttribute('data-command-capability-kind'),
            capabilityId: item.getAttribute('data-command-capability-id'),
            action: item.getAttribute('data-command-capability-action'),
            text: item.textContent,
          })),
          actions: Array.from(document.querySelectorAll('.capability-modal [data-capability-action-focused], .capability-modal [data-marketplace-source-action]')).slice(0, 40).map((item) => ({
            text: item.textContent,
            attrs: Object.fromEntries(Array.from(item.attributes).map((attr) => [attr.name, attr.value])),
          })),
          confirm: document.querySelector('.plugin-cli-confirm')?.textContent || '',
          body: document.body.textContent?.slice(0, 8000) || '',
        };
      })();
    `).catch((debugError) => ({ error: String(debugError?.stack || debugError) }));
    console.error("PASS302_DEBUG", JSON.stringify(debug, null, 2).slice(0, 24000));
  }
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS302_TIMEOUT");
  cleanup();
  app.exit(1);
}, 120000);
