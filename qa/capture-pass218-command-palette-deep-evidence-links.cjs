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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass218-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass218-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass218-project-"));
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

function writeFakeClaude() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  const fakeScript = `
const args = process.argv.slice(2);
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
if (args[0] === '--version') out('2.10.8 (Claude Code PASS218)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out({ plugins: [] });
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out({ servers: [] });
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else out('pass218 fake claude command: ' + args.join(' '));
`;
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeScript, "utf8");
  fs.writeFileSync(FAKE_CLAUDE, '@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n', "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function makeSourceRef(index, project) {
  const padded = String(index).padStart(2, "0");
  const isTarget = index === 25;
  const relativePath = isTarget ? "src/pass218-deep-source-25.md" : `src/pass218-filler-source-${padded}.md`;
  fs.writeFileSync(
    path.join(PROJECT_DIR, relativePath),
    isTarget ? "pass218 deep source 25 file content token\n" : `pass218 filler source ${index}\n`,
    "utf8",
  );
  return {
    id: `pass218-source-${index}`,
    type: "file",
    name: relativePath,
    path: relativePath,
    size: isTarget ? 21825 : 100 + index,
    project,
    reason: isTarget ? "pass218 deep source 25 reason token" : `pass218 filler source ${index}`,
    lastOpenedAt: `2026-07-07T11:${padded}:00.000Z`,
  };
}

function makeBrowserVisit(index, project) {
  const padded = String(index).padStart(2, "0");
  const isTarget = index === 25;
  return {
    id: `pass218-browser-${index}`,
    url: `https://pass218.example.test/${padded}`,
    finalUrl: `https://pass218.example.test/${padded}/final`,
    validatedUrl: `https://pass218.example.test/${padded}/final`,
    title: isTarget ? "pass218 deep browser 25 title token" : `pass218 filler browser ${index}`,
    excerpt: isTarget ? "pass218 deep browser 25 excerpt evidence token" : `pass218 filler browser ${index} excerpt`,
    status: isTarget ? "ready" : "ready",
    httpStatus: 200,
    isMainFrame: true,
    project,
    startedAt: `2026-07-07T12:${padded}:00.000Z`,
    endedAt: `2026-07-07T12:${padded}:01.000Z`,
    lastEventAt: `2026-07-07T12:${padded}:01.000Z`,
    snapshotCapturedAt: `2026-07-07T12:${padded}:01.000Z`,
  };
}

function writeInitialStore() {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(path.join(PROJECT_DIR, "src"), { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass218-project" }), "utf8");
  writeFakeClaude();

  const project = { name: "pass218-project", path: PROJECT_DIR };
  const createdAt = "2026-07-07T11:00:00.000Z";
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
        id: "pass218-session",
        title: "PASS218 deep evidence links",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt,
        updatedAt: createdAt,
        messages: [],
      },
    ],
    automations: [],
    subagentRuns: [],
    commandRuns: [],
    runEvents: [],
    sourceRefs: Array.from({ length: 25 }, (_value, index) => makeSourceRef(index + 1, project)),
    browserVisits: Array.from({ length: 25 }, (_value, index) => makeBrowserVisit(index + 1, project)),
    notices: [],
  });
}

async function paletteCommands(win, query) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return null;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));
      const result = Array.from(document.querySelectorAll('.command-modal .command-list button'))
        .map((button) => ({ id: button.getAttribute('data-command-id') || '', text: button.textContent || '' }));
      window.__pass218LastCommands = result;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return result;
    })();
  `);
}

async function waitForPaletteCommand(win, query, expectedId, textPattern, timeoutMs = 10000) {
  const pattern = textPattern ? new RegExp(textPattern) : null;
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const commands = await paletteCommands(win, query);
    if (Array.isArray(commands) && commands.some((command) => command.id === expectedId && (!pattern || pattern.test(command.text || "")))) return true;
    await wait(180);
  }
  return false;
}

async function runPaletteCommand(win, query, expectedId) {
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
      const button = Array.from(document.querySelectorAll('.command-modal .command-list button'))
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === ${JSON.stringify(expectedId)});
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS218_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS218_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS218_STORE_HAS_DEEP_EVIDENCE", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      return Boolean(
        state.sourceRefs?.length === 25 &&
        state.browserVisits?.length === 25 &&
        state.sourceRefs[24]?.id === 'pass218-source-25' &&
        state.browserVisits[24]?.id === 'pass218-browser-25'
      );
    })();
  `));

  assertStep("PASS218_DEEP_SOURCE_COMMAND_SEARCHABLE", await waitForPaletteCommand(
    win,
    "pass218 deep source 25 reason token",
    "source-ref:pass218-source-25",
    "pass218-deep-source-25",
  ));
  assertStep("PASS218_OPEN_DEEP_SOURCE_COMMAND", await runPaletteCommand(
    win,
    "pass218 deep source 25 reason token",
    "source-ref:pass218-source-25",
  ));
  assertStep("PASS218_DEEP_SOURCE_CARD_FOCUSED", await waitFor(win, `
    (function() {
      const active = document.querySelector('.bottom-panel-tabs button.active')?.textContent || '';
      const card = document.querySelector('.source-ref-card.selected');
      const text = card?.textContent || '';
      return Boolean(
        /\u6765\u6e90/.test(active) &&
        card &&
        /pass218-deep-source-25\.md/.test(text) &&
        /pass218-project/.test(text) &&
        !/pass218-filler-source-01/.test(text)
      );
    })();
  `, 10000));

  assertStep("PASS218_DEEP_BROWSER_COMMAND_SEARCHABLE", await waitForPaletteCommand(
    win,
    "pass218 deep browser 25 excerpt",
    "browser-visit:pass218-browser-25",
    "pass218 deep browser 25 title token",
  ));
  assertStep("PASS218_OPEN_DEEP_BROWSER_COMMAND", await runPaletteCommand(
    win,
    "pass218 deep browser 25 excerpt",
    "browser-visit:pass218-browser-25",
  ));
  assertStep("PASS218_DEEP_BROWSER_CARD_FOCUSED", await waitFor(win, `
    (function() {
      const active = document.querySelector('.bottom-panel-tabs button.active')?.textContent || '';
      const card = document.querySelector('.browser-evidence-card.selected[data-browser-visit-id="pass218-browser-25"]');
      const text = card?.textContent || '';
      return Boolean(
        /\u6d4f\u89c8\u5668/.test(active) &&
        card &&
        /pass218 deep browser 25 title token/.test(text) &&
        /pass218 deep browser 25 excerpt evidence token/.test(text) &&
        !/pass218 filler browser 1/.test(text)
      );
    })();
  `, 10000));

  assertStep("PASS218_DEEP_BROWSER_TIMELINE_COMMAND_SEARCHABLE", await waitForPaletteCommand(
    win,
    "timeline pass218 deep browser 25 excerpt",
    "browser-run:pass218-browser-25",
    "pass218 deep browser 25 title token",
  ));
  assertStep("PASS218_OPEN_DEEP_BROWSER_TIMELINE_COMMAND", await runPaletteCommand(
    win,
    "timeline pass218 deep browser 25 excerpt",
    "browser-run:pass218-browser-25",
  ));
  assertStep("PASS218_DEEP_BROWSER_TIMELINE_FOCUSED", await waitFor(win, `
    (function() {
      const active = document.querySelector('.bottom-panel-tabs button.active')?.textContent || '';
      const row = document.querySelector('.run-timeline-row.selected')?.textContent || '';
      const evidencePanel = document.querySelector('.selected-run-evidence-panel');
      const retry = evidencePanel?.querySelector('[data-run-recovery-action="retry-browser"]');
      const panel = evidencePanel?.textContent || '';
      return Boolean(
        /\u8f93\u51fa/.test(active) &&
        /pass218 deep browser 25 title token/.test(row) &&
        /pass218 deep browser 25 excerpt evidence token/.test(panel) &&
        panel.includes('https://pass218.example.test/25/final') &&
        retry &&
        retry.getAttribute('data-run-recovery-action-focused') === 'true' &&
        document.activeElement === retry
      );
    })();
  `, 10000));

  console.log("PASS218_COMMAND_PALETTE_DEEP_EVIDENCE_LINKS_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS218_COMMAND_PALETTE_DEEP_EVIDENCE_LINKS_FAILED", error?.stack || error);
  try {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      win.webContents.executeJavaScript("window.__pass218LastCommands || null")
        .then((debug) => console.error("PASS218_COMMANDS", JSON.stringify(debug, null, 2)))
        .finally(() => {
          cleanup();
          app.exit(1);
        });
      return;
    }
  } catch (_debugError) {
    // best-effort diagnostics
  }
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS218_COMMAND_PALETTE_DEEP_EVIDENCE_LINKS_TIMEOUT");
  cleanup();
  app.exit(1);
}, 100000);
