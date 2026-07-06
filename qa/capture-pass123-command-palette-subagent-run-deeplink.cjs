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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass123-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass123-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");

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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass123-project" }), "utf8");
  const project = { name: "pass123-project", path: PROJECT_DIR };
  writeJson(DATA_FILE, {
    version: 1,
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
    activeProject: project,
    projects: [project],
    sessions: [
      {
        id: "default",
        title: "Command palette subagent run deeplink",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    runEvents: [],
    automations: [],
    subagentRuns: [
      {
        id: "pass123-target-subagent",
        requestId: "pass123-target-request",
        nickname: "Pass123 Target Agent",
        task: "pass123 command palette subagent timeline task",
        status: "done",
        startedAt: "2026-07-07T00:00:00.000Z",
        endedAt: "2026-07-07T00:00:04.000Z",
        durationMs: 4000,
        sessionId: "default",
        code: 0,
        project,
        cwd: PROJECT_DIR,
        args: ["-p", "pass123 command palette subagent timeline task", "--model", "claude-haiku-4-5-20251001"],
        summary: "pass123 target subagent summary evidence",
        stdout: "pass123 target subagent stdout evidence",
        stderr: "pass123 target subagent stderr evidence",
        artifacts: [
          {
            label: "pass123 artifact",
            path: path.join(PROJECT_DIR, "pass123-artifact.md"),
            type: "markdown",
            content: "pass123 target subagent artifact evidence",
          },
        ],
      },
    ],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
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

async function clickSubagentRunCommand(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) =>
          (candidate.getAttribute('data-command-id') || '').startsWith('subagent-run:') &&
          /pass123 target subagent summary evidence/.test(candidate.textContent || '')
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
  if (!win) throw new Error("PASS123_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS123_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS123_STORE_HAS_SUBAGENT_WITHOUT_RUN_EVENTS", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      return Boolean(
        state.runEvents?.length === 0 &&
        state.subagentRuns?.some((run) =>
          run.id === 'pass123-target-subagent' &&
          run.requestId === 'pass123-target-request' &&
          /pass123 target subagent stdout evidence/.test(run.stdout || '')
        )
      );
    })();
  `));
  assertStep("PASS123_OPEN_PALETTE_QUERY_TARGET_SUBAGENT", await openPaletteAndQuery(win, "pass123 target subagent stdout"));
  assertStep("PASS123_SUBAGENT_RUN_COMMAND_VISIBLE", await waitFor(win, `
    Boolean([...document.querySelectorAll('.command-modal .command-list button')].some((button) =>
      (button.getAttribute('data-command-id') || '').startsWith('subagent-run:') &&
      /pass123 target subagent summary evidence/.test(button.textContent || '') &&
      /pass123-target-request/.test(button.getAttribute('data-command-id') || '')
    ))
  `, 5000));
  assertStep("PASS123_CLICK_SUBAGENT_RUN_COMMAND", await clickSubagentRunCommand(win));
  assertStep("PASS123_SUBAGENT_RUN_TIMELINE_FOCUSED", await waitFor(win, `
    (function() {
      const active = document.querySelector('.workspace-context-button.active')?.textContent || '';
      const selectedRow = document.querySelector('.run-timeline-row.selected')?.textContent || '';
      const panel = document.querySelector('.selected-run-evidence-panel')?.textContent || '';
      return /\\u8f93\\u51fa/.test(active) &&
        /Pass123 Target Agent/.test(selectedRow) &&
        /pass123 target subagent summary evidence/.test(panel) &&
        /pass123 target subagent stdout evidence/.test(panel) &&
        /pass123 target subagent stderr evidence/.test(panel) &&
        /pass123 target subagent artifact evidence/.test(panel) &&
        /default/.test(panel);
    })()
  `, 10000));

  console.log("PASS123_COMMAND_PALETTE_SUBAGENT_RUN_DEEPLINK_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS123_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS123_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
