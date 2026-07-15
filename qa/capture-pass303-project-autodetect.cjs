const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { app, BrowserWindow } = require("electron");

function findRepoDir() {
  const candidates = [
    process.env.CLAUDEX_REPO_DIR,
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
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass303-data-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pass303-autodetect-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass303-bin-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");

function cleanup() {
  for (const dir of [USER_DATA_DIR, PROJECT_DIR, FAKE_BIN_DIR]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_error) {
      // best-effort cleanup
    }
  }
}

function writeFakeClaude() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  const fakeClaudeScript = `
const args = process.argv.slice(2);
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
if (args[0] === '--version') out('2.10.4 (Claude Code QA)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else out('pass303 fake claude command: ' + args.join(' '));
`;
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function writeProjectFixture() {
  fs.mkdirSync(path.join(PROJECT_DIR, "src"), { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass303-autodetect" }, null, 2), "utf8");
  fs.writeFileSync(path.join(PROJECT_DIR, "README.md"), "# PASS303 autodetect\n", "utf8");
  fs.writeFileSync(path.join(PROJECT_DIR, "src", "index.js"), "console.log('pass303 autodetect');\n", "utf8");
  execFileSync("git", ["init"], { cwd: PROJECT_DIR, stdio: "ignore" });
}

async function wait(ms) {
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

async function openWorkspaceTool(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.rail-button[data-tool="workspace"]') ||
        [...document.querySelectorAll('button')].find((item) => /workspace|\\u5de5\\u4f5c\\u533a/i.test(item.getAttribute('aria-label') || item.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function openEnvironmentPanel(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.workspace-context-button[data-context-tab="environment"]') ||
        [...document.querySelectorAll('.workspace-context-button')].find((item) => /\\u73af\\u5883|environment/i.test(item.getAttribute('aria-label') || item.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS303_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS303_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS303_DATA_FILE_CREATED_FROM_EMPTY_USER_DATA", fs.existsSync(DATA_FILE));

  assertStep("PASS303_STATE_ADOPTED_LAUNCH_PROJECT", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const projectPath = ${JSON.stringify(PROJECT_DIR)};
      const active = state.activeProject || {};
      const firstProject = (state.projects || [])[0] || {};
      const defaultSession = (state.sessions || []).find((item) => item.id === 'default') || (state.sessions || [])[0] || {};
      return active.path === projectPath &&
        active.name === ${JSON.stringify(path.basename(PROJECT_DIR))} &&
        firstProject.path === projectPath &&
        defaultSession.projectPath === projectPath &&
        defaultSession.project === active.name &&
        (state.settings?.model || '') === 'claude-haiku-4-5-20251001';
    })();
  `, 10000));

  assertStep("PASS303_ENVIRONMENT_IPC_POINTS_TO_PROJECT", await win.webContents.executeJavaScript(`
    (async function() {
      const projectPath = ${JSON.stringify(PROJECT_DIR)};
      const env = await window.claudexDesktop.getEnvironment({ projectPath });
      return env.cwd === projectPath &&
        env.requestedProjectPath === projectPath &&
        env.projectExists === true &&
        env.projectMissing === false &&
        env.git?.available === true &&
        env.git.root === projectPath &&
        (env.git.relativePath === '.' || env.git.relativePath === '') &&
        (env.git.files || []).some((file) => file.path === 'package.json') &&
        (env.git.files || []).some((file) => file.path === 'README.md');
    })();
  `));

  assertStep("PASS303_WORKSPACE_IPC_LISTS_REAL_FILES", await win.webContents.executeJavaScript(`
    (async function() {
      const projectPath = ${JSON.stringify(PROJECT_DIR)};
      const result = await window.claudexDesktop.listWorkspaceFiles({ projectPath, depth: 2 });
      const files = result.files || [];
      const src = files.find((item) => item.name === 'src' && item.type === 'directory');
      return result.root === projectPath &&
        files.some((item) => item.name === 'package.json' && item.type === 'file') &&
        files.some((item) => item.name === 'README.md' && item.type === 'file') &&
        src &&
        (src.children || []).some((item) => item.path === 'src/index.js');
    })();
  `));

  assertStep("PASS303_UI_PROJECT_PILL_READY", await waitFor(win, `
    (function() {
      const projectName = ${JSON.stringify(path.basename(PROJECT_DIR))};
      const pill = document.querySelector('.prompt-box .project-pill');
      const railDot = document.querySelector('.tool-rail-project-dot.ready');
      return Boolean(
        pill &&
        !pill.classList.contains('project-missing') &&
        (pill.getAttribute('aria-label') || '').includes(projectName) &&
        pill.getAttribute('title') === ${JSON.stringify(PROJECT_DIR)} &&
        railDot &&
        railDot.getAttribute('data-project-status') === 'ready' &&
        railDot.getAttribute('role') === 'status' &&
        (railDot.getAttribute('aria-label') || '').includes(projectName) &&
        (railDot.getAttribute('aria-label') || '').includes(${JSON.stringify(PROJECT_DIR)}) &&
        (railDot.getAttribute('title') || '').includes(${JSON.stringify(PROJECT_DIR)})
      );
    })();
  `, 10000));

  assertStep("PASS303_OPEN_WORKSPACE_TOOL", await openWorkspaceTool(win));
  assertStep("PASS303_WORKSPACE_TREE_SHOWS_PROJECT_FILES", await waitFor(win, `
    (function() {
      const panelOpen = !document.querySelector('.app-grid.right-panel-hidden') && document.querySelector('.tools-panel');
      const tree = document.querySelector('#workspace-tool-detail .file-tree') || document.querySelector('.tools-panel .file-tree');
      const text = tree?.textContent || '';
      return Boolean(
        panelOpen &&
        /package\\.json/.test(text) &&
        /README\\.md/.test(text) &&
        /src/.test(text)
      );
    })();
  `, 12000));

  assertStep("PASS303_OPEN_ENVIRONMENT_PANEL", await openEnvironmentPanel(win));
  assertStep("PASS303_BOTTOM_ENVIRONMENT_SHOWS_GIT_ROOT", await waitFor(win, `
    (function() {
      const panel = document.querySelector('.bottom-work-panel');
      const text = panel?.textContent || '';
      const rows = [...(panel?.querySelectorAll('dl div') || [])].map((row) => ({
        label: row.querySelector('dt')?.textContent || '',
        value: row.querySelector('dd')?.textContent || '',
        title: row.querySelector('dd')?.getAttribute('title') || '',
      }));
      const gitRootRow = rows.find((row) => /Git \\u6839\\u76ee\\u5f55/.test(row.label));
      return Boolean(
        panel &&
        /${path.basename(PROJECT_DIR).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/.test(text) &&
        gitRootRow &&
        gitRootRow.title === ${JSON.stringify(PROJECT_DIR)}
      );
    })();
  `, 12000));

  console.log("PASS303_PROJECT_AUTODETECT_DONE");
  cleanup();
  app.exit(0);
}

try {
  writeProjectFixture();
  writeFakeClaude();
  process.env.ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
  app.setPath("appData", USER_DATA_DIR);
  app.setPath("userData", USER_DATA_DIR);
  process.chdir(PROJECT_DIR);
  require(path.join(REPO_DIR, "electron", "main.cjs"));
  app.whenReady().then(runTest).catch((error) => {
    console.error("PASS303_FAILED", error?.stack || error);
    Promise.resolve()
      .then(async () => {
        const win = BrowserWindow.getAllWindows()[0];
        if (!win) return;
        const debug = await win.webContents.executeJavaScript(`
          (async function() {
            return {
              cwd: ${JSON.stringify(PROJECT_DIR)},
              state: await window.claudexDesktop.getState()
                .then((state) => ({
                  activeProject: state.activeProject,
                  projects: state.projects,
                  sessions: state.sessions,
                  model: state.settings?.model,
                }))
                .catch((stateError) => ({ error: String(stateError?.message || stateError) })),
              environment: await window.claudexDesktop.getEnvironment({ projectPath: ${JSON.stringify(PROJECT_DIR)} }).catch((envError) => ({ error: String(envError?.message || envError) })),
              projectPill: document.querySelector('.prompt-box .project-pill')?.outerHTML || '',
              railDot: document.querySelector('.tool-rail-project-dot')?.outerHTML || '',
              workspaceTree: document.querySelector('.tools-panel .file-tree')?.textContent || '',
              bottomPanelHtml: document.querySelector('.bottom-work-panel')?.outerHTML || '',
              bottomPanel: document.querySelector('.bottom-work-panel')?.textContent || '',
              body: document.body?.textContent?.slice(0, 5000) || '',
            };
          })();
        `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
        console.error("PASS303_DEBUG", JSON.stringify(debug, null, 2).slice(0, 14000));
      })
      .finally(() => {
        cleanup();
        app.exit(1);
      });
  });
} catch (error) {
  console.error("PASS303_SETUP_FAILED", error?.stack || error);
  cleanup();
  process.exit(1);
}

setTimeout(() => {
  console.error("PASS303_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
