const { contextBridge, ipcRenderer } = require("electron");

const desktopApi = {
  getState: () => ipcRenderer.invoke("app:get-state"),
  onStateUpdate: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on("app:state-updated", listener);
    return () => ipcRenderer.removeListener("app:state-updated", listener);
  },
  saveSettings: (settings) => ipcRenderer.invoke("app:save-settings", settings),
  saveCapabilities: (capabilities) => ipcRenderer.invoke("app:save-capabilities", capabilities),
  recordNotice: (payload) => ipcRenderer.invoke("notice:record", payload),
  recordRunEvent: (payload) => ipcRenderer.invoke("run-event:record", payload),
  dismissNotice: (payload) => ipcRenderer.invoke("notice:dismiss", payload),
  clearNotices: () => ipcRenderer.invoke("notice:clear"),
  createAutomation: (payload) => ipcRenderer.invoke("automation:create", payload),
  setAutomationEnabled: (payload) => ipcRenderer.invoke("automation:set-enabled", payload),
  deleteAutomation: (payload) => ipcRenderer.invoke("automation:delete", payload),
  runAutomationNow: (payload) => ipcRenderer.invoke("automation:run-now", payload),
  cancelAutomation: (payload) => ipcRenderer.invoke("automation:cancel", payload),
  runSubagent: (payload) => ipcRenderer.invoke("subagent:run", payload),
  cancelSubagent: (payload) => ipcRenderer.invoke("subagent:cancel", payload),
  archiveSubagent: (payload) => ipcRenderer.invoke("subagent:archive", payload),
  continueSubagent: (payload) => ipcRenderer.invoke("subagent:continue", payload),
  onSubagentStream: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on("subagent:stream-event", listener);
    return () => ipcRenderer.removeListener("subagent:stream-event", listener);
  },
  selectProject: () => ipcRenderer.invoke("app:select-project"),
  setActiveProject: (project) => ipcRenderer.invoke("app:set-active-project", project),
  createSession: (title) => ipcRenderer.invoke("chat:create-session", title),
  updateSession: (payload) => ipcRenderer.invoke("chat:update-session", payload),
  deleteSession: (sessionId) => ipcRenderer.invoke("chat:delete-session", sessionId),
  forkSession: (sessionId) => ipcRenderer.invoke("chat:fork-session", sessionId),
  sendMessage: (payload) => ipcRenderer.invoke("chat:send-message", payload),
  cancelRequest: (requestId) => ipcRenderer.invoke("chat:cancel-request", requestId),
  onChatStream: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on("chat:stream-event", listener);
    return () => ipcRenderer.removeListener("chat:stream-event", listener);
  },
  openDataFile: () => ipcRenderer.invoke("app:open-data-file"),
  openProject: (projectPath) => ipcRenderer.invoke("app:open-project", projectPath),
  openTerminal: (projectPath) => ipcRenderer.invoke("app:open-terminal", projectPath),
  openClaudeTerminal: (payload) => ipcRenderer.invoke("app:open-claude-terminal", payload),
  openBrowserUrl: (url) => ipcRenderer.invoke("app:open-browser-url", url),
  recordBrowserVisit: (payload) => ipcRenderer.invoke("browser:record-visit", payload),
  listIdeOptions: () => ipcRenderer.invoke("app:list-ide-options"),
  openIde: (payload) => ipcRenderer.invoke("app:open-ide", payload),
  getEnvironment: (payload) => ipcRenderer.invoke("app:get-environment", payload),
  getClaudeStatus: (payload) => ipcRenderer.invoke("claude:status", payload),
  runClaudeCommand: (payload) => ipcRenderer.invoke("claude:run", payload),
  onClaudeRunStream: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on("claude:run-stream-event", listener);
    return () => ipcRenderer.removeListener("claude:run-stream-event", listener);
  },
  listWorkspaceFiles: (payload) => ipcRenderer.invoke("workspace:list-files", payload),
  searchWorkspaceFiles: (payload) => ipcRenderer.invoke("workspace:search-files", payload),
  readWorkspaceFile: (payload) => ipcRenderer.invoke("workspace:read-file", payload),
  saveWorkspaceFile: (payload) => ipcRenderer.invoke("workspace:save-file", payload),
  saveWorkspaceFileAs: (payload) => ipcRenderer.invoke("workspace:save-file-as", payload),
  runWorkspaceCommand: (payload) => ipcRenderer.invoke("workspace:run-command", payload),
  cancelWorkspaceCommand: (payload) => ipcRenderer.invoke("workspace:cancel-command", payload),
  onWorkspaceCommandStream: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on("workspace:command-stream-event", listener);
    return () => ipcRenderer.removeListener("workspace:command-stream-event", listener);
  },
  isDesktop: true,
};

contextBridge.exposeInMainWorld("claudexDesktop", desktopApi);
contextBridge.exposeInMainWorld("claudeDesktop", desktopApi);
