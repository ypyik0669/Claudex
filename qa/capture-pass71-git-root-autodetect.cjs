const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass71-data-"));
const GIT_REPO_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass71-repo-"));
const NESTED_PROJECT = path.join(GIT_REPO_DIR, "apps", "worker");

function cleanup() {
  for (const dir of [USER_DATA_DIR, GIT_REPO_DIR]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_error) {
      // best-effort cleanup
    }
  }
}

try {
  fs.mkdirSync(NESTED_PROJECT, { recursive: true });
  execFileSync("git", ["init"], { cwd: GIT_REPO_DIR, stdio: "ignore" });
  fs.writeFileSync(path.join(GIT_REPO_DIR, "README.md"), "# pass71 root change\n", "utf8");
  fs.writeFileSync(path.join(NESTED_PROJECT, "package.json"), JSON.stringify({ name: "worker" }), "utf8");
} catch (error) {
  console.error("PASS71_GIT_SETUP_FAILED", error?.message || error);
  cleanup();
  process.exit(1);
}

app.setPath("userData", USER_DATA_DIR);

fs.mkdirSync(USER_DATA_DIR, { recursive: true });
fs.writeFileSync(
  path.join(USER_DATA_DIR, "desktop-data.json"),
  JSON.stringify(
    {
      version: 1,
      activeProject: { name: "Nested Worker", path: NESTED_PROJECT },
      projects: [{ name: "Nested Worker", path: NESTED_PROJECT }],
      settings: {
        model: "claude-haiku-4-5-20251001",
      },
      sessions: [
        {
          id: "default",
          title: "新聊天",
          project: "Nested Worker",
          projectPath: NESTED_PROJECT,
          createdAt: "2026-07-05T00:00:00.000Z",
          updatedAt: "2026-07-05T00:00:00.000Z",
          messages: [],
        },
      ],
    },
    null,
    2,
  ),
  "utf8",
);

require(path.join(REPO_DIR, "electron", "main.cjs"));

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
    console.error("PASS71_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS71_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));

  assertStep("PASS71_ENVIRONMENT_IPC_GIT_ROOT", await win.webContents.executeJavaScript(`
    (async function() {
      const env = await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(NESTED_PROJECT)} });
      return env.cwd === ${JSON.stringify(NESTED_PROJECT)} &&
        env.projectExists === true &&
        env.projectMissing === false &&
        env.git?.available === true &&
        env.git.root === ${JSON.stringify(GIT_REPO_DIR)} &&
        env.git.relativePath === 'apps/worker' &&
        (env.git.files || []).some((file) => file.path === 'README.md');
    })();
  `));

  assertStep("PASS71_BOTTOM_ENVIRONMENT_SHOWS_GIT_ROOT", await waitFor(win, `
    (async function() {
      if (!window.__pass71EnvironmentClicked) {
        window.__pass71EnvironmentClicked = true;
        const button = Array.from(document.querySelectorAll('.workspace-context-button'))
          .find((item) => /\\u73af\\u5883/.test(item.textContent || ''));
        if (!button) return false;
        button.click();
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      const text = document.querySelector('.bottom-work-panel')?.textContent || '';
      return /Git \\u6839\\u76ee\\u5f55/.test(text) &&
        /\\u9879\\u76ee\\u76f8\\u5bf9\\u8def\\u5f84/.test(text) &&
        /apps\\/worker/.test(text);
    })();
  `, 10000));

  assertStep("PASS71_CHANGES_SHOW_ROOT_FILE", await waitFor(win, `
    (async function() {
      if (!window.__pass71ChangesClicked) {
        window.__pass71ChangesClicked = true;
        const button = Array.from(document.querySelectorAll('.workspace-context-button'))
          .find((item) => /\\u53d8\\u66f4/.test(item.textContent || ''));
        if (!button) return false;
        button.click();
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      const text = document.querySelector('.bottom-work-panel')?.textContent || '';
      return /README\\.md/.test(text) &&
        /Git \\u6839\\u76ee\\u5f55/.test(text) &&
        /\\u9879\\u76ee\\u76f8\\u5bf9\\u8def\\u5f84/.test(text);
    })();
  `, 10000));

  console.log("PASS71_GIT_ROOT_AUTODETECT_DONE");
  cleanup();
  app.exit(0);
}).catch((error) => {
  console.error("PASS71_GIT_ROOT_AUTODETECT_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS71_GIT_ROOT_AUTODETECT_TIMEOUT");
  cleanup();
  app.exit(1);
}, 60000);
