const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass43-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass43-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");

function cleanup(server) {
  try {
    server?.close();
  } catch (_error) {
    // best-effort cleanup
  }
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

async function openBrowserTool(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 't', ctrlKey: true, bubbles: true }));
      return true;
    })();
  `);
}

function writeInitialStore() {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass43-project" }), "utf8");
  writeJson(DATA_FILE, {
    version: 1,
    settings: {
      provider: "anthropic",
      model: "claude-sonnet-4-5-20250929",
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
    activeProject: { name: "pass43-project", path: PROJECT_DIR },
    projects: [{ name: "pass43-project", path: PROJECT_DIR }],
    sessions: [
      {
        id: "default",
        title: "新聊天",
        project: "pass43-project",
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-05T00:00:00.000Z",
        updatedAt: "2026-07-05T00:00:00.000Z",
        messages: [],
      },
    ],
    automations: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
  });
}

async function runTest(server, goodUrl) {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.error("PASS43_FAILED_NO_WINDOW");
    cleanup(server);
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  try {
    assertStep("PASS43_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
    assertStep("PASS43_BROWSER_IPC", await win.webContents.executeJavaScript("typeof window.claudexDesktop.recordBrowserVisit === 'function'"));
    assertStep("PASS43_OPEN_BROWSER", await openBrowserTool(win));
    assertStep("PASS43_BROWSER_TOOL_READY", await waitFor(win, "Boolean(document.querySelector('.browser-detail'))", 10000));

    assertStep("PASS43_WEBVIEW_READY_EVIDENCE", await waitFor(win, `
      (async function() {
        if (!window.__pass43Submitted) {
          window.__pass43Submitted = true;
          const input = document.querySelector('.browser-toolbar input');
          const submit = document.querySelector('.browser-preview-action');
          if (!input || !submit) return false;
          Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(goodUrl)});
          input.dispatchEvent(new Event('input', { bubbles: true }));
          submit.click();
        }
        await new Promise((resolve) => setTimeout(resolve, 700));
        const state = await window.claudexDesktop.getState();
        const visit = state.browserVisits?.[0];
        return Boolean(
          visit &&
          visit.url === ${JSON.stringify(goodUrl)} &&
          visit.status === 'ready' &&
          visit.project?.path === ${JSON.stringify(PROJECT_DIR)} &&
          document.querySelector('.browser-evidence-card.ready') &&
          /pass43-ready/.test(document.querySelector('webview')?.getURL?.() || document.body.textContent || '')
        );
      })();
    `, 15000));

    assertStep("PASS43_WEBVIEW_ERROR_EVIDENCE", await waitFor(win, `
      (async function() {
        if (!window.__pass43ErrorSubmitted) {
          window.__pass43ErrorSubmitted = true;
          const input = document.querySelector('.browser-toolbar input');
          const submit = document.querySelector('.browser-preview-action');
          if (!input || !submit) return false;
          Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, 'http://127.0.0.1:9/pass43-error');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          submit.click();
        }
        await new Promise((resolve) => setTimeout(resolve, 700));
        const state = await window.claudexDesktop.getState();
        const visit = state.browserVisits?.[0];
        return Boolean(
          visit &&
          visit.url === 'http://127.0.0.1:9/pass43-error' &&
          visit.status === 'error' &&
          document.querySelector('.browser-evidence-card.error')
        );
      })();
    `, 15000));

    assertStep("PASS43_BOTTOM_BROWSER_EVIDENCE", await waitFor(win, `
      (async function() {
        if (!document.querySelector('.bottom-work-panel')) {
          document.querySelector('.workspace-context-button')?.click();
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        const button = Array.from(document.querySelectorAll('.bottom-panel-tabs button'))[6];
        if (!button) return false;
        button.click();
        await new Promise((resolve) => setTimeout(resolve, 300));
        return Boolean(
          document.querySelector('.bottom-work-panel .browser-evidence-card.error') &&
          /127\\.0\\.0\\.1:9\\/pass43-error/.test(document.body.textContent || '') &&
          /来自真实 Electron webview/.test(document.body.textContent || '')
        );
      })();
    `, 10000));

    assertStep("PASS43_STORE_PERSISTED", (() => {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      return parsed.browserVisits?.length >= 2 &&
        parsed.browserVisits.some((item) => item.status === "ready" && item.url === goodUrl) &&
        parsed.browserVisits.some((item) => item.status === "error" && item.url === "http://127.0.0.1:9/pass43-error");
    })());

    win.webContents.reload();
    await wait(1200);
    assertStep("PASS43_RELOAD_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
    assertStep("PASS43_RELOAD_PERSISTED_UI", await waitFor(win, `
      (async function() {
        if (!document.querySelector('.bottom-work-panel')) {
          document.querySelector('.workspace-context-button')?.click();
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        const button = Array.from(document.querySelectorAll('.bottom-panel-tabs button'))[6];
        if (!button) return false;
        button.click();
        await new Promise((resolve) => setTimeout(resolve, 300));
        return Boolean(document.querySelector('.browser-evidence-card.error') && /127\\.0\\.0\\.1:9\\/pass43-error/.test(document.body.textContent || ''));
      })();
    `, 10000));

    console.log("PASS43_BROWSER_EVIDENCE_DONE");
    cleanup(server);
    app.exit(0);
  } catch (error) {
    console.error(error);
    cleanup(server);
    app.exit(1);
  }
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end("<!doctype html><title>pass43-ready</title><main>pass43-ready</main>");
});

server.listen(0, "127.0.0.1", () => {
  const { port } = server.address();
  const goodUrl = `http://127.0.0.1:${port}/pass43-ready`;
  require(path.join(REPO_DIR, "electron", "main.cjs"));
  app.whenReady().then(() => runTest(server, goodUrl));
});
