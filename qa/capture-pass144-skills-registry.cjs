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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass144-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass144-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass144-project-"));
const SKILL_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass144-skills-"));
const SKILL_DIR = path.join(SKILL_ROOT, "pass144-local-skill");
const SKILL_FILE = path.join(SKILL_DIR, "SKILL.md");

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

function writeFixtures() {
  fs.mkdirSync(SKILL_DIR, { recursive: true });
  fs.writeFileSync(SKILL_FILE, [
    "---",
    "name: pass144-local-skill",
    "description: Pass144 local skill registry evidence",
    "metadata:",
    "  short-description: Pass144 short metadata evidence",
    "---",
    "",
    "# Pass144 Local Skill",
    "",
    "This markdown body proves the row is backed by a real SKILL.md file.",
    "",
  ].join("\n"), "utf8");

  const fakeClaudeScript = `
const args = process.argv.slice(2);
function out(value) { process.stdout.write(typeof value === 'string' ? value + '\\n' : JSON.stringify(value, null, 2) + '\\n'); }
if (args[0] === '--version') out('2.9.0 (Claude Code QA)');
else if (args[0] === 'auth' && args[1] === 'status') out({ loggedIn: true, apiProvider: 'qa-provider', authMethod: 'api_key' });
else if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'list') out('Installed plugins: none');
else if (args[0] === 'mcp' && args[1] === 'list') out('No MCP servers configured');
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list' && args.includes('--json')) out([]);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') out('Configured marketplaces: none');
else out('fake claude command: ' + args.join(' '));
`;
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "fake-claude.cjs"), fakeClaudeScript, "utf8");
  fs.writeFileSync(path.join(FAKE_BIN_DIR, "claude.cmd"), `@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n`, "utf8");
  const claudeCommand = path.join(FAKE_BIN_DIR, "claude.cmd");
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
  process.env.CLAUDEX_SKILL_ROOTS = SKILL_ROOT;

  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass144-project" }), "utf8");
  writeJson(path.join(USER_DATA_DIR, "desktop-data.json"), {
    version: 1,
    settings: {
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      baseUrl: "https://api.example.invalid",
      temperature: 0.2,
      timeoutMs: 600000,
      language: "zh",
      appearance: { fontSize: "compact", density: "compact" },
      claudeCode: { executionMode: "claude-code", claudeCommand, permissionMode: "default" },
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
      apiKeys: {},
    },
    activeProject: { name: "pass144-project", path: PROJECT_DIR },
    projects: [{ name: "pass144-project", path: PROJECT_DIR }],
    sessions: [
      {
        id: "default",
        title: "新聊天",
        project: "pass144-project",
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
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
      await new Promise((resolve) => setTimeout(resolve, 250));
      return true;
    })();
  `);
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS144_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS144_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS144_STATUS_RETURNS_LOCAL_SKILL", await waitFor(win, `
    (async function() {
      const status = await window.claudexDesktop.getClaudeStatus({ projectPath: ${JSON.stringify(PROJECT_DIR)} });
      window.__pass144Status = status;
      const skill = status.skillItems?.find((item) => item.id === 'pass144-local-skill');
      return Boolean(skill &&
        /Pass144 local skill registry evidence/.test(skill.description || '') &&
        /SKILL\\.md$/.test(skill.path || '') &&
        (skill.root || '') === ${JSON.stringify(SKILL_ROOT)} &&
        skill.source === 'local-skill' &&
        skill.status === 'installed');
    })();
  `, 15000));

  assertStep("PASS144_OPEN_CAPABILITIES", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.nav-stack button')].find((candidate) => /\\u63d2\\u4ef6/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS144_OPEN_SKILLS_TAB", await waitFor(win, `
    (function() {
      const button = [...document.querySelectorAll('.plugin-manager-tabs button')].find((candidate) => /\\u6280\\u80fd/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `, 15000));
  assertStep("PASS144_SKILL_ROW_RENDERED_FROM_REGISTRY", await waitFor(win, `
    (function() {
      const row = document.querySelector('.skill-registry-row[data-skill-id="pass144-local-skill"]');
      const text = row?.textContent || '';
      const meta = row?.querySelector('.skill-row-meta')?.textContent || '';
      return Boolean(row) &&
        /pass144-local-skill/.test(text) &&
        /Pass144 local skill registry evidence/.test(text) &&
        /local-skill/.test(meta) &&
        /SKILL\\.md/.test(meta) &&
        !/\\u4ee3\\u7801\\u5ba1\\u67e5/.test(document.querySelector('.plugin-manager-list')?.textContent || '');
    })();
  `, 15000));

  assertStep("PASS144_COPY_SKILL_EVIDENCE", await win.webContents.executeJavaScript(`
    (async function() {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text) => {
            window.__pass144Clipboard = String(text || '');
          },
        },
      });
      document.querySelector('.skill-registry-row[data-skill-id="pass144-local-skill"] [data-skill-action="copy-evidence"]')?.click();
      await new Promise((resolve) => setTimeout(resolve, 200));
      return /Pass144 local skill registry evidence/.test(window.__pass144Clipboard || '') &&
        /local-skill/.test(window.__pass144Clipboard || '') &&
        /SKILL\\.md/.test(window.__pass144Clipboard || '');
    })();
  `));

  assertStep("PASS144_OPEN_SKILL_IN_WORKSPACE", await win.webContents.executeJavaScript(`
    (function() {
      document.querySelector('.skill-registry-row[data-skill-id="pass144-local-skill"] [data-skill-action="open-workspace"]')?.click();
      return true;
    })();
  `) && await waitFor(win, `
    (function() {
      const activeTool = document.querySelector('.tool-row.active')?.textContent || '';
      const editor = document.querySelector('.file-editor');
      const textarea = editor?.querySelector('textarea');
      const head = editor?.querySelector('.editor-head')?.textContent || '';
      return /\\u5de5\\u4f5c\\u533a/.test(activeTool) &&
        /SKILL\\.md/.test(head) &&
        /pass144-local-skill[\\\\/]SKILL\\.md/.test(head) &&
        /claudex-pass144-skills/.test(head) &&
        /This markdown body proves the row is backed by a real SKILL\\.md file/.test(textarea?.value || '');
    })();
  `, 10000));
  assertStep("PASS144_SKILL_SOURCE_REF_PERSISTED", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      return Boolean((state.sourceRefs || []).some((ref) =>
        ref.path === 'pass144-local-skill/SKILL.md' &&
        /SKILL\\.md/.test(ref.title || '') &&
        /claudex-pass144-skills/.test(ref.project?.path || '')
      ));
    })();
  `, 10000));

  assertStep("PASS144_PALETTE_SKILL_COMMAND_VISIBLE", await openPaletteAndQuery(win, "pass144 local skill") && await waitFor(win, `
    Boolean([...document.querySelectorAll('.command-modal .command-list button')].some((button) =>
      (button.getAttribute('data-command-id') || '').startsWith('capability-skill:') &&
      /pass144-local-skill/.test(button.textContent || '') &&
      /SKILL\\.md|local-skill/.test(button.textContent || '')
    ))
  `, 5000));
  assertStep("PASS144_PALETTE_DEEP_LINK_FOCUSES_SKILL", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '').startsWith('capability-skill:'));
      if (!button) return false;
      button.click();
      return true;
    })();
  `) && await waitFor(win, `
    (function() {
      const activeTab = document.querySelector('.plugin-manager-tabs button.active')?.textContent || '';
      const row = document.querySelector('.skill-registry-row[data-skill-id="pass144-local-skill"].focused-capability-row');
      return /\\u6280\\u80fd/.test(activeTab) && Boolean(row);
    })();
  `, 8000));
  assertStep("PASS144_PIN_SKILL_REGISTRY_EVIDENCE", await win.webContents.executeJavaScript(`
    (function() {
      document.querySelector('.skill-registry-row[data-skill-id="pass144-local-skill"] [data-skill-action="pin-evidence"]')?.click();
      return true;
    })();
  `) && await waitFor(win, `
    (function() {
      const panel = document.querySelector('.selected-run-evidence-panel');
      const row = document.querySelector('.run-timeline-row.selected');
      const typePill = panel?.querySelector('[data-run-event-type="skill-registry"]') || row?.querySelector('[data-run-event-type="skill-registry"]');
      const text = panel?.textContent || '';
      return Boolean(panel && row && typePill) &&
        /\\u6280\\u80fd registry/.test(typePill.textContent || '') &&
        /skill-registry/.test(typePill.textContent || '') &&
        /Skills registry/.test(text) &&
        /pass144-local-skill/.test(text) &&
        /Pass144 local skill registry evidence/.test(text) &&
        /SKILL\\.md/.test(text) &&
        /local-skill/.test(text);
    })();
  `, 10000));

  console.log("PASS144_SKILLS_REGISTRY_DONE");
}

writeFixtures();
app.setPath("userData", USER_DATA_DIR);
require(path.join(REPO_DIR, "electron", "main.cjs"));

app.whenReady()
  .then(runTest)
  .then(() => {
    cleanup();
    app.exit(0);
  })
  .catch((error) => {
    console.error(error);
    cleanup();
    app.exit(1);
  });
