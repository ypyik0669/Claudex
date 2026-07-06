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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass142-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass142-project-"));
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

function writeInitialStore() {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass142-project" }), "utf8");
  const project = { name: "pass142-project", path: PROJECT_DIR };
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
        id: "pass142-session",
        title: "Command palette automation action deeplink",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    runEvents: [
      {
        id: "pass142-create-action",
        type: "automation-action",
        status: "ok",
        title: "自动化：创建 · pass142 created automation action evidence",
        detail: "pass142-project · 下次运行: 2026-07-08T00:00:00.000Z · 线程: pass142-session",
        stdout: "pass142 created automation action evidence prompt",
        stderr: "",
        project,
        sessionId: "pass142-session",
        createdAt: "2026-07-07T00:00:01.000Z",
      },
      {
        id: "pass142-delete-action",
        type: "automation-action",
        status: "ok",
        title: "自动化：删除 · pass142 deleted automation action evidence",
        detail: "pass142-project · 线程: pass142-session",
        stdout: "pass142 deleted automation action evidence prompt",
        stderr: "",
        project,
        sessionId: "pass142-session",
        createdAt: "2026-07-07T00:00:02.000Z",
      },
    ],
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

async function clickRunCommand(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) =>
          (candidate.getAttribute('data-command-id') || '').startsWith('run:') &&
          /pass142 deleted automation action evidence/.test(candidate.textContent || '')
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
  if (!win) throw new Error("PASS142_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS142_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS142_STORE_HAS_DELETED_ACTION_WITHOUT_AUTOMATION", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      return Boolean(
        state.automations?.length === 0 &&
        state.runEvents?.some((event) =>
          event.id === 'pass142-delete-action' &&
          event.type === 'automation-action' &&
          /pass142 deleted automation action evidence/.test((event.title || '') + (event.stdout || ''))
        )
      );
    })();
  `));

  assertStep("PASS142_OPEN_PALETTE_QUERY_AUTOMATION_ACTION", await openPaletteAndQuery(win, "pass142 deleted automation action evidence"));
  assertStep("PASS142_AUTOMATION_ACTION_COMMAND_VISIBLE", await waitFor(win, `
    Boolean([...document.querySelectorAll('.command-modal .command-list button')].some((button) =>
      (button.getAttribute('data-command-id') || '').startsWith('run:') &&
      /pass142 deleted automation action evidence/.test(button.textContent || '') &&
      /\\u81ea\\u52a8\\u5316/.test(button.textContent || '')
    ))
  `, 5000));
  assertStep("PASS142_CLICK_AUTOMATION_ACTION_COMMAND", await clickRunCommand(win));
  assertStep("PASS142_AUTOMATION_ACTION_TIMELINE_FOCUSED", await waitFor(win, `
    (function() {
      const active = document.querySelector('.workspace-context-button.active')?.textContent || '';
      const selectedRow = document.querySelector('.run-timeline-row.selected')?.textContent || '';
      const panel = document.querySelector('.selected-run-evidence-panel')?.textContent || '';
      return /\\u8f93\\u51fa/.test(active) &&
        /pass142 deleted automation action evidence/.test(selectedRow) &&
        /automation-action/.test(panel) &&
        /pass142 deleted automation action evidence prompt/.test(panel) &&
        /pass142-project/.test(panel) &&
        /pass142-session/.test(panel);
    })()
  `, 10000));

  console.log("PASS142_COMMAND_PALETTE_AUTOMATION_ACTION_DEEPLINK_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS142_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS142_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
