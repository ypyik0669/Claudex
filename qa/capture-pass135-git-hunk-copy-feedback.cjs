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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass135-data-"));
const GIT_PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass135-git-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass135-bin-"));
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const TARGET_FILE = "pass135-hunks.txt";
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");

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

function cleanup() {
  for (const dir of [GIT_PROJECT_DIR, USER_DATA_DIR, FAKE_BIN_DIR]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_error) {
      // best-effort cleanup
    }
  }
}

function writeFakeClaude() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(
    FAKE_CLAUDE,
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass135& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins: none& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces: none& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass135 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function setupGitProject() {
  const baseLines = Array.from({ length: 28 }, (_item, index) => `line-${String(index + 1).padStart(2, "0")}`);
  fs.mkdirSync(GIT_PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, TARGET_FILE), `${baseLines.join("\n")}\n`, "utf8");
  runGit(["init"]);
  runGit(["config", "user.name", "Claudex QA"]);
  runGit(["config", "user.email", "qa@example.invalid"]);
  runGit(["add", TARGET_FILE]);
  runGit(["commit", "-m", "baseline"]);
  const editedLines = baseLines.slice();
  editedLines[2] = "line-03 pass135-first-hunk";
  editedLines[24] = "line-25 pass135-second-hunk";
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, TARGET_FILE), `${editedLines.join("\n")}\n`, "utf8");
}

function writeInitialStore() {
  writeFakeClaude();
  setupGitProject();
  const project = { name: "pass135-git-project", path: GIT_PROJECT_DIR };
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(
      {
        version: 1,
        activeProject: project,
        projects: [project],
        sessions: [
          {
            id: "pass135-session",
            title: "Pass135 git hunk copy feedback",
            project: project.name,
            projectPath: GIT_PROJECT_DIR,
            createdAt: "2026-07-07T00:00:00.000Z",
            updatedAt: "2026-07-07T00:00:00.000Z",
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
      },
      null,
      2,
    ),
    "utf8",
  );
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

async function openChanges(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = Array.from(document.querySelectorAll('.workspace-context-button, .bottom-panel-tabs button, button'))
        .find((item) => /\\u53d8\\u66f4|Changes/i.test(item.textContent || '') || (item.getAttribute('aria-label') || '').includes('\\u53d8\\u66f4'));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS135_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS135_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS135_OPEN_CHANGES", await openChanges(win));
  assertStep("PASS135_SELECT_SECOND_HUNK", await waitFor(win, `
    (function() {
      const fileButton = Array.from(document.querySelectorAll('.git-change-item'))
        .find((item) => /${TARGET_FILE}/.test(item.textContent || ''));
      if (fileButton && !fileButton.classList.contains('selected')) fileButton.click();
      const second = Array.from(document.querySelectorAll('.git-hunk-item'))
        .find((item) => /pass135-hunks\\.txt/.test(item.textContent || '') && /2\\./.test(item.textContent || ''));
      if (!second) return false;
      if (!window.__pass135SecondHunkClicked) {
        window.__pass135SecondHunkClicked = true;
        second.click();
      }
      const preview = document.querySelector('.git-diff-preview')?.textContent || '';
      const panel = document.querySelector('.git-selected-evidence-panel')?.textContent || '';
      return Boolean(
        /pass135-second-hunk/.test(preview) &&
        !/pass135-first-hunk/.test(preview) &&
        /\\u9009\\u4e2d hunk/.test(panel) &&
        /\\+1 -1/.test(panel)
      );
    })();
  `, 10000));
  assertStep("PASS135_COPY_GIT_HUNK_EVIDENCE_FEEDBACK", await waitFor(win, `
    (async function() {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text) => { window.__pass135Clipboard = String(text || ''); } },
      });
      const panel = document.querySelector('.git-selected-evidence-panel');
      const copy = panel?.querySelector('[data-git-action="copy-evidence"]');
      if (!copy) return false;
      copy.click();
      await new Promise((resolve) => setTimeout(resolve, 250));
      return /Diff hunks:\\s*2/.test(window.__pass135Clipboard || '') &&
        /\\u9009\\u4e2d hunk:/.test(window.__pass135Clipboard || '') &&
        /pass135-second-hunk/.test(window.__pass135Clipboard || '') &&
        !/pass135-first-hunk/.test(window.__pass135Clipboard || '') &&
        /\\u5df2\\u590d\\u5236/.test(panel.textContent || '');
    })();
  `, 5000));

  console.log("PASS135_GIT_HUNK_COPY_FEEDBACK_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS135_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS135_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
