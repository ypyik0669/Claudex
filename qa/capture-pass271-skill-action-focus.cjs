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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass271-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass271-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass271-project-"));
const SKILL_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass271-skills-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const SKILL_ID = "pass271-skill-action-focus";
const SKILL_DESCRIPTION = "PASS271 skill action focus evidence";
const SKILL_RELATIVE = path.join(SKILL_ID, "SKILL.md");
const SKILL_FILE = path.join(SKILL_ROOT, SKILL_RELATIVE);
const SKILL_BODY = "This real local SKILL.md proves PASS271 skill action focus.";

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_DIR, SKILL_ROOT]) {
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
  const fakeClaudeScript = `
const args = process.argv.slice(2);
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value) + '\\n'); }
if (args[0] === '--version') out('2.71.0 (Claude Code PASS271)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) out({ servers: [] });
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else out('pass271 fake claude command: ' + args.join(' '));
`;
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(FAKE_CLAUDE, '@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n', "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function writeInitialStore() {
  writeFakeClaude();
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(SKILL_FILE), { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass271-project" }), "utf8");
  fs.writeFileSync(
    SKILL_FILE,
    [
      "---",
      `name: ${SKILL_ID}`,
      `description: ${SKILL_DESCRIPTION}`,
      "---",
      "",
      "# PASS271 Skill",
      "",
      SKILL_BODY,
      "",
    ].join("\n"),
    "utf8",
  );
  process.env.CLAUDEX_SKILL_ROOTS = SKILL_ROOT;

  const project = { name: "pass271-project", path: PROJECT_DIR };
  writeJson(DATA_FILE, {
    version: 1,
    activeProject: project,
    projects: [project],
    settings: {
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      baseUrl: "https://api.example.invalid",
      temperature: 0.2,
      timeoutMs: 600000,
      language: "zh",
      appearance: { fontSize: "compact", density: "compact" },
      claudeCode: { executionMode: "claude-code", claudeCommand: FAKE_CLAUDE, permissionMode: "default" },
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
    sessions: [{
      id: "pass271-session",
      title: "PASS271 skill action focus",
      project: project.name,
      projectPath: project.path,
      createdAt: "2026-07-08T03:20:00.000Z",
      updatedAt: "2026-07-08T03:20:00.000Z",
      messages: [],
    }],
    commandRuns: [],
    runEvents: [],
    automations: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

async function runPaletteCommand(win, query, expectedId) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 240));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 320));
      const button = document.querySelector(${JSON.stringify(`.command-modal .command-list button[data-command-id="${expectedId}"]`)});
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function closeCapabilitySurface(win) {
  await win.webContents.executeJavaScript(`
    (function() {
      document.querySelector('.capability-modal header .icon-only')?.click();
      return true;
    })();
  `);
  await waitFor(win, "!document.querySelector('.capability-modal')", 5000);
}

async function skillActionFocusState(win, actionSelector) {
  return win.webContents.executeJavaScript(`
    (function() {
      const row = document.querySelector('.capability-modal .skill-registry-row[data-skill-id="${SKILL_ID}"]');
      const action = document.querySelector(${JSON.stringify(actionSelector)});
      const focusedActions = Array.from(document.querySelectorAll('.capability-modal [data-capability-action-focused="true"]'));
      if (!row || !action) return null;
      return {
        rowText: row.textContent || '',
        rowFocused: row.getAttribute('data-capability-focused') || '',
        rowAria: row.getAttribute('aria-current') || '',
        actionText: action.textContent || '',
        actionFocused: action.getAttribute('data-capability-action-focused') || '',
        actionAria: action.getAttribute('aria-current') || '',
        kind: action.getAttribute('data-capability-kind') || '',
        action: action.getAttribute('data-capability-action') || '',
        id: action.getAttribute('data-capability-id') || '',
        name: action.getAttribute('data-capability-name') || '',
        projectPath: action.getAttribute('data-capability-project-path') || '',
        focusedActionCount: focusedActions.length,
      };
    })();
  `);
}

async function openAndAssertSkillActionFocused(win, spec) {
  assertStep(`${spec.name}_COMMAND_CLICKED`, await runPaletteCommand(win, spec.query, spec.commandId));
  const actionSelector = `.capability-modal .skill-registry-row[data-skill-id="${SKILL_ID}"] [data-skill-action="${spec.skillAction}"]`;
  assertStep(`${spec.name}_ACTION_FOCUSED_READY`, await waitFor(win, `
    (function() {
      const row = document.querySelector('.capability-modal .skill-registry-row[data-skill-id="${SKILL_ID}"]');
      const action = document.querySelector(${JSON.stringify(actionSelector)});
      return Boolean(
        row &&
        action &&
        row.getAttribute('data-capability-focused') === 'true' &&
        row.getAttribute('aria-current') === 'true' &&
        action.getAttribute('data-capability-action-focused') === 'true' &&
        action.getAttribute('aria-current') === 'true' &&
        action.getAttribute('data-capability-kind') === 'skill' &&
        action.getAttribute('data-capability-action') === ${JSON.stringify(spec.traceAction)} &&
        action.getAttribute('data-capability-id') === '${SKILL_ID}' &&
        action.getAttribute('data-capability-project-path') === ${JSON.stringify(SKILL_ROOT)}
      );
    })();
  `, 12000));
  const state = await skillActionFocusState(win, actionSelector);
  assertStep(`${spec.name}_ACTION_FOCUS_TRACE`, Boolean(
    state &&
    state.rowFocused === "true" &&
    state.rowAria === "true" &&
    state.actionFocused === "true" &&
    state.actionAria === "true" &&
    state.kind === "skill" &&
    state.action === spec.traceAction &&
    state.id === SKILL_ID &&
    state.name === SKILL_ID &&
    state.projectPath === SKILL_ROOT &&
    state.focusedActionCount === 1 &&
    state.rowText.includes(SKILL_ID) &&
    state.rowText.includes(SKILL_DESCRIPTION)
  ));
  await closeCapabilitySurface(win);
}

writeInitialStore();
app.setPath("userData", USER_DATA_DIR);
require(path.join(REPO_DIR, "electron", "main.cjs"));

async function runTest() {
  await wait(1700);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS271_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  assertStep("PASS271_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS271_STATUS_HAS_SKILL", await waitFor(win, `
    (async function() {
      const status = await window.claudexDesktop.getClaudeStatus({ projectPath: ${JSON.stringify(PROJECT_DIR)} });
      const skill = status.skillItems?.find((item) => item.id === ${JSON.stringify(SKILL_ID)});
      return Boolean(
        skill &&
        skill.name === ${JSON.stringify(SKILL_ID)} &&
        skill.description === ${JSON.stringify(SKILL_DESCRIPTION)} &&
        skill.root === ${JSON.stringify(SKILL_ROOT)} &&
        /SKILL\.md$/.test(skill.path || '')
      );
    })();
  `, 15000));

  await openAndAssertSkillActionFocused(win, {
    name: "PASS271_SKILL_OPEN_FILE",
    query: "focus open pass271 skill action",
    commandId: "capability-skill-action:open-file:pass271-skill-action-focus",
    skillAction: "open-workspace",
    traceAction: "open-file",
  });

  await openAndAssertSkillActionFocused(win, {
    name: "PASS271_SKILL_COPY",
    query: "focus copy pass271 skill action",
    commandId: "capability-skill-action:copy:pass271-skill-action-focus",
    skillAction: "copy-evidence",
    traceAction: "copy",
  });

  await openAndAssertSkillActionFocused(win, {
    name: "PASS271_SKILL_PIN",
    query: "focus pin pass271 skill action",
    commandId: "capability-skill-action:pin:pass271-skill-action-focus",
    skillAction: "pin-evidence",
    traceAction: "pin",
  });

  console.log("PASS271_SKILL_ACTION_FOCUS_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS271_FAILED", error?.stack || error);
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    const debug = await win.webContents.executeJavaScript(`
      (function() {
        return {
          commands: Array.from(document.querySelectorAll('.command-modal .command-list button')).slice(0, 40).map((item) => ({
            id: item.getAttribute('data-command-id'),
            text: item.textContent,
            attrs: Object.fromEntries(Array.from(item.attributes).map((attr) => [attr.name, attr.value])),
          })),
          actions: Array.from(document.querySelectorAll('.capability-modal [data-capability-action-focused], .capability-modal [data-skill-action]')).slice(0, 40).map((item) => ({
            text: item.textContent,
            attrs: Object.fromEntries(Array.from(item.attributes).map((attr) => [attr.name, attr.value])),
          })),
          body: document.body.textContent?.slice(0, 6000) || '',
        };
      })();
    `).catch((debugError) => ({ error: String(debugError?.stack || debugError) }));
    console.error("PASS271_DEBUG", JSON.stringify(debug, null, 2).slice(0, 24000));
  }
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS271_TIMEOUT");
  cleanup();
  app.exit(1);
}, 120000);
