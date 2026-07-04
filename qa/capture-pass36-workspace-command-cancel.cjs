const path = require("path");
const fs = require("fs");
const { app, BrowserWindow } = require("electron");

require(path.join(__dirname, "..", "electron", "main.cjs"));

const PROJECT_PATH = path.join(__dirname, "..");
const SENTINEL = path.join(PROJECT_PATH, "qa", "pass36-command-cancel-sentinel.tmp");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(win, script, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const ok = await win.webContents.executeJavaScript(script);
    if (ok) return true;
    await wait(180);
  }
  return false;
}

function assertStep(name, ok) {
  console.log(name, ok);
  if (!ok) throw new Error(`${name} failed`);
}

async function fillWorkspaceCommand(win, command) {
  return win.webContents.executeJavaScript(`
    (function() {
      const input = document.querySelector("#workspace-tool-detail .command-runner input");
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(input, ${JSON.stringify(command)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })();
  `);
}

async function clickWorkspaceRunner(win) {
  return win.webContents.executeJavaScript(`
    (function() {
      const button = document.querySelector("#workspace-tool-detail .command-runner button");
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })();
  `);
}

app.whenReady().then(async () => {
  if (fs.existsSync(SENTINEL)) fs.rmSync(SENTINEL, { force: true });
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.error("PASS36_FAILED_NO_WINDOW");
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(500);
  await win.webContents.executeJavaScript(`
    window.claudexDesktop.setActiveProject(${JSON.stringify({ name: "Claudex", path: PROJECT_PATH })});
  `);
  await new Promise((resolve) => {
    win.webContents.once("did-finish-load", resolve);
    win.webContents.reload();
  });
  await wait(800);

  assertStep("PASS36_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid'))", 15000));
  assertStep("PASS36_OPEN_WORKSPACE", await win.webContents.executeJavaScript(`
    (function() {
      const rail = document.querySelector('.rail-button[data-tool="workspace"]');
      const panel = document.querySelector('.side-panel-button');
      const button = rail || panel;
      if (!button) return false;
      button.click();
      return true;
    })();
  `));
  assertStep("PASS36_WORKSPACE_VISIBLE", await waitFor(win, "Boolean(document.querySelector('#workspace-tool-detail .command-runner input'))", 10000));

  const command = "node -e \"const fs=require('fs');let n=0;console.log('cancel-start');const timer=setInterval(()=>console.log('tick '+(++n)),100);setTimeout(()=>{clearInterval(timer);fs.writeFileSync('qa/pass36-command-cancel-sentinel.tmp','not-cancelled');console.log('sentinel-written')},4000)\"";
  assertStep("PASS36_FILL_COMMAND", await fillWorkspaceCommand(win, command));
  assertStep("PASS36_RUN_COMMAND", await clickWorkspaceRunner(win));
  assertStep("PASS36_LIVE_OUTPUT", await waitFor(win, `
    Boolean(
      document.querySelector('#workspace-tool-detail .command-output-card.live') &&
      /cancel-start|tick/.test(document.querySelector('#workspace-tool-detail')?.textContent || '')
    )
  `, 8000));
  assertStep("PASS36_STOP_BUTTON", await waitFor(win, `
    /停止命令/.test(document.querySelector('#workspace-tool-detail .command-runner button')?.textContent || '')
  `, 5000));
  assertStep("PASS36_CLICK_CANCEL", await clickWorkspaceRunner(win));
  assertStep("PASS36_CANCELLED_HISTORY", await waitFor(win, `
    Boolean(
      !document.querySelector('#workspace-tool-detail .command-output-card.live') &&
      /命令已停止|已停止|130/.test(document.querySelector('#workspace-tool-detail')?.textContent || '')
    )
  `, 10000));
  assertStep("PASS36_BUTTON_RESTORED", await waitFor(win, `
    /运行/.test(document.querySelector('#workspace-tool-detail .command-runner button')?.textContent || '') &&
    !document.querySelector('#workspace-tool-detail .command-runner button')?.disabled
  `, 5000));
  assertStep("PASS36_SENTINEL_ABSENT", !fs.existsSync(SENTINEL));

  assertStep("PASS36_FILL_RECOVERY", await fillWorkspaceCommand(win, "node --version"));
  assertStep("PASS36_RUN_RECOVERY", await clickWorkspaceRunner(win));
  assertStep("PASS36_RECOVERY_DONE", await waitFor(win, `
    Boolean(
      !document.querySelector('#workspace-tool-detail .command-output-card.live') &&
      /node --version/.test(document.querySelector('#workspace-tool-detail')?.textContent || '')
    )
  `, 12000));

  console.log("PASS36_DONE");
  app.exit(0);
}).catch((error) => {
  if (fs.existsSync(SENTINEL)) fs.rmSync(SENTINEL, { force: true });
  console.error("PASS36_FAILED", error?.stack || error);
  app.exit(1);
});

setTimeout(() => {
  if (fs.existsSync(SENTINEL)) fs.rmSync(SENTINEL, { force: true });
  console.error("PASS36_TIMEOUT");
  app.exit(1);
}, 70000);
