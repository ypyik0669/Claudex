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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass199-data-"));
const GIT_PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass199-git-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass199-bin-"));
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const TARGET_FILE = "pass199-changes.txt";
const RUN_ID = "pass199-git-run";
const NOTICE_ID = "pass199-git-notice";

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
  for (const dir of [USER_DATA_DIR, GIT_PROJECT_DIR, FAKE_BIN_DIR]) {
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

function writeFakeClaude() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(
    FAKE_CLAUDE,
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass199& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins: none& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces: none& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass199 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function setupGitProject() {
  fs.mkdirSync(GIT_PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, TARGET_FILE), "pass199 baseline\n", "utf8");
  runGit(["init"]);
  runGit(["config", "user.name", "Claudex QA"]);
  runGit(["config", "user.email", "qa@example.invalid"]);
  runGit(["add", TARGET_FILE]);
  runGit(["commit", "-m", "baseline"]);
  fs.writeFileSync(path.join(GIT_PROJECT_DIR, TARGET_FILE), "pass199 baseline\npass199 dirty changes evidence\n", "utf8");
}

function writeInitialStore() {
  writeFakeClaude();
  setupGitProject();
  const project = { name: "pass199-git-project", path: GIT_PROJECT_DIR };
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify({
      version: 1,
      activeProject: project,
      projects: [project],
      sessions: [
        {
          id: "pass199-session",
          title: "Pass199 git notice changes evidence",
          project: project.name,
          projectPath: GIT_PROJECT_DIR,
          createdAt: "2026-07-08T00:40:00.000Z",
          updatedAt: "2026-07-08T00:40:00.000Z",
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
      commandRuns: [
        {
          id: RUN_ID,
          requestId: RUN_ID,
          kind: "git",
          command: `git add missing-${TARGET_FILE}`,
          commandLine: `git add missing-${TARGET_FILE}`,
          cwd: GIT_PROJECT_DIR,
          project,
          code: 128,
          durationMs: 199,
          stdout: "",
          stderr: `fatal: pathspec 'missing-${TARGET_FILE}' did not match any files`,
          startedAt: "2026-07-08T00:40:01.000Z",
          endedAt: "2026-07-08T00:40:02.000Z",
        },
      ],
      runEvents: [
        {
          id: RUN_ID,
          type: "git-command",
          status: "error",
          title: "Git: pass199 stage failed",
          detail: `暂存文件失败 · git add missing-${TARGET_FILE}`,
          commandLine: `git add missing-${TARGET_FILE}`,
          cwd: GIT_PROJECT_DIR,
          project,
          sessionId: "pass199-session",
          code: 128,
          durationMs: 199,
          createdAt: "2026-07-08T00:40:02.000Z",
        },
      ],
      notices: [
        {
          id: NOTICE_ID,
          key: "pass199:git-run",
          level: "error",
          source: "git-command",
          title: "Git: pass199 stage failed",
          detail: `pass199 git notice opens changes evidence for missing-${TARGET_FILE}`,
          action: `git-run:${encodeURIComponent(RUN_ID)}`,
          project,
          sessionId: "pass199-session",
          count: 1,
          createdAt: "2026-07-08T00:40:03.000Z",
          lastSeenAt: "2026-07-08T00:40:03.000Z",
        },
      ],
      automations: [],
      subagentRuns: [],
      sourceRefs: [],
      browserVisits: [],
    }, null, 2),
    "utf8",
  );
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

async function clickNoticeCommand(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === 'notice:${NOTICE_ID}');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS199_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS199_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS199_GIT_STATE_READY", await waitFor(win, `
    (async function() {
      const env = await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(GIT_PROJECT_DIR)} });
      const state = await window.claudexDesktop.getState();
      const notice = (state.notices || []).find((item) => item.id === ${JSON.stringify(NOTICE_ID)});
      const event = (state.runEvents || []).find((item) => item.id === ${JSON.stringify(RUN_ID)});
      const run = (state.commandRuns || []).find((item) => item.id === ${JSON.stringify(RUN_ID)});
      return Boolean(env?.git?.available && /${TARGET_FILE}/.test(env?.git?.diff?.text || '') && notice && /^git-run:/.test(notice.action || '') && event?.type === 'git-command' && run?.code === 128);
    })();
  `, 12000));

  assertStep("PASS199_OPEN_NOTICE_PANEL", await openPanel(win, "\\u901a\\u77e5"));
  assertStep("PASS199_NOTICE_CARD_LABEL_CHANGES", await waitFor(win, `
    (function() {
      const card = [...document.querySelectorAll('.notice-card')]
        .find((candidate) => /pass199 stage failed/.test(candidate.textContent || ''));
      const button = card?.querySelector('button[data-notice-action="open"]');
      return Boolean(card &&
        button &&
        button.getAttribute('data-notice-action-target') === 'changes' &&
        /\\u67e5\\u770b\\u53d8\\u66f4\\u8bc1\\u636e/.test(button.textContent || '') &&
        !/\\u67e5\\u770b\\u8bc1\\u636e/.test(button.textContent || ''));
    })();
  `, 8000));
  assertStep("PASS199_CLICK_NOTICE_CHANGES_ACTION", await win.webContents.executeJavaScript(`
    (function() {
      const card = [...document.querySelectorAll('.notice-card')]
        .find((candidate) => /pass199 stage failed/.test(candidate.textContent || ''));
      const button = card?.querySelector('button[data-notice-action="open"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS199_NOTICE_OPENS_CHANGES_EVIDENCE", await waitFor(win, `
    (function() {
      const active = document.querySelector('.workspace-context-button.active')?.textContent || document.querySelector('.bottom-panel-tabs button.active')?.textContent || '';
      const latest = document.querySelector('.git-latest-action.error')?.textContent || '';
      return /\\u53d8\\u66f4/.test(active) &&
        /Git: pass199 stage failed/.test(latest) &&
        /git add missing-${TARGET_FILE}/.test(latest) &&
        /pathspec|did not match|fatal/i.test(latest) &&
        Boolean(document.querySelector('.git-latest-action button[data-git-action="open-timeline"]'));
    })();
  `, 10000));

  assertStep("PASS199_OPEN_OUTPUTS_BEFORE_PALETTE", await openPanel(win, "\\u8f93\\u51fa"));
  assertStep("PASS199_OPEN_PALETTE_GIT_NOTICE", await openPaletteAndQuery(win, "pass199 stage failed"));
  assertStep("PASS199_PALETTE_GIT_NOTICE_LABEL", await waitFor(win, `
    (function() {
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === 'notice:${NOTICE_ID}');
      const text = button?.textContent || '';
      return Boolean(button &&
        button.getAttribute('data-command-target') === 'changes' &&
        /Git: pass199 stage failed/.test(text) &&
        /\\u67e5\\u770b\\u53d8\\u66f4\\u8bc1\\u636e/.test(text) &&
        /git-command/.test(text));
    })();
  `, 8000));
  assertStep("PASS199_CLICK_PALETTE_GIT_NOTICE", await clickNoticeCommand(win));
  assertStep("PASS199_PALETTE_NOTICE_OPENS_CHANGES_EVIDENCE", await waitFor(win, `
    (function() {
      const active = document.querySelector('.workspace-context-button.active')?.textContent || document.querySelector('.bottom-panel-tabs button.active')?.textContent || '';
      const latest = document.querySelector('.git-latest-action.error')?.textContent || '';
      return /\\u53d8\\u66f4/.test(active) &&
        /Git: pass199 stage failed/.test(latest) &&
        /git add missing-${TARGET_FILE}/.test(latest) &&
        /pathspec|did not match|fatal/i.test(latest);
    })();
  `, 10000));

  console.log("PASS199_GIT_NOTICE_CHANGES_TARGET_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS199_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (function() {
          return {
            noticeText: document.querySelector('.notice-card')?.textContent || '',
            noticeTarget: document.querySelector('.notice-card button[data-notice-action="open"]')?.getAttribute('data-notice-action-target') || '',
            commands: [...document.querySelectorAll('.command-modal .command-list button')].map((button) => ({
              id: button.getAttribute('data-command-id'),
              target: button.getAttribute('data-command-target'),
              text: button.textContent,
            })),
            activeBottom: document.querySelector('.workspace-context-button.active')?.textContent || document.querySelector('.bottom-panel-tabs button.active')?.textContent || '',
            latest: document.querySelector('.git-latest-action')?.textContent || '',
            selected: document.querySelector('.selected-run-evidence-panel')?.textContent || '',
            body: document.body?.textContent?.slice(0, 4000) || '',
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS199_DEBUG", JSON.stringify(debug, null, 2).slice(0, 8000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS199_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
