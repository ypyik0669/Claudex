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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass224-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass224-bin-"));
const GIT_PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass224-git-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const TARGET_FILE = "pass224-seven-hunks.txt";
const TARGET_TOKEN = "pass224 deep git hunk 7 command palette token";

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
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result;
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
      "if \"%1\"==\"--version\" (echo claude fake pass224& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins: none& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces: none& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass224 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function setupGitProject() {
  const baseLines = Array.from({ length: 160 }, (_item, index) => `pass224 baseline line ${String(index + 1).padStart(3, "0")}`);
  const editPositions = [4, 24, 44, 64, 84, 104, 124];
  fs.mkdirSync(GIT_PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, TARGET_FILE), `${baseLines.join("\n")}\n`, "utf8");
  runGit(["init"]);
  runGit(["config", "user.name", "Claudex QA"]);
  runGit(["config", "user.email", "qa@example.invalid"]);
  runGit(["add", TARGET_FILE]);
  runGit(["commit", "-m", "baseline"]);

  const editedLines = baseLines.slice();
  editPositions.forEach((lineIndex, index) => {
    const hunkNumber = index + 1;
    editedLines[lineIndex] = hunkNumber === 7
      ? `pass224 edited hunk 7 ${TARGET_TOKEN}`
      : `pass224 edited filler hunk ${hunkNumber}`;
  });
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, TARGET_FILE), `${editedLines.join("\n")}\n`, "utf8");
}

function writeInitialStore() {
  writeFakeClaude();
  setupGitProject();
  const project = { name: "pass224-git-project", path: GIT_PROJECT_DIR };
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  writeJson(DATA_FILE, {
    version: 1,
    activeProject: project,
    projects: [project],
    sessions: [
      {
        id: "pass224-session",
        title: "PASS224 deep git hunk 7",
        project: project.name,
        projectPath: GIT_PROJECT_DIR,
        createdAt: "2026-07-08T02:24:00.000Z",
        updatedAt: "2026-07-08T02:24:00.000Z",
        messages: [],
      },
    ],
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
    commandRuns: [],
    runEvents: [],
    automations: [],
    subagentRuns: [],
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
      const result = [...document.querySelectorAll('.command-modal .command-list button')].map((button) => ({
        id: button.getAttribute('data-command-id') || '',
        group: button.getAttribute('data-command-group') || '',
        text: button.textContent || '',
      }));
      window.__pass224Commands = result;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return result;
    })();
  `);
}

async function waitForPaletteCommand(win, query, timeoutMs = 12000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const commands = await paletteCommands(win, query);
    if (Array.isArray(commands) && commands.some((command) =>
      command.id.startsWith('git-hunk:') &&
      /pass224-seven-hunks\.txt/.test(command.text || '') &&
      /7\./.test(command.text || '')
    )) return true;
    await wait(180);
  }
  return false;
}

async function runPaletteCommand(win, query) {
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
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) =>
          (candidate.getAttribute('data-command-id') || '').startsWith('git-hunk:') &&
          /pass224-seven-hunks\.txt/.test(candidate.textContent || '') &&
          /7\./.test(candidate.textContent || '')
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
  if (!win) throw new Error("PASS224_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS224_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS224_ENVIRONMENT_HAS_SEVEN_HUNKS", await waitFor(win, `
    (async function() {
      const env = await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(GIT_PROJECT_DIR)} });
      const fileDiff = env.git?.diff?.fileDiffs?.find((file) => file.path === ${JSON.stringify(TARGET_FILE)});
      const hunkCount = (fileDiff?.text || '').split('@@').length - 1;
      return Boolean(
        env.git?.available &&
        env.git?.files?.some((file) => file.path === ${JSON.stringify(TARGET_FILE)}) &&
        hunkCount >= 7 &&
        (fileDiff?.text || '').includes(${JSON.stringify(TARGET_TOKEN)})
      );
    })();
  `, 15000));

  assertStep("PASS224_DEEP_GIT_HUNK_7_COMMAND_SEARCHABLE", await waitForPaletteCommand(win, TARGET_TOKEN));
  assertStep("PASS224_OPEN_DEEP_GIT_HUNK_7_COMMAND", await runPaletteCommand(win, TARGET_TOKEN));
  assertStep("PASS224_DEEP_GIT_HUNK_7_FOCUSED", await waitFor(win, `
    (function() {
      const active = document.querySelector('.bottom-panel-tabs button.active')?.textContent || '';
      const selectedFile = document.querySelector('.git-change-item.selected')?.textContent || '';
      const selectedHunk = document.querySelector('.git-hunk-item.selected')?.textContent || '';
      const panel = document.querySelector('.git-selected-evidence-panel')?.textContent || '';
      const preview = document.querySelector('.git-diff-preview')?.textContent || '';
      return Boolean(
        /\u53d8\u66f4/.test(active) &&
        /pass224-seven-hunks\.txt/.test(selectedFile) &&
        /7\./.test(selectedHunk) &&
        panel.includes(${JSON.stringify(TARGET_TOKEN)}) &&
        preview.includes(${JSON.stringify(TARGET_TOKEN)}) &&
        /\u9009\u4e2d hunk/.test(panel)
      );
    })();
  `, 10000));

  console.log("PASS224_COMMAND_PALETTE_DEEP_GIT_HUNK_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS224_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (async function() {
          return {
            commands: window.__pass224Commands || [],
            selectedFile: document.querySelector('.git-change-item.selected')?.textContent || '',
            selectedHunk: document.querySelector('.git-hunk-item.selected')?.textContent || '',
            panel: document.querySelector('.git-selected-evidence-panel')?.textContent || '',
            preview: document.querySelector('.git-diff-preview')?.textContent || '',
            env: await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(GIT_PROJECT_DIR)} }).catch((envError) => ({ error: String(envError?.message || envError) })),
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS224_DEBUG", JSON.stringify(debug, null, 2).slice(0, 12000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS224_TIMEOUT");
  cleanup();
  app.exit(1);
}, 100000);
