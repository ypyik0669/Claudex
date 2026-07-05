const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass53-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass53-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const COMMAND = `node -e "console.log('workspace-evidence-ok')"`;

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

async function waitForStore(predicate, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      if (predicate(parsed)) return true;
    } catch (_error) {
      // Store may still be mid-write.
    }
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
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass53-project" }), "utf8");
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
    activeProject: { name: "pass53-project", path: PROJECT_DIR },
    projects: [{ name: "pass53-project", path: PROJECT_DIR }],
    sessions: [
      {
        id: "default",
        title: "新聊天",
        project: "pass53-project",
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-05T00:00:00.000Z",
        updatedAt: "2026-07-05T00:00:00.000Z",
        messages: [],
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

async function openWorkspaceTool(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = Array.from(document.querySelectorAll('button.tool-row')).find((item) =>
        /Workspace|工作区/.test(item.textContent || '')
      );
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runWorkspaceCommand(win) {
  const filled = await win.webContents.executeJavaScript(`
    (function() {
      const detail = document.querySelector('#workspace-tool-detail');
      const input = detail?.querySelector('.command-runner input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(COMMAND)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })();
  `);
  if (!filled) return false;
  await wait(150);
  return win.webContents.executeJavaScript(`
    (function() {
      const detail = document.querySelector('#workspace-tool-detail');
      const button = detail?.querySelector('.command-runner button');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `);
}

async function openOutputsPanel(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      if (document.querySelector('.bottom-work-panel .run-timeline')) return true;
      const button = Array.from(document.querySelectorAll('.workspace-context-tabs .workspace-context-button'))[1];
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS53_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS53_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS53_OPEN_WORKSPACE_TOOL", await openWorkspaceTool(win));
  assertStep("PASS53_WORKSPACE_READY", await waitFor(win, `
    Boolean(document.querySelector('#workspace-tool-detail .command-runner input'))
  `, 15000));
  assertStep("PASS53_RUN_COMMAND", await runWorkspaceCommand(win));
  assertStep("PASS53_SIDE_HISTORY_VISIBLE", await waitFor(win, `
    Boolean(document.querySelector('#workspace-tool-detail .command-output-card.ok') &&
      /workspace-evidence-ok/.test(document.querySelector('#workspace-tool-detail .command-history')?.textContent || ''))
  `, 15000));
  assertStep("PASS53_OPEN_OUTPUTS_PANEL", await openOutputsPanel(win));
  assertStep("PASS53_TIMELINE_VISIBLE", await waitFor(win, `
    (() => {
      const row = Array.from(document.querySelectorAll('.run-timeline-row.ok'))
        .find((item) => /workspace-evidence-ok/.test(item.textContent || '') || /退出码: 0/.test(item.textContent || ''));
      return Boolean(document.querySelector('.run-timeline') && row);
    })()
  `, 10000));
  assertStep("PASS53_TIMELINE_EVIDENCE_DETAILS", await waitFor(win, `
    (() => {
      const row = Array.from(document.querySelectorAll('.run-timeline-row.ok'))
        .find((item) => /workspace-evidence-ok/.test(item.textContent || '') || /退出码: 0/.test(item.textContent || ''));
      const summary = row?.querySelector('summary');
      if (!row || !summary) return false;
      if (!row.open) summary.click();
      const text = row.textContent || '';
      return Boolean(
        row.open &&
        /Timeline 证据|事件类型/.test(text) &&
        /标准输出/.test(text) &&
        /workspace-evidence-ok/.test(text) &&
        /node -e/.test(text) &&
        /复制证据/.test(text)
      );
    })()
  `, 10000));
  assertStep("PASS53_TIMELINE_COPY_EVIDENCE", await waitFor(win, `
    (async function() {
      const row = Array.from(document.querySelectorAll('.run-timeline-row.ok'))
        .find((item) => /workspace-evidence-ok/.test(item.textContent || '') || /退出码: 0/.test(item.textContent || ''));
      const button = Array.from(row?.querySelectorAll('button') || [])
        .find((item) => /复制证据/.test(item.textContent || ''));
      if (!button) return false;
      if (!window.__pass53CopiedTimelineEvidence) {
        window.__pass53CopiedTimelineEvidence = true;
        button.click();
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      return /已复制/.test(document.body.textContent || '');
    })();
  `, 5000));
  assertStep("PASS53_BOTTOM_EVIDENCE_VISIBLE", await waitFor(win, `
    Boolean(document.querySelector('.command-evidence-stack') &&
      /Workspace|工作区|命令/.test(document.querySelector('.command-evidence-stack')?.textContent || '') &&
      /workspace-evidence-ok/.test(document.querySelector('.command-evidence-stack')?.textContent || ''))
  `, 10000));
  assertStep("PASS53_COMMAND_PERSISTED", await waitForStore((parsed) => (
    parsed.commandRuns?.some((run) => (run.kind || "workspace") === "workspace" &&
      /workspace-evidence-ok/.test(run.stdout || "") &&
      run.code === 0)
  )));
  assertStep("PASS53_RUN_EVENT_UPSERTED", await waitForStore((parsed) => {
    const events = parsed.runEvents?.filter((event) => event.type === "workspace-command" && /workspace-evidence-ok/.test(event.commandLine || event.title || "")) || [];
    return events.length === 1 && events[0].status === "ok" && events[0].code === 0;
  }));

  console.log("PASS53_WORKSPACE_COMMAND_TIMELINE_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS53_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS53_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
