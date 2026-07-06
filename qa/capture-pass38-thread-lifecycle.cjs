const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const REPO_DIR = path.join(__dirname, "..");
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass38-data-"));
const PROJECT_A = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass38-project-a-"));
const PROJECT_B = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-pass38-project-b-"));

function cleanup() {
  for (const dir of [USER_DATA_DIR, PROJECT_A, PROJECT_B]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_error) {
      // best-effort cleanup
    }
  }
}

app.setPath("userData", USER_DATA_DIR);

fs.mkdirSync(USER_DATA_DIR, { recursive: true });
fs.writeFileSync(path.join(PROJECT_A, "package.json"), JSON.stringify({ name: "project-a" }), "utf8");
fs.writeFileSync(path.join(PROJECT_B, "package.json"), JSON.stringify({ name: "project-b" }), "utf8");
fs.writeFileSync(
  path.join(USER_DATA_DIR, "desktop-data.json"),
  JSON.stringify(
    {
      version: 1,
      activeProject: { name: "Project A", path: PROJECT_A },
      projects: [
        { name: "Project A", path: PROJECT_A },
        { name: "Project B", path: PROJECT_B },
      ],
      sessions: [
        {
          id: "project-b-history",
          title: "Project B hidden thread",
          project: "Project B",
          projectPath: PROJECT_B,
          createdAt: "2026-07-05T00:00:00.000Z",
          updatedAt: "2026-07-05T00:09:00.000Z",
          messages: [{ role: "user", content: "Project B should be hidden while A is active", createdAt: "2026-07-05T00:00:00.000Z" }],
        },
        {
          id: "project-a-archived",
          title: "Archived A thread",
          project: "Project A",
          projectPath: PROJECT_A,
          createdAt: "2026-07-05T00:01:00.000Z",
          updatedAt: "2026-07-05T00:08:00.000Z",
          archived: true,
          messages: [{ role: "user", content: "Archived A should stay hidden", createdAt: "2026-07-05T00:01:00.000Z" }],
        },
        {
          id: "project-a-active",
          title: "Active A thread",
          project: "Project A",
          projectPath: PROJECT_A,
          createdAt: "2026-07-05T00:02:00.000Z",
          updatedAt: "2026-07-05T00:07:00.000Z",
          messages: [
            { role: "user", content: "pass38 active project thread", createdAt: "2026-07-05T00:02:00.000Z" },
            { role: "assistant", content: "pass38 response", createdAt: "2026-07-05T00:03:00.000Z" },
          ],
        },
      ],
    },
    null,
    2,
  ),
  "utf8",
);

require(path.join(REPO_DIR, "electron", "main.cjs"));

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

app.whenReady().then(async () => {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.error("PASS38_FAILED_NO_WINDOW");
    cleanup();
    app.exit(1);
    return;
  }

  win.setBounds({ x: 0, y: 0, width: 1480, height: 960 });
  await wait(700);

  assertStep("PASS38_READY", await waitFor(win, "Boolean(document.querySelector('.app-grid') && window.claudexDesktop)", 15000));

  assertStep("PASS38_PROJECT_FILTERS_AND_SELECTS_VISIBLE_THREAD", await waitFor(win, `
    (function() {
      const rows = Array.from(document.querySelectorAll('.thread-list .thread-item'));
      const listText = document.querySelector('.thread-list')?.textContent || '';
      const scopeText = document.querySelector('.chat-scope-toggle')?.textContent || '';
      const scopeButtons = Array.from(document.querySelectorAll('.chat-scope-toggle button'));
      const scopeCounts = scopeButtons.map((button) => button.querySelector('em')?.textContent || '').join('|');
      const scopeSummary = document.querySelector('.thread-scope-summary')?.textContent || '';
      const headerText = document.querySelector('.thread-header')?.textContent || document.body.textContent || '';
      return rows.length === 1 &&
        /Active A thread/.test(rows[0].textContent || '') &&
        /Active A thread/.test(headerText) &&
        /\\u5f53\\u524d\\u9879\\u76ee/.test(scopeText) &&
        /\\u5168\\u90e8\\u9879\\u76ee/.test(scopeText) &&
        /\\u67e5\\u770b\\u5f52\\u6863/.test(scopeText) &&
        scopeCounts === '1|2|1' &&
        /Project A/.test(scopeSummary) &&
        /当前项目 1 条/.test(scopeSummary) &&
        /查看归档 1/.test(scopeSummary) &&
        !/Project B hidden thread/.test(listText) &&
        !/Archived A thread/.test(listText);
    })();
  `, 10000));

  assertStep("PASS38_ALL_PROJECT_HISTORY_TOGGLE", await waitFor(win, `
    (async function() {
      if (!window.__pass38AllProjectsClicked) {
        window.__pass38AllProjectsClicked = true;
        const button = document.querySelector('.chat-scope-toggle button[data-thread-scope="all"]');
        if (!button) return false;
        button.click();
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      const rows = Array.from(document.querySelectorAll('.thread-list .thread-item'));
      const listText = document.querySelector('.thread-list')?.textContent || '';
      const scopeSummary = document.querySelector('.thread-scope-summary')?.textContent || '';
      return rows.length === 2 &&
        /全部项目 2 条/.test(scopeSummary) &&
        /Active A thread/.test(listText) &&
        /Project B hidden thread/.test(listText) &&
        !/Archived A thread/.test(listText);
    })();
  `, 10000));

  assertStep("PASS38_CURRENT_PROJECT_TOGGLE", await waitFor(win, `
    (async function() {
      if (!window.__pass38CurrentProjectClicked) {
        window.__pass38CurrentProjectClicked = true;
        const button = document.querySelector('.chat-scope-toggle button[data-thread-scope="current"]');
        if (!button) return false;
        button.click();
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      const rows = Array.from(document.querySelectorAll('.thread-list .thread-item'));
      const listText = document.querySelector('.thread-list')?.textContent || '';
      return rows.length === 1 &&
        /Active A thread/.test(rows[0].textContent || '') &&
        !/Project B hidden thread/.test(listText) &&
        !/Archived A thread/.test(listText);
    })();
  `, 10000));

  assertStep("PASS38_ARCHIVED_SCOPE_SHOWS_ARCHIVED", await waitFor(win, `
    (async function() {
      if (!window.__pass38ArchivedScopeClicked) {
        window.__pass38ArchivedScopeClicked = true;
        const button = document.querySelector('.chat-scope-toggle button[data-thread-scope="archived"]');
        if (!button) return false;
        button.click();
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      const rows = Array.from(document.querySelectorAll('.thread-list .thread-item'));
      const listText = document.querySelector('.thread-list')?.textContent || '';
      const scopeSummary = document.querySelector('.thread-scope-summary')?.textContent || '';
      const active = document.querySelector('.thread-list .thread-item.active')?.textContent || '';
      return rows.length === 1 &&
        /查看归档 1 条/.test(scopeSummary) &&
        /Archived A thread/.test(rows[0].textContent || '') &&
        /Archived A thread/.test(active) &&
        !/Active A thread|Project B hidden thread/.test(listText);
    })();
  `, 10000));

  assertStep("PASS38_RESTORE_ARCHIVED_THREAD", await waitFor(win, `
    (async function() {
      if (!window.__pass38RestoreArchivedClicked) {
        window.__pass38RestoreArchivedClicked = true;
        const row = document.querySelector('.thread-list .thread-item[data-thread-id="project-a-archived"]');
        const restore = row?.querySelector('[data-thread-action="restore"]');
        if (!restore) return false;
        restore.click();
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
      const state = await window.claudexDesktop.getState();
      const rows = Array.from(document.querySelectorAll('.thread-list .thread-item'));
      const listText = document.querySelector('.thread-list')?.textContent || '';
      const scopeCounts = Array.from(document.querySelectorAll('.chat-scope-toggle button')).map((button) => button.querySelector('em')?.textContent || '').join('|');
      return state.sessions.find((item) => item.id === 'project-a-archived')?.archived === false &&
        rows.length === 2 &&
        scopeCounts === '2|3|0' &&
        /Archived A thread/.test(listText) &&
        /Active A thread/.test(listText);
    })();
  `, 10000));

  assertStep("PASS38_REARCHIVE_RESTORED_THREAD", await waitFor(win, `
    (async function() {
      if (!window.__pass38RearchiveRestoredClicked) {
        window.__pass38RearchiveRestoredClicked = true;
        const row = document.querySelector('.thread-list .thread-item[data-thread-id="project-a-archived"]');
        const archive = row?.querySelector('[data-thread-action="archive"]');
        if (!archive) return false;
        archive.click();
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
      const state = await window.claudexDesktop.getState();
      const rows = Array.from(document.querySelectorAll('.thread-list .thread-item'));
      const scopeCounts = Array.from(document.querySelectorAll('.chat-scope-toggle button')).map((button) => button.querySelector('em')?.textContent || '').join('|');
      return state.sessions.find((item) => item.id === 'project-a-archived')?.archived === true &&
        rows.length === 1 &&
        scopeCounts === '1|2|1' &&
        /Active A thread/.test(rows[0].textContent || '');
    })();
  `, 10000));

  assertStep("PASS38_PIN_THREAD", await win.webContents.executeJavaScript(`
    (async function() {
      const row = document.querySelector('.thread-list .thread-item[data-thread-id="project-a-active"]');
      const pin = row?.querySelector('[data-thread-action="pin"]');
      if (!pin) return false;
      pin.click();
      await new Promise((resolve) => setTimeout(resolve, 450));
      const state = await window.claudexDesktop.getState();
      return document.querySelector('.thread-list .thread-item.pinned-thread') &&
        state.sessions.find((item) => item.id === 'project-a-active')?.pinned === true;
    })();
  `));

  assertStep("PASS38_RENAME_THREAD", await win.webContents.executeJavaScript(`
    (async function() {
      window.prompt = () => 'Renamed A thread';
      const row = document.querySelector('.thread-list .thread-item[data-thread-id="project-a-active"]');
      const rename = row?.querySelector('[data-thread-action="rename"]');
      if (!rename) return false;
      rename.click();
      await new Promise((resolve) => setTimeout(resolve, 450));
      const state = await window.claudexDesktop.getState();
      return /Renamed A thread/.test(document.querySelector('.thread-list')?.textContent || '') &&
        state.sessions.find((item) => item.id === 'project-a-active')?.title === 'Renamed A thread';
    })();
  `));

  assertStep("PASS38_FORK_THREAD_AND_SELECT_FORK", await waitFor(win, `
    (async function() {
      if (!window.__pass38ForkClicked) {
        window.__pass38ForkClicked = true;
        const row = document.querySelector('.thread-list .thread-item[data-thread-id="project-a-active"]');
        const fork = row?.querySelector('[data-thread-action="fork"]');
        if (!fork) return false;
        fork.click();
      }
      await new Promise((resolve) => setTimeout(resolve, 450));
      const rows = Array.from(document.querySelectorAll('.thread-list .thread-item'));
      const active = document.querySelector('.thread-list .thread-item.active');
      return rows.length === 2 &&
        rows.some((item) => /Fork: Renamed A thread/.test(item.textContent || '')) &&
        /Fork: Renamed A thread/.test(active?.textContent || '');
    })();
  `, 10000));

  assertStep("PASS38_ARCHIVE_ORIGINAL", await waitFor(win, `
    (async function() {
      if (!window.__pass38ArchiveClicked) {
        window.__pass38ArchiveClicked = true;
        const original = document.querySelector('.thread-list .thread-item[data-thread-id="project-a-active"]');
        const archive = original?.querySelector('[data-thread-action="archive"]');
        if (!archive) return false;
        archive.click();
      }
      await new Promise((resolve) => setTimeout(resolve, 450));
      const rows = Array.from(document.querySelectorAll('.thread-list .thread-item'));
      const state = await window.claudexDesktop.getState();
      return rows.length === 1 &&
        /Fork: Renamed A thread/.test(rows[0].textContent || '') &&
        state.sessions.find((item) => item.id === 'project-a-active')?.archived === true;
    })();
  `, 10000));

  assertStep("PASS38_DELETE_LAST_VISIBLE_CREATES_PROJECT_DRAFT", await waitFor(win, `
    (async function() {
      if (!window.__pass38DeleteClicked) {
        window.__pass38DeleteClicked = true;
        window.confirm = () => true;
        const forkRow = Array.from(document.querySelectorAll('.thread-list .thread-item')).find((item) => /Fork: Renamed A thread/.test(item.textContent || ''));
        const del = forkRow?.querySelector('[data-thread-action="delete"]');
        if (!del) return false;
        del.click();
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
      const rows = Array.from(document.querySelectorAll('.thread-list .thread-item'));
      const state = await window.claudexDesktop.getState();
      const activeProjectDraft = state.sessions.find((item) =>
        item.projectPath === ${JSON.stringify(PROJECT_A)} &&
        !item.archived &&
        (!item.messages || item.messages.length === 0) &&
        /新聊天|New chat/.test(item.title || '')
      );
      return rows.length === 1 &&
        /新聊天|New chat/.test(rows[0].textContent || '') &&
        !/Fork: Renamed A thread/.test(rows[0].textContent || '') &&
        Boolean(activeProjectDraft);
    })();
  `, 10000));

  assertStep("PASS38_PROJECT_SWITCH_FILTERS_TO_PROJECT_B", await waitFor(win, `
    (async function() {
      if (!window.__pass38ProjectBClicked) {
        window.__pass38ProjectBClicked = true;
        const projectButton = Array.from(document.querySelectorAll('.project-list button[data-project-path]')).find((button) => button.dataset.projectPath === ${JSON.stringify(PROJECT_B)});
        if (!projectButton) return false;
        projectButton.click();
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
      const rows = Array.from(document.querySelectorAll('.thread-list .thread-item'));
      const listText = document.querySelector('.thread-list')?.textContent || '';
      const scopeCounts = Array.from(document.querySelectorAll('.chat-scope-toggle button')).map((button) => button.querySelector('em')?.textContent || '').join('|');
      const scopeSummary = document.querySelector('.thread-scope-summary')?.textContent || '';
      return rows.length === 1 &&
        scopeCounts === '1|2|0' &&
        /Project B/.test(scopeSummary) &&
        /当前项目 1 条/.test(scopeSummary) &&
        /Project B hidden thread/.test(rows[0].textContent || '') &&
        !/Renamed A thread|Fork: Renamed A thread|Archived A thread/.test(listText);
    })();
  `, 10000));

  assertStep("PASS38_COMMAND_PALETTE_DEEP_LINKS", await waitFor(win, `
    (async function() {
      if (!window.__pass38OpenedChanges) {
        window.__pass38OpenedChanges = true;
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 200));
        const input = document.querySelector('.command-search input');
        if (!input) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, 'git diff');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 100));
        document.querySelector('.command-list button')?.click();
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      const changesOpen = Boolean(document.querySelector('.bottom-work-panel .git-diff-preview'));
      if (!changesOpen) return false;
      if (!window.__pass38OpenedWorkspace) {
        window.__pass38OpenedWorkspace = true;
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 200));
        const input = document.querySelector('.command-search input');
        if (!input) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, 'workspace files');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 100));
        document.querySelector('.command-list button')?.click();
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
      return Boolean(document.querySelector('.tools-panel .tool-row.active[aria-controls="workspace-tool-detail"]')) &&
        !document.querySelector('.app-grid')?.classList.contains('right-panel-hidden');
    })();
  `, 15000));

  console.log("PASS38_THREAD_LIFECYCLE_DONE");
  cleanup();
  app.exit(0);
}).catch((error) => {
  console.error("PASS38_THREAD_LIFECYCLE_FAILED", error?.stack || error);
  cleanup();
  app.exit(1);
});

setTimeout(() => {
  console.error("PASS38_THREAD_LIFECYCLE_TIMEOUT");
  cleanup();
  app.exit(1);
}, 80000);
