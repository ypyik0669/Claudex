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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass262-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass262-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass262-project-"));
const SKILL_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass262-skills-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const SKILL_ID = "pass262-skill-trace";
const SKILL_DESCRIPTION = "PASS262 skill trace context evidence";
const SKILL_RELATIVE = path.join(SKILL_ID, "SKILL.md");
const SKILL_FILE = path.join(SKILL_ROOT, SKILL_RELATIVE);

const TRACE_FIELDS = [
  "kind",
  "action",
  "id",
  "name",
  "status",
  "enabled",
  "version",
  "source",
  "marketplace",
  "toolCount",
  "tools",
  "risk",
  "permissions",
  "transport",
  "error",
  "projectPath",
];
const TRACE_SUFFIX = {
  kind: "kind",
  action: "action",
  id: "id",
  name: "name",
  status: "status",
  enabled: "enabled",
  version: "version",
  source: "source",
  marketplace: "marketplace",
  toolCount: "tool-count",
  tools: "tools",
  risk: "risk",
  permissions: "permissions",
  transport: "transport",
  error: "error",
  projectPath: "project-path",
};

function cleanup() {
  for (const dir of [USER_DATA_DIR, FAKE_BIN_DIR, PROJECT_DIR, SKILL_ROOT]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_error) {
      // best-effort cleanup
    }
  }
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

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function writeFakeClaude() {
  const fakeClaudeScript = `
const args = process.argv.slice(2);
function out(value) {
  process.stdout.write(typeof value === "string" ? value + "\\n" : JSON.stringify(value) + "\\n");
}
if (args[0] === "--version") out("2.62.0 (Claude Code PASS262)");
else if (args[0] === "auth" && args[1] === "status") out({ loggedIn: true, apiProvider: "qa-provider", authMethod: "api_key" });
else if (args[0] === "plugin" && args[1] === "list" && args.includes("--json")) out([]);
else if (args[0] === "plugin" && args[1] === "list") out("Installed plugins: none");
else if (args[0] === "plugin" && args[1] === "marketplace" && args[2] === "list" && args.includes("--json")) out([]);
else if (args[0] === "plugin" && args[1] === "marketplace" && args[2] === "list") out("Configured marketplaces: none");
else if (args[0] === "mcp" && args[1] === "list" && args.includes("--json")) out({ servers: [] });
else if (args[0] === "mcp" && args[1] === "list") out("No MCP servers configured");
else out("pass262 fake claude command: " + args.join(" "));
`;
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(FAKE_CLAUDE, `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
}

function writeInitialStore() {
  writeFakeClaude();
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(SKILL_FILE), { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass262-project" }), "utf8");
  fs.writeFileSync(
    SKILL_FILE,
    [
      "---",
      `name: ${SKILL_ID}`,
      `description: ${SKILL_DESCRIPTION}`,
      "---",
      "",
      "# PASS262 Skill",
      "",
      "This real local SKILL.md proves skill trace context.",
      "",
    ].join("\n"),
    "utf8",
  );
  process.env.CLAUDEX_SKILL_ROOTS = SKILL_ROOT;

  const project = { name: "pass262-project", path: PROJECT_DIR };
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
      systemPrompt: "QA",
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
    sessions: [
      {
        id: "pass262-session",
        title: "PASS262 skill surface trace context",
        project: project.name,
        projectPath: project.path,
        createdAt: "2026-07-08T03:02:00.000Z",
        updatedAt: "2026-07-08T03:02:00.000Z",
        messages: [],
      },
    ],
    commandRuns: [],
    runEvents: [],
    automations: [],
    subagentRuns: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
  });
}

function sharedFieldsMatch(left, right, fields) {
  return Boolean(left && right && fields.every((field) => left[field] === right[field]));
}

async function paletteTrace(win, query, expectedId, click = false) {
  return win.webContents.executeJavaScript(`
    (async function() {
      const fields = ${JSON.stringify(TRACE_FIELDS)};
      const suffix = ${JSON.stringify(TRACE_SUFFIX)};
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 240));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return null;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 320));
      const button = document.querySelector(${JSON.stringify(`.command-modal .command-list button[data-command-id="${expectedId}"]`)});
      if (!button) {
        return {
          missing: true,
          commands: Array.from(document.querySelectorAll('.command-modal .command-list button')).slice(0, 20).map((item) => ({
            id: item.getAttribute('data-command-id'),
            target: item.getAttribute('data-command-target'),
            text: item.textContent,
          }))
        };
      }
      const trace = Object.fromEntries(fields.map((field) => [field, button.getAttribute('data-command-capability-' + suffix[field]) || '']));
      const result = { id: button.getAttribute('data-command-id') || '', target: button.getAttribute('data-command-target') || '', text: button.textContent || '', trace };
      if (${click ? "true" : "false"}) {
        button.click();
      } else {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      }
      await new Promise((resolve) => setTimeout(resolve, 260));
      return result;
    })();
  `);
}

async function surfaceTrace(win, selector) {
  return win.webContents.executeJavaScript(`
    (function() {
      const fields = ${JSON.stringify(TRACE_FIELDS)};
      const suffix = ${JSON.stringify(TRACE_SUFFIX)};
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return null;
      return Object.fromEntries(fields.map((field) => [field, element.getAttribute('data-capability-' + suffix[field]) || '']));
    })();
  `);
}

function assertSkillCommandTrace(name, command, action, target = "") {
  assertStep(`${name}_READY`, Boolean(command && !command.missing));
  assertStep(`${name}_KIND_ACTION`, command?.trace?.kind === "skill" && command?.trace?.action === action);
  assertStep(`${name}_IDENTITY`, command?.trace?.id === SKILL_ID && command?.trace?.name === SKILL_ID);
  assertStep(`${name}_STATUS_ENABLED`, command?.trace?.status === "installed" && command?.trace?.enabled === "true");
  assertStep(`${name}_SOURCE_ROOT`, Boolean((command?.trace?.source || "").includes(SKILL_ROOT) && (command?.trace?.source || "").includes("local-skill")));
  assertStep(`${name}_PROJECT_PATH`, command?.trace?.projectPath === SKILL_ROOT);
  if (target) assertStep(`${name}_TARGET`, command?.target === target);
}

writeInitialStore();
app.setPath("userData", USER_DATA_DIR);
require(path.join(REPO_DIR, "electron", "main.cjs"));

async function runTest() {
  await wait(1700);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS262_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1500, height: 980 });
  await wait(700);

  const openCommandId = `capability-skill:${encodeURIComponent(SKILL_ID)}`;
  const openFileCommandId = `capability-skill-open:${encodeURIComponent(SKILL_ID)}`;
  const copyCommandId = `capability-skill-copy:${encodeURIComponent(SKILL_ID)}`;
  const pinCommandId = `capability-skill-pin:${encodeURIComponent(SKILL_ID)}`;
  const query = "PASS262 skill trace context";

  assertStep("PASS262_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS262_STATUS_READY", await waitFor(win, `
    (async function() {
      const status = await window.claudexDesktop.getClaudeStatus({ projectPath: ${JSON.stringify(PROJECT_DIR)} });
      const target = status.skillItems?.find((item) => item.id === ${JSON.stringify(SKILL_ID)});
      window.__PASS262_STATUS__ = status;
      return Boolean(
        target &&
        target.name === ${JSON.stringify(SKILL_ID)} &&
        /${SKILL_DESCRIPTION}/.test(target.description || "") &&
        target.root === ${JSON.stringify(SKILL_ROOT)} &&
        target.relativePath === ${JSON.stringify(SKILL_RELATIVE)}
      );
    })();
  `, 15000));

  const openCommand = await paletteTrace(win, query, openCommandId);
  assertSkillCommandTrace("PASS262_OPEN_COMMAND_TRACE", openCommand, "open");
  const openFileCommand = await paletteTrace(win, query, openFileCommandId);
  assertSkillCommandTrace("PASS262_OPEN_FILE_COMMAND_TRACE", openFileCommand, "open-file");
  const copyCommand = await paletteTrace(win, query, copyCommandId);
  assertSkillCommandTrace("PASS262_COPY_COMMAND_TRACE", copyCommand, "copy", "clipboard");
  const pinCommand = await paletteTrace(win, query, pinCommandId);
  assertSkillCommandTrace("PASS262_PIN_COMMAND_TRACE", pinCommand, "pin", "timeline");

  const clickedOpen = await paletteTrace(win, query, openCommandId, true);
  assertSkillCommandTrace("PASS262_CLICK_OPEN_COMMAND_TRACE", clickedOpen, "open");
  const rowSelector = `.capability-modal .skill-registry-row[data-skill-id="${SKILL_ID}"]`;
  assertStep("PASS262_SURFACE_ROW_READY", await waitFor(win, `Boolean(document.querySelector(${JSON.stringify(rowSelector)}))`, 12000));
  const row = await surfaceTrace(win, rowSelector);
  const openFileButton = await surfaceTrace(win, `${rowSelector} [data-skill-action="open-workspace"]`);
  const copyButton = await surfaceTrace(win, `${rowSelector} [data-skill-action="copy-evidence"]`);
  const pinButton = await surfaceTrace(win, `${rowSelector} [data-skill-action="pin-evidence"]`);
  const sharedFields = TRACE_FIELDS.filter((field) => field !== "action");

  assertStep("PASS262_ROW_TRACE_SCHEMA", Boolean(
    row?.kind === "skill" &&
    row?.action === "open" &&
    sharedFieldsMatch(openCommand.trace, row, sharedFields)
  ));
  assertStep("PASS262_OPEN_FILE_ACTION_TRACE_SCHEMA", Boolean(
    openFileButton?.action === "open-file" &&
    sharedFieldsMatch(openFileCommand.trace, openFileButton, sharedFields)
  ));
  assertStep("PASS262_COPY_ACTION_TRACE_SCHEMA", Boolean(
    copyButton?.action === "copy" &&
    sharedFieldsMatch(copyCommand.trace, copyButton, sharedFields)
  ));
  assertStep("PASS262_PIN_ACTION_TRACE_SCHEMA", Boolean(
    pinButton?.action === "pin" &&
    sharedFieldsMatch(pinCommand.trace, pinButton, sharedFields)
  ));

  console.log("PASS262_SKILL_SURFACE_TRACE_CONTEXT_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch(async (error) => {
  console.error("PASS262_FAILED", error?.stack || error);
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    const debug = await win.webContents.executeJavaScript(`
      (async function() {
        return {
          commands: Array.from(document.querySelectorAll('.command-modal .command-list button')).slice(0, 30).map((item) => ({
            id: item.getAttribute('data-command-id'),
            target: item.getAttribute('data-command-target'),
            text: item.textContent,
            attrs: Object.fromEntries(Array.from(item.attributes).map((attr) => [attr.name, attr.value])),
          })),
          rows: Array.from(document.querySelectorAll('.capability-modal [data-capability-kind], .skill-registry-row')).slice(0, 30).map((item) => ({
            text: item.textContent,
            attrs: Object.fromEntries(Array.from(item.attributes).map((attr) => [attr.name, attr.value])),
          })),
          status: window.__PASS262_STATUS__ || null,
          body: document.body.textContent?.slice(0, 4000) || "",
          state: await window.claudexDesktop?.getState?.().catch((stateError) => ({ error: String(stateError?.message || stateError) })),
        };
      })();
    `).catch((debugError) => ({ error: String(debugError?.stack || debugError) }));
    console.error("PASS262_DEBUG", JSON.stringify(debug, null, 2).slice(0, 20000));
  }
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS262_TIMEOUT");
  cleanup();
  app.exit(1);
}, 120000);
