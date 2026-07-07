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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass221-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass221-bin-"));
const PROJECT_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass221-projects-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const TARGET_PROJECT_NAME = "pass221 Project 13 deep";
let targetProject = null;
let projectOne = null;

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_ROOT]) {
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
  fs.writeFileSync(
    FAKE_CLAUDE,
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass221& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins: none& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces: none& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo {\"servers\":[]}& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass221 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function writeInitialStore() {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_ROOT, { recursive: true });
  writeFakeClaude();

  const projects = [];
  for (let index = 1; index <= 13; index += 1) {
    const padded = String(index).padStart(2, "0");
    const name = index === 13 ? TARGET_PROJECT_NAME : `pass221 Project ${padded} filler`;
    const projectPath = path.join(PROJECT_ROOT, `project-${padded}`);
    fs.mkdirSync(projectPath, { recursive: true });
    fs.writeFileSync(path.join(projectPath, "package.json"), JSON.stringify({ name }), "utf8");
    projects.push({ name, path: projectPath });
  }
  [projectOne] = projects;
  targetProject = projects[12];

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
      systemPrompt: "QA",
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
    activeProject: projectOne,
    projects,
    sessions: [
      {
        id: "pass221-project-one-thread",
        title: "pass221 current project one thread",
        project: projectOne.name,
        projectPath: projectOne.path,
        createdAt: "2026-07-08T02:21:00.000Z",
        updatedAt: "2026-07-08T02:21:00.000Z",
        messages: [{ role: "user", content: "project one", createdAt: "2026-07-08T02:21:00.000Z" }],
      },
      {
        id: "pass221-target-thread",
        title: "pass221 target project thirteen thread",
        project: targetProject.name,
        projectPath: targetProject.path,
        createdAt: "2026-07-08T02:22:00.000Z",
        updatedAt: "2026-07-08T02:22:00.000Z",
        messages: [{ role: "user", content: "project thirteen", createdAt: "2026-07-08T02:22:00.000Z" }],
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

async function openPaletteWithQuery(win, query) {
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
      window.__pass221Commands = [...document.querySelectorAll('.command-modal .command-list button')].map((button) => ({
        id: button.getAttribute('data-command-id') || '',
        group: button.getAttribute('data-command-group') || '',
        text: button.textContent || '',
      }));
      return true;
    })();
  `);
}

async function clickProjectCommand(win, query) {
  await openPaletteWithQuery(win, query);
  return win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) =>
          (candidate.getAttribute('data-command-id') || '').startsWith('project:') &&
          /${TARGET_PROJECT_NAME}/.test(candidate.textContent || '') &&
          /${targetProject.path.replace(/\\/g, "\\\\")}/.test(candidate.textContent || '')
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
  if (!win) throw new Error("PASS221_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS221_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS221_INITIAL_PROJECT_ONE", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const list = document.querySelector('.thread-list')?.textContent || '';
      return state.activeProject?.path === ${JSON.stringify(projectOne.path)} &&
        state.projects?.length === 13 &&
        /pass221 current project one thread/.test(list) &&
        !/pass221 target project thirteen thread/.test(list);
    })();
  `, 10000));

  assertStep("PASS221_DEEP_PROJECT_COMMAND_SEARCHABLE", await openPaletteWithQuery(win, TARGET_PROJECT_NAME) && await waitFor(win, `
    Boolean((window.__pass221Commands || []).some((command) =>
      /^project:/.test(command.id || '') &&
      /${TARGET_PROJECT_NAME}/.test(command.text || '') &&
      /${targetProject.path.replace(/\\/g, "\\\\")}/.test(command.text || '')
    ))
  `, 5000));
  assertStep("PASS221_OPEN_DEEP_PROJECT_COMMAND", await clickProjectCommand(win, TARGET_PROJECT_NAME));
  assertStep("PASS221_DEEP_PROJECT_SELECTED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const activeProjectButton = document.querySelector('.project-list button.active');
      const activeProjectText = activeProjectButton?.textContent || '';
      const activeProjectPath = activeProjectButton?.getAttribute('data-project-path') || '';
      const list = document.querySelector('.thread-list')?.textContent || '';
      const scope = document.querySelector('.thread-scope-summary')?.textContent || '';
      return state.activeProject?.path === ${JSON.stringify(targetProject.path)} &&
        /${TARGET_PROJECT_NAME}/.test(activeProjectText) &&
        activeProjectPath === ${JSON.stringify(targetProject.path)} &&
        /${TARGET_PROJECT_NAME}/.test(scope) &&
        /pass221 target project thirteen thread/.test(list) &&
        !/pass221 current project one thread/.test(list);
    })();
  `, 12000));

  console.log("PASS221_COMMAND_PALETTE_DEEP_PROJECTS_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS221_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (async function() {
          return {
            commands: window.__pass221Commands || [],
            activeProjectText: document.querySelector('.project-list button.active')?.textContent || '',
            activeProjectPath: document.querySelector('.project-list button.active')?.getAttribute('data-project-path') || '',
            threads: document.querySelector('.thread-list')?.textContent || '',
            scope: document.querySelector('.thread-scope-summary')?.textContent || '',
            state: await window.claudexDesktop.getState().catch((stateError) => ({ error: String(stateError?.message || stateError) })),
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS221_DEBUG", JSON.stringify(debug, null, 2).slice(0, 12000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS221_TIMEOUT");
  cleanup();
  app.exit(1);
}, 100000);
