const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass59-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass59-bin-"));
const MARKETPLACE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass59-market-"));
const MARKETPLACE_MANIFEST_DIR = path.join(MARKETPLACE_DIR, ".claude-plugin");
const PROJECT_FIXTURE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass59-project-"));
const COMMAND_LOG = path.join(USER_DATA_DIR, "claude-command-log.txt");

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

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, MARKETPLACE_DIR, PROJECT_FIXTURE_DIR]) {
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

async function waitForLog(pattern, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (pattern.test(readCommandLog())) return true;
    await wait(150);
  }
  return false;
}

async function openOutputsPanel(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      if (document.querySelector('.bottom-work-panel .run-timeline') || document.querySelector('.bottom-work-panel .capability-command-evidence-stack')) return true;
      const button = [...document.querySelectorAll('.workspace-context-tabs .workspace-context-button')]
        .find((candidate) => /输出/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

fs.mkdirSync(MARKETPLACE_MANIFEST_DIR, { recursive: true });
writeJson(path.join(MARKETPLACE_MANIFEST_DIR, "marketplace.json"), {
  name: "qa-market",
  description: "QA marketplace fixture",
  owner: { name: "QA Owner" },
  plugins: [
    {
      name: "qa-structured-plugin",
      description: "A deterministic plugin used by Claudex QA to prove row action evidence.",
      category: "testing",
      author: { name: "Claudex QA" },
      source: { source: "git-subdir", url: "https://example.invalid/repo.git", path: "plugins/qa", ref: "v1" },
    },
    {
      name: "qa-installed-plugin",
      description: "Already installed plugin fixture.",
      category: "productivity",
      source: "./plugins/qa-installed-plugin",
    },
  ],
});

const fakeClaudeScript = `
const fs = require('fs');
const args = process.argv.slice(2);
const marketplaceDir = ${JSON.stringify(MARKETPLACE_DIR)};
const commandLog = ${JSON.stringify(COMMAND_LOG)};
fs.appendFileSync(commandLog, args.join(' ') + '\\n', 'utf8');
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
if (args[0] === '--version') out('2.9.0 (Claude Code QA)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([
  { id: 'qa-installed-plugin@qa-market', version: '1.2.3', scope: 'user', enabled: true, installPath: 'C:/qa/plugin' },
  { id: 'qa-disabled-plugin@qa-market', version: '0.1.0', scope: 'project', enabled: false, installPath: 'C:/qa/disabled' }
]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins:\\n\\n  > qa-installed-plugin@qa-market\\n    Version: 1.2.3\\n    Scope: user\\n    Status: ✓ enabled\\n\\n  > qa-disabled-plugin@qa-market\\n    Version: 0.1.0\\n    Scope: project\\n    Status: × disabled');
else if (args[0] === 'mcp' && args[1] === 'list') out('✓ qa-mcp: connected');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([{ name: 'qa-market', source: 'path', repo: marketplaceDir, installLocation: marketplaceDir }]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces:\\n\\n  > qa-market\\n    Source: Path (' + marketplaceDir + ')');
else if (args[0] === 'plugin' && ['install', 'enable', 'disable', 'update'].includes(args[1])) out('ok ' + args.join(' '));
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'update') out('updated qa-market');
else out('fake claude command: ' + args.join(' '));
`;
fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
const FAKE_CLAUDE_COMMAND = path.join(FAKE_BIN_DIR, "claude.cmd");
process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;

app.setPath("userData", USER_DATA_DIR);
fs.mkdirSync(USER_DATA_DIR, { recursive: true });
fs.writeFileSync(path.join(PROJECT_FIXTURE_DIR, "package.json"), JSON.stringify({ name: "pass59" }), "utf8");
writeJson(path.join(USER_DATA_DIR, "desktop-data.json"), {
  version: 1,
  settings: {
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    baseUrl: "https://api.example.invalid",
    temperature: 0.2,
    timeoutMs: 600000,
    language: "zh",
    appearance: { fontSize: "compact", density: "compact" },
    claudeCode: { executionMode: "claude-code", claudeCommand: FAKE_CLAUDE_COMMAND, permissionMode: "default" },
    capabilities: {
      "project-context": true,
      "terminal-helper": true,
      "mcp-runtime": true,
      "plugin-router": true,
      "marketplace-router": true,
    },
    customMarketplaces: [],
  },
  activeProject: { name: "pass59-project", path: PROJECT_FIXTURE_DIR },
  projects: [{ name: "pass59-project", path: PROJECT_FIXTURE_DIR }],
  sessions: [
    {
      id: "default",
      title: "新聊天",
      project: "pass59-project",
      projectPath: PROJECT_FIXTURE_DIR,
      createdAt: "2026-07-05T00:00:00.000Z",
      updatedAt: "2026-07-05T00:00:00.000Z",
      messages: [],
    },
  ],
});

require(path.join(REPO_DIR, "electron", "main.cjs"));

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

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS59_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS59_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid'))", 15000));
  assertStep("PASS59_OPEN_CAPABILITIES", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.nav-stack button')].find((candidate) => /插件/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS59_PLUGIN_ROWS", await waitFor(win, `
    (function() {
      const row = document.querySelector('.structured-plugin-row[data-plugin-id="qa-installed-plugin@qa-market"]');
      const action = row?.querySelector('[data-plugin-action="disable"]');
      return Boolean(row && action && !action.disabled);
    })()
  `, 15000));

  const beforeDisable = readCommandLog();
  assertStep("PASS59_CLICK_DISABLE", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.structured-plugin-row[data-plugin-id="qa-installed-plugin@qa-market"] [data-plugin-action="disable"]');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS59_DISABLE_CONFIRM_VISIBLE", await waitFor(win, "Boolean(document.querySelector('.plugin-cli-confirm'))", 5000));
  assertStep("PASS59_DISABLE_NOT_RUN_BEFORE_CONFIRM", !/plugin disable --scope user qa-installed-plugin@qa-market/.test(readCommandLog().slice(beforeDisable.length)));
  assertStep("PASS59_CONFIRM_DISABLE", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.plugin-cli-confirm .danger-action');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS59_DISABLE_RAN_AFTER_CONFIRM", await waitForLog(/plugin disable --scope user qa-installed-plugin@qa-market/));
  assertStep("PASS59_PLUGIN_ROW_ACTION_EVIDENCE_VISIBLE", await waitFor(win, `
    (function() {
      const row = [...document.querySelectorAll('.structured-plugin-row')]
        .find((item) => /qa-installed-plugin@qa-market/.test(item.textContent || ''));
      const evidence = row?.querySelector('.row-cli-action-evidence.ok');
      const text = evidence?.textContent || '';
      return Boolean(evidence && /plugin disable --scope user qa-installed-plugin@qa-market/.test(text) && /退出码/.test(text) && /\\b0\\b/.test(text));
    })();
  `, 10000));

  assertStep("PASS59_OPEN_MARKETPLACE", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.plugin-manager-tabs button')].find((candidate) => /市场/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS59_MARKETPLACE_ROWS", await waitFor(win, "Boolean(document.querySelector('.marketplace-plugin-card'))", 10000));
  assertStep("PASS59_MARKETPLACE_INSTALL_READY", await waitFor(win, `
    Boolean([...document.querySelectorAll('.marketplace-plugin-card')]
      .find((item) => /qa-structured-plugin/.test(item.textContent || ''))
      ?.querySelector('.marketplace-card-actions button:not([disabled])'))
  `, 10000));
  const beforeInstall = readCommandLog();
  assertStep("PASS59_CLICK_INSTALL", await win.webContents.executeJavaScript(`
    (function() {
      const card = [...document.querySelectorAll('.marketplace-plugin-card')]
        .find((item) => /qa-structured-plugin/.test(item.textContent || ''));
      const button = card?.querySelector('.marketplace-card-actions button');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS59_INSTALL_CONFIRM_VISIBLE", await waitFor(win, "Boolean(document.querySelector('.plugin-cli-confirm'))", 5000));
  assertStep("PASS59_INSTALL_NOT_RUN_BEFORE_CONFIRM", !/plugin install --scope user qa-structured-plugin/.test(readCommandLog().slice(beforeInstall.length)));
  assertStep("PASS59_CONFIRM_INSTALL", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.plugin-cli-confirm .danger-action');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS59_INSTALL_RAN_AFTER_CONFIRM", await waitForLog(/plugin install --scope user qa-structured-plugin/));
  assertStep("PASS59_MARKETPLACE_ROW_ACTION_EVIDENCE_VISIBLE", await waitFor(win, `
    (function() {
      const card = [...document.querySelectorAll('.marketplace-plugin-card')]
        .find((item) => /qa-structured-plugin/.test(item.textContent || ''));
      const evidence = card?.querySelector('.row-cli-action-evidence.ok');
      const text = evidence?.textContent || '';
      return Boolean(evidence && /plugin install --scope user qa-structured-plugin/.test(text) && /退出码/.test(text) && /\\b0\\b/.test(text));
    })();
  `, 10000));
  assertStep("PASS59_ROW_EVIDENCE_ACTIONS_VISIBLE", await win.webContents.executeJavaScript(`
    (function() {
      const card = [...document.querySelectorAll('.marketplace-plugin-card')]
        .find((item) => /qa-structured-plugin/.test(item.textContent || ''));
      const evidence = card?.querySelector('.row-cli-action-evidence.ok');
      const buttons = [...(evidence?.querySelectorAll('button') || [])].map((button) => button.textContent || button.getAttribute('aria-label') || '');
      return buttons.some((text) => /复制证据/.test(text)) && buttons.some((text) => /打开输出/.test(text));
    })();
  `));
  assertStep("PASS59_COPY_ROW_EVIDENCE", await win.webContents.executeJavaScript(`
    (function() {
      const card = [...document.querySelectorAll('.marketplace-plugin-card')]
        .find((item) => /qa-structured-plugin/.test(item.textContent || ''));
      const evidence = card?.querySelector('.row-cli-action-evidence.ok');
      const button = [...(evidence?.querySelectorAll('button') || [])].find((candidate) => /复制证据/.test(candidate.textContent || candidate.getAttribute('aria-label') || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS59_COPY_ROW_EVIDENCE_FEEDBACK", await waitFor(win, `
    (function() {
      const card = [...document.querySelectorAll('.marketplace-plugin-card')]
        .find((item) => /qa-structured-plugin/.test(item.textContent || ''));
      const evidence = card?.querySelector('.row-cli-action-evidence.ok');
      return /已复制/.test(evidence?.textContent || '');
    })();
  `, 3000));
  assertStep("PASS59_GLOBAL_ACTION_EVIDENCE_STILL_VISIBLE", await waitFor(win, `
    (function() {
      const card = document.querySelector('.plugin-cli-action-evidence.ok');
      const text = card?.textContent || '';
      return Boolean(card && /plugin install --scope user qa-structured-plugin/.test(text) && /\\b0\\b/.test(text));
    })();
  `, 10000));
  assertStep("PASS59_OPEN_OUTPUTS_FROM_ROW_EVIDENCE", await win.webContents.executeJavaScript(`
    (function() {
      const card = [...document.querySelectorAll('.marketplace-plugin-card')]
        .find((item) => /qa-structured-plugin/.test(item.textContent || ''));
      const evidence = card?.querySelector('.row-cli-action-evidence.ok');
      const button = [...(evidence?.querySelectorAll('button') || [])].find((candidate) => /打开输出/.test(candidate.textContent || candidate.getAttribute('aria-label') || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS59_OUTPUTS_PANEL_FROM_ROW_EVIDENCE", await waitFor(win, `
    Boolean(document.querySelector('.bottom-work-panel') &&
      document.querySelector('.capability-command-evidence-stack') &&
      /plugin install --scope user qa-structured-plugin/.test(document.querySelector('.capability-command-evidence-stack')?.textContent || ''))
  `, 5000));
  assertStep("PASS59_APP_RETURNED_FROM_ROW_OUTPUTS", await waitFor(win, `
    Boolean(!document.querySelector('.plugin-manager-modal') &&
      document.querySelector('.workspace-context-tabs') &&
      document.querySelector('.bottom-work-panel'))
  `, 5000));
  assertStep("PASS59_TIMELINE_HAS_CLI_EVENT", await waitFor(win, `
    Boolean(document.querySelector('.run-timeline') &&
      /plugin install --scope user qa-structured-plugin/.test(document.querySelector('.run-timeline')?.textContent || '') &&
      /退出码: 0/.test(document.querySelector('.run-timeline')?.textContent || ''))
  `, 8000));
  assertStep("PASS59_BOTTOM_EVIDENCE_HAS_CLI_OUTPUT", await waitFor(win, `
    Boolean(document.querySelector('.capability-command-evidence-stack') &&
      /Plugin\\/MCP CLI/.test(document.querySelector('.capability-command-evidence-stack')?.textContent || '') &&
      /plugin install --scope user qa-structured-plugin/.test(document.querySelector('.capability-command-evidence-stack')?.textContent || '') &&
      /退出码/.test(document.querySelector('.capability-command-evidence-stack')?.textContent || ''))
  `, 8000));
  assertStep("PASS59_SELECT_CLI_TIMELINE_EVENT", await win.webContents.executeJavaScript(`
    (async function() {
      const row = [...document.querySelectorAll('.run-timeline-row')]
        .find((candidate) => /plugin install --scope user qa-structured-plugin/.test(candidate.textContent || ''));
      if (!row) return false;
      row.querySelector('summary')?.click();
      await new Promise((resolve) => setTimeout(resolve, 200));
      return Boolean(document.querySelector('.selected-run-evidence-panel'));
    })();
  `));
  assertStep("PASS59_SELECTED_CLI_EVIDENCE_PANEL_STRUCTURED", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.selected-run-evidence-panel');
      const text = panel?.textContent || '';
      const type = panel?.querySelector('[data-run-event-type]')?.getAttribute('data-run-event-type') || '';
      return Boolean(
        panel &&
        /Plugin\\/MCP CLI/.test(text) &&
        /plugin install --scope user qa-structured-plugin/.test(text) &&
        /ok plugin install --scope user qa-structured-plugin/.test(text) &&
        /退出码/.test(text) &&
        /capability-(?:cli|command)/.test(type)
      );
    })();
  `, 8000));
  assertStep("PASS59_COPY_SELECTED_CLI_TIMELINE_EVIDENCE", await win.webContents.executeJavaScript(`
    (function() {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text) => { window.__pass59TimelineClipboard = String(text || ''); } },
      });
      const button = document.querySelector('.selected-run-evidence-panel [data-run-timeline-action="copy-evidence"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS59_SELECTED_CLI_TIMELINE_EVIDENCE_COPIED", await waitFor(win, `
    (function() {
      const text = window.__pass59TimelineClipboard || '';
      const panelText = document.querySelector('.selected-run-evidence-panel')?.textContent || '';
      return /Plugin\\/MCP CLI/.test(text) &&
        /Raw 类型: capability-(?:cli|command)/.test(text) &&
        /命令: claude plugin install --scope user qa-structured-plugin/.test(text) &&
        /工作目录: /.test(text) &&
        /退出码: 0/.test(text) &&
        /标准输出\\n(ok )?plugin install --scope user qa-structured-plugin/.test(text) &&
        /已复制/.test(panelText);
    })();
  `, 5000));
  assertStep("PASS59_CAPABILITY_COMMAND_PERSISTED", (() => {
    const parsed = JSON.parse(fs.readFileSync(path.join(USER_DATA_DIR, "desktop-data.json"), "utf8"));
    return parsed.commandRuns?.some((run) => run.kind === "capability" &&
      /plugin install --scope user qa-structured-plugin/.test(run.command || "") &&
      run.code === 0 &&
      /ok plugin install --scope user qa-structured-plugin/.test(run.stdout || ""));
  })());

  console.log("PASS59_ROW_ACTION_EVIDENCE_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch((error) => {
  console.error("PASS59_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS59_TIMEOUT");
  cleanup();
  app.exit(1);
}, 80000);
