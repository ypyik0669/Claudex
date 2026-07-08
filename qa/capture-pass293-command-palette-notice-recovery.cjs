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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass293-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass293-project-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass293-bin-"));
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const TARGET_FILE = "pass293-changes.txt";
const TIMELINE_RUN_ID = "pass293-timeline-command-request";
const GIT_RUN_ID = "pass293-git-run";
const TIMELINE_NOTICE_ID = "pass293-timeline-notice";
const CHANGES_NOTICE_ID = "pass293-changes-notice";
const SURFACE_NOTICE_ID = "pass293-surface-notice";
const TIMELINE_COMMAND = "node -e \"console.log('pass293 timeline summary stdout'); console.error('pass293 timeline summary stderr'); process.exit(2)\"";

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
      "if \"%1\"==\"--version\" (echo claude fake pass293& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo [{\"name\":\"pass293-plugin\",\"version\":\"1.0.0\",\"scope\":\"user\",\"enabled\":true}]& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins: pass293-plugin& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces: none& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass293 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function setupProject() {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, TARGET_FILE), "pass293 baseline\n", "utf8");
  runGit(["init"]);
  runGit(["config", "user.name", "Claudex QA"]);
  runGit(["config", "user.email", "qa@example.invalid"]);
  runGit(["add", TARGET_FILE]);
  runGit(["commit", "-m", "baseline"]);
  fs.writeFileSync(path.join(PROJECT_DIR, TARGET_FILE), "pass293 baseline\npass293 dirty changes evidence\n", "utf8");
}

function writeInitialStore() {
  writeFakeClaude();
  setupProject();
  const project = { name: "pass293-project", path: PROJECT_DIR };
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify({
      version: 1,
      activeProject: project,
      projects: [project],
      sessions: [
        {
          id: "pass293-session",
          title: "Command palette notice recovery",
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
          id: "pass293-timeline-command-run",
          requestId: TIMELINE_RUN_ID,
          kind: "workspace",
          command: TIMELINE_COMMAND,
          commandLine: TIMELINE_COMMAND,
          cwd: PROJECT_DIR,
          project,
          code: 2,
          durationMs: 292,
          stdout: "pass293 timeline summary stdout\n",
          stderr: "pass293 timeline summary stderr\n",
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
          title: "Git: pass293 summary changes failed",
          detail: `stage file failed · git add missing-${TARGET_FILE}`,
          commandLine: `git add missing-${TARGET_FILE}`,
          cwd: PROJECT_DIR,
          project,
          sessionId: "pass293-session",
          code: 128,
          durationMs: 199,
          createdAt: "2026-07-08T00:01:03.000Z",
        },
      ],
      notices: [
        {
          id: TIMELINE_NOTICE_ID,
          key: "pass293:timeline",
          level: "error",
          source: "workspace-command",
          title: "pass293 timeline recovery notice",
          detail: "pass293 summary opens command evidence",
          action: `command-run:${encodeURIComponent(TIMELINE_RUN_ID)}`,
          project,
          sessionId: "pass293-session",
          count: 1,
          createdAt: "2026-07-08T00:02:00.000Z",
          lastSeenAt: "2026-07-08T00:02:00.000Z",
        },
        {
          id: CHANGES_NOTICE_ID,
          key: "pass293:changes",
          level: "warning",
          source: "git-command",
          title: "pass293 changes recovery notice",
          detail: `pass293 summary opens changes for missing-${TARGET_FILE}`,
          action: `git-run:${encodeURIComponent(GIT_RUN_ID)}`,
          project,
          sessionId: "pass293-session",
          count: 1,
          createdAt: "2026-07-08T00:02:01.000Z",
          lastSeenAt: "2026-07-08T00:02:01.000Z",
        },
        {
          id: SURFACE_NOTICE_ID,
          key: "pass293:surface",
          level: "info",
          source: "runtime-health",
          title: "pass293 surface recovery notice",
          detail: "pass293 summary opens plugin workbench",
          action: "runtime-health:plugins",
          project,
          sessionId: "pass293-session",
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

async function openPaletteAndQuery(win, query) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 240));
      return true;
    })();
  `);
}

async function assertRecoveryCommand(win, target, firstId, textNeedle) {
  assertStep(`PASS293_${target.toUpperCase()}_RECOVERY_COMMAND_VISIBLE`, await waitFor(win, `
    (function() {
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === 'notice-recovery:${target}');
      const text = button?.textContent || '';
      return Boolean(
        button &&
        button.getAttribute('data-command-target') === ${JSON.stringify(target)} &&
        button.getAttribute('data-notice-recovery-target') === ${JSON.stringify(target)} &&
        button.getAttribute('data-notice-recovery-count') === '1' &&
        button.getAttribute('data-notice-recovery-first-id') === ${JSON.stringify(firstId)} &&
        text.includes(${JSON.stringify(textNeedle)})
      );
    })();
  `, 8000));
}

async function clickRecoveryCommand(win, target) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === 'notice-recovery:${target}');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS293_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS293_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS293_STORE_HAS_THREE_TARGETS", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const notices = state.notices || [];
      return notices.length === 3 &&
        notices.some((item) => item.id === ${JSON.stringify(TIMELINE_NOTICE_ID)} && /^command-run:/.test(item.action || '')) &&
        notices.some((item) => item.id === ${JSON.stringify(CHANGES_NOTICE_ID)} && /^git-run:/.test(item.action || '')) &&
        notices.some((item) => item.id === ${JSON.stringify(SURFACE_NOTICE_ID)} && item.action === 'runtime-health:plugins');
    })();
  `, 10000));

  assertStep("PASS293_OPEN_PALETTE_TIMELINE_RECOVERY", await openPaletteAndQuery(win, "pass293 timeline recovery notice"));
  await assertRecoveryCommand(win, "timeline", TIMELINE_NOTICE_ID, "pass293 timeline recovery notice");
  assertStep("PASS293_CLICK_TIMELINE_RECOVERY_COMMAND", await clickRecoveryCommand(win, "timeline"));
  assertStep("PASS293_TIMELINE_RECOVERY_COMMAND_OPENS_EVIDENCE", await waitFor(win, `
    (function() {
      const active = document.querySelector('.bottom-panel-tabs button.active')?.textContent || '';
      const panel = document.querySelector('.selected-run-evidence-panel.error');
      const retry = panel?.querySelector('[data-run-recovery-action="retry-workspace"]');
      const text = panel?.textContent || '';
      return active.length > 0 &&
        /pass293 timeline summary stdout/.test(text) &&
        /pass293 timeline summary stderr/.test(text) &&
        /${TIMELINE_RUN_ID}/.test(text) &&
        retry &&
        retry.getAttribute('data-run-recovery-action-focused') === 'true' &&
        document.activeElement === retry;
    })();
  `, 10000));

  assertStep("PASS293_OPEN_PALETTE_CHANGES_RECOVERY", await openPaletteAndQuery(win, "pass293 changes recovery notice"));
  await assertRecoveryCommand(win, "changes", CHANGES_NOTICE_ID, "pass293 changes recovery notice");
  assertStep("PASS293_CLICK_CHANGES_RECOVERY_COMMAND", await clickRecoveryCommand(win, "changes"));
  assertStep("PASS293_CHANGES_RECOVERY_COMMAND_OPENS_GIT_EVIDENCE", await waitFor(win, `
    (function() {
      const active = document.querySelector('.workspace-context-button.active')?.textContent || document.querySelector('.bottom-panel-tabs button.active')?.textContent || '';
      const latest = document.querySelector('.git-latest-action.error')?.textContent || '';
      return active.length > 0 &&
        /Git: pass293 summary changes failed/.test(latest) &&
        /git add missing-${TARGET_FILE}/.test(latest) &&
        /pathspec|did not match|fatal/i.test(latest) &&
        Boolean(document.querySelector('.git-latest-action button[data-git-action="open-timeline"]'));
    })();
  `, 10000));

  assertStep("PASS293_OPEN_PALETTE_SURFACE_RECOVERY", await openPaletteAndQuery(win, "pass293 surface recovery notice"));
  await assertRecoveryCommand(win, "surface", SURFACE_NOTICE_ID, "pass293 surface recovery notice");
  assertStep("PASS293_CLICK_SURFACE_RECOVERY_COMMAND", await clickRecoveryCommand(win, "surface"));
  assertStep("PASS293_SURFACE_RECOVERY_COMMAND_OPENS_PLUGIN_WORKBENCH", await waitFor(win, `
    (function() {
      const modal = document.querySelector('.capability-modal');
      const activeTab = document.querySelector('.plugin-manager-tabs button.active');
      return Boolean(
        modal &&
        activeTab &&
        (activeTab.textContent || '').trim() &&
        /pass293-plugin|Installed plugins/i.test(modal.textContent || '')
      );
    })();
  `, 12000));

  assertStep("PASS293_RECOVERY_COMMANDS_DID_NOT_MUTATE_STORE", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      return (state.notices || []).length === 3 &&
        (state.commandRuns || []).length === 2 &&
        (state.runEvents || []).length === 1;
    })();
  `, 10000));

  console.log("PASS293_COMMAND_PALETTE_NOTICE_RECOVERY_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS293_FAILED", error?.stack || error);
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
      console.error("PASS293_DEBUG", JSON.stringify(debug, null, 2).slice(0, 12000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS293_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);

