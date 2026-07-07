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
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass50-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass50-project-"));
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

app.setPath("userData", USER_DATA_DIR);
fs.mkdirSync(PROJECT_DIR, { recursive: true });
fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass50-project" }), "utf8");
fs.writeFileSync(path.join(PROJECT_DIR, "fixture.txt"), "pass50 fixture", "utf8");

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
      "code-review": true,
      "implementation-plan": true,
      "terminal-helper": true,
      "mcp-runtime": true,
      "plugin-router": true,
      "marketplace-router": true,
    },
    customMarketplaces: [],
  },
  activeProject: { name: "pass50-project", path: PROJECT_DIR },
  projects: [{ name: "pass50-project", path: PROJECT_DIR }],
  sessions: [
    {
      id: "default",
      title: "\u65b0\u804a\u5929",
      project: "pass50-project",
      projectPath: PROJECT_DIR,
      createdAt: "2026-07-05T00:00:00.000Z",
      updatedAt: "2026-07-05T00:00:00.000Z",
      messages: [],
    },
  ],
  commandRuns: [],
});

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

async function openWorkspace(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const rail = document.querySelector('.rail-button[data-tool="workspace"]');
      if (rail) {
        rail.click();
        return true;
      }
      const button = Array.from(document.querySelectorAll('button.tool-row'))
        .find((item) => /\\u5de5\\u4f5c\\u533a/.test(item.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runWorkspaceCommand(win, command) {
  const filled = await win.webContents.executeJavaScript(`
    (function() {
      const input = document.querySelector('#workspace-tool-detail .command-runner input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(command)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })();
  `);
  if (!filled) return false;
  await wait(150);
  return win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('#workspace-tool-detail .command-runner button');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `);
}

app.whenReady().then(async () => {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.error("PASS50_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  try {
    assertStep("PASS50_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
    assertStep("PASS50_OPEN_WORKSPACE", await openWorkspace(win));
    assertStep("PASS50_WORKSPACE_READY", await waitFor(win, "Boolean(document.querySelector('#workspace-tool-detail .command-runner input'))", 10000));

    assertStep("PASS50_RUN_COMMAND", await runWorkspaceCommand(win, "node -e \"console.log('pass50 command evidence')\""));
    assertStep("PASS50_COMMAND_STORED_AND_VISIBLE", await waitFor(win, `
      (async function() {
        const state = await window.claudexDesktop.getState();
        const run = state.commandRuns?.[0];
        return Boolean(
          run &&
          run.kind === 'workspace' &&
          run.code === 0 &&
          /pass50 command evidence/.test(run.stdout || '') &&
          /pass50 command evidence/.test(document.body.textContent || '') &&
          document.querySelector('#workspace-tool-detail .command-output-card.ok')
        );
      })();
    `, 12000));

    assertStep("PASS50_STORE_PERSISTED", (() => {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      return parsed.commandRuns?.length === 1 &&
        parsed.commandRuns[0].kind === "workspace" &&
        /pass50 command evidence/.test(parsed.commandRuns[0].stdout || "");
    })());

    assertStep("PASS50_OUTPUTS_SHOW_COMMAND_EVIDENCE", await waitFor(win, `
      (async function() {
        const button = Array.from(document.querySelectorAll('.workspace-context-button, .bottom-panel-tabs button'))
          .find((item) => /\\u8f93\\u51fa/.test(item.textContent || '') || (item.getAttribute('aria-label') || '').includes('\\u8f93\\u51fa'));
        if (!button) return false;
        button.click();
        await new Promise((resolve) => setTimeout(resolve, 250));
        return Boolean(
          document.querySelector('.bottom-work-panel .command-history') &&
          /Workspace \\u547d\\u4ee4\\u8bc1\\u636e/.test(document.body.textContent || '') &&
          /pass50 command evidence/.test(document.body.textContent || '')
        );
      })();
    `, 5000));

    win.webContents.reload();
    await wait(1200);
    assertStep("PASS50_RELOAD_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
    assertStep("PASS50_REOPEN_WORKSPACE", await openWorkspace(win));
    assertStep("PASS50_RELOAD_HISTORY_FROM_STORE", await waitFor(win, `
      Boolean(
        document.querySelector('#workspace-tool-detail .command-history') &&
        /pass50 command evidence/.test(document.body.textContent || '')
      )
    `, 10000));

    assertStep("PASS50_CANCEL_COMMAND", await waitFor(win, `
      (async function() {
        if (!window.__pass50CancelStarted) {
          window.__pass50CancelStarted = true;
          const input = document.querySelector('#workspace-tool-detail .command-runner input');
          const button = document.querySelector('#workspace-tool-detail .command-runner button');
          if (!input || !button) return false;
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(input, ${JSON.stringify("node -e \"setTimeout(() => console.log('pass50 should cancel'), 8000)\"")});
          input.dispatchEvent(new Event('input', { bubbles: true }));
          button.click();
          await new Promise((resolve) => setTimeout(resolve, 500));
          const cancel = document.querySelector('#workspace-tool-detail .command-runner button');
          if (!cancel || !/\\u505c\\u6b62\\u547d\\u4ee4/.test(cancel.textContent || '')) return false;
          cancel.click();
        }
        await new Promise((resolve) => setTimeout(resolve, 900));
        const state = await window.claudexDesktop.getState();
        const run = state.commandRuns?.[0];
        const event = state.runEvents?.find((item) => item.type === 'workspace-command' && /pass50 should cancel/.test(item.commandLine || item.title || ''));
        return Boolean(
          run &&
          run.cancelled === true &&
          run.code === 130 &&
          event &&
          event.status === 'cancelled' &&
          event.code === 130 &&
          /\\u547d\\u4ee4\\u5df2\\u53d6\\u6d88/.test(run.stderr || '') &&
          /\\u547d\\u4ee4\\u5df2\\u505c\\u6b62/.test(document.body.textContent || '') &&
          document.querySelector('#workspace-tool-detail .command-output-card.cancelled')
        );
      })();
    `, 12000));

    assertStep("PASS50_CANCEL_OUTPUTS_PANEL_EVIDENCE", await waitFor(win, `
      (async function() {
        const button = Array.from(document.querySelectorAll('.workspace-context-button, .bottom-panel-tabs button'))
          .find((item) => /\\u8f93\\u51fa/.test(item.textContent || '') || (item.getAttribute('aria-label') || '').includes('\\u8f93\\u51fa'));
        if (!button) return false;
        button.click();
        await new Promise((resolve) => setTimeout(resolve, 250));
        const timelineText = document.querySelector('.run-timeline')?.textContent || '';
        const evidenceText = document.querySelector('.bottom-work-panel .command-history')?.textContent || '';
        return Boolean(
          document.querySelector('.run-timeline-row.cancelled') &&
          /pass50 should cancel/.test(timelineText) &&
          /\\u547d\\u4ee4\\u5df2\\u505c\\u6b62/.test(timelineText) &&
          /pass50 should cancel/.test(evidenceText) &&
          /\\u547d\\u4ee4\\u5df2\\u505c\\u6b62/.test(evidenceText)
        );
      })();
    `, 8000));

    assertStep("PASS50_CANCEL_PERSISTED_RUN_EVENT", (() => {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      const events = parsed.runEvents?.filter((event) =>
        event.type === "workspace-command" &&
        /pass50 should cancel/.test(event.commandLine || event.title || "")
      ) || [];
      return events.length === 1 &&
        events[0].status === "cancelled" &&
        events[0].code === 130;
    })());

    console.log("PASS50_WORKSPACE_COMMAND_EVIDENCE_DONE");
    cleanup();
    app.exit(0);
  } catch (error) {
    console.error(error);
    cleanup();
    app.exit(1);
  }
});
