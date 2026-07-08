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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass294-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass294-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const TIMELINE_RUN_ID = "pass294-timeline-command-request";
const GIT_RUN_ID = "pass294-git-run";
const TIMELINE_NOTICE_ID = "pass294-timeline-notice";
const CHANGES_NOTICE_ID = "pass294-changes-notice";
const SURFACE_NOTICE_ID = "pass294-surface-notice";
const TIMELINE_COMMAND = "node -e \"console.log('pass294 trace timeline stdout'); console.error('pass294 trace timeline stderr'); process.exit(2)\"";

const TRACE_FIELDS = [
  "surface",
  "action",
  "target",
  "count",
  "errorCount",
  "warningCount",
  "firstId",
  "firstKey",
  "firstLevel",
  "firstSource",
  "firstTitle",
  "firstAction",
  "firstRunEventId",
  "projectName",
  "projectPath",
];

const TRACE_SUFFIX = {
  surface: "surface",
  action: "action",
  target: "target",
  count: "count",
  errorCount: "error-count",
  warningCount: "warning-count",
  firstId: "first-id",
  firstKey: "first-key",
  firstLevel: "first-level",
  firstSource: "first-source",
  firstTitle: "first-title",
  firstAction: "first-action",
  firstRunEventId: "first-run-event-id",
  projectName: "project-name",
  projectPath: "project-path",
};

function cleanup() {
  for (const dir of [USER_DATA_DIR, PROJECT_DIR]) {
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

function writeInitialStore() {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass294-project" }), "utf8");
  const project = { name: "pass294-project", path: PROJECT_DIR };
  writeJson(DATA_FILE, {
    version: 1,
    activeProject: project,
    projects: [project],
    sessions: [
      {
        id: "pass294-session",
        title: "Notice recovery trace schema",
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
    commandRuns: [
      {
        id: "pass294-timeline-command-run",
        requestId: TIMELINE_RUN_ID,
        kind: "workspace",
        command: TIMELINE_COMMAND,
        commandLine: TIMELINE_COMMAND,
        cwd: PROJECT_DIR,
        project,
        code: 2,
        durationMs: 294,
        stdout: "pass294 trace timeline stdout\n",
        stderr: "pass294 trace timeline stderr\n",
        startedAt: "2026-07-08T00:01:00.000Z",
        endedAt: "2026-07-08T00:01:01.000Z",
      },
    ],
    runEvents: [
      {
        id: GIT_RUN_ID,
        type: "git-command",
        status: "error",
        title: "Git: pass294 trace changes failed",
        detail: "pass294 trace git action failed",
        commandLine: "git add missing-pass294.txt",
        cwd: PROJECT_DIR,
        project,
        sessionId: "pass294-session",
        code: 128,
        durationMs: 199,
        createdAt: "2026-07-08T00:01:03.000Z",
      },
    ],
    notices: [
      {
        id: TIMELINE_NOTICE_ID,
        key: "pass294:timeline",
        level: "error",
        source: "workspace-command",
        title: "pass294 timeline trace notice",
        detail: "pass294 command palette trace opens command evidence",
        action: `command-run:${encodeURIComponent(TIMELINE_RUN_ID)}`,
        project,
        sessionId: "pass294-session",
        count: 1,
        createdAt: "2026-07-08T00:02:00.000Z",
        lastSeenAt: "2026-07-08T00:02:00.000Z",
      },
      {
        id: CHANGES_NOTICE_ID,
        key: "pass294:changes",
        level: "warning",
        source: "git-command",
        title: "pass294 changes trace notice",
        detail: "pass294 command palette trace opens changes evidence",
        action: `git-run:${encodeURIComponent(GIT_RUN_ID)}`,
        project,
        sessionId: "pass294-session",
        count: 1,
        createdAt: "2026-07-08T00:02:01.000Z",
        lastSeenAt: "2026-07-08T00:02:01.000Z",
      },
      {
        id: SURFACE_NOTICE_ID,
        key: "pass294:surface",
        level: "info",
        source: "runtime-health",
        title: "pass294 surface trace notice",
        detail: "pass294 command palette trace opens plugin workbench",
        action: "runtime-health:plugins",
        project,
        sessionId: "pass294-session",
        count: 1,
        createdAt: "2026-07-08T00:02:02.000Z",
        lastSeenAt: "2026-07-08T00:02:02.000Z",
      },
    ],
    automations: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
  });
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

async function paletteTrace(win, query, target) {
  return win.webContents.executeJavaScript(`
    (async function() {
      const fields = ${JSON.stringify(TRACE_FIELDS)};
      const suffix = ${JSON.stringify(TRACE_SUFFIX)};
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 240));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return null;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 280));
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === 'notice-recovery:' + ${JSON.stringify(target)});
      if (!button) return null;
      const trace = Object.fromEntries(fields.map((field) => [field, button.getAttribute('data-command-notice-recovery-' + suffix[field]) || '']));
      return {
        id: button.getAttribute('data-command-id') || '',
        target: button.getAttribute('data-command-target') || '',
        legacyTarget: button.getAttribute('data-notice-recovery-target') || '',
        legacyCount: button.getAttribute('data-notice-recovery-count') || '',
        legacyFirstId: button.getAttribute('data-notice-recovery-first-id') || '',
        text: button.textContent || '',
        trace,
      };
    })();
  `);
}

async function surfaceTraces(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const fields = ${JSON.stringify(TRACE_FIELDS)};
      const suffix = ${JSON.stringify(TRACE_SUFFIX)};
      const read = (target) => {
        const button = document.querySelector('.notice-recovery-summary [data-notice-recovery-target="' + target + '"]');
        if (!button) return null;
        return Object.fromEntries(fields.map((field) => [field, button.getAttribute('data-notice-recovery-' + suffix[field]) || '']));
      };
      return {
        timeline: read('timeline'),
        changes: read('changes'),
        surface: read('surface'),
      };
    })();
  `);
}

function expectedTrace(target, firstId, level, source, title, action, errorCount, warningCount, projectPath) {
  return {
    surface: target === "command" ? "command-palette" : "notice-center",
    action: "open-first",
    target,
    count: "1",
    errorCount: String(errorCount),
    warningCount: String(warningCount),
    firstId,
    firstKey: `pass294:${target}`,
    firstLevel: level,
    firstSource: source,
    firstTitle: title,
    firstAction: action,
    firstRunEventId: "",
    projectName: path.basename(projectPath),
    projectPath,
  };
}

function traceMatches(actual, expected) {
  return Boolean(actual && TRACE_FIELDS.every((field) => actual[field] === expected[field]));
}

function sharedTraceMatches(commandTrace, surfaceTrace) {
  return Boolean(commandTrace && surfaceTrace && TRACE_FIELDS
    .filter((field) => field !== "surface")
    .every((field) => commandTrace[field] === surfaceTrace[field]));
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS294_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS294_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS294_STORE_READY", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      return (state.notices || []).length === 3 &&
        state.notices.some((item) => item.id === ${JSON.stringify(TIMELINE_NOTICE_ID)}) &&
        state.notices.some((item) => item.id === ${JSON.stringify(CHANGES_NOTICE_ID)}) &&
        state.notices.some((item) => item.id === ${JSON.stringify(SURFACE_NOTICE_ID)});
    })();
  `, 10000));

  assertStep("PASS294_OPEN_NOTICE_CENTER", await openPanel(win, "通知"));
  assertStep("PASS294_SUMMARY_TRACE_VISIBLE", await waitFor(win, `
    Boolean(
      document.querySelector('.notice-recovery-summary [data-notice-recovery-target="timeline"]') &&
      document.querySelector('.notice-recovery-summary [data-notice-recovery-target="changes"]') &&
      document.querySelector('.notice-recovery-summary [data-notice-recovery-target="surface"]')
    )
  `, 10000));

  const projectPath = PROJECT_DIR;
  const surface = await surfaceTraces(win);
  const expectedTimelineSurface = {
    ...expectedTrace("timeline", TIMELINE_NOTICE_ID, "error", "workspace-command", "pass294 timeline trace notice", `command-run:${encodeURIComponent(TIMELINE_RUN_ID)}`, 1, 0, projectPath),
    surface: "notice-center",
  };
  const expectedChangesSurface = {
    ...expectedTrace("changes", CHANGES_NOTICE_ID, "warning", "git-command", "pass294 changes trace notice", `git-run:${encodeURIComponent(GIT_RUN_ID)}`, 0, 1, projectPath),
    surface: "notice-center",
  };
  const expectedSurfaceSurface = {
    ...expectedTrace("surface", SURFACE_NOTICE_ID, "info", "runtime-health", "pass294 surface trace notice", "runtime-health:plugins", 0, 0, projectPath),
    surface: "notice-center",
  };
  assertStep("PASS294_SURFACE_TIMELINE_TRACE", traceMatches(surface.timeline, expectedTimelineSurface));
  assertStep("PASS294_SURFACE_CHANGES_TRACE", traceMatches(surface.changes, expectedChangesSurface));
  assertStep("PASS294_SURFACE_SURFACE_TRACE", traceMatches(surface.surface, expectedSurfaceSurface));

  const timelineCommand = await paletteTrace(win, "pass294 timeline trace notice", "timeline");
  const changesCommand = await paletteTrace(win, "pass294 changes trace notice", "changes");
  const surfaceCommand = await paletteTrace(win, "pass294 surface trace notice", "surface");
  assertStep("PASS294_COMMAND_TIMELINE_TRACE", Boolean(
    timelineCommand?.target === "timeline" &&
    timelineCommand.legacyTarget === "timeline" &&
    timelineCommand.legacyCount === "1" &&
    timelineCommand.legacyFirstId === TIMELINE_NOTICE_ID &&
    timelineCommand.trace.surface === "command-palette" &&
    sharedTraceMatches(timelineCommand.trace, surface.timeline)
  ));
  assertStep("PASS294_COMMAND_CHANGES_TRACE", Boolean(
    changesCommand?.target === "changes" &&
    changesCommand.legacyTarget === "changes" &&
    changesCommand.legacyCount === "1" &&
    changesCommand.legacyFirstId === CHANGES_NOTICE_ID &&
    changesCommand.trace.surface === "command-palette" &&
    sharedTraceMatches(changesCommand.trace, surface.changes)
  ));
  assertStep("PASS294_COMMAND_SURFACE_TRACE", Boolean(
    surfaceCommand?.target === "surface" &&
    surfaceCommand.legacyTarget === "surface" &&
    surfaceCommand.legacyCount === "1" &&
    surfaceCommand.legacyFirstId === SURFACE_NOTICE_ID &&
    surfaceCommand.trace.surface === "command-palette" &&
    sharedTraceMatches(surfaceCommand.trace, surface.surface)
  ));

  console.log("PASS294_NOTICE_RECOVERY_TRACE_SCHEMA_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS294_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (async function() {
          return {
            summary: document.querySelector('.notice-recovery-summary')?.outerHTML || '',
            commands: [...document.querySelectorAll('.command-modal .command-list button')].map((button) => ({
              id: button.getAttribute('data-command-id') || '',
              target: button.getAttribute('data-command-target') || '',
              text: button.textContent || '',
              traceTarget: button.getAttribute('data-command-notice-recovery-target') || '',
              traceFirstId: button.getAttribute('data-command-notice-recovery-first-id') || '',
            })),
            state: await window.claudexDesktop.getState().catch((stateError) => ({ error: String(stateError?.message || stateError) })),
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS294_DEBUG", JSON.stringify(debug, null, 2).slice(0, 12000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS294_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
