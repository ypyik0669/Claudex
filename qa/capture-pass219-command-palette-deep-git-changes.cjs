const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass219-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass219-bin-"));
const GIT_PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass219-git-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const TARGET_FILE = "src/pass219-file-25.txt";
const TARGET_TOKEN = "pass219 deep git file 25 hunk token";

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, GIT_PROJECT_DIR]) {
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

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: GIT_PROJECT_DIR,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  return result;
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
if (args[0] === '--version') out('2.10.9 (Claude Code PASS219)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out({ plugins: [] });
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out({ servers: [] });
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else out('pass219 fake claude command: ' + args.join(' '));
`;
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeScript, "utf8");
  fs.writeFileSync(FAKE_CLAUDE, '@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n', "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function setupGitProject() {
  fs.mkdirSync(path.join(GIT_PROJECT_DIR, "src"), { recursive: true });
  for (let index = 1; index <= 25; index += 1) {
    const padded = String(index).padStart(2, "0");
    const relative = `src/pass219-file-${padded}.txt`;
    fs.writeFileSync(path.join(GIT_PROJECT_DIR, relative), `baseline pass219 file ${padded}\n`, "utf8");
  }
  runGit(["init"]);
  runGit(["config", "user.name", "Claudex QA"]);
  runGit(["config", "user.email", "qa@example.invalid"]);
  runGit(["add", "."]);
  runGit(["commit", "-m", "baseline"]);
  for (let index = 1; index <= 25; index += 1) {
    const padded = String(index).padStart(2, "0");
    const relative = `src/pass219-file-${padded}.txt`;
    const content = index === 25
      ? `baseline pass219 file ${padded}\n${TARGET_TOKEN}\n`
      : `baseline pass219 file ${padded}\npass219 filler git file ${padded}\n`;
    fs.writeFileSync(path.join(GIT_PROJECT_DIR, relative), content, "utf8");
  }
}

function writeInitialStore() {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  writeFakeClaude();
  setupGitProject();
  const project = { name: "pass219-git-project", path: GIT_PROJECT_DIR };
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
    sessions: [
      {
        id: "pass219-session",
        title: "PASS219 deep git changes",
        project: project.name,
        projectPath: GIT_PROJECT_DIR,
        createdAt: "2026-07-07T13:00:00.000Z",
        updatedAt: "2026-07-07T13:00:00.000Z",
        messages: [],
      },
    ],
    automations: [],
    subagentRuns: [],
    commandRuns: [],
    runEvents: [],
    sourceRefs: [],
    browserVisits: [],
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
      window.__pass219LastCommands = result;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return result;
    })();
  `);
}

async function waitForPaletteCommand(win, query, predicateSource, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const commands = await paletteCommands(win, query);
    const predicate = new Function("command", `return (${predicateSource})(command);`);
    if (Array.isArray(commands) && commands.some((command) => predicate(command))) return true;
    await wait(180);
  }
  return false;
}

async function runPaletteCommand(win, query, predicateSource) {
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
      const predicate = ${predicateSource};
      const button = Array.from(document.querySelectorAll('.command-modal .command-list button'))
        .find((candidate) => predicate({ id: candidate.getAttribute('data-command-id') || '', text: candidate.textContent || '' }));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

const gitFilePredicate = `(command) => command.id.startsWith('git-file:') && /pass219-file-25\.txt/.test(command.text || '')`;
const gitOpenPredicate = `(command) => command.id.startsWith('git-open-file:') && /pass219-file-25\.txt/.test(command.text || '')`;
const gitHunkPredicate = `(command) => command.id.startsWith('git-hunk:') && /pass219-file-25\.txt/.test(command.text || '') && /pass219 deep git file 25 hunk token/.test(command.text || '')`;

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS219_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS219_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS219_ENVIRONMENT_HAS_25_GIT_FILES", await waitFor(win, `
    (async function() {
      const env = await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(GIT_PROJECT_DIR)} });
      return Boolean(
        env.git?.files?.length === 25 &&
        env.git.files.some((file) => file.path === ${JSON.stringify(TARGET_FILE)}) &&
        env.git.diff?.fileDiffs?.some((file) => file.path === ${JSON.stringify(TARGET_FILE)} && /${TARGET_TOKEN}/.test(file.text || ''))
      );
    })();
  `, 15000));

  assertStep("PASS219_DEEP_GIT_FILE_COMMAND_SEARCHABLE", await waitForPaletteCommand(
    win,
    "pass219-file-25",
    gitFilePredicate,
  ));
  assertStep("PASS219_OPEN_DEEP_GIT_FILE_COMMAND", await runPaletteCommand(win, "pass219-file-25", gitFilePredicate));
  assertStep("PASS219_DEEP_GIT_FILE_FOCUSED", await waitFor(win, `
    (function() {
      const active = document.querySelector('.bottom-panel-tabs button.active')?.textContent || '';
      const selected = document.querySelector('.git-change-item.selected')?.textContent || '';
      const panel = document.querySelector('.git-selected-evidence-panel')?.textContent || '';
      const preview = document.querySelector('.git-diff-preview')?.textContent || '';
      return Boolean(
        /\u53d8\u66f4/.test(active) &&
        /pass219-file-25\.txt/.test(selected) &&
        /pass219-file-25\.txt/.test(panel) &&
        /${TARGET_TOKEN}/.test(panel) &&
        /${TARGET_TOKEN}/.test(preview)
      );
    })();
  `, 10000));

  assertStep("PASS219_DEEP_GIT_OPEN_FILE_COMMAND_SEARCHABLE", await waitForPaletteCommand(
    win,
    "workspace pass219-file-25",
    gitOpenPredicate,
  ));
  assertStep("PASS219_OPEN_DEEP_GIT_WORKSPACE_FILE", await runPaletteCommand(win, "workspace pass219-file-25", gitOpenPredicate));
  assertStep("PASS219_DEEP_WORKSPACE_FILE_OPENED", await waitFor(win, `
    (function() {
      const grid = document.querySelector('.app-grid');
      const workspace = document.querySelector('.tools-panel .workspace-detail');
      const editor = document.querySelector('.tools-panel .file-editor');
      const text = editor?.textContent || '';
      const textarea = editor?.querySelector('textarea');
      return Boolean(
        grid && !grid.classList.contains('right-panel-hidden') &&
        workspace &&
        editor &&
        /pass219-file-25\.txt/.test(text) &&
        textarea && /${TARGET_TOKEN}/.test(textarea.value || '')
      );
    })();
  `, 12000));

  assertStep("PASS219_DEEP_GIT_HUNK_COMMAND_SEARCHABLE", await waitForPaletteCommand(
    win,
    "pass219 deep git file 25 hunk token",
    gitHunkPredicate,
  ));
  assertStep("PASS219_OPEN_DEEP_GIT_HUNK_COMMAND", await runPaletteCommand(win, "pass219 deep git file 25 hunk token", gitHunkPredicate));
  assertStep("PASS219_DEEP_GIT_HUNK_FOCUSED", await waitFor(win, `
    (function() {
      const active = document.querySelector('.bottom-panel-tabs button.active')?.textContent || '';
      const selectedFile = document.querySelector('.git-change-item.selected')?.textContent || '';
      const selectedHunk = document.querySelector('.git-hunk-item.selected')?.textContent || '';
      const panel = document.querySelector('.git-selected-evidence-panel')?.textContent || '';
      const preview = document.querySelector('.git-diff-preview')?.textContent || '';
      return Boolean(
        /\u53d8\u66f4/.test(active) &&
        /pass219-file-25\.txt/.test(selectedFile) &&
        /pass219-file-25\.txt/.test(selectedHunk) &&
        /${TARGET_TOKEN}/.test(panel) &&
        /${TARGET_TOKEN}/.test(preview) &&
        /\u9009\u4e2d hunk/.test(panel)
      );
    })();
  `, 10000));

  console.log("PASS219_COMMAND_PALETTE_DEEP_GIT_CHANGES_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS219_COMMAND_PALETTE_DEEP_GIT_CHANGES_FAILED", error?.stack || error);
  try {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      win.webContents.executeJavaScript("window.__pass219LastCommands || null")
        .then((debug) => console.error("PASS219_COMMANDS", JSON.stringify(debug, null, 2)))
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
  console.error("PASS219_COMMAND_PALETTE_DEEP_GIT_CHANGES_TIMEOUT");
  cleanup();
  app.exit(1);
}, 100000);
