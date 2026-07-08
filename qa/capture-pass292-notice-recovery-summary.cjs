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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass292-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass292-project-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass292-bin-"));
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const TARGET_FILE = "pass292-changes.txt";
const TIMELINE_RUN_ID = "pass292-timeline-command-request";
const GIT_RUN_ID = "pass292-git-run";
const TIMELINE_NOTICE_ID = "pass292-timeline-notice";
const CHANGES_NOTICE_ID = "pass292-changes-notice";
const SURFACE_NOTICE_ID = "pass292-surface-notice";
const TIMELINE_COMMAND = "node -e \"console.log('pass292 timeline summary stdout'); console.error('pass292 timeline summary stderr'); process.exit(2)\"";

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: PROJECT_DIR,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result;
}

function cleanup() {
  for (const dir of [USER_DATA_DIR, PROJECT_DIR, FAKE_BIN_DIR]) {
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
      "if \"%1\"==\"--version\" (echo claude fake pass292& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo [{\"name\":\"pass292-plugin\",\"version\":\"1.0.0\",\"scope\":\"user\",\"enabled\":true}]& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins: pass292-plugin& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces: none& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass292 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function setupProject() {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, TARGET_FILE), "pass292 baseline\n", "utf8");
  runGit(["init"]);
  runGit(["config", "user.name", "Claudex QA"]);
  runGit(["config", "user.email", "qa@example.invalid"]);
  runGit(["add", TARGET_FILE]);
  runGit(["commit", "-m", "baseline"]);
  fs.writeFileSync(path.join(PROJECT_DIR, TARGET_FILE), "pass292 baseline\npass292 dirty changes evidence\n", "utf8");
}

function writeInitialStore() {
  writeFakeClaude();
  setupProject();
  const project = { name: "pass292-project", path: PROJECT_DIR };
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify({
      version: 1,
      activeProject: project,
      projects: [project],
      sessions: [
        {
          id: "pass292-session",
          title: "Notice recovery summary",
          project: project.name,
          projectPath: project.path,
          createdAt: "2026-07-08T00:00:00.000Z",
          updatedAt: "2026-07-08T00:00:00.000Z",
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
          id: "pass292-timeline-command-run",
          requestId: TIMELINE_RUN_ID,
          kind: "workspace",
          command: TIMELINE_COMMAND,
          commandLine: TIMELINE_COMMAND,
          cwd: PROJECT_DIR,
          project,
          code: 2,
          durationMs: 292,
          stdout: "pass292 timeline summary stdout\n",
          stderr: "pass292 timeline summary stderr\n",
          startedAt: "2026-07-08T00:01:00.000Z",
          endedAt: "2026-07-08T00:01:01.000Z",
        },
        {
          id: GIT_RUN_ID,
          requestId: GIT_RUN_ID,
          kind: "git",
          command: `git add missing-${TARGET_FILE}`,
          commandLine: `git add missing-${TARGET_FILE}`,
          cwd: PROJECT_DIR,
          project,
          code: 128,
          durationMs: 199,
          stdout: "",
          stderr: `fatal: pathspec 'missing-${TARGET_FILE}' did not match any files`,
          startedAt: "2026-07-08T00:01:02.000Z",
          endedAt: "2026-07-08T00:01:03.000Z",
        },
      ],
      runEvents: [
        {
          id: GIT_RUN_ID,
          type: "git-command",
          status: "error",
          title: "Git: pass292 summary changes failed",
          detail: `暂存文件失败 · git add missing-${TARGET_FILE}`,
          commandLine: `git add missing-${TARGET_FILE}`,
          cwd: PROJECT_DIR,
          project,
          sessionId: "pass292-session",
          code: 128,
          durationMs: 199,
          createdAt: "2026-07-08T00:01:03.000Z",
        },
      ],
      notices: [
        {
          id: TIMELINE_NOTICE_ID,
          key: "pass292:timeline",
          level: "error",
          source: "workspace-command",
          title: "Pass292 timeline recovery notice",
          detail: "pass292 summary opens command evidence",
          action: `command-run:${encodeURIComponent(TIMELINE_RUN_ID)}`,
          project,
          sessionId: "pass292-session",
          count: 1,
          createdAt: "2026-07-08T00:02:00.000Z",
          lastSeenAt: "2026-07-08T00:02:00.000Z",
        },
        {
          id: CHANGES_NOTICE_ID,
          key: "pass292:changes",
          level: "warning",
          source: "git-command",
          title: "Pass292 changes recovery notice",
          detail: `pass292 summary opens changes for missing-${TARGET_FILE}`,
          action: `git-run:${encodeURIComponent(GIT_RUN_ID)}`,
          project,
          sessionId: "pass292-session",
          count: 1,
          createdAt: "2026-07-08T00:02:01.000Z",
          lastSeenAt: "2026-07-08T00:02:01.000Z",
        },
        {
          id: SURFACE_NOTICE_ID,
          key: "pass292:surface",
          level: "info",
          source: "runtime-health",
          title: "Pass292 surface recovery notice",
          detail: "pass292 summary opens plugin workbench",
          action: "runtime-health:plugins",
          project,
          sessionId: "pass292-session",
          count: 1,
          createdAt: "2026-07-08T00:02:02.000Z",
          lastSeenAt: "2026-07-08T00:02:02.000Z",
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

async function openPanel(win, label) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.workspace-context-button, .bottom-panel-tabs button, button')]
        .find((item) => item.getAttribute('aria-label') === ${JSON.stringify(label)} || (item.textContent || '').includes(${JSON.stringify(label)}));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function clickSummaryTarget(win, target) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('[data-notice-recovery-target="${target}"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS292_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS292_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS292_STORE_HAS_THREE_TARGETS", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const notices = state.notices || [];
      return notices.length === 3 &&
        notices.some((item) => item.id === ${JSON.stringify(TIMELINE_NOTICE_ID)} && /^command-run:/.test(item.action || '')) &&
        notices.some((item) => item.id === ${JSON.stringify(CHANGES_NOTICE_ID)} && /^git-run:/.test(item.action || '')) &&
        notices.some((item) => item.id === ${JSON.stringify(SURFACE_NOTICE_ID)} && item.action === 'runtime-health:plugins');
    })();
  `, 10000));

  assertStep("PASS292_OPEN_NOTICE_CENTER", await openPanel(win, "通知"));
  assertStep("PASS292_RECOVERY_SUMMARY_VISIBLE", await waitFor(win, `
    (function() {
      const summary = document.querySelector('.notice-recovery-summary');
      const timeline = summary?.querySelector('[data-notice-recovery-target="timeline"]');
      const changes = summary?.querySelector('[data-notice-recovery-target="changes"]');
      const surface = summary?.querySelector('[data-notice-recovery-target="surface"]');
      return Boolean(
        summary &&
        /恢复入口/.test(summary.textContent || '') &&
        timeline?.getAttribute('data-notice-recovery-count') === '1' &&
        timeline?.getAttribute('data-notice-recovery-first-id') === ${JSON.stringify(TIMELINE_NOTICE_ID)} &&
        changes?.getAttribute('data-notice-recovery-count') === '1' &&
        changes?.getAttribute('data-notice-recovery-first-id') === ${JSON.stringify(CHANGES_NOTICE_ID)} &&
        surface?.getAttribute('data-notice-recovery-count') === '1' &&
        surface?.getAttribute('data-notice-recovery-first-id') === ${JSON.stringify(SURFACE_NOTICE_ID)}
      );
    })();
  `, 10000));

  assertStep("PASS292_CLICK_TIMELINE_RECOVERY", await clickSummaryTarget(win, "timeline"));
  assertStep("PASS292_TIMELINE_RECOVERY_OPENS_EVIDENCE", await waitFor(win, `
    (function() {
      const active = document.querySelector('.bottom-panel-tabs button.active')?.textContent || '';
      const panel = document.querySelector('.selected-run-evidence-panel.error');
      const retry = panel?.querySelector('[data-run-recovery-action="retry-workspace"]');
      const text = panel?.textContent || '';
      return /输出/.test(active) &&
        /pass292 timeline summary stdout/.test(text) &&
        /pass292 timeline summary stderr/.test(text) &&
        /${TIMELINE_RUN_ID}/.test(text) &&
        retry &&
        retry.getAttribute('data-run-recovery-action-focused') === 'true' &&
        document.activeElement === retry;
    })();
  `, 10000));

  assertStep("PASS292_REOPEN_NOTICE_CENTER_FOR_CHANGES", await openPanel(win, "通知"));
  assertStep("PASS292_CLICK_CHANGES_RECOVERY", await clickSummaryTarget(win, "changes"));
  assertStep("PASS292_CHANGES_RECOVERY_OPENS_GIT_EVIDENCE", await waitFor(win, `
    (function() {
      const active = document.querySelector('.workspace-context-button.active')?.textContent || document.querySelector('.bottom-panel-tabs button.active')?.textContent || '';
      const latest = document.querySelector('.git-latest-action.error')?.textContent || '';
      return /变更/.test(active) &&
        /Git: pass292 summary changes failed/.test(latest) &&
        /git add missing-${TARGET_FILE}/.test(latest) &&
        /pathspec|did not match|fatal/i.test(latest) &&
        Boolean(document.querySelector('.git-latest-action button[data-git-action="open-timeline"]'));
    })();
  `, 10000));

  assertStep("PASS292_REOPEN_NOTICE_CENTER_FOR_SURFACE", await openPanel(win, "通知"));
  assertStep("PASS292_CLICK_SURFACE_RECOVERY", await clickSummaryTarget(win, "surface"));
  assertStep("PASS292_SURFACE_RECOVERY_OPENS_PLUGIN_WORKBENCH", await waitFor(win, `
    (function() {
      const modal = document.querySelector('.capability-modal');
      const activeTab = document.querySelector('.plugin-manager-tabs button.active');
      return Boolean(
        modal &&
        activeTab &&
        /插件|plugin/i.test(activeTab.textContent || '') &&
        /pass292-plugin|Installed plugins|插件/.test(modal.textContent || '')
      );
    })();
  `, 12000));

  assertStep("PASS292_SUMMARY_ACTIONS_DID_NOT_MUTATE_STORE", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      return (state.notices || []).length === 3 &&
        (state.commandRuns || []).length === 2 &&
        (state.runEvents || []).length === 1;
    })();
  `, 10000));

  console.log("PASS292_NOTICE_RECOVERY_SUMMARY_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS292_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (async function() {
          return {
            activePanel: document.querySelector('.workspace-context-button.active')?.textContent || document.querySelector('.bottom-panel-tabs button.active')?.textContent || '',
            summary: document.querySelector('.notice-recovery-summary')?.outerHTML || '',
            selectedPanel: document.querySelector('.selected-run-evidence-panel')?.outerHTML || '',
            latestGit: document.querySelector('.git-latest-action')?.outerHTML || '',
            capabilityModal: document.querySelector('.capability-modal')?.textContent?.slice(0, 2000) || '',
            state: await window.claudexDesktop.getState().catch((stateError) => ({ error: String(stateError?.message || stateError) })),
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS292_DEBUG", JSON.stringify(debug, null, 2).slice(0, 12000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS292_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
