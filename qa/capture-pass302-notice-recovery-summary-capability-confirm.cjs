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
const OTHER_MARKETPLACE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass302-other-market-"));
const MARKETPLACE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass302-market-"));
const OTHER_MARKETPLACE_MANIFEST_DIR = path.join(OTHER_MARKETPLACE_DIR, ".claude-plugin");
const MARKETPLACE_MANIFEST_DIR = path.join(MARKETPLACE_DIR, ".claude-plugin");
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass302-project-"));
const COMMAND_LOG = path.join(USER_DATA_DIR, "claude-command-log.txt");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const OTHER_MARKETPLACE_NAME = "pass302-alpha";
const TARGET_MARKETPLACE_NAME = "pass302-market";

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, OTHER_MARKETPLACE_DIR, MARKETPLACE_DIR, PROJECT_DIR]) {
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
      await new Promise((resolve) => setTimeout(resolve, 240));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 300));
      return true;
    })();
  `);
}

async function clickNoticeRecoveryCommand(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === 'notice-recovery:timeline');
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
  fs.mkdirSync(OTHER_MARKETPLACE_MANIFEST_DIR, { recursive: true });
  writeJson(path.join(OTHER_MARKETPLACE_MANIFEST_DIR, "marketplace.json"), {
    name: OTHER_MARKETPLACE_NAME,
    description: "PASS302 first marketplace fixture that must not receive recovery focus",
    owner: { name: "PASS302 Alpha Owner" },
    plugins: [],
  });
  fs.mkdirSync(MARKETPLACE_MANIFEST_DIR, { recursive: true });
  writeJson(path.join(MARKETPLACE_MANIFEST_DIR, "marketplace.json"), {
    name: TARGET_MARKETPLACE_NAME,
    description: "PASS302 marketplace fixture",
    owner: { name: "PASS302 Owner" },
    plugins: [
      {
        name: "pass302-failing-plugin",
        description: "A deterministic plugin used to prove notice recovery bucket capability confirmation.",
        category: "testing",
        author: { name: "PASS302 QA" },
        source: { source: "git-subdir", url: "https://example.invalid/pass302.git", path: "plugins/qa", ref: "v1" },
      },
    ],
  });
}

function writeFakeClaude() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
const fakeClaudeScript = `
const fs = require('fs');
const args = process.argv.slice(2);
const otherMarketplaceDir = ${JSON.stringify(OTHER_MARKETPLACE_DIR)};
const marketplaceDir = ${JSON.stringify(MARKETPLACE_DIR)};
const commandLog = ${JSON.stringify(COMMAND_LOG)};
fs.appendFileSync(commandLog, args.join(' ') + '\\n', 'utf8');
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
if (args[0] === '--version') out('2.10.4 (Claude Code QA)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out([{ name: 'pass302-mcp', status: 'connected', tools: [] }]);
else if (args[0] === 'mcp' && args[1] === 'list') out('✓ pass302-mcp: connected');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([
  { name: '${OTHER_MARKETPLACE_NAME}', source: 'path', repo: otherMarketplaceDir, installLocation: otherMarketplaceDir, version: '302.0.1-alpha', status: 'ready', permissions: ['Read'] },
  { name: '${TARGET_MARKETPLACE_NAME}', source: 'path', repo: marketplaceDir, installLocation: marketplaceDir, version: '302.7.9', status: 'ready', permissions: ['Read', 'Bash'] }
]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces:\\n\\n  > ${OTHER_MARKETPLACE_NAME}\\n    Source: Path (' + otherMarketplaceDir + ')\\n\\n  > ${TARGET_MARKETPLACE_NAME}\\n    Source: Path (' + marketplaceDir + ')');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'update') { process.stderr.write('pass302 marketplace update failed\\n'); process.exitCode = 32; }
else out('pass302 fake claude command: ' + args.join(' '));
`;
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  const command = path.join(FAKE_BIN_DIR, "claude.cmd");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
  return command;
}

function writeInitialStore() {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass302-project" }), "utf8");
  const fakeClaude = writeFakeClaude();
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
        id: "pass302-session",
        title: "Notice recovery bucket capability confirmation",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-09T00:00:00.000Z",
        updatedAt: "2026-07-09T00:00:00.000Z",
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

async function openCapabilities(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.nav-stack button')]
        .find((candidate) => /\\u63d2\\u4ef6/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function openMarketplaceTab(win) {
  return waitFor(win, "Boolean(document.querySelector('.plugin-manager-tabs'))", 10000) && win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.plugin-manager-tabs button')]
        .find((candidate) => /\\u5e02\\u573a/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function clickMarketplaceUpdate(win) {
  return win.webContents.executeJavaScript(`
    (async function() {
      let button = null;
      const startedAt = Date.now();
      while (Date.now() - startedAt < 5000) {
        const targetRow = document.querySelector('[data-marketplace-source-id="${TARGET_MARKETPLACE_NAME}"]');
        button = targetRow?.querySelector('[data-marketplace-source-action="update"]') || null;
        if (button && !button.disabled) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `);
}

async function confirmCliAction(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.plugin-cli-confirm .danger-action');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `);
}

async function leaveSurface(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.surface-back');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function openNoticeCenter(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.rail-button[data-tool="notices"]') ||
        [...document.querySelectorAll('.workspace-context-button, .bottom-panel-tabs button, button')]
          .find((candidate) => /\\u901a\\u77e5|notices/i.test(candidate.getAttribute('aria-label') || candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function clickSummaryTimeline(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.notice-recovery-summary [data-notice-recovery-target="timeline"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS302_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS302_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS302_OPEN_CAPABILITIES", await openCapabilities(win));
  assertStep("PASS302_OPEN_MARKETPLACE", await openMarketplaceTab(win));
  assertStep("PASS302_MARKETPLACE_SOURCE_READY", await waitFor(win, `
    Boolean(document.querySelector('[data-marketplace-source-id="${OTHER_MARKETPLACE_NAME}"]') &&
      document.querySelector('[data-marketplace-source-id="${TARGET_MARKETPLACE_NAME}"]') &&
      /302\\.7\\.9/.test(document.querySelector('[data-marketplace-source-id="${TARGET_MARKETPLACE_NAME}"]')?.textContent || ''))
  `, 15000));

  const beforeUpdate = readCommandLog();
  assertStep("PASS302_CLICK_UPDATE", await clickMarketplaceUpdate(win));
  assertStep("PASS302_UPDATE_CONFIRM_VISIBLE", await waitFor(win, `
    (function() {
      const confirm = document.querySelector('.plugin-cli-confirm');
      const text = confirm?.textContent || '';
      return Boolean(
        confirm &&
        /plugin marketplace update/.test(text) &&
        /${TARGET_MARKETPLACE_NAME}/.test(text) &&
        !/${OTHER_MARKETPLACE_NAME}/.test(text) &&
        /302\\.7\\.9/.test(text) &&
        /Read/.test(text) &&
        /Bash/.test(text)
      );
    })();
  `, 5000));
  assertStep("PASS302_UPDATE_NOT_RUN_BEFORE_CONFIRM", !/plugin marketplace update/.test(readCommandLog().slice(beforeUpdate.length)));
  assertStep("PASS302_CONFIRM_UPDATE", await confirmCliAction(win));
  assertStep("PASS302_UPDATE_RAN_AFTER_CONFIRM", await waitForLog(/plugin marketplace update/, 10000));

  assertStep("PASS302_FAILURE_PERSISTED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const notice = (state.notices || []).find((item) => item.level === 'error' &&
        /pass302 marketplace update failed/.test((item.title || '') + (item.detail || '')));
      const run = (state.commandRuns || []).find((item) => item.kind === 'capability' &&
          /plugin marketplace update/.test(item.command || item.commandLine || '') &&
          item.code === 32 &&
          /pass302 marketplace update failed/.test(item.stderr || ''));
      window.__PASS302_NOTICE_ID__ = notice?.id || '';
      window.__PASS302_RUN_ID__ = notice?.runEventId || run?.requestId || run?.id || '';
      return Boolean(
        run &&
        notice &&
        notice.action === 'capability-recovery:' + encodeURIComponent(notice.runEventId) &&
        notice.runEventId &&
        run.capabilityContext?.kind === 'marketplace-source' &&
        run.capabilityContext?.id === '${TARGET_MARKETPLACE_NAME}' &&
        run.capabilityContext?.action === 'update' &&
        notice.capabilityContext?.kind === 'marketplace-source' &&
        notice.capabilityContext?.id === '${TARGET_MARKETPLACE_NAME}'
      );
    })();
  `, 10000));

  assertStep("PASS302_LEAVE_CAPABILITIES", await leaveSurface(win));
  assertStep("PASS302_OPEN_NOTICE_CENTER", await openNoticeCenter(win));
  assertStep("PASS302_SUMMARY_BUCKET_VISIBLE", await waitFor(win, `
    (function() {
      const noticeId = window.__PASS302_NOTICE_ID__ || '';
      const bucket = document.querySelector('.notice-recovery-summary [data-notice-recovery-target="timeline"]');
      const text = bucket?.closest('.notice-recovery-summary')?.textContent || '';
      return Boolean(
        bucket &&
        bucket.getAttribute('data-notice-recovery-count') === '1' &&
        bucket.getAttribute('data-notice-recovery-first-id') === noticeId &&
        bucket.getAttribute('data-notice-recovery-first-action')?.startsWith('capability-recovery:') &&
        /plugin marketplace update/.test(bucket.getAttribute('data-notice-recovery-first-title') || text)
      );
    })();
  `, 10000));

  assertStep("PASS302_CLICK_SUMMARY_BUCKET", await clickSummaryTimeline(win));
  assertStep("PASS302_SUMMARY_OPENS_EVIDENCE_RETRY", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.selected-run-evidence-panel.error');
      const retry = panel?.querySelector('[data-run-recovery-action="retry-capability"]');
      const text = panel?.textContent || '';
      return Boolean(
        panel &&
        retry &&
        retry.getAttribute('data-run-recovery-action-focused') === 'true' &&
        document.activeElement === retry &&
        /plugin marketplace update/.test(text) &&
        /pass302 marketplace update failed/.test(text)
      );
    })();
  `, 12000));

  assertStep("PASS302_OPEN_PALETTE_BUCKET", await openPaletteAndQuery(win, "notice recovery summary pass302 marketplace update failed"));
  assertStep("PASS302_PALETTE_BUCKET_VISIBLE", await waitFor(win, `
    (function() {
      const noticeId = window.__PASS302_NOTICE_ID__ || '';
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === 'notice-recovery:timeline');
      const text = button?.textContent || '';
      return Boolean(
        button &&
        button.getAttribute('data-command-target') === 'timeline' &&
        button.getAttribute('data-notice-recovery-count') === '1' &&
        button.getAttribute('data-notice-recovery-first-id') === noticeId &&
        button.getAttribute('data-command-notice-recovery-first-action')?.startsWith('capability-recovery:') &&
        /plugin marketplace update/.test(text)
      );
    })();
  `, 10000));

  assertStep("PASS302_CLICK_PALETTE_BUCKET", await clickNoticeRecoveryCommand(win));
  assertStep("PASS302_PALETTE_BUCKET_OPENS_EVIDENCE_RETRY", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.selected-run-evidence-panel.error');
      const retry = panel?.querySelector('[data-run-recovery-action="retry-capability"]');
      const text = panel?.textContent || '';
      return Boolean(
        panel &&
        retry &&
        retry.getAttribute('data-run-recovery-action-focused') === 'true' &&
        document.activeElement === retry &&
        /plugin marketplace update/.test(text) &&
        /pass302 marketplace update failed/.test(text)
      );
    })();
  `, 12000));

  const beforeRetry = readCommandLog();
  assertStep("PASS302_CLICK_EVIDENCE_RETRY", await win.webContents.executeJavaScript(`
    (function() {
      const retry = document.querySelector('.selected-run-evidence-panel [data-run-recovery-action="retry-capability"]');
      if (!retry || retry.disabled) return false;
      retry.click();
      return true;
    })();
  `));
  assertStep("PASS302_RETRY_SOURCE_CONFIRM", await waitFor(win, `
    (function() {
      const otherRow = document.querySelector('.plugin-manager-modal [data-marketplace-source-id="${OTHER_MARKETPLACE_NAME}"]');
      const otherUpdate = otherRow?.querySelector('[data-marketplace-source-action="update"]');
      const row = document.querySelector('.plugin-manager-modal [data-marketplace-source-id="${TARGET_MARKETPLACE_NAME}"]');
      const update = row?.querySelector('[data-marketplace-source-action="update"]');
      const confirm = document.querySelector('.plugin-cli-confirm');
      const confirmText = confirm?.textContent || '';
      return Boolean(
        (!otherRow || (
          otherUpdate?.getAttribute('data-capability-action-focused') !== 'true' &&
          !otherRow.classList.contains('focused-capability-row')
        )) &&
        row &&
        update &&
        row.classList.contains('focused-capability-row') &&
        update.getAttribute('data-capability-action-focused') === 'true' &&
        update.getAttribute('data-capability-kind') === 'marketplace-source' &&
        update.getAttribute('data-capability-action') === 'update' &&
        update.getAttribute('data-capability-id') === '${TARGET_MARKETPLACE_NAME}' &&
        confirm &&
        /plugin marketplace update/.test(confirmText) &&
        /${TARGET_MARKETPLACE_NAME}/.test(confirmText) &&
        !/${OTHER_MARKETPLACE_NAME}/.test(confirmText) &&
        /302\\.7\\.9/.test(confirmText) &&
        /Read/.test(confirmText) &&
        /Bash/.test(confirmText)
      );
    })();
  `, 12000));
  assertStep("PASS302_RETRY_NOT_RUN_BEFORE_CONFIRM", !/plugin marketplace update/.test(readCommandLog().slice(beforeRetry.length)));

  console.log("PASS302_NOTICE_RECOVERY_SUMMARY_CAPABILITY_CONFIRM_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeMarketplaceFixture();
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS302_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (async function() {
          return {
            noticeId: window.__PASS302_NOTICE_ID__ || '',
            runId: window.__PASS302_RUN_ID__ || '',
            summary: document.querySelector('.notice-recovery-summary')?.outerHTML || '',
            commands: [...document.querySelectorAll('.command-modal .command-list button')].map((button) => ({
              id: button.getAttribute('data-command-id'),
              target: button.getAttribute('data-command-target'),
              text: button.textContent,
            })),
            evidence: document.querySelector('.selected-run-evidence-panel')?.textContent || '',
            actions: [...document.querySelectorAll('.plugin-manager-modal [data-marketplace-source-action], .plugin-manager-modal [data-capability-action-focused]')].map((item) => ({
              text: item.textContent,
              attrs: Object.fromEntries([...item.attributes].map((attr) => [attr.name, attr.value])),
            })),
            confirm: document.querySelector('.plugin-cli-confirm')?.textContent || '',
            activePanel: document.querySelector('.workspace-context-button.active')?.textContent || document.querySelector('.bottom-panel-tabs button.active')?.textContent || '',
            state: await window.claudexDesktop.getState().catch((stateError) => ({ error: String(stateError?.message || stateError) })),
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS302_DEBUG", JSON.stringify(debug, null, 2).slice(0, 16000));
      console.error("PASS302_COMMAND_LOG", readCommandLog());
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS302_TIMEOUT");
  console.error("PASS302_COMMAND_LOG", readCommandLog());
  cleanup();
  app.exit(1);
}, 90000);
