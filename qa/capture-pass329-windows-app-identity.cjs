const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

function findRepoDir() {
  const candidates = [process.env.CLAUDEX_REPO_DIR, process.cwd(), __dirname, path.join(__dirname, "..")].filter(Boolean);
  for (const candidate of candidates) {
    let current = path.resolve(candidate);
    while (current && current !== path.dirname(current)) {
      if (fs.existsSync(path.join(current, "package.json")) && fs.existsSync(path.join(current, "electron", "main.cjs"))) {
        return current;
      }
      current = path.dirname(current);
    }
  }
  throw new Error("Unable to locate Claudex repo root");
}

const REPO_DIR = findRepoDir();
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass329-data-"));
const EXPECTED_APP_ID = "com.ypyik0669.claudex";
const EXPECTED_PRODUCT_NAME = "Claudex";
const appUserModelIds = [];
const originalSetAppUserModelId = app.setAppUserModelId.bind(app);

process.chdir(REPO_DIR);
app.setPath("userData", USER_DATA_DIR);
app.setAppUserModelId = (id) => {
  appUserModelIds.push(String(id || ""));
  return originalSetAppUserModelId(id);
};

function cleanup() {
  try {
    fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
  } catch (_error) {
    // best-effort cleanup
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

require(path.join(REPO_DIR, "electron", "main.cjs"));

async function runTest() {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("PASS329_FAILED_NO_WINDOW");
  const packageJson = JSON.parse(fs.readFileSync(path.join(REPO_DIR, "package.json"), "utf8"));

  assertStep("PASS329_PACKAGE_IDENTITY", packageJson.build?.appId === EXPECTED_APP_ID && packageJson.build?.productName === EXPECTED_PRODUCT_NAME);
  assertStep("PASS329_MAIN_PROCESS_NAME", app.getName() === EXPECTED_PRODUCT_NAME);
  assertStep(
    "PASS329_WINDOWS_APP_USER_MODEL_ID",
    process.platform !== "win32" || appUserModelIds.includes(EXPECTED_APP_ID),
  );
  assertStep("PASS329_IDENTITY_ASSETS", [
    path.join(REPO_DIR, "build", "icon.ico"),
    path.join(REPO_DIR, "build", "icon.png"),
    path.join(REPO_DIR, "public", "assets", "claudex-mark.png"),
    path.join(REPO_DIR, "public", "assets", "claudex-lockup.png"),
  ].every((file) => fs.existsSync(file) && fs.statSync(file).size > 0));
  assertStep("PASS329_RENDERER_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid'))", 15000));
  const rendererIdentity = await win.webContents.executeJavaScript(`
    (function() {
      const favicon = document.querySelector('link[rel~="icon"]');
      return {
        documentTitle: document.title,
        favicon: favicon?.getAttribute('href') || '',
        ok: document.title === ${JSON.stringify(EXPECTED_PRODUCT_NAME)} &&
          new URL(favicon?.href || '', document.baseURI).pathname.endsWith('/assets/claudex-mark.png'),
      };
    })();
  `);
  console.log("PASS329_RENDERER_IDENTITY", rendererIdentity);
  assertStep("PASS329_WINDOW_AND_RENDERER_IDENTITY", win.getTitle() === EXPECTED_PRODUCT_NAME && rendererIdentity?.ok);
  console.log("PASS329_WINDOWS_APP_IDENTITY_DONE");
  cleanup();
  app.exit(0);
}

app.whenReady().then(runTest).catch((error) => {
  console.error("PASS329_WINDOWS_APP_IDENTITY_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS329_WINDOWS_APP_IDENTITY_TIMEOUT");
  cleanup();
  app.exit(1);
}, 90000);
