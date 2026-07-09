const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass106-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass106-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass106-project-"));
const MARKETPLACE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass106-market-"));
const MARKETPLACE_MANIFEST_DIR = path.join(MARKETPLACE_DIR, ".claude-plugin");
const COMMAND_LOG = path.join(USER_DATA_DIR, "claude-command-log.txt");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const MARKETPLACE_PLUGIN_ID = "pass106-retry-plugin@pass106-market";
const MARKETPLACE_INSTALL_COMMAND = `plugin install ${MARKETPLACE_PLUGIN_ID}`;

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

function readCommandLog() {
  try {
    return fs.readFileSync(COMMAND_LOG, "utf8");
  } catch (_error) {
    return "";
  }
}

async function waitForLog(pattern, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (pattern.test(readCommandLog())) return true;
    await wait(150);
  }
  return false;
}

async function waitForPluginConfirmReady(win, commandText, timeoutMs = 7000) {
  return waitFor(win, `
    (function() {
      const command = ${JSON.stringify(commandText)};
      const confirm = [...document.querySelectorAll('.plugin-cli-confirm')]
        .find((item) => (item.textContent || '').includes(command));
      const button = confirm?.querySelector('.danger-action');
      return Boolean(confirm && button && !button.disabled);
    })();
  `, timeoutMs);
}

async function clickPluginConfirm(win, commandText, timeoutMs = 7000) {
  return win.webContents.executeJavaScript(`
    (async function() {
      const command = ${JSON.stringify(commandText)};
      const startedAt = Date.now();
      while (Date.now() - startedAt < ${Number(timeoutMs)}) {
        const confirm = [...document.querySelectorAll('.plugin-cli-confirm')]
          .find((item) => (item.textContent || '').includes(command));
        const button = confirm?.querySelector('.danger-action');
        if (button && !button.disabled) {
          button.click();
          return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return false;
    })();
  `);
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

function writeMarketplaceFixture() {
  fs.mkdirSync(MARKETPLACE_MANIFEST_DIR, { recursive: true });
  writeJson(path.join(MARKETPLACE_MANIFEST_DIR, "marketplace.json"), {
    name: "pass106-market",
    description: "PASS106 marketplace fixture",
    owner: { name: "PASS106 Owner" },
    plugins: [
      {
        name: "pass106-retry-plugin",
        version: "10.6.0",
        description: "A marketplace plugin that should expose inline retry recovery after an install failure.",
        category: "workflow",
        author: { name: "PASS106 QA" },
        source: { source: "git-subdir", url: "https://example.invalid/pass106.git", path: "plugins/failing", ref: "v10.6.0" },
        permissions: ["Read", "Bash"],
      },
    ],
  });
}

function writeFakeClaude() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  const fakeScript = `
const fs = require('fs');
const args = process.argv.slice(2);
const marketplaceDir = ${JSON.stringify(MARKETPLACE_DIR)};
const commandLog = ${JSON.stringify(COMMAND_LOG)};
const installCountFile = ${JSON.stringify(path.join(USER_DATA_DIR, "pass106-install-count.txt"))};
function installCount() { try { return Number(fs.readFileSync(installCountFile, 'utf8')) || 0; } catch (_error) { return 0; } }
fs.appendFileSync(commandLog, args.join(' ') + '\\n', 'utf8');
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
if (args[0] === '--version') out('2.10.5 (Claude Code QA)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out(installCount() >= 2 ? [{ id: 'pass106-retry-plugin@pass106-market', version: '10.6.0', scope: 'user', enabled: true, installPath: 'C:/qa/pass106-plugin' }] : []);
else if (args[0] === 'plugin' && args[1] === 'list') out(installCount() >= 2 ? 'Installed plugins:\\n\\n  > pass106-retry-plugin@pass106-market\\n    Version: 10.6.0\\n    Scope: user\\n    Status: ✓ enabled' : 'Installed plugins: none');
else if (args[0] === 'mcp' && args[1] === 'list') out('âœ“ pass106-mcp: connected');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([{ name: 'pass106-market', source: 'path', repo: marketplaceDir, installLocation: marketplaceDir, version: '2026.7.6', status: 'ready', permissions: ['Read', 'Bash'] }]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces:\\n\\n  > pass106-market\\n    Source: Path (' + marketplaceDir + ')');
else if (args[0] === 'plugin' && args[1] === 'install') { const nextInstallCount = installCount() + 1; fs.writeFileSync(installCountFile, String(nextInstallCount), 'utf8'); if (nextInstallCount === 1) { process.stderr.write('pass106 plugin install failed\\n'); process.exitCode = 42; } else { out('ok plugin install ' + args.slice(2).join(' ')); } }
else out('pass106 fake claude command: ' + args.join(' '));
`;
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeScript, "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
  return path.join(FAKE_BIN_DIR, "claude.cmd");
}

function writeInitialStore() {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass106-project" }), "utf8");
  const fakeClaude = writeFakeClaude();
  const project = { name: "pass106-project", path: PROJECT_DIR };
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
        id: "pass106-session",
        title: "Marketplace install retry recovery",
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

async function openMarketplace(win) {
  assertStep("PASS106_OPEN_CAPABILITIES", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.nav-stack button')].find((candidate) => /\u63d2\u4ef6/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS106_OPEN_MARKETPLACE", await waitFor(win, "Boolean(document.querySelector('.plugin-manager-tabs'))", 10000) && await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.plugin-manager-tabs button')].find((candidate) => /\u5e02\u573a/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  return true;
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
          .find((candidate) => /\u901a\u77e5|notices/i.test(candidate.getAttribute('aria-label') || candidate.textContent || ''));
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
  if (!win) throw new Error("PASS106_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS106_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  await openMarketplace(win);
  assertStep("PASS106_MARKETPLACE_CARD_READY", await waitFor(win, `
    Boolean([...document.querySelectorAll('.marketplace-plugin-card')]
      .find((item) => /pass106-retry-plugin/.test(item.textContent || '')))
  `, 15000));
  assertStep("PASS106_CLICK_INSTALL", await win.webContents.executeJavaScript(`
    (async function() {
      let button = null;
      const startedAt = Date.now();
      while (Date.now() - startedAt < 5000) {
        const card = [...document.querySelectorAll('.marketplace-plugin-card')]
          .find((item) => /pass106-retry-plugin/.test(item.textContent || ''));
        button = card?.querySelector('[data-marketplace-plugin-action="install"]');
        if (button && !button.disabled) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS106_CONFIRM_INSTALL_VISIBLE", await waitForPluginConfirmReady(win, MARKETPLACE_INSTALL_COMMAND));
  assertStep("PASS106_CONFIRM_INSTALL", await clickPluginConfirm(win, MARKETPLACE_INSTALL_COMMAND));
  assertStep("PASS106_INSTALL_RAN", await waitForLog(/plugin install pass106-retry-plugin@pass106-market/));
  assertStep("PASS106_MARKETPLACE_INSTALL_FAILURE_FOCUS", await waitFor(win, `
    (function() {
      const input = document.querySelector('.capability-search input');
      const card = [...document.querySelectorAll('.marketplace-plugin-card')]
        .find((item) => /pass106-retry-plugin/.test(item.textContent || ''));
      const text = card?.textContent || '';
      return Boolean(
        input?.value === 'pass106-retry-plugin' &&
        card?.classList.contains('focused-capability-row') &&
        card?.querySelector('.row-cli-action-evidence.error') &&
        /pass106 plugin install failed/.test(text) &&
        /42/.test(text) &&
        /\u91cd\u8bd5/.test(text) &&
        /\u6253\u5f00\u8f93\u51fa/.test(text) &&
        /pass106 plugin install failed/.test(document.querySelector('.plugin-cli-error')?.textContent || '')
      );
    })();
  `, 15000));
  assertStep("PASS106_FAILURE_PERSISTED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const failedRun = state.commandRuns?.find((run) => run.kind === 'capability' &&
        /plugin install pass106-retry-plugin@pass106-market/.test(run.command || '') &&
        run.code === 42 &&
        /pass106 plugin install failed/.test(run.stderr || ''));
      const notice = state.notices?.find((item) => item.level === 'error' &&
        /pass106 plugin install failed/.test((item.title || '') + (item.detail || '')));
      window.__PASS106_NOTICE_ID__ = notice?.id || '';
      window.__PASS106_RUN_ID__ = notice?.runEventId || failedRun?.requestId || failedRun?.id || '';
      return Boolean(
        failedRun &&
        failedRun.capabilityContext?.tab === 'marketplace' &&
        failedRun.capabilityContext?.kind === 'marketplace-plugin' &&
        failedRun.capabilityContext?.id === 'pass106-retry-plugin@pass106-market' &&
        failedRun.capabilityContext?.action === 'install' &&
        notice &&
        notice.capabilityContext?.kind === 'marketplace-plugin' &&
        notice.capabilityContext?.id === 'pass106-retry-plugin@pass106-market'
      );
    })();
  `, 10000));

  assertStep("PASS106_LEAVE_CAPABILITIES_FOR_NOTICE", await leaveSurface(win));
  assertStep("PASS106_OPEN_NOTICE_CENTER", await openNoticeCenter(win));
  assertStep("PASS106_SUMMARY_BUCKET_VISIBLE", await waitFor(win, `
    (function() {
      const noticeId = window.__PASS106_NOTICE_ID__ || '';
      const bucket = document.querySelector('.notice-recovery-summary [data-notice-recovery-target="timeline"]');
      const text = bucket?.closest('.notice-recovery-summary')?.textContent || '';
      return Boolean(
        bucket &&
        bucket.getAttribute('data-notice-recovery-count') === '1' &&
        bucket.getAttribute('data-notice-recovery-first-id') === noticeId &&
        bucket.getAttribute('data-notice-recovery-first-action')?.startsWith('capability-recovery:') &&
        /plugin install pass106-retry-plugin@pass106-market/.test(bucket.getAttribute('data-notice-recovery-first-title') || text)
      );
    })();
  `, 10000));
  assertStep("PASS106_CLICK_SUMMARY_BUCKET", await clickSummaryTimeline(win));
  assertStep("PASS106_SUMMARY_OPENS_PLUGIN_EVIDENCE_RETRY", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.selected-run-evidence-panel.error');
      const retry = panel?.querySelector('[data-run-recovery-action="retry-capability"]');
      const text = panel?.textContent || '';
      return Boolean(
        panel &&
        retry &&
        retry.getAttribute('data-run-recovery-action-focused') === 'true' &&
        document.activeElement === retry &&
        /plugin install pass106-retry-plugin@pass106-market/.test(text) &&
        /pass106 plugin install failed/.test(text)
      );
    })();
  `, 12000));
  assertStep("PASS106_SUMMARY_EVIDENCE_CONTEXT_VISIBLE", await waitFor(win, `
    (function() {
      const runId = window.__PASS106_RUN_ID__ || '';
      const panel = document.querySelector('.selected-run-evidence-panel.error');
      const row = [...document.querySelectorAll('.run-timeline-row.error')]
        .find((candidate) => candidate.getAttribute('data-run-event-id') === runId);
      const context = panel?.querySelector('[data-run-capability-context="true"]');
      const rowContext = row?.querySelector('[data-run-capability-context="true"]');
      const contextText = context?.textContent || '';
      const rowContextText = rowContext?.textContent || '';
      return Boolean(
        panel &&
        row &&
        panel.getAttribute('data-run-evidence-source') === 'command' &&
        panel.getAttribute('data-run-capability-tab') === 'marketplace' &&
        panel.getAttribute('data-run-capability-kind') === 'marketplace-plugin' &&
        panel.getAttribute('data-run-capability-id') === 'pass106-retry-plugin@pass106-market' &&
        panel.getAttribute('data-run-capability-action') === 'install' &&
        row.getAttribute('data-run-capability-tab') === 'marketplace' &&
        row.getAttribute('data-run-capability-kind') === 'marketplace-plugin' &&
        row.getAttribute('data-run-capability-id') === 'pass106-retry-plugin@pass106-market' &&
        row.getAttribute('data-run-capability-action') === 'install' &&
        context &&
        context.getAttribute('data-run-capability-tab') === 'marketplace' &&
        context.getAttribute('data-run-capability-kind') === 'marketplace-plugin' &&
        context.getAttribute('data-run-capability-id') === 'pass106-retry-plugin@pass106-market' &&
        context.getAttribute('data-run-capability-action') === 'install' &&
        rowContext &&
        rowContext.getAttribute('data-run-capability-tab') === 'marketplace' &&
        rowContext.getAttribute('data-run-capability-kind') === 'marketplace-plugin' &&
        rowContext.getAttribute('data-run-capability-id') === 'pass106-retry-plugin@pass106-market' &&
        rowContext.getAttribute('data-run-capability-action') === 'install' &&
        /marketplace-plugin/.test(contextText) &&
        /pass106-retry-plugin@pass106-market/.test(contextText) &&
        /install/.test(contextText) &&
        /marketplace-plugin/.test(rowContextText) &&
        /pass106-retry-plugin@pass106-market/.test(rowContextText) &&
        /install/.test(rowContextText)
      );
    })();
  `, 5000));
  const beforeSummaryContextOpen = readCommandLog();
  assertStep("PASS106_OPEN_SUMMARY_EVIDENCE_CAPABILITY_CONTEXT", await win.webContents.executeJavaScript(`
    (function() {
      const open = document.querySelector('.selected-run-evidence-panel [data-run-recovery-action="open-capability-context"]');
      if (!open || open.disabled) return false;
      open.click();
      return true;
    })();
  `));
  assertStep("PASS106_SUMMARY_CONTEXT_FOCUSES_PLUGIN_WITHOUT_MUTATION", await waitFor(win, `
    (function() {
      const row = document.querySelector('.plugin-manager-modal [data-marketplace-plugin-id="pass106-retry-plugin@pass106-market"]');
      const copy = row?.querySelector('[data-marketplace-plugin-action="copy-evidence"]');
      const install = row?.querySelector('[data-marketplace-plugin-action="install"]');
      const retry = row?.querySelector('[data-marketplace-plugin-action="retry"]');
      return Boolean(
        row &&
        row.classList.contains('focused-capability-row') &&
        row.getAttribute('data-capability-kind') === 'marketplace-plugin' &&
        row.getAttribute('data-capability-id') === 'pass106-retry-plugin@pass106-market' &&
        row.getAttribute('data-capability-focused') === 'true' &&
        copy &&
        copy.getAttribute('data-capability-action-focused') === 'true' &&
        copy.getAttribute('data-capability-action') === 'copy' &&
        install &&
        install.getAttribute('data-capability-action-focused') !== 'true' &&
        (!retry || retry.getAttribute('data-capability-action-focused') !== 'true') &&
        !document.querySelector('.plugin-cli-confirm')
      );
    })();
  `, 12000));
  assertStep("PASS106_SUMMARY_CONTEXT_DID_NOT_RUN_INSTALL", !/plugin install pass106-retry-plugin@pass106-market/.test(readCommandLog().slice(beforeSummaryContextOpen.length)));
  assertStep("PASS106_LEAVE_SUMMARY_CONTEXT", await leaveSurface(win));
  assertStep("PASS106_RETURN_TO_NOTICE_CENTER", await openNoticeCenter(win));

  assertStep("PASS106_OPEN_PALETTE_BUCKET", await openPaletteAndQuery(win, "notice recovery summary pass106 plugin install failed"));
  assertStep("PASS106_PALETTE_BUCKET_VISIBLE", await waitFor(win, `
    (function() {
      const noticeId = window.__PASS106_NOTICE_ID__ || '';
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === 'notice-recovery:timeline');
      const text = button?.textContent || '';
      return Boolean(
        button &&
        button.getAttribute('data-command-target') === 'timeline' &&
        button.getAttribute('data-notice-recovery-count') === '1' &&
        button.getAttribute('data-notice-recovery-first-id') === noticeId &&
        button.getAttribute('data-command-notice-recovery-first-action')?.startsWith('capability-recovery:') &&
        /plugin install pass106-retry-plugin@pass106-market/.test(text)
      );
    })();
  `, 10000));
  assertStep("PASS106_CLICK_PALETTE_BUCKET", await clickNoticeRecoveryCommand(win));
  assertStep("PASS106_PALETTE_BUCKET_OPENS_PLUGIN_EVIDENCE_RETRY", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.selected-run-evidence-panel.error');
      const retry = panel?.querySelector('[data-run-recovery-action="retry-capability"]');
      const context = panel?.querySelector('[data-run-capability-context="true"]');
      const text = panel?.textContent || '';
      return Boolean(
        panel &&
        retry &&
        retry.getAttribute('data-run-recovery-action-focused') === 'true' &&
        document.activeElement === retry &&
        panel.getAttribute('data-run-capability-tab') === 'marketplace' &&
        panel.getAttribute('data-run-capability-kind') === 'marketplace-plugin' &&
        panel.getAttribute('data-run-capability-id') === 'pass106-retry-plugin@pass106-market' &&
        panel.getAttribute('data-run-capability-action') === 'install' &&
        context &&
        context.getAttribute('data-run-capability-kind') === 'marketplace-plugin' &&
        /plugin install pass106-retry-plugin@pass106-market/.test(text) &&
        /pass106 plugin install failed/.test(text)
      );
    })();
  `, 12000));

  const beforeRetry = readCommandLog();
  assertStep("PASS106_CLICK_RETRY", await win.webContents.executeJavaScript(`
    (async function() {
      let retry = null;
      const startedAt = Date.now();
      while (Date.now() - startedAt < 5000) {
        const evidenceRetry = document.querySelector('.selected-run-evidence-panel [data-run-recovery-action="retry-capability"]');
        const card = [...document.querySelectorAll('.marketplace-plugin-card')]
          .find((item) => /pass106-retry-plugin/.test(item.textContent || ''));
        const rowRetry = [...(card?.querySelectorAll('.row-cli-action-evidence.error button') || [])]
          .find((button) => /重试/.test(button.textContent || ''));
        retry = evidenceRetry || rowRetry;
        if (retry && !retry.disabled) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (!retry || retry.disabled) return false;
      retry.click();
      return true;
    })();
  `));
  assertStep("PASS106_RETRY_CONFIRM_VISIBLE", await waitForPluginConfirmReady(win, MARKETPLACE_INSTALL_COMMAND));
  assertStep("PASS106_RETRY_NOT_RUN_BEFORE_CONFIRM", !/plugin install pass106-retry-plugin@pass106-market/.test(readCommandLog().slice(beforeRetry.length)));
  assertStep("PASS106_CONFIRM_RETRY", await clickPluginConfirm(win, MARKETPLACE_INSTALL_COMMAND));
  assertStep("PASS106_RETRY_INSTALL_RAN", await waitForLog(/plugin install pass106-retry-plugin@pass106-market(?:.|\n)*plugin install pass106-retry-plugin@pass106-market/, 12000));
  assertStep("PASS106_RETRY_RECOVERED_INLINE", await waitFor(win, `
    (function() {
      const input = document.querySelector('.capability-search input');
      const card = [...document.querySelectorAll('.marketplace-plugin-card')]
        .find((item) => /pass106-retry-plugin/.test(item.textContent || ''));
      const text = card?.textContent || '';
      return Boolean(
        input?.value === 'pass106-retry-plugin' &&
        card?.classList.contains('focused-capability-row') &&
        card?.classList.contains('installed') &&
        card?.querySelector('.row-cli-action-evidence.ok') &&
        /ok plugin install pass106-retry-plugin@pass106-market/.test(text) &&
        /\u672c\u5730\u5df2\u5b89\u88c5/.test(text)
      );
    })();
  `, 15000));
  assertStep("PASS106_RETRY_PERSISTED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const runs = state.commandRuns?.filter((run) => run.kind === 'capability' && /plugin install pass106-retry-plugin@pass106-market/.test(run.command || '')) || [];
      const failed = runs.find((run) => run.code === 42 && /pass106 plugin install failed/.test(run.stderr || ''));
      const recovered = runs.find((run) => run.code === 0 && /ok plugin install pass106-retry-plugin@pass106-market/.test(run.stdout || ''));
      return Boolean(
        runs.length >= 2 &&
        failed?.capabilityContext?.tab === 'marketplace' &&
        failed?.capabilityContext?.kind === 'marketplace-plugin' &&
        failed?.capabilityContext?.id === 'pass106-retry-plugin@pass106-market' &&
        failed?.capabilityContext?.action === 'install' &&
        recovered?.capabilityContext?.tab === 'marketplace' &&
        recovered?.capabilityContext?.kind === 'marketplace-plugin' &&
        recovered?.capabilityContext?.id === 'pass106-retry-plugin@pass106-market' &&
        recovered?.capabilityContext?.action === 'install'
      );
    })();
  `, 10000));

  console.log("PASS106_MARKETPLACE_INSTALL_RETRY_RECOVERY_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeMarketplaceFixture();
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS106_FAILED", error?.stack || error);
  console.error("PASS106_COMMAND_LOG", readCommandLog());
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS106_TIMEOUT");
  console.error("PASS106_COMMAND_LOG", readCommandLog());
  cleanup();
  app.exit(1);
}, 90000);
