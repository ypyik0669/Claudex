const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow, clipboard } = require("electron");

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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass220-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass220-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass220-project-"));
const SKILL_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass220-skills-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const TARGET_SKILL_ID = "pass220-skill-25-deep";
const TARGET_QUERY = TARGET_SKILL_ID;
const TARGET_DESCRIPTION = "PASS220 deep registry command palette evidence";
const TARGET_BODY = "This real local SKILL.md proves deep skill commands are not capped at twenty four.";
const TARGET_RELATIVE = path.join(TARGET_SKILL_ID, "SKILL.md");
const TARGET_FILE = path.join(SKILL_ROOT, TARGET_RELATIVE);

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

function writeSkill(id, description, body) {
  const skillFile = path.join(SKILL_ROOT, id, "SKILL.md");
  fs.mkdirSync(path.dirname(skillFile), { recursive: true });
  fs.writeFileSync(
    skillFile,
    [
      "---",
      `name: ${id}`,
      `description: ${description}`,
      "---",
      "",
      `# ${id}`,
      "",
      body,
      "",
    ].join("\n"),
    "utf8",
  );
}

function writeInitialStore() {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass220-project" }), "utf8");
  for (let index = 1; index <= 24; index += 1) {
    const padded = String(index).padStart(2, "0");
    writeSkill(`pass220-skill-${padded}-filler`, `PASS220 filler registry skill ${padded}`, `Filler skill ${padded}.`);
  }
  writeSkill(TARGET_SKILL_ID, TARGET_DESCRIPTION, TARGET_BODY);

  fs.writeFileSync(
    FAKE_CLAUDE,
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass220& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins: none& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces: none& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo {\"servers\":[]}& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo No MCP servers configured& exit /b 0)",
      "echo pass220 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
  process.env.CLAUDEX_SKILL_ROOTS = SKILL_ROOT;

  const project = { name: "pass220-project", path: PROJECT_DIR };
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
    activeProject: project,
    projects: [project],
    sessions: [
      {
        id: "pass220-session",
        title: "PASS220 deep skill palette",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-08T02:20:00.000Z",
        updatedAt: "2026-07-08T02:20:00.000Z",
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

async function openPaletteWithQuery(win, query) {
  return win.webContents.executeJavaScript(`
    (async function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));
      const input = document.querySelector('.command-modal .command-search input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));
      window.__pass220Commands = [...document.querySelectorAll('.command-modal .command-list button')].map((button) => ({
        id: button.getAttribute('data-command-id') || '',
        target: button.getAttribute('data-command-target') || '',
        text: button.textContent || '',
      }));
      return true;
    })();
  `);
}

async function waitForCommand(win, query, expectedId, target = "", timeoutMs = 12000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await openPaletteWithQuery(win, query);
    const ok = await win.webContents.executeJavaScript(`
      (function() {
        const button = [...document.querySelectorAll('.command-modal .command-list button')]
          .find((candidate) => (candidate.getAttribute('data-command-id') || '') === ${JSON.stringify(expectedId)});
        const text = button?.textContent || '';
        return Boolean(button &&
          (button.getAttribute('data-command-target') || '') === ${JSON.stringify(target)} &&
          /${TARGET_SKILL_ID}/.test(text));
      })();
    `);
    if (ok) return true;
    await win.webContents.executeJavaScript("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));");
    await wait(180);
  }
  return false;
}

async function clickCommand(win, query, expectedId) {
  await openPaletteWithQuery(win, query);
  return win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.command-modal .command-list button')]
        .find((candidate) => (candidate.getAttribute('data-command-id') || '') === ${JSON.stringify(expectedId)});
      if (!button) return false;
      button.click();
      return true;
    })();
  `);
}

async function waitForClipboard(patterns, timeoutMs = 6000) {
  const checks = Array.isArray(patterns) ? patterns : [patterns];
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const text = clipboard.readText() || "";
    if (checks.every((pattern) => (pattern instanceof RegExp ? pattern.test(text) : text.includes(String(pattern))))) {
      return true;
    }
    await wait(120);
  }
  console.error("PASS220_CLIPBOARD_DEBUG", clipboard.readText());
  return false;
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS220_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  const skillId = `capability-skill:${encodeURIComponent(TARGET_SKILL_ID)}`;
  const openId = `capability-skill-open:${encodeURIComponent(TARGET_SKILL_ID)}`;
  const copyId = `capability-skill-copy:${encodeURIComponent(TARGET_SKILL_ID)}`;
  const pinId = `capability-skill-pin:${encodeURIComponent(TARGET_SKILL_ID)}`;

  assertStep("PASS220_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS220_STATUS_HAS_25_SKILLS", await waitFor(win, `
    (async function() {
      const status = await window.claudexDesktop.getClaudeStatus({ projectPath: ${JSON.stringify(PROJECT_DIR)} });
      const target = status.skillItems?.find((item) => item.id === ${JSON.stringify(TARGET_SKILL_ID)});
      window.__pass220Status = status;
      return Boolean(
        status.skillItems?.length === 25 &&
        target &&
        /${TARGET_DESCRIPTION}/.test(target.description || '') &&
        /${TARGET_RELATIVE.replace(/\\/g, "\\\\")}/.test(target.relativePath || target.path || '') &&
        (target.root || '') === ${JSON.stringify(SKILL_ROOT)}
      );
    })();
  `, 15000));
  assertStep("PASS220_OPEN_CAPABILITIES", await win.webContents.executeJavaScript(`
    (function() {
      const button = [...document.querySelectorAll('.nav-stack button')]
        .find((candidate) => /\\u63d2\\u4ef6/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS220_OPEN_SKILLS_TAB", await waitFor(win, `
    (function() {
      const button = [...document.querySelectorAll('.plugin-manager-tabs button')]
        .find((candidate) => /\\u6280\\u80fd/.test(candidate.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })();
  `, 15000));
  assertStep("PASS220_DEEP_SKILL_ROW_RENDERED", await waitFor(win, `
    (function() {
      const row = document.querySelector('.skill-registry-row[data-skill-id="${TARGET_SKILL_ID}"]');
      const listText = document.querySelector('.plugin-manager-list')?.textContent || '';
      return Boolean(row) &&
        /${TARGET_DESCRIPTION}/.test(row.textContent || '') &&
        /${TARGET_SKILL_ID}/.test(listText);
    })();
  `, 15000));

  assertStep("PASS220_DEEP_SKILL_COMMAND_SEARCHABLE", await waitForCommand(win, TARGET_QUERY, skillId));
  assertStep("PASS220_OPEN_DEEP_SKILL_SURFACE", await clickCommand(win, TARGET_QUERY, skillId));
  assertStep("PASS220_DEEP_SKILL_FOCUSED", await waitFor(win, `
    (function() {
      const activeTab = document.querySelector('.plugin-manager-tabs button.active')?.textContent || '';
      const row = document.querySelector('.skill-registry-row[data-skill-id="${TARGET_SKILL_ID}"].focused-capability-row');
      const text = row?.textContent || '';
      return /\\u6280\\u80fd/.test(activeTab) &&
        Boolean(row) &&
        /${TARGET_DESCRIPTION}/.test(text) &&
        /local-skill/.test(text);
    })();
  `, 10000));

  assertStep("PASS220_DEEP_SKILL_OPEN_FILE_SEARCHABLE", await waitForCommand(win, TARGET_QUERY, openId));
  assertStep("PASS220_OPEN_DEEP_SKILL_FILE", await clickCommand(win, TARGET_QUERY, openId));
  assertStep("PASS220_DEEP_SKILL_FILE_OPENED", await waitFor(win, `
    (function() {
      const activeTool = document.querySelector('.tool-row.active')?.textContent || '';
      const head = document.querySelector('.file-editor .editor-head')?.textContent || '';
      const textarea = document.querySelector('.file-editor textarea');
      return /\\u5de5\\u4f5c\\u533a/.test(activeTool) &&
        /${TARGET_SKILL_ID}[\\\\/]SKILL\\.md/.test(head) &&
        /${TARGET_BODY}/.test(textarea?.value || '');
    })();
  `, 10000));

  assertStep("PASS220_DEEP_SKILL_COPY_SEARCHABLE", await waitForCommand(win, TARGET_QUERY, copyId, "clipboard"));
  clipboard.writeText("");
  assertStep("PASS220_COPY_DEEP_SKILL_EVIDENCE", await clickCommand(win, TARGET_QUERY, copyId));
  assertStep("PASS220_DEEP_SKILL_COPY_CLIPBOARD", await waitForClipboard([
    TARGET_SKILL_ID,
    TARGET_DESCRIPTION,
    /local-skill/,
    /SKILL\.md/,
    SKILL_ROOT,
  ]));

  assertStep("PASS220_DEEP_SKILL_PIN_SEARCHABLE", await waitForCommand(win, TARGET_QUERY, pinId, "timeline"));
  assertStep("PASS220_PIN_DEEP_SKILL_EVIDENCE", await clickCommand(win, TARGET_QUERY, pinId));
  assertStep("PASS220_DEEP_SKILL_PIN_PANEL", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const event = (state.runEvents || []).find((item) =>
        item.type === 'skill-registry' &&
        /${TARGET_SKILL_ID}/.test(item.title || '') &&
        /${TARGET_DESCRIPTION}/.test(item.stdout || '') &&
        /SKILL\\.md/.test(item.stdout || '')
      );
      const panel = document.querySelector('.selected-run-evidence-panel.ok');
      const text = panel?.textContent || '';
      return Boolean(event &&
        panel &&
        /${TARGET_SKILL_ID}/.test(text) &&
        /${TARGET_DESCRIPTION}/.test(text) &&
        /SKILL\\.md/.test(text));
    })();
  `, 12000));

  console.log("PASS220_COMMAND_PALETTE_DEEP_SKILLS_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS220_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (async function() {
          return {
            commands: window.__pass220Commands || [],
            activeTab: document.querySelector('.plugin-manager-tabs button.active')?.textContent || '',
            rows: [...document.querySelectorAll('.skill-registry-row')].map((row) => ({
              id: row.getAttribute('data-skill-id'),
              text: row.textContent,
              focused: row.classList.contains('focused-capability-row'),
            })),
            panel: document.querySelector('.selected-run-evidence-panel')?.textContent || '',
            editor: document.querySelector('.file-editor')?.textContent || '',
            statusCount: window.__pass220Status?.skillItems?.length || 0,
            targetStatus: window.__pass220Status?.skillItems?.find((item) => item.id === ${JSON.stringify(TARGET_SKILL_ID)}) || null,
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS220_DEBUG", JSON.stringify(debug, null, 2).slice(0, 12000));
      console.error("PASS220_CLIPBOARD", clipboard.readText());
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS220_TIMEOUT");
  cleanup();
  app.exit(1);
}, 100000);
