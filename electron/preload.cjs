const { contextBridge, ipcRenderer } = require("electron");

const desktopApi = {
  getState: () => ipcRenderer.invoke("app:get-state"),
  saveSettings: (settings) => ipcRenderer.invoke("app:save-settings", settings),
  saveCapabilities: (capabilities) => ipcRenderer.invoke("app:save-capabilities", capabilities),
  selectProject: () => ipcRenderer.invoke("app:select-project"),
  setActiveProject: (project) => ipcRenderer.invoke("app:set-active-project", project),
  createSession: (title) => ipcRenderer.invoke("chat:create-session", title),
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
  readWorkspaceFile: (payload) => ipcRenderer.invoke("workspace:read-file", payload),
  saveWorkspaceFile: (payload) => ipcRenderer.invoke("workspace:save-file", payload),
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
