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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass299-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass299-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const TARGET_RELATIVE = "src/deep/pass299-target.ts";
const SECOND_RELATIVE = "docs/pass299-target-notes.md";
const IGNORED_RELATIVE = "node_modules/pass299-target-ignored.txt";
const TARGET_TEXT = "pass299 workspace search target evidence";

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

function writeProjectFile(relativePath, content) {
  const file = path.join(PROJECT_DIR, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
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
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  writeProjectFile("package.json", JSON.stringify({ name: "pass299-project" }));
  writeProjectFile(TARGET_RELATIVE, `export const pass299 = ${JSON.stringify(TARGET_TEXT)};\n`);
  writeProjectFile(SECOND_RELATIVE, `# PASS299\n\n${TARGET_TEXT} secondary\n`);
  writeProjectFile(IGNORED_RELATIVE, "pass299 ignored dependency file\n");
  const project = { name: "pass299-project", path: PROJECT_DIR };
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
      claudeCode: { executionMode: "claude-code", permissionMode: "default" },
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
        id: "pass299-session",
        title: "PASS299 workspace search",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-08T00:00:00.000Z",
        updatedAt: "2026-07-08T00:00:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    runEvents: [],
    notices: [],
    automations: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
  });
}

async function openWorkspace(win) {
  const clicked = await win.webContents.executeJavaScript(`
    (function() {
      if (document.querySelector('.tools-panel .workspace-detail')) return true;
      const rail = document.querySelector('.rail-button[data-tool="workspace"]');
      if (rail) {
        rail.click();
        return true;
      }
      const side = document.querySelector('.side-panel-button');
      if (side) {
        side.click();
        return true;
      }
      return false;
    })();
  `);
  if (!clicked) return false;
  const panelReady = await waitFor(win, `
    (function() {
      if (document.querySelector('.tools-panel .workspace-detail')) return true;
      return Boolean(document.querySelector('.tools-panel'));
    })();
  `, 5000);
  if (!panelReady) return false;
  await win.webContents.executeJavaScript(`
    (function() {
      if (document.querySelector('.tools-panel .workspace-detail')) return true;
      const row = [...document.querySelectorAll('.tool-row')]
        .find((candidate) => /Workspace|工作区/i.test(candidate.textContent || ''));
      if (!row) return false;
      row.click();
      return true;
    })();
  `);
  return waitFor(win, "Boolean(document.querySelector('.tools-panel .workspace-detail'))", 5000);
}

async function setSearch(win, query) {
  return win.webContents.executeJavaScript(`
    (function() {
      const input = document.querySelector('[data-workspace-search-input]');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })();
  `);
}

async function clickWorkspaceFileButton(win, attribute, relativePath) {
  return win.webContents.executeJavaScript(`
    (function() {
      const selector = ${JSON.stringify(`[${attribute}="${relativePath}"]`)};
      const button = document.querySelector(selector);
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS299_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS299_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS299_OPEN_WORKSPACE", await openWorkspace(win));
  assertStep("PASS299_SEARCH_INPUT_READY", await waitFor(win, "Boolean(document.querySelector('[data-workspace-search-input]'))", 10000));
  assertStep("PASS299_TYPE_SEARCH", await setSearch(win, "pass299-target"));
  assertStep("PASS299_SEARCH_RESULTS_READY", await waitFor(win, `
    (function() {
      const results = Array.from(document.querySelectorAll('[data-workspace-search-result]'))
        .map((item) => item.getAttribute('data-workspace-search-result'));
      return results.includes(${JSON.stringify(TARGET_RELATIVE)}) &&
        results.includes(${JSON.stringify(SECOND_RELATIVE)}) &&
        !results.some((item) => /node_modules/.test(item || ''));
    })();
  `, 10000));

  assertStep("PASS299_OPEN_SEARCH_RESULT", await clickWorkspaceFileButton(win, "data-workspace-search-result", TARGET_RELATIVE));
  assertStep("PASS299_FILE_OPENED_FROM_SEARCH", await waitFor(win, `
    (async function() {
      const value = document.querySelector('#workspace-tool-detail textarea')?.value || '';
      const state = await window.claudexDesktop.getState();
      return value.includes(${JSON.stringify(TARGET_TEXT)}) &&
        state.sourceRefs?.some((source) =>
          source.path === ${JSON.stringify(TARGET_RELATIVE)} &&
          source.project?.path === ${JSON.stringify(PROJECT_DIR)} &&
          source.sha256 &&
          source.lastOpenedAt
        );
    })();
  `, 10000));

  assertStep("PASS299_CLEAR_SEARCH", await setSearch(win, ""));
  assertStep("PASS299_RECENT_VISIBLE_AFTER_OPEN", await waitFor(win, `
    Boolean(document.querySelector(${JSON.stringify(`[data-workspace-recent-file="${TARGET_RELATIVE}"]`)}))
  `, 5000));

  assertStep("PASS299_SOURCE_REF_PERSISTED", (() => {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return parsed.sourceRefs?.some((source) =>
      source.path === TARGET_RELATIVE &&
      source.project?.path === PROJECT_DIR &&
      source.sha256 &&
      source.lastOpenedAt
    );
  })());

  win.webContents.reload();
  assertStep("PASS299_RELOAD_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS299_REOPEN_WORKSPACE", await openWorkspace(win));
  assertStep("PASS299_RECENT_RESTORED", await waitFor(win, `
    Boolean(document.querySelector(${JSON.stringify(`[data-workspace-recent-file="${TARGET_RELATIVE}"]`)}))
  `, 10000));
  assertStep("PASS299_OPEN_RECENT_FILE", await clickWorkspaceFileButton(win, "data-workspace-recent-file", TARGET_RELATIVE));
  assertStep("PASS299_RECENT_FILE_OPENED", await waitFor(win, `
    (document.querySelector('#workspace-tool-detail textarea')?.value || '').includes(${JSON.stringify(TARGET_TEXT)})
  `, 10000));

  console.log("PASS299_WORKSPACE_FILE_SEARCH_RECENT_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS299_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (async function() {
          return {
            body: document.body?.textContent || '',
            results: Array.from(document.querySelectorAll('[data-workspace-search-result]')).map((item) => item.getAttribute('data-workspace-search-result')),
            recent: Array.from(document.querySelectorAll('[data-workspace-recent-file]')).map((item) => item.getAttribute('data-workspace-recent-file')),
            workspaceValue: document.querySelector('#workspace-tool-detail textarea')?.value || '',
            state: await window.claudexDesktop.getState().catch((stateError) => ({ error: String(stateError?.message || stateError) })),
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS299_DEBUG", JSON.stringify(debug, null, 2).slice(0, 16000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS299_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
