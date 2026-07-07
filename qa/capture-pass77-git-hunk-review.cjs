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

const PROJECT_PATH = findRepoDir();
process.chdir(PROJECT_PATH);
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass77-data-"));
const GIT_PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass77-git-"));
const TARGET_FILE = "pass77-hunks.txt";

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

function setupGitProject() {
  const baseLines = Array.from({ length: 26 }, (_item, index) => `line-${String(index + 1).padStart(2, "0")}`);
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, TARGET_FILE), `${baseLines.join("\n")}\n`, "utf8");
  runGit(["init"]);
  runGit(["config", "user.name", "Claudex QA"]);
  runGit(["config", "user.email", "qa@example.invalid"]);
  runGit(["add", TARGET_FILE]);
  runGit(["commit", "-m", "baseline"]);
  const editedLines = baseLines.slice();
  editedLines[1] = "line-02 pass77-first-hunk";
  editedLines[22] = "line-23 pass77-second-hunk";
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, TARGET_FILE), `${editedLines.join("\n")}\n`, "utf8");
}

setupGitProject();
app.setPath("userData", USER_DATA_DIR);
fs.mkdirSync(USER_DATA_DIR, { recursive: true });
fs.writeFileSync(
  path.join(USER_DATA_DIR, "desktop-data.json"),
  JSON.stringify(
    {
      version: 1,
      activeProject: { name: "pass77-git-project", path: GIT_PROJECT_DIR },
      projects: [{ name: "pass77-git-project", path: GIT_PROJECT_DIR }],
      sessions: [
        {
          id: "default",
          title: "Git hunk review",
          project: "pass77-git-project",
          projectPath: GIT_PROJECT_DIR,
          createdAt: "2026-07-06T00:00:00.000Z",
          updatedAt: "2026-07-06T00:00:00.000Z",
          messages: [],
        },
      ],
      settings: {
        model: "claude-haiku-4-5-20251001",
      },
    },
    null,
    2,
  ),
  "utf8",
);

require(path.join(PROJECT_PATH, "electron", "main.cjs"));

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

app.whenReady().then(async () => {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.error("PASS77_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  try {
    assertStep("PASS77_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
    assertStep("PASS77_OPEN_CHANGES", await win.webContents.executeJavaScript(`
      (function() {
        const button = Array.from(document.querySelectorAll('.workspace-context-button, .bottom-panel-tabs button'))
          .find((item) => /\\u53d8\\u66f4/.test(item.textContent || '') || (item.getAttribute('aria-label') || '').includes('\\u53d8\\u66f4'));
        if (!button) return false;
        button.click();
        return true;
      })();
    `));
    assertStep("PASS77_HUNKS_VISIBLE", await waitFor(win, `
      (function() {
        const fileButton = Array.from(document.querySelectorAll('.git-change-item'))
          .find((item) => /${TARGET_FILE}/.test(item.textContent || ''));
        if (fileButton && !fileButton.classList.contains('selected')) fileButton.click();
        const review = document.querySelector('.git-hunk-review');
        const buttons = Array.from(document.querySelectorAll('.git-hunk-item'));
        const preview = document.querySelector('.git-diff-preview')?.textContent || '';
        const panel = document.querySelector('.git-selected-evidence-panel')?.textContent || '';
        return Boolean(
          review &&
          buttons.length >= 3 &&
          /Hunk review/.test(review.textContent || '') &&
          /Diff hunks/.test(review.textContent || '') &&
          /pass77-first-hunk/.test(preview) &&
          /pass77-second-hunk/.test(preview) &&
          /Diff hunks\\s*2/.test(panel) &&
          /\\+2 -2/.test(panel)
        );
      })();
    `, 10000));

    assertStep("PASS77_SELECT_SECOND_HUNK", await waitFor(win, `
      (function() {
        if (!window.__pass77SecondHunkClicked) {
          const buttons = Array.from(document.querySelectorAll('.git-hunk-item'));
          const second = buttons.find((item) => /pass77-hunks\\.txt/.test(item.textContent || '') && /2\\./.test(item.textContent || ''));
          if (!second) return false;
          window.__pass77SecondHunkClicked = true;
          second.click();
        }
        const preview = document.querySelector('.git-diff-preview')?.textContent || '';
        const panel = document.querySelector('.git-selected-evidence-panel')?.textContent || '';
        return Boolean(
          document.querySelector('.git-hunk-item.selected') &&
          /pass77-second-hunk/.test(preview) &&
          !/pass77-first-hunk/.test(preview) &&
          /\\u9009\\u4e2d hunk/.test(panel) &&
          /\\+1 -1/.test(panel)
        );
      })();
    `, 5000));

    assertStep("PASS77_COPY_SELECTED_HUNK_EVIDENCE", await waitFor(win, `
      (async function() {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText: async (text) => { window.__pass77Clipboard = String(text || ''); } },
        });
        const copy = Array.from(document.querySelectorAll('.git-selected-evidence-panel button'))
          .find((item) => /Git/.test(item.textContent || '') && /\\u590d\\u5236/.test(item.textContent || ''));
        if (!copy) return false;
        copy.click();
        await new Promise((resolve) => setTimeout(resolve, 250));
        return /Diff hunks:\\s*2/.test(window.__pass77Clipboard || '') &&
          /\\u9009\\u4e2d hunk:/.test(window.__pass77Clipboard || '') &&
          /pass77-second-hunk/.test(window.__pass77Clipboard || '') &&
          !/pass77-first-hunk/.test(window.__pass77Clipboard || '');
      })();
    `, 5000));

    console.log("PASS77_GIT_HUNK_REVIEW_DONE");
    cleanup();
    app.exit(0);
  } catch (error) {
    console.error(error);
    cleanup();
    app.exit(1);
  }
});

setTimeout(() => {
  console.error("PASS77_TIMEOUT");
  cleanup();
  app.exit(1);
}, 70000);
