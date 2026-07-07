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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass250-data-"));
const PROJECT_A = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass250-project-a-"));
const PROJECT_B = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass250-project-b-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");

function cleanup() {
  for (const dir of [USER_DATA_DIR, PROJECT_A, PROJECT_B]) {
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
  fs.mkdirSync(PROJECT_A, { recursive: true });
  fs.mkdirSync(PROJECT_B, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_A, "package.json"), JSON.stringify({ name: "pass250-project-a" }), "utf8");
  fs.writeFileSync(path.join(PROJECT_B, "package.json"), JSON.stringify({ name: "pass250-project-b" }), "utf8");
  const projectA = { name: "Project A", path: PROJECT_A };
  const projectB = { name: "Project B", path: PROJECT_B };
  writeJson(DATA_FILE, {
    version: 1,
    activeProject: projectA,
    projects: [projectA, projectB],
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
    sessions: [
      {
        id: "pass250-a-current",
        title: "PASS250 current project trace",
        project: projectA.name,
        projectPath: PROJECT_A,
        claudeSessionId: "pass250-claude-a",
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:10:00.000Z",
        messages: [{ role: "user", content: "pass250 current project message", createdAt: "2026-07-07T00:00:00.000Z" }],
      },
      {
        id: "pass250-b-pinned",
        title: "PASS250 cross project pinned trace",
        project: projectB.name,
        projectPath: PROJECT_B,
        claudeSessionId: "pass250-claude-b",
        pinned: true,
        pinnedAt: "2026-07-07T00:05:00.000Z",
        createdAt: "2026-07-07T00:01:00.000Z",
        updatedAt: "2026-07-07T00:09:00.000Z",
        messages: [
          { role: "user", content: "pass250 project b user", createdAt: "2026-07-07T00:01:00.000Z" },
          { role: "assistant", content: "pass250 project b assistant", createdAt: "2026-07-07T00:02:00.000Z" },
        ],
      },
      {
        id: "pass250-b-archived",
        title: "PASS250 archived thread trace",
        project: projectB.name,
        projectPath: PROJECT_B,
        archived: true,
        archivedAt: "2026-07-07T00:06:00.000Z",
        claudeSessionId: "pass250-claude-archived",
        createdAt: "2026-07-07T00:03:00.000Z",
        updatedAt: "2026-07-07T00:08:00.000Z",
        messages: [{ role: "user", content: "pass250 archived message", createdAt: "2026-07-07T00:03:00.000Z" }],
      },
    ],
    automations: [],
    subagentRuns: [],
    commandRuns: [],
    runEvents: [],
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

writeInitialStore();
app.setPath("userData", USER_DATA_DIR);
require(path.join(REPO_DIR, "electron", "main.cjs"));

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS250_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS250_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS250_CURRENT_SCOPE_TRACE", await waitFor(win, `
    (function() {
      const summary = document.querySelector('.thread-scope-summary');
      const current = document.querySelector('.chat-scope-toggle button[data-thread-scope="current"]');
      const row = document.querySelector('.thread-item[data-thread-id="pass250-a-current"]');
      const projectBHidden = !document.querySelector('.thread-item[data-thread-id="pass250-b-pinned"]');
      return Boolean(summary && current && row && projectBHidden &&
        summary.getAttribute('data-thread-scope') === 'current' &&
        summary.getAttribute('data-thread-active-project-path') === ${JSON.stringify(PROJECT_A)} &&
        summary.getAttribute('data-thread-visible-count') === '1' &&
        current.getAttribute('data-thread-scope-count') === '1' &&
        current.getAttribute('data-thread-active-project-path') === ${JSON.stringify(PROJECT_A)} &&
        row.getAttribute('data-thread-project-path') === ${JSON.stringify(PROJECT_A)} &&
        row.getAttribute('data-thread-scope') === 'current' &&
        row.getAttribute('data-thread-active') === 'true' &&
        row.getAttribute('data-thread-claude-session-id') === 'pass250-claude-a' &&
        row.getAttribute('data-thread-message-count') === '1' &&
        row.getAttribute('data-thread-archived') === 'false');
    })();
  `, 10000));

  assertStep("PASS250_ALL_SCOPE_ACTION_TRACE", await waitFor(win, `
    (async function() {
      if (!window.__pass250AllClicked) {
        window.__pass250AllClicked = true;
        const button = document.querySelector('.chat-scope-toggle button[data-thread-scope="all"]');
        if (!button) return false;
        button.click();
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      const summary = document.querySelector('.thread-scope-summary');
      const all = document.querySelector('.chat-scope-toggle button[data-thread-scope="all"]');
      const row = document.querySelector('.thread-item[data-thread-id="pass250-b-pinned"]');
      const resume = row?.querySelector('button[data-thread-action="resume"]');
      const unpin = row?.querySelector('button[data-thread-action="unpin"]');
      const archive = row?.querySelector('button[data-thread-action="archive"]');
      return Boolean(summary && all && row && resume && unpin && archive &&
        summary.getAttribute('data-thread-scope') === 'all' &&
        summary.getAttribute('data-thread-visible-count') === '2' &&
        Number(all.getAttribute('data-thread-scope-count') || 0) >= 2 &&
        row.getAttribute('data-thread-project-path') === ${JSON.stringify(PROJECT_B)} &&
        row.getAttribute('data-thread-scope') === 'all' &&
        row.getAttribute('data-thread-active') === 'false' &&
        row.getAttribute('data-thread-pinned') === 'true' &&
        row.getAttribute('data-thread-claude-session-id') === 'pass250-claude-b' &&
        row.getAttribute('data-thread-message-count') === '2' &&
        resume.getAttribute('data-thread-id') === 'pass250-b-pinned' &&
        resume.getAttribute('data-thread-project-path') === ${JSON.stringify(PROJECT_B)} &&
        resume.getAttribute('data-thread-scope') === 'all' &&
        resume.getAttribute('data-thread-claude-session-id') === 'pass250-claude-b' &&
        unpin.getAttribute('data-thread-pinned') === 'true' &&
        archive.getAttribute('data-thread-archived') === 'false');
    })();
  `, 10000));

  assertStep("PASS250_ARCHIVED_SCOPE_TRACE", await waitFor(win, `
    (async function() {
      if (!window.__pass250ProjectBClicked) {
        window.__pass250ProjectBClicked = true;
        const project = Array.from(document.querySelectorAll('.project-list button'))
          .find((button) => button.getAttribute('data-project-path') === ${JSON.stringify(PROJECT_B)});
        if (!project) return false;
        project.click();
        await new Promise((resolve) => setTimeout(resolve, 450));
      }
      if (!window.__pass250ArchivedClicked) {
        window.__pass250ArchivedClicked = true;
        const button = document.querySelector('.chat-scope-toggle button[data-thread-scope="archived"]');
        if (!button) return false;
        button.click();
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      const summary = document.querySelector('.thread-scope-summary');
      const archived = document.querySelector('.chat-scope-toggle button[data-thread-scope="archived"]');
      const row = document.querySelector('.thread-item[data-thread-id="pass250-b-archived"]');
      const restore = row?.querySelector('button[data-thread-action="restore"]');
      return Boolean(summary && archived && row && restore &&
        summary.getAttribute('data-thread-scope') === 'archived' &&
        summary.getAttribute('data-thread-active-project-path') === ${JSON.stringify(PROJECT_B)} &&
        summary.getAttribute('data-thread-visible-count') === '1' &&
        archived.getAttribute('data-thread-scope-count') === '1' &&
        row.getAttribute('data-thread-project-path') === ${JSON.stringify(PROJECT_B)} &&
        row.getAttribute('data-thread-scope') === 'archived' &&
        row.getAttribute('data-thread-archived') === 'true' &&
        row.getAttribute('data-thread-claude-session-id') === 'pass250-claude-archived' &&
        restore.getAttribute('data-thread-id') === 'pass250-b-archived' &&
        restore.getAttribute('data-thread-project-path') === ${JSON.stringify(PROJECT_B)} &&
        restore.getAttribute('data-thread-scope') === 'archived' &&
        restore.getAttribute('data-thread-archived') === 'true');
    })();
  `, 10000));

  console.log("PASS250_THREAD_TRACE_CONTEXT_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS250_FAILED", error?.stack || error);
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    const debug = await win.webContents.executeJavaScript(`
      (function() {
        return {
          summary: Object.fromEntries(Array.from(document.querySelector('.thread-scope-summary')?.attributes || []).map((attr) => [attr.name, attr.value])),
          scopes: Array.from(document.querySelectorAll('.chat-scope-toggle button')).map((button) => ({
            text: button.textContent,
            attrs: Object.fromEntries(Array.from(button.attributes).map((attr) => [attr.name, attr.value])),
          })),
          rows: Array.from(document.querySelectorAll('.thread-item')).map((row) => ({
            text: row.textContent,
            attrs: Object.fromEntries(Array.from(row.attributes).map((attr) => [attr.name, attr.value])),
            actions: Array.from(row.querySelectorAll('[data-thread-action]')).map((button) => Object.fromEntries(Array.from(button.attributes).map((attr) => [attr.name, attr.value]))),
          })),
        };
      })();
    `).catch((debugError) => ({ error: String(debugError?.stack || debugError) }));
    console.error("PASS250_DEBUG", JSON.stringify(debug, null, 2).slice(0, 16000));
  }
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS250_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
