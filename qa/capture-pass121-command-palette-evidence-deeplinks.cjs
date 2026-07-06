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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass121-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass121-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const SOURCE_OTHER = "src/pass121-other-source.txt";
const SOURCE_TARGET = "docs/pass121-source-target.md";
const TARGET_BROWSER_URL = "http://127.0.0.1/pass121-browser-target";
const OTHER_BROWSER_URL = "http://127.0.0.1/pass121-browser-other";

function cleanup() {
  for (const dir of [USER_DATA_DIR, PROJECT_DIR]) {
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

function writeInitialStore() {
  fs.mkdirSync(path.join(PROJECT_DIR, "src"), { recursive: true });
  fs.mkdirSync(path.join(PROJECT_DIR, "docs"), { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass121-project" }), "utf8");
  fs.writeFileSync(path.join(PROJECT_DIR, SOURCE_OTHER), "pass121 other source evidence\n", "utf8");
  fs.writeFileSync(path.join(PROJECT_DIR, SOURCE_TARGET), "pass121 target source evidence\n", "utf8");
  const project = { name: "pass121-project", path: PROJECT_DIR };
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
      claudeCode: { executionMode: "claude-code", claudeCommand: "claude", permissionMode: "default" },
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
        id: "default",
        title: "Command palette evidence deeplinks",
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
    sourceRefs: [
      {
        id: "pass121-source-other",
        path: SOURCE_OTHER,
        name: "pass121-other-source.txt",
        type: "file",
        size: 31,
        project,
        lastOpenedAt: "2026-07-06T00:01:00.000Z",
      },
      {
        id: "pass121-source-target",
        path: SOURCE_TARGET,
        name: "pass121-source-target.md",
        type: "file",
        size: 32,
        project,
        lastOpenedAt: "2026-07-06T00:02:00.000Z",
      },
    ],
    browserVisits: [
      {
        id: "pass121-browser-other",
        url: OTHER_BROWSER_URL,
        finalUrl: OTHER_BROWSER_URL,
        title: "pass121 browser other title",
        excerpt: "pass121 other browser excerpt",
        status: "ready",
        httpStatus: 200,
        project,
        lastEventAt: "2026-07-06T00:03:00.000Z",
        snapshotCapturedAt: "2026-07-06T00:03:00.000Z",
      },
      {
        id: "pass121-browser-target",
        url: TARGET_BROWSER_URL,
        finalUrl: `${TARGET_BROWSER_URL}/final`,
        title: "pass121 browser target title",
        excerpt: "pass121 target browser excerpt",
        status: "ready",
        httpStatus: 200,
        project,
        lastEventAt: "2026-07-06T00:04:00.000Z",
        snapshotCapturedAt: "2026-07-06T00:04:00.000Z",
      },
    ],
    notices: [],
  });
}

async function openPanel(win, labelPattern) {
  return win.webContents.executeJavaScript(`
    (function() {
      const pattern = new RegExp(${JSON.stringify(labelPattern)});
      const button = [...document.querySelectorAll('.workspace-context-button, .bottom-panel-tabs button')]
        .find((candidate) => pattern.test(candidate.textContent || '') || pattern.test(candidate.getAttribute('aria-label') || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function openPaletteAndQuery(win, query) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      return true;
    })();
  `);
}

async function clickCommand(win, idPrefix, textNeedle) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) =>
          (candidate.getAttribute('data-command-id') || '').startsWith(${JSON.stringify(idPrefix)}) &&
          (candidate.textContent || '').includes(${JSON.stringify(textNeedle)})
        );
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS121_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS121_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS121_STORE_EVIDENCE_READY", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      return Boolean(
        state.sourceRefs?.some((source) => source.path === ${JSON.stringify(SOURCE_TARGET)}) &&
        state.browserVisits?.some((visit) => visit.id === 'pass121-browser-target')
      );
    })();
  `, 10000));
  assertStep("PASS121_OPEN_OUTPUTS_BEFORE_SOURCE", await openPanel(win, "\\u8f93\\u51fa"));
  assertStep("PASS121_OPEN_PALETTE_QUERY_SOURCE", await openPaletteAndQuery(win, "pass121-source-target"));
  assertStep("PASS121_SOURCE_COMMAND_VISIBLE", await waitFor(win, `
    Boolean([...document.querySelectorAll('.command-modal .command-list button')].some((button) =>
      (button.getAttribute('data-command-id') || '').startsWith('source-ref:') &&
      (button.textContent || '').includes(${JSON.stringify(SOURCE_TARGET)})
    ))
  `, 5000));
  assertStep("PASS121_CLICK_SOURCE_COMMAND", await clickCommand(win, "source-ref:", SOURCE_TARGET));
  assertStep("PASS121_SOURCE_PANEL_FOCUSED_FROM_PALETTE", await waitFor(win, `
    (function() {
      const active = document.querySelector('.workspace-context-button.active')?.textContent || '';
      const selected = document.querySelector('.source-ref-card.selected')?.textContent || '';
      return /\\u6765\\u6e90/.test(active) &&
        selected.includes(${JSON.stringify(SOURCE_TARGET)}) &&
        !/pass121-other-source/.test(selected) &&
        /\\u6765\\u81ea\\u771f\\u5b9e Workspace/.test(document.querySelector('.bottom-work-panel')?.textContent || '');
    })()
  `, 10000));
  assertStep("PASS121_OPEN_OUTPUTS_BEFORE_BROWSER", await openPanel(win, "\\u8f93\\u51fa"));
  assertStep("PASS121_OPEN_PALETTE_QUERY_BROWSER", await openPaletteAndQuery(win, "pass121 browser target"));
  assertStep("PASS121_BROWSER_COMMAND_VISIBLE", await waitFor(win, `
    Boolean([...document.querySelectorAll('.command-modal .command-list button')].some((button) =>
      (button.getAttribute('data-command-id') || '').startsWith('browser-visit:') &&
      /pass121 browser target title/.test(button.textContent || '')
    ))
  `, 5000));
  assertStep("PASS121_CLICK_BROWSER_COMMAND", await clickCommand(win, "browser-visit:", "pass121 browser target title"));
  assertStep("PASS121_BROWSER_PANEL_FOCUSED_FROM_PALETTE", await waitFor(win, `
    (function() {
      const active = document.querySelector('.bottom-panel-tabs button.active')?.textContent || '';
      const selected = document.querySelector('.browser-evidence-card.selected')?.textContent || '';
      return /\\u6d4f\\u89c8\\u5668/.test(active) &&
        /pass121 browser target title/.test(selected) &&
        /pass121 target browser excerpt/.test(selected) &&
        !/pass121 browser other title/.test(selected) &&
        /\\u6700\\u7ec8 URL/.test(selected);
    })()
  `, 10000));

  console.log("PASS121_COMMAND_PALETTE_EVIDENCE_DEEPLINKS_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS121_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS121_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
