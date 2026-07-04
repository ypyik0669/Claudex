const path = require("path");
const fs = require("fs");
const { app, BrowserWindow } = require("electron");

require(path.join(__dirname, "..", "electron", "main.cjs"));

const BREAKPOINTS = [
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "1480x960", width: 1480, height: 960 },
  { name: "1240x900", width: 1240, height: 900 },
  { name: "860x900", width: 860, height: 900 },
  { name: "560x900", width: 560, height: 900 },
];

app.whenReady().then(async () => {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.error("CAPTURE_FAILED_NO_WINDOW");
    app.exit(1);
    return;
  }
  win.setMinimumSize(1, 1);
  for (const bp of BREAKPOINTS) {
    win.setBounds({ x: 0, y: 0, width: bp.width, height: bp.height });
    await new Promise((resolve) => setTimeout(resolve, 500));
    const image = await win.webContents.capturePage();
    const outPath = path.join(__dirname, `breakpoint-${bp.name}.png`);
    fs.writeFileSync(outPath, image.toPNG());
    console.log("CAPTURED", bp.name, outPath);
  }
  console.log("CAPTURE_DONE");
  app.exit(0);
});

setTimeout(() => {
  console.error("CAPTURE_TIMEOUT");
  app.exit(1);
}, 30000);
