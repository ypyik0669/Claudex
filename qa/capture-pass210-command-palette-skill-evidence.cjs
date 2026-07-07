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

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass210-data-"));
const FAKE_BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass210-bin-"));
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass210-project-"));
const SKILL_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass210-skills-"));
const DATA_FILE = path.join(USER_DATA_DIR, "desktop-data.json");
const FAKE_CLAUDE = path.join(FAKE_BIN_DIR, "claude.cmd");
const SKILL_ID = "pass210-skill-copy-pin";
const SKILL_RELATIVE = path.join(SKILL_ID, "SKILL.md");
const SKILL_FILE = path.join(SKILL_ROOT, SKILL_RELATIVE);

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

function writeInitialStore() {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(FAKE_BIN_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(SKILL_FILE), { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "package.json"), JSON.stringify({ name: "pass210-project" }), "utf8");
  fs.writeFileSync(
    SKILL_FILE,
    [
      "---",
      `name: ${SKILL_ID}`,
      "description: PASS210 unique registry command palette evidence",
      "---",
      "",
      "# PASS210 Skill",
      "",
      "This real local SKILL.md is scanned through CLAUDEX_SKILL_ROOTS for PASS210.",
      "",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    FAKE_CLAUDE,
    [
      "@echo off",
      "if \"%1\"==\"--version\" (echo claude fake pass210& exit /b 0)",
      "if \"%1\"==\"auth\" (echo {\"loggedIn\":true,\"apiProvider\":\"qa\",\"authMethod\":\"api_key\"}& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" if \"%3\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"list\" (echo Installed plugins: none& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" if \"%4\"==\"--json\" (echo []& exit /b 0)",
      "if \"%1\"==\"plugin\" if \"%2\"==\"marketplace\" if \"%3\"==\"list\" (echo Configured marketplaces: none& exit /b 0)",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" (echo pass210-mcp: connected & exit /b 0)",
      "echo pass210 ok %*",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  process.env.PATH = `${FAKE_BIN_DIR}${path.delimiter}${process.env.PATH || ""}`;
  process.env.CLAUDEX_SKILL_ROOTS = SKILL_ROOT;

  const project = { name: "pass210-project", path: PROJECT_DIR };
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
        id: "pass210-session",
        title: "PASS210 skill palette evidence",
        project: project.name,
        projectPath: PROJECT_DIR,
        createdAt: "2026-07-08T02:10:00.000Z",
        updatedAt: "2026-07-08T02:10:00.000Z",
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
      return true;
    })();
  `);
}

async function waitForCommand(win, query, expectedId, target, timeoutMs = 12000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await openPaletteWithQuery(win, query);
    const ok = await win.webContents.executeJavaScript(`
      (function() {
        const button = [...document.querySelectorAll('.command-modal .command-list button')]
          .find((candidate) => (candidate.getAttribute('data-command-id') || '') === ${JSON.stringify(expectedId)});
        const text = button?.textContent || '';
        return Boolean(button &&
          button.getAttribute('data-command-target') === ${JSON.stringify(target)} &&
          /${SKILL_ID}/.test(text));
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
  console.error("PASS210_CLIPBOARD_DEBUG", clipboard.readText());
  return false;
}

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS210_FAILED_NO_WINDOW");
  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  const copyId = `capability-skill-copy:${encodeURIComponent(SKILL_ID)}`;
  const pinId = `capability-skill-pin:${encodeURIComponent(SKILL_ID)}`;

  assertStep("PASS210_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));
  assertStep("PASS210_SKILL_COPY_COMMAND_SEARCHABLE", await waitForCommand(win, "copy evidence pass210 unique registry", copyId, "clipboard"));
  clipboard.writeText("");
  assertStep("PASS210_CLICK_SKILL_COPY", await clickCommand(win, "copy evidence pass210 unique registry", copyId));
  assertStep("PASS210_SKILL_COPY_CLIPBOARD", await waitForClipboard([
    /pass210-skill-copy-pin/,
    /PASS210 unique registry command palette evidence/,
    /local-skill/,
    /SKILL\.md/,
    SKILL_ROOT,
  ]));

  assertStep("PASS210_SKILL_PIN_COMMAND_SEARCHABLE", await waitForCommand(win, "pin evidence pass210 unique registry", pinId, "timeline"));
  assertStep("PASS210_CLICK_SKILL_PIN", await clickCommand(win, "pin evidence pass210 unique registry", pinId));
  assertStep("PASS210_SKILL_PIN_STATE", await waitFor(win, `
    (async function() {
      const state = await window.claudexDesktop.getState();
      const event = (state.runEvents || []).find((item) =>
        item.type === 'skill-registry' &&
        /pass210-skill-copy-pin/.test(item.title || '') &&
        /PASS210 unique registry command palette evidence/.test(item.stdout || '') &&
        /SKILL\\.md/.test(item.stdout || '')
      );
      window.__PASS210_EVENT_ID__ = event?.id || '';
      return Boolean(event);
    })();
  `, 10000));
  assertStep("PASS210_SKILL_PIN_EVIDENCE_PANEL", await waitFor(win, `
    (function() {
      const eventId = window.__PASS210_EVENT_ID__ || '';
      const row = [...document.querySelectorAll('.run-timeline-row')]
        .find((item) => /pass210-skill-copy-pin/.test(item.textContent || ''));
      const panel = document.querySelector('.selected-run-evidence-panel.ok');
      const text = panel?.textContent || '';
      return Boolean(eventId &&
        row &&
        row.querySelector('[data-run-event-type="skill-registry"]') &&
        panel &&
        panel.querySelector('[data-run-event-type="skill-registry"]') &&
        /pass210-skill-copy-pin/.test(text) &&
        /PASS210 unique registry command palette evidence/.test(text) &&
        /SKILL\.md/.test(text));
    })();
  `, 12000));

  console.log("PASS210_COMMAND_PALETTE_SKILL_EVIDENCE_DONE");
  cleanup();
  app.exit(0);
}

app.setPath("userData", USER_DATA_DIR);
writeInitialStore();
require(path.join(REPO_DIR, "electron", "main.cjs"));
app.whenReady().then(runTest).catch((error) => {
  console.error("PASS210_FAILED", error?.stack || error);
  Promise.resolve()
    .then(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const debug = await win.webContents.executeJavaScript(`
        (async function() {
          return {
            commands: [...document.querySelectorAll('.command-modal .command-list button')].map((button) => ({
              id: button.getAttribute('data-command-id'),
              target: button.getAttribute('data-command-target'),
              text: button.textContent,
            })),
            panel: document.querySelector('.selected-run-evidence-panel')?.textContent || '',
            timeline: [...document.querySelectorAll('.run-timeline-row')].map((row) => row.textContent),
            body: document.body?.textContent?.slice(0, 6000) || '',
            state: await window.claudexDesktop.getState().catch((stateError) => ({ error: String(stateError?.message || stateError) })),
          };
        })();
      `).catch((debugError) => ({ error: String(debugError?.message || debugError) }));
      console.error("PASS210_DEBUG", JSON.stringify(debug, null, 2).slice(0, 12000));
      console.error("PASS210_CLIPBOARD", clipboard.readText());
    })
    .finally(() => {
      cleanup();
      app.exit(1);
    });
});

setTimeout(() => {
  console.error("PASS210_TIMEOUT");
  console.error("PASS210_CLIPBOARD", clipboard.readText());
  cleanup();
  app.exit(1);
}, 90000);
