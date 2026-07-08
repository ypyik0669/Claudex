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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass298-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass298-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass298-project-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const AUTOMATION_ID = "pass298-automation";
const AUTOMATION_RUN_ID = "pass298-automation-run";
const ARTIFACT_RELATIVE = "artifacts/pass298-report.md";
const SENSITIVE_RELATIVE = "artifacts/.env.local";
const ARTIFACT_TEXT = "pass298 automation workspace artifact body evidence";
const SENSITIVE_TEXT = "PASS298_SHOULD_NOT_LEAK";

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
  out('claude fake pass298');
  process.exit(0);
}
if (args[0] === 'auth') {
  out({ loggedIn: true, apiProvider: 'qa', authMethod: 'api_key' });
  process.exit(0);
}
if (args[0] === '-p') {
  const artifactPath = path.join(process.cwd(), ${JSON.stringify(ARTIFACT_RELATIVE)});
  const sensitivePath = path.join(process.cwd(), ${JSON.stringify(SENSITIVE_RELATIVE)});
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, ${JSON.stringify(`# PASS298\\n\\n${ARTIFACT_TEXT}\\n`)}, 'utf8');
  fs.writeFileSync(sensitivePath, ${JSON.stringify(`${SENSITIVE_TEXT}=1\\n`)}, 'utf8');
  out({ result: 'pass298-automation-ok created ' + ${JSON.stringify(ARTIFACT_RELATIVE)}, session_id: 'pass298-claude-session' });
  process.exit(0);
}
out({ result: 'pass298 generic ok', session_id: 'pass298-claude-session' });
`;
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function writeInitialStore() {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass298-project" }), "utf8");
  writeFakeClaude();

  const project = { name: "pass298-project", path: PROJECT_DIR };
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
        id: "pass298-session",
        title: "PASS298 automation artifact",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-08T00:00:00.000Z",
        updatedAt: "2026-07-08T00:00:00.000Z",
        messages: [],
      },
    ],
    automations: [
      {
        id: AUTOMATION_ID,
        prompt: "pass298 create automation workspace file artifact",
        enabled: false,
        status: "idle",
        project,
        threadId: "pass298-session",
        schedule: { type: "once", runAt: "" },
        history: [],
      },
    ],
    commandRuns: [],
    runEvents: [],
    notices: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
  });
}

async function openOutputs(win) {
  const clicked = await win.webContents.executeJavaScript(`
    (function() {
      if (document.querySelector('.selected-run-evidence-panel')) return true;
      const button =
        document.querySelector('button[data-context-tab="outputs"]') ||
        document.querySelector('button[data-bottom-tab="outputs"]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
  if (!clicked) return false;
  return waitFor(win, "Boolean(document.querySelector('.bottom-work-panel'))", 5000);
}

async function clickTimelineArtifactOpen(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const item = Array.from(document.querySelectorAll('.selected-run-evidence-panel .subagent-artifact-item'))
        .find((candidate) =>
          candidate.querySelector('[data-run-timeline-artifact-open]') &&
          (candidate.querySelector('code')?.textContent || '').includes(${JSON.stringify(ARTIFACT_RELATIVE)})
        );
      const button = item?.querySelector('[data-run-timeline-artifact-open]');
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS298_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS298_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));

  assertStep("PASS298_RUN_AUTOMATION_FILE_ARTIFACT", await waitFor(win, `
    (async function() {
      if (!window.__pass298RunStarted) {
        window.__pass298RunStarted = true;
        await window.claudexDesktop.runAutomationNow({
          automationId: ${JSON.stringify(AUTOMATION_ID)},
          requestId: ${JSON.stringify(AUTOMATION_RUN_ID)}
        });
      }
      const state = await window.claudexDesktop.getState();
      const automation = state.automations?.find((item) => item.id === ${JSON.stringify(AUTOMATION_ID)});
      const run = automation?.history?.find((item) => item.id === ${JSON.stringify(AUTOMATION_RUN_ID)}) || automation?.lastRun;
      const artifact = run?.artifacts?.find((item) => item.type === 'file' && item.path === ${JSON.stringify(ARTIFACT_RELATIVE)});
      const sensitive = run?.artifacts?.find((item) =>
        (item.path || '').includes(${JSON.stringify(SENSITIVE_RELATIVE)}) ||
        (item.content || '').includes(${JSON.stringify(SENSITIVE_TEXT)})
      );
      return Boolean(
        run?.status === 'succeeded' &&
        /pass298-automation-ok/.test(run.stdout || '') &&
        artifact &&
        artifact.projectPath === ${JSON.stringify(PROJECT_DIR)} &&
        artifact.content?.includes(${JSON.stringify(ARTIFACT_TEXT)}) &&
        !sensitive &&
        state.runEvents?.some((event) => event.id === ${JSON.stringify(AUTOMATION_RUN_ID)} && event.type === 'automation' && event.status === 'ok')
      );
    })();
  `, 15000));

  assertStep("PASS298_FILES_EXIST_ON_DISK", fs.existsSync(path.join(PROJECT_DIR, ARTIFACT_RELATIVE)) && fs.existsSync(path.join(PROJECT_DIR, SENSITIVE_RELATIVE)));
  assertStep("PASS298_PERSISTED_FILE_ARTIFACT", (() => {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    const automation = parsed.automations?.find((item) => item.id === AUTOMATION_ID);
    const run = automation?.history?.find((item) => item.id === AUTOMATION_RUN_ID) || automation?.lastRun;
    const artifact = run?.artifacts?.find((item) => item.type === "file" && item.path === ARTIFACT_RELATIVE);
    const serialized = JSON.stringify(run?.artifacts || []);
    return run?.status === "succeeded" &&
      artifact?.content?.includes(ARTIFACT_TEXT) &&
      artifact.projectPath === PROJECT_DIR &&
      !serialized.includes(SENSITIVE_TEXT) &&
      !serialized.includes(SENSITIVE_RELATIVE);
  })());

  win.webContents.reload();
  assertStep("PASS298_RELOAD_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS298_OPEN_OUTPUTS", await openOutputs(win));
  assertStep("PASS298_TIMELINE_ARTIFACT_VISIBLE", await waitFor(win, `
    Boolean(
      document.querySelector('.selected-run-evidence-panel') &&
      Array.from(document.querySelectorAll('.selected-run-evidence-panel .subagent-artifact-item')).some((item) =>
        (item.textContent || '').includes(${JSON.stringify(ARTIFACT_RELATIVE)}) &&
        (item.textContent || '').includes(${JSON.stringify(ARTIFACT_TEXT)}) &&
        !(item.textContent || '').includes(${JSON.stringify(SENSITIVE_TEXT)})
      )
    )
  `, 10000));

  assertStep("PASS298_OPEN_TIMELINE_ARTIFACT", await clickTimelineArtifactOpen(win));
  assertStep("PASS298_WORKSPACE_OPENED_TIMELINE_ARTIFACT", await waitFor(win, `
    Boolean(
      document.querySelector('#workspace-tool-detail') &&
      /pass298-report\\.md/.test(document.body.textContent || '') &&
      (document.querySelector('#workspace-tool-detail textarea')?.value || '').includes(${JSON.stringify(ARTIFACT_TEXT)})
    )
  `, 10000));

  assertStep("PASS298_REOPEN_OUTPUTS_FOR_COPY", await openOutputs(win));
  assertStep("PASS298_TIMELINE_COPY_INCLUDES_ARTIFACT", await waitFor(win, `
    (async function() {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text) => { window.__pass298Clipboard = String(text || ''); } },
      });
      const copy = document.querySelector('.selected-run-evidence-panel [data-run-timeline-action="copy-evidence"]');
      if (!copy) return false;
      copy.click();
      await new Promise((resolve) => setTimeout(resolve, 250));
      const text = window.__pass298Clipboard || '';
      return text.includes(${JSON.stringify(AUTOMATION_ID)}) &&
        text.includes(${JSON.stringify(AUTOMATION_RUN_ID)}) &&
        text.includes(${JSON.stringify(ARTIFACT_RELATIVE)}) &&
        text.includes(${JSON.stringify(ARTIFACT_TEXT)}) &&
        !text.includes(${JSON.stringify(SENSITIVE_TEXT)});
    })();
  `, 5000));

  console.log("PASS298_AUTOMATION_WORKSPACE_FILE_ARTIFACT_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS298_FAILED", error?.stack || error);
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
      console.error("PASS298_DEBUG", JSON.stringify(debug, null, 2).slice(0, 16000));
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS298_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
