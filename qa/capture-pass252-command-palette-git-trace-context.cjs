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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass252-data-"));
const GIT_PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass252-git-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const TARGET_FILE = "pass252-command-git-trace.txt";
const TARGET_TOKEN = "pass252 command palette git trace token";

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
  for (const dir of [GIT_PROJECT_DIR, USER_DATA_DIR]) {
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

function setupGitProject() {
  fs.mkdirSync(GIT_PROJECT_DIR, { recursive: true });
  const baseLines = Array.from({ length: 30 }, (_item, index) => `line-${String(index + 1).padStart(2, "0")}`);
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass252-git-project" }), "utf8");
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, TARGET_FILE), `${baseLines.join("\n")}\n`, "utf8");
  runGit(["init"]);
  runGit(["config", "user.name", "Claudex QA"]);
  runGit(["config", "user.email", "qa@example.invalid"]);
  runGit(["add", "package.json", TARGET_FILE]);
  runGit(["commit", "-m", "pass252 baseline"]);
  const editedLines = baseLines.slice();
  editedLines[2] = "line-03 pass252 first hunk";
  editedLines[25] = `line-26 ${TARGET_TOKEN}`;
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, TARGET_FILE), `${editedLines.join("\n")}\n`, "utf8");
}

function writeInitialStore() {
  const project = { name: "pass252-git-project", path: GIT_PROJECT_DIR };
  writeJson(DATA_FILE, {
    version: 1,
    activeProject: project,
    projects: [project],
    sessions: [
      {
        id: "pass252-session",
        title: "PASS252 command palette git trace context",
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
    commandRuns: [],
    runEvents: [],
    automations: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
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

async function paletteCommandTrace(win, query, prefix, textToken) {
  return win.webContents.executeJavaScript(`
    (async function() {
      if (!document.querySelector('.command-modal')) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 220));
      }
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return null;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 260));
      const button = Array.from(document.querySelectorAll('.command-modal .command-list button'))
        .find((candidate) =>
          (candidate.getAttribute('data-command-id') || '').startsWith(${JSON.stringify(prefix)}) &&
          (candidate.textContent || '').includes(${JSON.stringify(textToken)})
        );
      if (!button) return null;
      return {
        id: button.getAttribute('data-command-id') || '',
        target: button.getAttribute('data-command-target') || '',
        scope: button.getAttribute('data-command-git-evidence-scope') || '',
        root: button.getAttribute('data-command-git-root') || '',
        relativePath: button.getAttribute('data-command-git-relative-path') || '',
        selectedPath: button.getAttribute('data-command-git-selected-path') || '',
        previousPath: button.getAttribute('data-command-git-previous-path') || '',
        selectedKind: button.getAttribute('data-command-git-selected-kind') || '',
        selectedStatus: button.getAttribute('data-command-git-selected-status') || '',
        selectedHunkId: button.getAttribute('data-command-git-selected-hunk-id') || '',
        selectedHunkFile: button.getAttribute('data-command-git-selected-hunk-file') || '',
        hunkIndex: button.getAttribute('data-command-git-hunk-index') || '',
        branch: button.getAttribute('data-command-git-branch') || '',
        additions: button.getAttribute('data-command-git-additions') || '',
        deletions: button.getAttribute('data-command-git-deletions') || '',
        text: button.textContent || '',
      };
    })();
  `);
}

setupGitProject();
app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS252_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS252_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS252_ENVIRONMENT_GIT_READY", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(GIT_PROJECT_DIR)} });
      const files = state?.git?.files || [];
      return Boolean(
        state?.git?.available &&
        state?.git?.root === ${JSON.stringify(GIT_PROJECT_DIR)} &&
        files.some((file) => file.path === ${JSON.stringify(TARGET_FILE)} && file.status) &&
        /${TARGET_TOKEN}/.test(state?.git?.diff?.text || '')
      );
    })();
  `, 10000));

  const fileTrace = await paletteCommandTrace(win, TARGET_FILE, "git-file:", TARGET_FILE);
  assertStep("PASS252_GIT_FILE_COMMAND_TRACE", Boolean(fileTrace &&
    fileTrace.target === "git-file" &&
    fileTrace.scope === "file" &&
    fileTrace.root === GIT_PROJECT_DIR &&
    fileTrace.relativePath === "." &&
    fileTrace.selectedPath === TARGET_FILE &&
    fileTrace.selectedKind &&
    fileTrace.selectedStatus &&
    fileTrace.selectedHunkId === "" &&
    fileTrace.selectedHunkFile === TARGET_FILE &&
    fileTrace.additions &&
    fileTrace.deletions &&
    /git-file:/.test(fileTrace.id)));

  const openTrace = await paletteCommandTrace(win, `workspace open ${TARGET_FILE}`, "git-open-file:", TARGET_FILE);
  assertStep("PASS252_GIT_OPEN_FILE_COMMAND_TRACE", Boolean(openTrace &&
    openTrace.target === "git-open-file" &&
    openTrace.scope === "workspace-file" &&
    openTrace.root === GIT_PROJECT_DIR &&
    openTrace.relativePath === "." &&
    openTrace.selectedPath === TARGET_FILE &&
    openTrace.selectedKind &&
    openTrace.selectedStatus &&
    openTrace.selectedHunkId === "" &&
    openTrace.selectedHunkFile === TARGET_FILE &&
    openTrace.additions &&
    openTrace.deletions &&
    /git-open-file:/.test(openTrace.id)));

  const hunkTrace = await paletteCommandTrace(win, TARGET_TOKEN, "git-hunk:", "pass252 command palette");
  const hunkChecks = {
    present: Boolean(hunkTrace),
    target: hunkTrace?.target === "git-hunk",
    scope: hunkTrace?.scope === "hunk",
    root: hunkTrace?.root === GIT_PROJECT_DIR,
    relativePath: hunkTrace?.relativePath === ".",
    selectedPath: hunkTrace?.selectedPath === TARGET_FILE,
    selectedKind: Boolean(hunkTrace?.selectedKind),
    selectedStatus: Boolean(hunkTrace?.selectedStatus),
    selectedHunkId: Boolean(hunkTrace?.selectedHunkId),
    selectedHunkFile: hunkTrace?.selectedHunkFile === TARGET_FILE,
    hunkIndex: hunkTrace?.hunkIndex === "2",
    additions: hunkTrace?.additions === "1",
    deletions: hunkTrace?.deletions === "1",
    id: /git-hunk:/.test(hunkTrace?.id || ""),
  };
  assertStep("PASS252_GIT_HUNK_COMMAND_TRACE", Object.values(hunkChecks).every(Boolean));

  console.log("PASS252_COMMAND_PALETTE_GIT_TRACE_CONTEXT_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS252_FAILED", error?.stack || error);
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    const debug = await win.webContents.executeJavaScript(`
      (function() {
        return {
          commands: Array.from(document.querySelectorAll('.command-modal .command-list button')).slice(0, 12).map((button) => ({
            text: button.textContent,
            attrs: Object.fromEntries(Array.from(button.attributes).map((attr) => [attr.name, attr.value])),
          })),
          gitRows: Array.from(document.querySelectorAll('.git-change-item')).map((row) => row.textContent),
        };
      })();
    `).catch((debugError) => ({ error: String(debugError?.stack || debugError) }));
    console.error("PASS252_DEBUG", JSON.stringify(debug, null, 2).slice(0, 16000));
  }
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS252_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
