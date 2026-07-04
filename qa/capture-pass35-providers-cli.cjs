const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const PROJECT_PATH = path.join(__dirname, "..");
const QA_DIR = path.join(PROJECT_PATH, "qa");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass35-providers-cli-"));

app.setPath("userData", USER_DATA_DIR);

fs.mkdirSync(USER_DATA_DIR, { recursive: true });
fs.writeFileSync(
  path.join(USER_DATA_DIR, "desktop-data.json"),
  JSON.stringify(
    {
      version: 1,
      settings: {
        provider: "openai-compatible",
        model: "sonnet",
        baseUrl: "https://api.openai.com/v1",
        temperature: 0.2,
        timeoutMs: 600000,
        language: "zh",
        appearance: { fontSize: "compact", density: "compact" },
        systemPrompt: "QA",
        claudeCode: {
          executionMode: "claude-code",
          claudeCommand: "claude",
          permissionMode: "default",
        },
        capabilities: {},
        customMarketplaces: [],
        apiKeys: {},
      },
      activeProject: { name: "claude-code-app", path: PROJECT_PATH },
      projects: [{ name: "claude-code-app", path: PROJECT_PATH }],
      sessions: [
        {
          id: "default",
          title: "新聊天",
          project: "claude-code-app",
          projectPath: PROJECT_PATH,
          createdAt: "2026-07-05T00:00:00.000Z",
          updatedAt: "2026-07-05T00:00:00.000Z",
          messages: [],
        },
      ],
    },
    null,
    2,
  ),
  "utf8",
);

require(path.join(PROJECT_PATH, "electron", "main.cjs"));

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

async function shot(win, name) {
  await win.webContents.executeJavaScript("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  await wait(250);
  const image = await win.webContents.capturePage();
  const outPath = path.join(QA_DIR, name);
  fs.writeFileSync(outPath, image.toPNG());
  console.log("CAPTURED", outPath);
}

app.whenReady().then(async () => {
  fs.mkdirSync(QA_DIR, { recursive: true });
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("没有找到应用窗口。");

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(500);

  assertStep("PASS35_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid'))", 15000));
  assertStep("PASS35_SETTINGS_OPEN", await win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector('.account-row button');
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS35_SETTINGS_SURFACE", await waitFor(win, "Boolean(document.querySelector('.settings-workspace'))", 5000));

  assertStep("PASS35_ADVANCED_OPEN", await win.webContents.executeJavaScript(`
    (function() {
      const summary = [...document.querySelectorAll('.settings-inline-disclosure summary')]
        .find((candidate) => (candidate.textContent || '').includes('高级 Claude Code'));
      if (!summary) return false;
      summary.click();
      return true;
    })();
  `));
  assertStep("PASS35_ADVANCED_FIELDS", await waitFor(win, `
    ['推理强度', 'Agent', '允许工具', '禁止工具', 'MCP 配置', '插件 URL', '额外 Claude 参数']
      .every((label) => document.body.textContent.includes(label))
  `, 5000));
  await shot(win, "pass35-advanced-claude.png");

  assertStep("PASS35_SWITCH_API", await win.webContents.executeJavaScript(`
    (function() {
      const label = [...document.querySelectorAll('.settings-grid label')]
        .find((candidate) => (candidate.textContent || '').includes('执行方式'));
      const select = label?.querySelector('select');
      if (!select) return false;
      select.value = 'api';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })();
  `));
  assertStep("PASS35_PROVIDER_OPTIONS", await waitFor(win, `
    (function() {
      const select = [...document.querySelectorAll('select')]
        .find((candidate) => [...candidate.options].some((option) => option.value === 'deepseek'));
      if (!select) return false;
      const values = [...select.options].map((option) => option.value);
      return ['openrouter', 'deepseek', 'minimax', 'xiaomi-mimo', 'lm-studio', 'anthropic', 'ollama']
        .every((value) => values.includes(value));
    })()
  `, 5000));
  assertStep("PASS35_SELECT_MIMO", await win.webContents.executeJavaScript(`
    (function() {
      const select = [...document.querySelectorAll('select')]
        .find((candidate) => [...candidate.options].some((option) => option.value === 'xiaomi-mimo'));
      if (!select) return false;
      select.value = 'xiaomi-mimo';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })();
  `));
  assertStep("PASS35_MIMO_AUTH_HINT", await waitFor(win, "document.body.textContent.includes('api-key 请求头')", 5000));
  await shot(win, "pass35-provider-mimo.png");

  console.log("PASS35_DONE");
  app.exit(0);
}).catch((error) => {
  console.error("PASS35_FAILED", error?.stack || error);
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS35_TIMEOUT");
  app.exit(1);
}, 70000);
