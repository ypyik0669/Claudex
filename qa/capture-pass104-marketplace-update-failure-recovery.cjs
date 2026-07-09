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
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass104-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass104-bin-"));
const MARKETPLACE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass104-market-"));
const MARKETPLACE_MANIFEST_DIR = path.join(MARKETPLACE_DIR, ".claude-plugin");
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass104-project-"));
const COMMAND_LOG = path.join(USER_DATA_DIR, "claude-command-log.txt");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, MARKETPLACE_DIR, PROJECT_DIR]) {
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

function readCommandLog() {
  try {
    return fs.readFileSync(COMMAND_LOG, "utf8");
  } catch (_error) {
    return "";
  }
}

async function wait(ms) {
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

async function waitForLog(pattern, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (pattern.test(readCommandLog())) return true;
    await wait(150);
  }
  return false;
}

async function openPaletteAndQuery(win, query) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 260));
      return true;
    })();
  `);
}

async function clickNoticeCommand(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const noticeId = window.__PASS104_NOTICE_ID__ || '';
      const expectedId = 'notice:' + encodeURIComponent(noticeId).slice(0, 120);
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === expectedId);
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

function assertStep(name, ok) {
  console.log(name, ok);
  if (!ok) throw new Error(`${name} failed`);
}

function writeMarketplaceFixture() {
  fs.mkdirSync(MARKETPLACE_MANIFEST_DIR, { recursive: true });
  writeJson(path.join(MARKETPLACE_MANIFEST_DIR, "marketplace.json"), {
    name: "pass104-market",
    description: "PASS104 marketplace fixture",
    owner: { name: "PASS104 Owner" },
    plugins: [
      {
        name: "pass104-failing-plugin",
        description: "A deterministic plugin used to prove marketplace update failure recovery.",
        category: "testing",
        author: { name: "PASS104 QA" },
        source: { source: "git-subdir", url: "https://example.invalid/pass104.git", path: "plugins/qa", ref: "v1" },
      },
    ],
  });
}

function writeFakeClaude() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  const fakeClaudeScript = `
const fs = require('fs');
const args = process.argv.slice(2);
const marketplaceDir = ${JSON.stringify(MARKETPLACE_DIR)};
const commandLog = ${JSON.stringify(COMMAND_LOG)};
fs.appendFileSync(commandLog, args.join(' ') + '\\n', 'utf8');
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
if (args[0] === '--version') out('2.10.4 (Claude Code QA)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'mcp' && args[1] === 'list') out('✓ pass104-mcp: connected');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([{ name: 'pass104-market', source: 'path', repo: marketplaceDir, installLocation: marketplaceDir, version: '2026.7.6', status: 'ready', permissions: ['Read', 'Bash'] }]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces:\\n\\n  > pass104-market\\n    Source: Path (' + marketplaceDir + ')');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'update') { process.stderr.write('pass104 marketplace update failed\\n'); process.exitCode = 31; }
else out('pass104 fake claude command: ' + args.join(' '));
`;
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  const command = path.join(FAKE_BIN_DIR, "claude.cmd");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
  return command;
}

function writeInitialStore() {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass104-project" }), "utf8");
  const fakeClaude = writeFakeClaude();
  const project = { name: "pass104-project", path: PROJECT_DIR };
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
        id: "pass104-session",
        title: "Marketplace update failure recovery",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-06T00:00:00.000Z",
        updatedAt: "2026-07-06T00:00:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    automations: [],
    subagentRuns: [],
    browserVisits: [],
    notices: [],
  });
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS104_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS104_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS104_OPEN_CAPABILITIES", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.nav-stack button')].find((candidate) => /插件/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS104_OPEN_MARKETPLACE", await waitFor(win, "Boolean(document.querySelector('.plugin-manager-tabs'))", 10000) && await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.plugin-manager-tabs button')].find((candidate) => /市场/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS104_MARKETPLACE_SOURCE_READY", await waitFor(win, `
    Boolean(document.querySelector('[data-marketplace-source-id="pass104-market"]') &&
      /2026\\.7\\.6/.test(document.querySelector('[data-marketplace-source-id="pass104-market"]')?.textContent || ''))
  `, 15000));

  const beforeUpdate = readCommandLog();
  assertStep("PASS104_CLICK_UPDATE", await win.webContents.executeJavaScript(`
    (async function() {
      let button = null;
      const startedAt = Date.now();
      while (Date.now() - startedAt < 5000) {
        button = [...document.querySelectorAll('.marketplace-actions button')]
          .find((candidate) => /更新/.test(candidate.textContent || ''));
        if (button && !button.disabled) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS104_UPDATE_CONFIRM_VISIBLE", await waitFor(win, "Boolean(document.querySelector('.plugin-cli-confirm'))", 5000));
  assertStep("PASS104_UPDATE_NOT_RUN_BEFORE_CONFIRM", !/plugin marketplace update/.test(readCommandLog().slice(beforeUpdate.length)));
  assertStep("PASS104_CONFIRM_UPDATE", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.plugin-cli-confirm .danger-action');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS104_UPDATE_RAN_AFTER_CONFIRM", await waitForLog(/plugin marketplace update/));
  assertStep("PASS104_MARKETPLACE_UPDATE_FAILURE_FOCUS", await waitFor(win, `
    (function() {
      const input = document.querySelector('.capability-search input');
      const row = document.querySelector('[data-marketplace-source-id="pass104-market"]');
      const text = row?.textContent || '';
      return Boolean(
        input?.value === 'pass104-market' &&
        row?.classList.contains('focused-capability-row') &&
        row?.querySelector('.row-cli-action-evidence.error') &&
        /pass104 marketplace update failed/.test(text) &&
        /31/.test(text) &&
        /重试/.test(text) &&
        /打开输出/.test(text) &&
        /pass104 marketplace update failed/.test(document.querySelector('.plugin-cli-error')?.textContent || '')
      );
    })();
  `, 15000));
  assertStep("PASS104_FAILURE_PERSISTED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const notice = (state.notices || []).find((item) => item.level === 'error' &&
        /pass104 marketplace update failed/.test((item.title || '') + (item.detail || '')));
      const run = (state.commandRuns || []).find((item) => item.kind === 'capability' &&
          /plugin marketplace update/.test(item.command || item.commandLine || '') &&
          item.code === 31 &&
          /pass104 marketplace update failed/.test(item.stderr || ''));
      window.__PASS104_NOTICE_ID__ = notice?.id || '';
      window.__PASS104_RUN_ID__ = notice?.runEventId || run?.requestId || run?.id || '';
      return Boolean(
        run &&
        notice &&
        notice.action === 'capability-recovery:' + encodeURIComponent(notice.runEventId) &&
        notice.runEventId
      );
    })();
  `, 10000));

  assertStep("PASS104_OPEN_PALETTE_NOTICE", await openPaletteAndQuery(win, "notice pass104 marketplace update failed"));
  assertStep("PASS104_NOTICE_COMMAND_VISIBLE", await waitFor(win, `
    (function() {
      const noticeId = window.__PASS104_NOTICE_ID__ || '';
      const expectedId = 'notice:' + encodeURIComponent(noticeId).slice(0, 120);
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === expectedId);
      const text = button?.textContent || '';
      return Boolean(
        button &&
        button.getAttribute('data-command-target') === 'timeline' &&
        /pass104 marketplace update failed/.test(text) &&
        /\\u67e5\\u770b\\u8bc1\\u636e/.test(text)
      );
    })();
  `, 10000));
  assertStep("PASS104_CLICK_NOTICE_COMMAND", await clickNoticeCommand(win));
  assertStep("PASS104_NOTICE_OPENS_EVIDENCE_RETRY", await waitFor(win, `
    (function() {
      const runId = window.__PASS104_RUN_ID__ || '';
      const active = document.querySelector('.bottom-panel-tabs button[data-bottom-tab="outputs"].active') ||
        document.querySelector('.workspace-context-button.active');
      const panel = document.querySelector('.selected-run-evidence-panel.error');
      const retry = panel?.querySelector('[data-run-recovery-action="retry-capability"]');
      const text = panel?.textContent || '';
      return Boolean(
        active &&
        panel &&
        retry &&
        retry.getAttribute('data-run-recovery-action-focused') === 'true' &&
        document.activeElement === retry &&
        /plugin marketplace update/.test(text) &&
        /pass104 marketplace update failed/.test(text) &&
        (!runId || /plugin marketplace update/.test(text))
      );
    })();
  `, 12000));
  const beforeNoticeRetry = readCommandLog();
  assertStep("PASS104_CLICK_NOTICE_EVIDENCE_RETRY", await win.webContents.executeJavaScript(`
    (function() {
      const retry = document.querySelector('.selected-run-evidence-panel [data-run-recovery-action="retry-capability"]');
      if (!retry || retry.disabled) return false;
      retry.click();
      return true;
    })();
  `));
  assertStep("PASS104_NOTICE_RETRY_SOURCE_CONFIRM", await waitFor(win, `
    (function() {
      const row = document.querySelector('.plugin-manager-modal [data-marketplace-source-id="pass104-market"]');
      const update = row?.querySelector('[data-marketplace-source-action="update"]');
      const confirm = document.querySelector('.plugin-cli-confirm');
      const confirmText = confirm?.textContent || '';
      return Boolean(
        row &&
        update &&
        row.classList.contains('focused-capability-row') &&
        update.getAttribute('data-capability-action-focused') === 'true' &&
        update.getAttribute('data-capability-kind') === 'marketplace-source' &&
        update.getAttribute('data-capability-action') === 'update' &&
        update.getAttribute('data-capability-id') === 'pass104-market' &&
        confirm &&
        /plugin marketplace update/.test(confirmText) &&
        /pass104-market/.test(confirmText)
      );
    })();
  `, 12000));
  assertStep("PASS104_NOTICE_RETRY_NOT_RUN_BEFORE_CONFIRM", !/plugin marketplace update/.test(readCommandLog().slice(beforeNoticeRetry.length)));

  console.log("PASS104_MARKETPLACE_UPDATE_FAILURE_RECOVERY_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeMarketplaceFixture();
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS104_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (async function() {
          return {
            noticeId: window.__PASS104_NOTICE_ID__ || '',
            runId: window.__PASS104_RUN_ID__ || '',
            commands: [...document.querySelectorAll('.command-modal .command-list button')].map((button) => ({
              id: button.getAttribute('data-command-id'),
              target: button.getAttribute('data-command-target'),
              text: button.textContent,
            })),
            actions: [...document.querySelectorAll('.plugin-manager-modal [data-marketplace-source-action], .plugin-manager-modal [data-capability-action-focused]')].map((item) => ({
              text: item.textContent,
              attrs: Object.fromEntries([...item.attributes].map((attr) => [attr.name, attr.value])),
            })),
            confirm: document.querySelector('.plugin-cli-confirm')?.textContent || '',
            body: document.body?.textContent?.slice(0, 6000) || '',
            state: await window.claudexDesktop.getState().catch((stateError) => ({ error: String(stateError?.message || stateError) })),
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS104_DEBUG", JSON.stringify(debug, null, 2).slice(0, 14000));
      console.error("PASS104_COMMAND_LOG", readCommandLog());
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS104_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
