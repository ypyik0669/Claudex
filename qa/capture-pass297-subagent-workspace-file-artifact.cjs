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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass297-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass297-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass297-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const ARTIFACT_RELATIVE = "artifacts/pass297-report.md";
const ARTIFACT_TEXT = "pass297 workspace artifact body evidence";

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_DIR]) {
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

function writeFakeClaude() {
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  const fakeClaudeScript = `
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value) + '\\n'); }
if (args[0] === '--version') {
  out('claude fake pass297');
  process.exit(0);
}
if (args[0] === 'auth') {
  out({ loggedIn: true, apiProvider: 'qa', authMethod: 'api_key' });
  process.exit(0);
}
if (args[0] === '-p') {
  const artifactPath = path.join(process.cwd(), ${JSON.stringify(ARTIFACT_RELATIVE)});
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, ${JSON.stringify(`# PASS297\\n\\n${ARTIFACT_TEXT}\\n`)}, 'utf8');
  out({ result: 'pass297-subagent-ok created ' + ${JSON.stringify(ARTIFACT_RELATIVE)}, session_id: 'pass297-claude-session' });
  process.exit(0);
}
out({ result: 'pass297 generic ok', session_id: 'pass297-claude-session' });
`;
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function writeInitialStore() {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass297-project" }), "utf8");
  writeFakeClaude();

  const project = { name: "pass297-project", path: PROJECT_DIR };
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
      systemPrompt: "QA",
      claudeCode: { executionMode: "claude-code", claudeCommand: path.join(FAKE_BIN_DIR, "claude.cmd"), permissionMode: "default" },
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
        id: "pass297-session",
        title: "PASS297 subagent artifact",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-08T00:00:00.000Z",
        updatedAt: "2026-07-08T00:00:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    runEvents: [],
    notices: [],
    automations: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
  });
}

async function openSubagents(win) {
  const clicked = await win.webContents.executeJavaScript(`
    (function() {
      if (document.querySelector('.subagent-workbench')) return true;
      const button =
        document.querySelector('button[data-context-tab="subagents"]') ||
        document.querySelector('button[data-bottom-tab="subagents"]') ||
        Array.from(document.querySelectorAll('.workspace-context-button, .bottom-panel-tabs button'))
          .find((item) => item.getAttribute('aria-label') === '子代理' || /子代理|Subagent/i.test(item.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
  if (!clicked) return false;
  return waitFor(win, "Boolean(document.querySelector('.subagent-workbench'))", 5000);
}

async function clickArtifactOpen(win, containerSelector, openAttribute) {
  return win.webContents.executeJavaScript(`
    (function() {
      const selector = ${JSON.stringify(`[${openAttribute}]`)};
      const candidates = Array.from(document.querySelectorAll(${JSON.stringify(`${containerSelector} .subagent-artifact-item`)}))
        .filter((candidate) => (candidate.textContent || '').includes(${JSON.stringify(ARTIFACT_RELATIVE)}));
      const item = candidates.find((candidate) =>
        candidate.querySelector(selector) &&
        (candidate.querySelector('code')?.textContent || '').includes(${JSON.stringify(ARTIFACT_RELATIVE)})
      ) || candidates.find((candidate) => candidate.querySelector(selector));
      const button = item?.querySelector(selector);
      if (!button) return false;
      item.closest('details')?.setAttribute('open', '');
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS297_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS297_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));

  assertStep("PASS297_RUN_SUBAGENT_FILE_ARTIFACT", await waitFor(win, `
    (async function() {
      if (!window.__pass297RunStarted) {
        window.__pass297RunStarted = true;
        await window.claudexDesktop.runSubagent({
          task: 'pass297 create workspace file artifact',
          nickname: 'PASS297 File Agent',
          projectPath: ${JSON.stringify(PROJECT_DIR)},
          sessionId: 'pass297-session'
        });
      }
      const state = await window.claudexDesktop.getState();
      const run = state.subagentRuns?.find((item) => /pass297 create workspace file artifact/.test(item.task || ''));
      const artifact = run?.artifacts?.find((item) => item.type === 'file' && item.path === ${JSON.stringify(ARTIFACT_RELATIVE)});
      return Boolean(
        run?.status === 'done' &&
        /pass297-subagent-ok/.test(run.summary || '') &&
        artifact &&
        artifact.projectPath === ${JSON.stringify(PROJECT_DIR)} &&
        artifact.content?.includes(${JSON.stringify(ARTIFACT_TEXT)}) &&
        state.runEvents?.some((event) => event.id === run.requestId && event.type === 'subagent' && event.status === 'ok')
      );
    })();
  `, 15000));

  assertStep("PASS297_FILE_EXISTS_ON_DISK", fs.existsSync(path.join(PROJECT_DIR, ARTIFACT_RELATIVE)));
  assertStep("PASS297_OPEN_SUBAGENTS", await openSubagents(win));
  assertStep("PASS297_TASK_CENTER_ARTIFACT_VISIBLE", await waitFor(win, `
    Boolean(
      document.querySelector('.subagent-workbench') &&
      document.querySelector('.subagent-run-card.done') &&
      Array.from(document.querySelectorAll('.subagent-artifact-item')).some((item) =>
        (item.textContent || '').includes(${JSON.stringify(ARTIFACT_RELATIVE)}) &&
        (item.textContent || '').includes(${JSON.stringify(ARTIFACT_TEXT)})
      )
    )
  `, 10000));

  assertStep("PASS297_OPEN_TASK_ARTIFACT", await clickArtifactOpen(win, ".subagent-run-card", "data-subagent-artifact-open"));
  assertStep("PASS297_WORKSPACE_OPENED_TASK_ARTIFACT", await waitFor(win, `
    Boolean(
      document.querySelector('#workspace-tool-detail') &&
      /pass297-report\\.md/.test(document.body.textContent || '') &&
      (document.querySelector('#workspace-tool-detail textarea')?.value || '').includes(${JSON.stringify(ARTIFACT_TEXT)})
    )
  `, 10000));

  assertStep("PASS297_REOPEN_SUBAGENTS_FOR_TIMELINE", await openSubagents(win));
  assertStep("PASS297_OPEN_TIMELINE_FROM_SUBAGENT", await waitFor(win, `
    (function() {
      const button =
        document.querySelector('.subagent-run-foot [data-subagent-run-action="timeline"]') ||
        Array.from(document.querySelectorAll('.subagent-run-foot button'))
          .find((candidate) => /timeline|时间线/i.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `, 5000));
  assertStep("PASS297_TIMELINE_ARTIFACT_VISIBLE", await waitFor(win, `
    Boolean(
      document.querySelector('.selected-run-evidence-panel') &&
      Array.from(document.querySelectorAll('.selected-run-evidence-panel .subagent-artifact-item')).some((item) =>
        (item.textContent || '').includes(${JSON.stringify(ARTIFACT_RELATIVE)}) &&
        (item.textContent || '').includes(${JSON.stringify(ARTIFACT_TEXT)})
      )
    )
  `, 10000));
  assertStep("PASS297_OPEN_TIMELINE_ARTIFACT", await clickArtifactOpen(win, ".selected-run-evidence-panel", "data-run-timeline-artifact-open"));
  assertStep("PASS297_WORKSPACE_OPENED_TIMELINE_ARTIFACT", await waitFor(win, `
    Boolean(
      document.querySelector('#workspace-tool-detail') &&
      (document.querySelector('#workspace-tool-detail textarea')?.value || '').includes(${JSON.stringify(ARTIFACT_TEXT)})
    )
  `, 10000));

  assertStep("PASS297_RELOAD_RESTORES_FILE_ARTIFACT", await win.webContents.executeJavaScript(`
    (async function() {
      const state = await window.claudexDesktop.getState();
      const run = state.subagentRuns?.find((item) => /pass297 create workspace file artifact/.test(item.task || ''));
      const artifact = run?.artifacts?.find((item) => item.type === 'file' && item.path === ${JSON.stringify(ARTIFACT_RELATIVE)});
      return Boolean(artifact && artifact.projectPath === ${JSON.stringify(PROJECT_DIR)} && artifact.content?.includes(${JSON.stringify(ARTIFACT_TEXT)}));
    })();
  `));

  console.log("PASS297_SUBAGENT_WORKSPACE_FILE_ARTIFACT_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS297_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (async function() {
          return {
            body: document.body?.textContent || '',
            artifacts: Array.from(document.querySelectorAll('.subagent-artifact-item')).map((item) => item.textContent || '').slice(0, 20),
            workspace: document.querySelector('#workspace-tool-detail')?.textContent || '',
            workspaceValue: document.querySelector('#workspace-tool-detail textarea')?.value || '',
            state: await window.claudexDesktop.getState().catch((stateError) => ({ error: String(stateError?.message || stateError) })),
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS297_DEBUG", JSON.stringify(debug, null, 2).slice(0, 16000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS297_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
