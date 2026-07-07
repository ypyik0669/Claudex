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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass208-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass208-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass208-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const COMMAND_LOG = path.join(USER_DATA_DIR, "claude-command-log.txt");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const SAFE_RUN_ID = "pass208-safe-mcp-failure";
const MUTATING_RUN_ID = "pass208-mutating-plugin-failure";
const PLUGIN_ID = "pass208-plugin@qa-market";

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

function readCommandLog() {
  try {
    return fs.readFileSync(COMMAND_LOG, "utf8");
  } catch (_error) {
    return "";
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

async function waitForLog(pattern, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (pattern.test(readCommandLog())) return true;
    await wait(150);
  }
  return false;
}

async function waitForLogGrowth(pattern, previous, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const next = readCommandLog().slice(String(previous || "").length);
    if (pattern.test(next)) return true;
    await wait(150);
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
  console.error("PASS208_CLIPBOARD_DEBUG", clipboard.readText());
  return false;
}

function assertStep(name, ok) {
  console.log(name, ok);
  if (!ok) throw new Error(`${name} failed`);
}

function writeFakeClaude() {
  const fakeClaudeScript = `
const fs = require('fs');
const args = process.argv.slice(2);
const commandLog = ${JSON.stringify(COMMAND_LOG)};
fs.appendFileSync(commandLog, args.join(' ') + '\\n', 'utf8');
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
if (args[0] === '--version') out('2.12.0 (Claude Code PASS208)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([{ id: '${PLUGIN_ID}', name: 'pass208-plugin', marketplace: 'qa-market', version: '12.8.0', scope: 'user', enabled: true, source: 'pass208 fixture', permissions: ['Read'] }]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins:\\n\\n  > ${PLUGIN_ID}\\n    Version: 12.8.0\\n    Scope: user\\n    Status: ✓ enabled');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else if (args[0] === 'mcp' && args[1] === 'list') out('pass208 mcp list recovered');
else if (args[0] === 'plugin' && args[1] === 'disable' && args[2] === '${PLUGIN_ID}') out('ok plugin disable ${PLUGIN_ID}');
else out('pass208 fake claude command: ' + args.join(' '));
`;
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(FAKE_CLAUDE, `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function writeInitialStore() {
  writeFakeClaude();
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass208-project" }), "utf8");
  const project = { name: "pass208-project", path: PROJECT_DIR };
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
        id: "pass208-session",
        title: "PASS208 command palette capability recovery",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-08T02:08:00.000Z",
        updatedAt: "2026-07-08T02:08:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [
      {
        id: SAFE_RUN_ID,
        requestId: SAFE_RUN_ID,
        kind: "capability",
        command: "mcp list",
        commandLine: "mcp list",
        cwd: PROJECT_DIR,
        project,
        code: 19,
        durationMs: 91,
        stdout: "pass208 mcp stdout before failure",
        stderr: "pass208 mcp list failed before retry",
        startedAt: "2026-07-08T02:08:01.000Z",
        endedAt: "2026-07-08T02:08:02.000Z",
      },
      {
        id: MUTATING_RUN_ID,
        requestId: MUTATING_RUN_ID,
        kind: "capability",
        command: `plugin disable ${PLUGIN_ID}`,
        commandLine: `plugin disable ${PLUGIN_ID}`,
        cwd: PROJECT_DIR,
        project,
        code: 33,
        durationMs: 121,
        stdout: "pass208 plugin stdout before failure",
        stderr: "pass208 plugin disable failed before retry",
        startedAt: "2026-07-08T02:08:03.000Z",
        endedAt: "2026-07-08T02:08:04.000Z",
      },
    ],
    runEvents: [],
    notices: [],
    automations: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
  });
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
      await new Promise((resolve) => setTimeout(resolve, 220));
      return true;
    })();
  `);
}

async function clickCommandById(win, id) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === ${JSON.stringify(id)});
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function commandVisible(win, id, pattern, target = "") {
  return waitFor(win, `
    (function() {
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === ${JSON.stringify(id)});
      const text = button?.textContent || '';
      return Boolean(button &&
        (${JSON.stringify(target)} ? button.getAttribute('data-command-target') === ${JSON.stringify(target)} : true) &&
        ${pattern}.test(text));
    })();
  `, 8000);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS208_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS208_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));

  assertStep("PASS208_OPEN_PALETTE_SAFE_RETRY", await openPaletteAndQuery(win, "retry pass208 mcp list"));
  assertStep("PASS208_SAFE_RETRY_COMMAND_VISIBLE", await commandVisible(win, `capability-recovery:retry:${SAFE_RUN_ID}`, /重试|retry/i, "outputs"));
  const beforeSafeRetry = readCommandLog();
  assertStep("PASS208_CLICK_SAFE_RETRY", await clickCommandById(win, `capability-recovery:retry:${SAFE_RUN_ID}`));
  assertStep("PASS208_SAFE_RETRY_RAN", await waitForLogGrowth(/mcp list/, beforeSafeRetry, 12000));
  assertStep("PASS208_SAFE_RETRY_NO_CONFIRM", await win.webContents.executeJavaScript("!document.querySelector('.plugin-cli-confirm')"));
  assertStep("PASS208_SAFE_RETRY_PERSISTED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const runs = (state.commandRuns || []).filter((run) => run.kind === 'capability' && /mcp list/.test(run.command || run.commandLine || ''));
      return runs.some((run) => run.code === 19 && /pass208 mcp list failed/.test(run.stderr || '')) &&
        runs.some((run) => run.code === 0 && /pass208 mcp list recovered/.test(run.stdout || ''));
    })();
  `, 10000));

  assertStep("PASS208_OPEN_PALETTE_MUTATING_RETRY", await openPaletteAndQuery(win, "retry pass208 plugin disable"));
  assertStep("PASS208_MUTATING_RETRY_COMMAND_VISIBLE", await commandVisible(win, `capability-recovery:retry:${MUTATING_RUN_ID}`, /重试|retry/i, "capabilities"));
  const beforeMutatingRetry = readCommandLog();
  assertStep("PASS208_CLICK_MUTATING_RETRY", await clickCommandById(win, `capability-recovery:retry:${MUTATING_RUN_ID}`));
  assertStep("PASS208_MUTATING_CONFIRM_VISIBLE", await waitFor(win, `
    Boolean(document.querySelector('.plugin-manager-modal') &&
      document.querySelector('.plugin-cli-confirm') &&
      !document.querySelector('.plugin-cli-confirm .danger-action')?.disabled &&
      /plugin disable ${PLUGIN_ID}/.test(document.querySelector('.plugin-cli-confirm')?.textContent || ''))
  `, 10000));
  assertStep("PASS208_MUTATING_NOT_RUN_BEFORE_CONFIRM", !/plugin disable pass208-plugin@qa-market/.test(readCommandLog().slice(beforeMutatingRetry.length)));
  assertStep("PASS208_CONFIRM_MUTATING_RETRY", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.plugin-cli-confirm .danger-action');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS208_MUTATING_RETRY_RAN", await waitForLogGrowth(/plugin disable pass208-plugin@qa-market/, beforeMutatingRetry, 12000));
  assertStep("PASS208_MUTATING_RETRY_PERSISTED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const runs = (state.commandRuns || []).filter((run) => run.kind === 'capability' && /plugin disable pass208-plugin@qa-market/.test(run.command || run.commandLine || ''));
      return runs.some((run) => run.code === 33 && /pass208 plugin disable failed/.test(run.stderr || '')) &&
        runs.some((run) => run.code === 0 && /ok plugin disable pass208-plugin@qa-market/.test(run.stdout || ''));
    })();
  `, 10000));

  assertStep("PASS208_OPEN_PALETTE_COPY_EVIDENCE", await openPaletteAndQuery(win, "copy evidence pass208 plugin disable"));
  assertStep("PASS208_COPY_COMMAND_VISIBLE", await commandVisible(win, `capability-recovery:copy:${MUTATING_RUN_ID}`, /复制证据|copy/i, "clipboard"));
  clipboard.writeText("");
  assertStep("PASS208_CLICK_COPY_EVIDENCE", await clickCommandById(win, `capability-recovery:copy:${MUTATING_RUN_ID}`));
  assertStep("PASS208_COPY_EVIDENCE_CLIPBOARD", await waitForClipboard([
    /plugin disable pass208-plugin@qa-market/,
    /pass208 plugin disable failed before retry/,
    /33/,
  ]));

  assertStep("PASS208_OPEN_PALETTE_TIMELINE", await openPaletteAndQuery(win, "timeline pass208 mcp list"));
  assertStep("PASS208_TIMELINE_COMMAND_VISIBLE", await commandVisible(win, `capability-recovery:timeline:${SAFE_RUN_ID}`, /timeline|时间线|输出/i, "outputs"));
  assertStep("PASS208_CLICK_TIMELINE", await clickCommandById(win, `capability-recovery:timeline:${SAFE_RUN_ID}`));
  assertStep("PASS208_TIMELINE_FOCUSED", await waitFor(win, `
    Boolean(document.querySelector('.selected-run-evidence-panel') &&
      /mcp list/.test(document.querySelector('.selected-run-evidence-panel')?.textContent || '') &&
      /pass208 mcp list failed before retry/.test(document.querySelector('.selected-run-evidence-panel')?.textContent || ''))
  `, 10000));

  console.log("PASS208_COMMAND_PALETTE_CAPABILITY_RECOVERY_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS208_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (function() {
          return {
            commands: [...document.querySelectorAll('.command-modal .command-list button')].map((button) => ({
              id: button.getAttribute('data-command-id'),
              target: button.getAttribute('data-command-target'),
              text: button.textContent,
            })),
            confirm: document.querySelector('.plugin-cli-confirm')?.textContent || '',
            selectedRun: document.querySelector('.selected-run-evidence-panel')?.textContent || '',
            body: document.body?.textContent?.slice(0, 5000) || '',
            log: ${JSON.stringify(COMMAND_LOG)},
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS208_DEBUG", JSON.stringify(debug, null, 2).slice(0, 9000));
      console.error("PASS208_COMMAND_LOG", readCommandLog());
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS208_TIMEOUT");
  console.error("PASS208_COMMAND_LOG", readCommandLog());
  cleanup();
  app.exit(1);
}, 90000);
