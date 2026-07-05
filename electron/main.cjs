const { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const DEFAULT_SYSTEM_PROMPT =
  "你是一名务实的资深编程助手。回答要简洁、准确，并专注于可执行的实现。";
const OPENAI_COMPATIBLE_PROVIDERS = new Set([
  "openai-compatible",
  "openrouter",
  "deepseek",
  "minimax",
  "xiaomi-mimo",
  "lm-studio",
]);
const PROVIDER_ENV_KEYS = {
  anthropic: ["ANTHROPIC_API_KEY"],
  "openai-compatible": ["OPENAI_API_KEY"],
  openrouter: ["OPENROUTER_API_KEY", "OPENAI_API_KEY"],
  deepseek: ["DEEPSEEK_API_KEY", "OPENAI_API_KEY"],
  minimax: ["MINIMAX_API_KEY", "OPENAI_API_KEY"],
  "xiaomi-mimo": ["MIMO_API_KEY", "XIAOMI_MIMO_API_KEY", "OPENAI_API_KEY"],
  "lm-studio": [],
};
const DEFAULT_CAPABILITIES = {
  "project-context": true,
  "code-review": true,
  "implementation-plan": true,
  "terminal-helper": true,
  "mcp-runtime": true,
  "plugin-router": true,
  "marketplace-router": true,
  "custom-marketplaces": false,
  debugger: false,
  "docs-writer": false,
  "test-writer": false,
};
const CAPABILITY_CONTEXT = {
  "project-context": "用户请求代码或文件工作时，把当前项目文件夹作为工作上下文。",
  "code-review": "做代码审查时，优先指出缺陷、回归风险、实现风险和缺失测试，再给摘要。",
  "implementation-plan": "非平凡实现工作需要给出具体步骤和验证命令。",
  "terminal-helper": "建议终端命令时，要写清楚命令并绑定到当前项目路径。",
  "mcp-runtime": "暴露 Claude Code MCP 状态，并通过 Claude Code CLI 命令处理 MCP 配置工作。",
  "plugin-router": "自动考虑已启用的插件、技能和工具，不要求用户手动输入斜杠命令。",
  "marketplace-router": "用户要发现或安装插件时，使用 Claude Code 插件市场命令。",
  "custom-marketplaces": "把已保存的自定义插件市场 URL 作为用户提供的插件来源。",
  debugger: "调试时先复现问题、形成假设，并聚焦根因修复。",
  "docs-writer": "需要文档时，写简洁、可操作的使用说明。",
  "test-writer": "需要测试时，优先通过公开接口写行为测试。",
};
const activeRequests = new Map();
const IGNORED_DIRS = new Set([".git", "node_modules", "dist", "build", "release", ".npm-cache", ".next", "coverage"]);
const IGNORED_DIR_PATTERNS = [/^release/i, /^out$/i, /^tmp$/i, /^temp$/i];
const PROJECT_MARKERS = [
  ".git",
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  "CONTEXT.md",
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
];
const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;
const MAX_COMMAND_OUTPUT_CHARS = 30000;
const MAX_GIT_DIFF_CHARS = 80000;
const CLAUDE_TIMEOUT_MS = 10 * 60 * 1000;

const CLAUDE_CODE_SETTINGS = {
  executionMode: "claude-code",
  claudeCommand: "claude",
  permissionMode: "default",
  outputFormat: "json",
  effort: "",
  agent: "",
  allowedTools: "",
  disallowedTools: "",
  tools: "",
  addDirs: "",
  mcpConfig: "",
  pluginDir: "",
  pluginUrl: "",
  settings: "",
  settingSources: "",
  fallbackModel: "",
  maxBudgetUsd: "",
  sessionName: "",
  extraArgs: "",
  safeMode: false,
  bareMode: false,
  ide: false,
  chromeMode: "default",
  strictMcpConfig: false,
  noSessionPersistence: false,
  axScreenReader: false,
  verbose: false,
};
const GENERIC_SESSION_TITLES = new Set(["", "claudex", "new chat", "new coding session", "新聊天"]);

app.setName("Claudex");

function parseEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        const key = line.slice(0, index).trim();
        const value = line.slice(index + 1).trim().replace(/^["']|["']$/g, "");
        return [key, value];
      }),
  );
}

function envBag() {
  const exeDir = path.dirname(process.execPath);
  const envFiles = [
    (() => {
      try {
        return path.join(app.getAppPath(), ".env");
      } catch {
        return "";
      }
    })(),
    path.join(exeDir, ".env"),
    path.join(process.cwd(), ".env"),
  ].filter(Boolean);
  const env = {
    ...process.env,
    ...Object.assign({}, ...envFiles.map((file) => parseEnvFile(file))),
  };
  if (env.ANTHROPIC_API_KEY) {
    delete env.ANTHROPIC_AUTH_TOKEN;
    delete env.CLAUDE_CODE_OAUTH_TOKEN;
  }
  return env;
}

function envValue(key) {
  return envBag()[key] || "";
}

function now() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function sessionMessages(session) {
  return Array.isArray(session?.messages) ? session.messages : [];
}

function hasSessionMessages(session) {
  return sessionMessages(session).length > 0;
}

function isGenericSessionTitle(title) {
  return GENERIC_SESSION_TITLES.has(String(title || "").trim().toLowerCase());
}

function sessionProjectKey(session) {
  return String(session?.projectPath || session?.project || "").trim().toLowerCase();
}

function projectKeyForStore(project) {
  return String(project?.path || project?.name || "").trim().toLowerCase();
}

function visibleProjectSessions(store, project = store?.activeProject) {
  const key = projectKeyForStore(project);
  return (store?.sessions || []).filter((session) => !session.archived && (!key || sessionProjectKey(session) === key));
}

function ensureActiveProjectDraftSession(store) {
  const project = store.activeProject || localWorkspaceProject();
  if (visibleProjectSessions(store, project).length) return null;
  const createdAt = now();
  const session = {
    id: id("session"),
    title: "新聊天",
    project: project.name,
    projectPath: project.path,
    createdAt,
    updatedAt: createdAt,
    messages: [],
    pinned: false,
    archived: false,
  };
  store.sessions = [session, ...(store.sessions || [])];
  return session;
}

function titleFromUserContent(content) {
  const text = String(content || "").replace(/\s+/g, " ").trim();
  if (!text) return "新聊天";
  return text.length > 64 ? `${text.slice(0, 61)}...` : text;
}

function sessionDisplayTitleForStore(session) {
  const rawTitle = String(session?.title || "").trim();
  if (rawTitle && !isGenericSessionTitle(rawTitle)) return titleFromUserContent(rawTitle);
  const firstUser = sessionMessages(session).find((message) => message.role === "user" && message.content);
  return titleFromUserContent(firstUser?.content || rawTitle || "新聊天");
}

function dataPath() {
  return path.join(app.getPath("userData"), "desktop-data.json");
}

function legacyDataPath() {
  return path.join(app.getPath("appData"), "Claude Code App", "desktop-data.json");
}

function localWorkspaceProject() {
  return {
    name: "本地工作区",
    path: "",
  };
}

function isPlaceholderProject(project) {
  const name = String(project?.name || "").trim().toLowerCase();
  return !project?.path && (!name || name === "本地工作区" || name === "local workspace");
}

function projectMarkerScore(folder) {
  try {
    if (!folder || !fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) return 0;
    return PROJECT_MARKERS.reduce(
      (score, marker) => score + (fs.existsSync(path.join(folder, marker)) ? 1 : 0),
      0,
    );
  } catch {
    return 0;
  }
}

function launchProjectFromContext() {
  const candidates = [];
  for (const arg of process.argv.slice(1)) {
    if (!arg || String(arg).startsWith("-")) continue;
    const resolved = path.resolve(process.cwd(), String(arg));
    candidates.push(resolved);
  }
  if (!app.isPackaged) candidates.push(process.cwd());

  const appPath = path.resolve(app.getAppPath());
  const uniqueCandidates = [...new Set(candidates.map((candidate) => path.resolve(candidate)))];
  for (const candidate of uniqueCandidates) {
    if (app.isPackaged && (candidate === appPath || candidate.startsWith(`${appPath}${path.sep}`))) {
      continue;
    }
    if (projectMarkerScore(candidate) > 0) {
      return projectFromPath(candidate);
    }
  }
  return null;
}

function storeHasRealProject(store) {
  return Boolean(store.activeProject?.path)
    || (store.projects || []).some((project) => Boolean(project?.path))
    || (store.sessions || []).some((session) => Boolean(session?.projectPath));
}

function defaultStore() {
  const createdAt = now();
  const env = envBag();
  const hasAnthropicEnv = Boolean(
    env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_BASE_URL || env.ANTHROPIC_MODEL,
  );
  const hasOpenAiEnv = Boolean(env.OPENAI_API_KEY || env.OPENAI_BASE_URL || env.OPENAI_MODEL);
  const provider = hasAnthropicEnv ? "anthropic" : "openai-compatible";
  const activeProject = launchProjectFromContext() || localWorkspaceProject();
  return {
    version: 1,
    settings: {
      provider,
      model:
        env.ANTHROPIC_MODEL ||
        env.ANTHROPIC_DEFAULT_SONNET_MODEL ||
        env.OPENAI_MODEL ||
        (hasAnthropicEnv ? "claude-sonnet-4-5-20250929" : "gpt-4.1"),
      baseUrl:
        env.ANTHROPIC_BASE_URL ||
        env.OPENAI_BASE_URL ||
        (hasAnthropicEnv ? "https://api.anthropic.com/v1" : "https://api.openai.com/v1"),
      temperature: 0.2,
      timeoutMs: Number(env.API_TIMEOUT_MS || 600000),
      language: "zh",
      appearance: {
        fontSize: "compact",
        density: "compact",
      },
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      apiKeys: {},
      capabilities: DEFAULT_CAPABILITIES,
      customMarketplaces: [],
      claudeCode: CLAUDE_CODE_SETTINGS,
    },
    activeProject,
    projects: [activeProject],
    sessions: [
      {
        id: "default",
        title: "新聊天",
        project: activeProject.name,
        projectPath: activeProject.path,
        createdAt,
        updatedAt: createdAt,
        messages: [],
      },
    ],
  };
}

function effectiveStoredModel(storedModel, fallbackModel) {
  const envModel = envValue("ANTHROPIC_MODEL");
  const model = String(storedModel || "").trim();
  const staleSonnetDefault = model === "sonnet" || model === "claude-sonnet-4-5" || /(^|-)sonnet-5($|-)/.test(model);
  if (envModel && (!model || staleSonnetDefault)) return envModel;
  return model || fallbackModel;
}

function normalizeStore(store) {
  const fallback = defaultStore();
  const launchProject = launchProjectFromContext();
  const sessions = Array.isArray(store.sessions) ? store.sessions : [];
  const shouldAdoptLaunchProject = Boolean(launchProject)
    && !storeHasRealProject(store)
    && !sessions.some((session) => hasSessionMessages(session));
  const activeProject = shouldAdoptLaunchProject ? launchProject : store.activeProject || {
    name: store.sessions?.[0]?.project || fallback.activeProject.name,
    path: store.sessions?.[0]?.projectPath || "",
  };
  const storedProjects = Array.isArray(store.projects) && store.projects.length ? store.projects : [activeProject];
  const projects = shouldAdoptLaunchProject
    ? [launchProject, ...storedProjects.filter((project) => !isPlaceholderProject(project))]
    : storedProjects;
  const mergedSettings = {
    ...fallback.settings,
    ...(store.settings || {}),
    model: effectiveStoredModel(store.settings?.model, fallback.settings.model),
    capabilities: {
      ...DEFAULT_CAPABILITIES,
      ...(store.settings?.capabilities || {}),
    },
    customMarketplaces: Array.isArray(store.settings?.customMarketplaces) ? store.settings.customMarketplaces : [],
    claudeCode: {
      ...CLAUDE_CODE_SETTINGS,
      ...(store.settings?.claudeCode || {}),
    },
    appearance: {
      fontSize: "compact",
      density: "compact",
      ...(store.settings?.appearance || {}),
    },
  };

  return {
    ...fallback,
    ...store,
    settings: mergedSettings,
    activeProject,
    projects,
    sessions: (store.sessions || fallback.sessions).map((session) => {
      const adoptSessionProject = shouldAdoptLaunchProject
        && !hasSessionMessages(session)
        && !session.projectPath
        && isGenericSessionTitle(session.title);
      return {
        ...session,
        project: adoptSessionProject ? launchProject.name : session.project || activeProject.name,
        projectPath: adoptSessionProject ? launchProject.path : session.projectPath || activeProject.path || "",
        messages: Array.isArray(session.messages) ? session.messages : [],
        pinned: Boolean(session.pinned),
        archived: Boolean(session.archived),
      };
    }),
  };
}

function projectFromPath(projectPath) {
  return {
    name: path.basename(projectPath) || projectPath,
    path: projectPath,
  };
}

function addProject(store, project) {
  const key = project.path || project.name;
  const existing = (store.projects || []).filter((item) => (item.path || item.name) !== key);
  store.projects = [project, ...existing].slice(0, 12);
  store.activeProject = project;
}

function slashPath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function resolveProjectRoot(projectPath) {
  const store = readStore();
  const candidate = projectPath || store.activeProject?.path;
  if (!candidate || !fs.existsSync(candidate)) {
    throw new Error("请先选择项目文件夹。");
  }
  const root = path.resolve(candidate);
  const stat = fs.statSync(root);
  if (!stat.isDirectory()) throw new Error("项目路径不是文件夹。");
  return root;
}

function resolveInsideProject(projectPath, relativePath = "") {
  const root = resolveProjectRoot(projectPath);
  const target = path.resolve(root, relativePath || ".");
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("路径超出了当前项目范围。");
  }
  return { root, target, relative: slashPath(relative) };
}

function trimOutput(value, maxChars = MAX_COMMAND_OUTPUT_CHARS) {
  const text = String(value || "");
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[输出已截断]`;
}

function emitProcessChunk(sender, channel, requestId, stream, text) {
  if (!sender || sender.isDestroyed?.() || !text) return;
  sender.send(channel, {
    requestId,
    type: "chunk",
    stream,
    text: stripAnsi(String(text)),
  });
}

function killChildProcess(child) {
  if (!child || child.killed) return;
  if (process.platform === "win32" && child.pid) {
    try {
      spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        windowsHide: true,
        stdio: "ignore",
      });
      return;
    } catch {
      // Fall through to child.kill().
    }
  }
  child.kill();
}

function hashBuffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function fileSnapshot(target, content) {
  const stat = fs.statSync(target);
  const buffer = Buffer.isBuffer(content) ? content : fs.readFileSync(target);
  return {
    path: "",
    name: path.basename(target),
    content: buffer.toString("utf8"),
    size: stat.size,
    updatedAt: stat.mtime.toISOString(),
    sha256: hashBuffer(buffer),
  };
}

function spawnDescriptor(command, args = []) {
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(String(command || ""))) {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/c", command, ...args],
    };
  }
  return { command, args };
}

function runProcess(command, args = [], options = {}) {
  const timeoutMs = Number(options.timeoutMs || CLAUDE_TIMEOUT_MS);
  const maxOutputChars = Number(options.maxOutputChars || MAX_COMMAND_OUTPUT_CHARS);
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let child;
    try {
      const childEnv = { ...process.env, ...(options.env || {}) };
      for (const [key, value] of Object.entries(childEnv)) {
        if (value === undefined || value === null) delete childEnv[key];
      }
      const spawnTarget = spawnDescriptor(command, args);
      child = spawn(spawnTarget.command, spawnTarget.args, {
        cwd: options.cwd || app.getPath("home"),
        windowsHide: true,
        env: childEnv,
      });
    } catch (error) {
      resolve({
        command,
        args,
        cwd: options.cwd || app.getPath("home"),
        durationMs: Date.now() - startedAt,
        stdout: "",
        stderr: error.message,
        code: 1,
      });
      return;
    }
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (options.requestId) activeRequests.delete(options.requestId);
      resolve({
        command,
        args,
        cwd: options.cwd || app.getPath("home"),
        durationMs: Date.now() - startedAt,
        stdout: trimOutput(stdout, maxOutputChars),
        stderr: trimOutput(stderr, maxOutputChars),
        ...result,
      });
    };
    const timeout = setTimeout(() => {
      killChildProcess(child);
      finish({ code: 124, stderr: trimOutput(`${stderr}\n命令运行超过 ${timeoutMs} 毫秒，已停止。`, maxOutputChars) });
    }, timeoutMs);

    if (options.requestId) activeRequests.set(options.requestId, child);
    child.stdout.on("data", (chunk) => {
      stdout = trimOutput(stdout + chunk.toString("utf8"), maxOutputChars);
    });
    child.stderr.on("data", (chunk) => {
      stderr = trimOutput(stderr + chunk.toString("utf8"), maxOutputChars);
    });
    child.on("error", (error) => {
      finish({ code: 1, stderr: trimOutput(`${stderr}\n${error.message}`, maxOutputChars) });
    });
    child.on("close", (code) => {
      finish({ code });
    });
  });
}

function runStreamingProcess(command, args = [], options = {}) {
  const timeoutMs = Number(options.timeoutMs || CLAUDE_TIMEOUT_MS);
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let child;
    try {
      const childEnv = { ...process.env, ...(options.env || {}) };
      for (const [key, value] of Object.entries(childEnv)) {
        if (value === undefined || value === null) delete childEnv[key];
      }
      const spawnTarget = spawnDescriptor(command, args);
      child = spawn(spawnTarget.command, spawnTarget.args, {
        cwd: options.cwd || app.getPath("home"),
        windowsHide: true,
        env: childEnv,
      });
    } catch (error) {
      resolve({
        command,
        args,
        cwd: options.cwd || app.getPath("home"),
        durationMs: Date.now() - startedAt,
        stdout: "",
        stderr: error.message,
        code: 1,
      });
      return;
    }
    let stdout = "";
    let stderr = "";
    let lineBuffer = "";
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (lineBuffer.trim()) options.onLine?.(lineBuffer.trim());
      if (options.requestId) activeRequests.delete(options.requestId);
      resolve({
        command,
        args,
        cwd: options.cwd || app.getPath("home"),
        durationMs: Date.now() - startedAt,
        stdout: trimOutput(stdout),
        stderr: trimOutput(stderr),
        ...result,
      });
    };
    const timeout = setTimeout(() => {
      killChildProcess(child);
      finish({ code: 124, stderr: trimOutput(`${stderr}\n命令运行超过 ${timeoutMs} 毫秒，已停止。`) });
    }, timeoutMs);

    if (options.requestId) activeRequests.set(options.requestId, child);
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stdout = trimOutput(stdout + text);
      options.onChunk?.("stdout", text);
      lineBuffer += text;
      const lines = lineBuffer.split(/\r?\n/);
      lineBuffer = lines.pop() || "";
      for (const line of lines) {
        if (line.trim()) options.onLine?.(line.trim());
      }
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stderr = trimOutput(stderr + text);
      options.onChunk?.("stderr", text);
    });
    child.on("error", (error) => {
      finish({ code: 1, stderr: trimOutput(`${stderr}\n${error.message}`) });
    });
    child.on("close", (code) => {
      finish({ code });
    });
  });
}

function parseJsonOutput(output) {
  const trimmed = String(output || "").trim();
  if (!trimmed) return null;
  const candidates = [trimmed, ...trimmed.split(/\r?\n/).filter((line) => /^[\[{]/.test(line.trim()))].reverse();
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Keep trying later lines because Claude Code may print diagnostics before JSON.
    }
  }
  return null;
}

function parseJsonArrayOutput(output) {
  const parsed = parseJsonOutput(output);
  return Array.isArray(parsed) ? parsed : [];
}

function stripAnsi(value) {
  return String(value || "").replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

function pluginNameFromId(idValue) {
  const idText = String(idValue || "").trim();
  return idText.split("@")[0] || idText;
}

function pluginMarketplaceFromId(idValue) {
  const idText = String(idValue || "").trim();
  return idText.includes("@") ? idText.split("@").slice(1).join("@") : "";
}

function parseClaudePluginText(rawOutput) {
  const lines = stripAnsi(rawOutput).split(/\r?\n/);
  const items = [];
  let current = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const head = line.match(/^>\s+(.+)$/);
    if (head) {
      if (current?.id) items.push(current);
      current = {
        id: head[1].trim(),
        name: pluginNameFromId(head[1]),
        marketplace: pluginMarketplaceFromId(head[1]),
        source: "claude-code",
      };
      continue;
    }
    if (!current) continue;
    const pair = line.match(/^([^:]+):\s*(.+)$/);
    if (!pair) continue;
    const key = pair[1].trim().toLowerCase();
    const value = pair[2].trim();
    if (key === "version") current.version = value;
    if (key === "scope") current.scope = value;
    if (key === "status") {
      current.status = value;
      current.enabled = /enabled/i.test(value);
    }
  }
  if (current?.id) items.push(current);
  return items;
}

function normalizeClaudePluginItems(jsonOutput, rawOutput) {
  const jsonItems = parseJsonArrayOutput(jsonOutput);
  const sourceItems = jsonItems.length ? jsonItems : parseClaudePluginText(rawOutput);
  return sourceItems.map((plugin) => {
    const idText = String(plugin.id || plugin.name || "").trim();
    const enabled = typeof plugin.enabled === "boolean" ? plugin.enabled : /enabled/i.test(plugin.status || "");
    return {
      id: idText,
      name: String(plugin.name || pluginNameFromId(idText)).trim() || idText,
      marketplace: String(plugin.marketplace || pluginMarketplaceFromId(idText)).trim(),
      version: String(plugin.version || "unknown"),
      scope: String(plugin.scope || ""),
      enabled,
      status: enabled ? "enabled" : "disabled",
      installPath: String(plugin.installPath || ""),
      installedAt: String(plugin.installedAt || ""),
      lastUpdated: String(plugin.lastUpdated || ""),
      source: "claude-code",
    };
  }).filter((plugin) => plugin.id);
}

function normalizeMarketplaceItems(jsonOutput, rawOutput) {
  const jsonItems = parseJsonArrayOutput(jsonOutput);
  if (jsonItems.length) {
    return jsonItems.map((item) => ({
      name: String(item.name || "").trim(),
      source: String(item.source || ""),
      repo: String(item.repo || item.url || item.path || ""),
      installLocation: String(item.installLocation || item.path || ""),
      raw: item,
    })).filter((item) => item.name);
  }

  const lines = stripAnsi(rawOutput).split(/\r?\n/);
  const items = [];
  let current = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const head = line.match(/^>\s+(.+)$/);
    if (head) {
      if (current?.name) items.push(current);
      current = { name: head[1].trim(), source: "", repo: "", installLocation: "", raw: {} };
      continue;
    }
    const sourceMatch = line.match(/^Source:\s*(.+)$/i);
    if (current && sourceMatch) {
      const source = sourceMatch[1].trim();
      current.source = source;
      current.repo = source;
    }
  }
  if (current?.name) items.push(current);
  return items;
}

function readJsonFileSafe(file) {
  try {
    if (!file || !fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function marketplacePluginSourceSummary(source) {
  if (!source) return "";
  if (typeof source === "string") return source;
  return [source.source, source.url, source.path, source.ref].filter(Boolean).join(" · ");
}

function loadMarketplacePluginCatalog(marketplaces, installedPlugins) {
  const installedIds = new Set();
  for (const plugin of installedPlugins || []) {
    if (plugin.id) installedIds.add(String(plugin.id).toLowerCase());
    if (plugin.name) installedIds.add(String(plugin.name).toLowerCase());
    if (plugin.name && plugin.marketplace) installedIds.add(`${plugin.name}@${plugin.marketplace}`.toLowerCase());
  }
  const catalog = [];
  for (const marketplace of marketplaces || []) {
    const manifest = readJsonFileSafe(path.join(marketplace.installLocation || "", ".claude-plugin", "marketplace.json"));
    const plugins = Array.isArray(manifest?.plugins) ? manifest.plugins : [];
    for (const plugin of plugins) {
      const name = String(plugin.name || "").trim();
      if (!name) continue;
      const idText = `${name}@${marketplace.name}`;
      const author = typeof plugin.author === "string" ? plugin.author : plugin.author?.name || manifest?.owner?.name || "";
      const installed = installedIds.has(idText.toLowerCase()) || installedIds.has(name.toLowerCase());
      catalog.push({
        id: idText,
        name,
        marketplace: marketplace.name,
        description: String(plugin.description || manifest?.description || manifest?.metadata?.description || ""),
        category: String(plugin.category || ""),
        author: String(author || ""),
        homepage: String(plugin.homepage || ""),
        source: marketplacePluginSourceSummary(plugin.source),
        installed,
      });
      if (catalog.length >= 240) return catalog;
    }
  }
  return catalog;
}

function parseMcpServers(rawOutput) {
  const text = stripAnsi(rawOutput).trim();
  if (!text || /no mcp servers configured/i.test(text)) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^checking|^name\s+/i.test(line))
    .map((line) => {
      const clean = line.replace(/^[✓✔✗×!⏸\-\*]\s*/, "").trim();
      const pair = clean.match(/^([^:\s]+)\s*[:\s]\s*(.*)$/);
      const name = pair?.[1] || clean.split(/\s+/)[0] || clean;
      const detail = pair?.[2] || clean.replace(name, "").trim();
      const lower = line.toLowerCase();
      const status = /pending|paused|⏸/.test(lower)
        ? "pending"
        : /failed|error|✗|×/.test(lower)
          ? "error"
          : /connected|ok|✓|✔/.test(lower)
            ? "ok"
            : "unknown";
      return { name, detail, status, raw: line };
    })
    .filter((item) => item.name);
}

function splitArgs(value) {
  const args = [];
  let current = "";
  let quote = "";
  let escaping = false;
  for (const char of String(value || "")) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = "";
      else current += char;
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) args.push(current);
  return args;
}

function isIgnoredWorkspaceDir(name) {
  return IGNORED_DIRS.has(name) || IGNORED_DIR_PATTERNS.some((pattern) => pattern.test(name));
}

function posixShellQuote(value) {
  return `'${String(value || "").replace(/'/g, "'\\''")}'`;
}

function shellCommandForPlatform(command) {
  const raw = String(command || "").trim();
  if (process.platform === "win32") {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", raw],
    };
  }
  return {
    command: process.platform === "darwin" ? "/bin/zsh" : "/bin/bash",
    args: ["-lc", raw],
  };
}

function openExternalTerminal(cwd, command = "") {
  const raw = String(command || "").trim();
  if (process.platform === "win32") {
    const args = raw ? ["/K", raw] : ["/K"];
    return spawn(process.env.ComSpec || "cmd.exe", args, {
      cwd,
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });
  }

  if (process.platform === "darwin") {
    const scriptCommand = raw ? `cd ${posixShellQuote(cwd)}; ${raw}` : `cd ${posixShellQuote(cwd)}`;
    return spawn("osascript", [
      "-e",
      `tell application "Terminal" to do script ${JSON.stringify(scriptCommand)}`,
      "-e",
      `tell application "Terminal" to activate`,
    ], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
  }

  const scriptCommand = raw ? `cd ${posixShellQuote(cwd)}; ${raw}; exec bash` : `cd ${posixShellQuote(cwd)}; exec bash`;
  return spawn("x-terminal-emulator", ["-e", "bash", "-lc", scriptCommand], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
}

function commandCandidates(command) {
  const raw = String(command || "").trim() || "claude";
  if (path.isAbsolute(raw) || raw.includes("\\") || raw.includes("/")) return [raw];
  const pathExts = process.platform === "win32" ? [".exe", ".com", ".cmd", ".bat"] : [""];
  const paths = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  const names = path.extname(raw) ? [raw] : pathExts.map((ext) => `${raw}${ext}`);
  const directClaudeBins = [];
  const found = [];
  for (const folder of paths) {
    if (raw === "claude") {
      const directBin = path.join(
        folder,
        "node_modules",
        "@anthropic-ai",
        "claude-code",
        "bin",
        process.platform === "win32" ? "claude.exe" : "claude",
      );
      if (fs.existsSync(directBin)) directClaudeBins.push(directBin);
    }
    for (const name of names) {
      const candidate = path.join(folder, name);
      if (fs.existsSync(candidate)) found.push(candidate);
    }
  }
  return [...new Set([...directClaudeBins, ...found, raw])];
}

function existingCommandCandidate(command) {
  return commandCandidates(command).find((candidate) => candidate !== command && fs.existsSync(candidate)) || "";
}

function ideOptions() {
  const candidates = [
    { id: "vscode", label: "VS Code", command: "code" },
    { id: "cursor", label: "Cursor", command: "cursor" },
    { id: "windsurf", label: "Windsurf", command: "windsurf" },
  ];
  return candidates
    .map((item) => ({ ...item, executable: existingCommandCandidate(item.command) }))
    .filter((item) => item.executable);
}

function parseGitEnvironment(result) {
  const output = stripAnsi(`${result.stdout || ""}\n${result.stderr || ""}`).trim();
  if (result.code !== 0) {
    return {
      available: false,
      branch: "",
      changes: 0,
      files: [],
      raw: output,
    };
  }
  const lines = output.split(/\r?\n/).filter(Boolean);
  const first = lines[0] || "";
  const branch = first.startsWith("## ") ? first.slice(3).split("...")[0].trim() : "";
  const files = parseGitStatusFiles(lines.filter((line) => !line.startsWith("## ")));
  const changes = files.length;
  return {
    available: result.code === 0,
    branch,
    changes,
    files,
    raw: output,
  };
}

function parseGitStatusFiles(lines) {
  return lines.map((line) => {
    const code = line.slice(0, 2);
    const pathPart = line.slice(3).trim();
    const [from, to] = pathPart.split(/\s+->\s+/);
    return {
      status: code.trim() || code,
      staged: code[0] && code[0] !== " " && code[0] !== "?",
      unstaged: code[1] && code[1] !== " ",
      path: to || from || pathPart,
      previousPath: to ? from : "",
    };
  }).filter((item) => item.path);
}

function gitText(result) {
  return stripAnsi(result.stdout || result.stderr).trim();
}

async function loadGitEnvironment(cwd) {
  const status = parseGitEnvironment(await runProcess("git", ["status", "--short", "--branch"], { cwd, timeoutMs: 8000 }));
  if (!status.available) return status;
  const [worktreeStat, stagedStat, worktreeDiff, stagedDiff] = await Promise.all([
    runProcess("git", ["diff", "--stat", "--no-ext-diff"], { cwd, timeoutMs: 8000 }),
    runProcess("git", ["diff", "--cached", "--stat", "--no-ext-diff"], { cwd, timeoutMs: 8000 }),
    runProcess("git", ["diff", "--no-ext-diff", "--find-renames", "--unified=3", "--"], {
      cwd,
      timeoutMs: 10000,
      maxOutputChars: MAX_GIT_DIFF_CHARS,
    }),
    runProcess("git", ["diff", "--cached", "--no-ext-diff", "--find-renames", "--unified=3", "--"], {
      cwd,
      timeoutMs: 10000,
      maxOutputChars: MAX_GIT_DIFF_CHARS,
    }),
  ]);
  const statParts = [
    gitText(stagedStat),
    gitText(worktreeStat),
  ].filter(Boolean);
  const diffSections = [
    { label: "Staged changes", text: gitText(stagedDiff) },
    { label: "Working tree changes", text: gitText(worktreeDiff) },
  ].filter((section) => section.text);
  const diffText = diffSections.map((section) => `# ${section.label}\n${section.text}`).join("\n\n");
  return {
    ...status,
    stat: statParts.join("\n"),
    diff: {
      text: trimOutput(diffText, MAX_GIT_DIFF_CHARS),
      truncated: diffText.length > MAX_GIT_DIFF_CHARS || /\[输出已截断\]/.test(diffText),
      files: status.files.length,
    },
  };
}

async function runClaudeCommand(command, args = [], options = {}) {
  let lastResult = null;
  const claudeOptions = {
    ...options,
    env: claudeProcessEnv(options.env),
  };
  for (const candidate of commandCandidates(command)) {
    const result = await runProcess(candidate, args, claudeOptions);
    lastResult = result;
    if (!(result.code === 1 && /ENOENT/i.test(result.stderr || ""))) return result;
  }
  return lastResult || { code: 1, stdout: "", stderr: "未找到 Claude 命令。", durationMs: 0 };
}

function configuredClaudeCommand(store = readStore()) {
  return String(store.settings?.claudeCode?.claudeCommand || "claude").trim() || "claude";
}

function claudeProcessEnv(extra = {}) {
  const env = { ...process.env, ...envBag(), ...(extra || {}) };
  if (env.ANTHROPIC_API_KEY) {
    delete env.ANTHROPIC_AUTH_TOKEN;
    delete env.CLAUDE_CODE_OAUTH_TOKEN;
  }
  return env;
}

function readStore() {
  const file = dataPath();
  const legacyFile = legacyDataPath();
  if (!fs.existsSync(file) && fs.existsSync(legacyFile)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.copyFileSync(legacyFile, file);
  }

  if (!fs.existsSync(file)) {
    const initial = defaultStore();
    writeStore(initial);
    return initial;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return normalizeStore(parsed);
  } catch {
    const backup = `${file}.broken-${Date.now()}`;
    fs.copyFileSync(file, backup);
    const initial = defaultStore();
    writeStore(initial);
    return normalizeStore(initial);
  }
}

function writeStore(store) {
  fs.mkdirSync(path.dirname(dataPath()), { recursive: true });
  fs.writeFileSync(dataPath(), JSON.stringify(store, null, 2), "utf8");
}

function encryptSecret(value) {
  if (!value) return undefined;
  if (safeStorage.isEncryptionAvailable()) {
    return {
      scheme: "safeStorage",
      value: safeStorage.encryptString(value).toString("base64"),
    };
  }
  return {
    scheme: "base64",
    value: Buffer.from(value, "utf8").toString("base64"),
  };
}

function decryptSecret(secret) {
  if (!secret?.value) return "";
  if (secret.scheme === "safeStorage") {
    return safeStorage.decryptString(Buffer.from(secret.value, "base64"));
  }
  if (secret.scheme === "base64") {
    return Buffer.from(secret.value, "base64").toString("utf8");
  }
  return "";
}

function sanitizeStore(store) {
  const apiKeyState = Object.fromEntries(
    Object.entries(store.settings.apiKeys || {}).map(([provider, secret]) => [
      provider,
      Boolean(secret?.value),
    ]),
  );

  return {
    ...store,
    settings: {
      ...store.settings,
      apiKeys: apiKeyState,
      dataFile: dataPath(),
      encryptionAvailable: safeStorage.isEncryptionAvailable(),
      appLocale: app.getLocale(),
      env: {
        anthropicKey: Boolean(envValue("ANTHROPIC_API_KEY") || envValue("ANTHROPIC_AUTH_TOKEN")),
        anthropicApiKey: Boolean(envValue("ANTHROPIC_API_KEY")),
        anthropicAuthToken: Boolean(envValue("ANTHROPIC_AUTH_TOKEN")),
        anthropicBaseUrl: envValue("ANTHROPIC_BASE_URL"),
        openaiKey: Boolean(envValue("OPENAI_API_KEY")),
        openaiBaseUrl: envValue("OPENAI_BASE_URL"),
        openrouterKey: Boolean(envValue("OPENROUTER_API_KEY")),
        deepseekKey: Boolean(envValue("DEEPSEEK_API_KEY")),
        minimaxKey: Boolean(envValue("MINIMAX_API_KEY")),
        mimoKey: Boolean(envValue("MIMO_API_KEY") || envValue("XIAOMI_MIMO_API_KEY")),
        envFileDirs: [process.cwd(), path.dirname(process.execPath)],
      },
    },
  };
}

async function fetchWithTimeout(url, options, timeoutMs, requestId) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(timeoutMs || 600000));
  if (requestId) activeRequests.set(requestId, controller);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    if (requestId) activeRequests.delete(requestId);
  }
}

function joinUrl(baseUrl, suffix) {
  return `${String(baseUrl || "").replace(/\/+$/, "")}${suffix}`;
}

function isLocalBaseUrl(baseUrl) {
  return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])/i.test(baseUrl || "");
}

function isOpenAiCompatibleProvider(provider) {
  return OPENAI_COMPATIBLE_PROVIDERS.has(provider || "openai-compatible");
}

function providerEnvKey(provider) {
  const keys = PROVIDER_ENV_KEYS[provider] || PROVIDER_ENV_KEYS["openai-compatible"];
  return keys.map((key) => envValue(key)).find(Boolean) || "";
}

function providerAuthHeaders(provider, apiKey) {
  if (!apiKey) return {};
  if (provider === "xiaomi-mimo") return { "api-key": apiKey };
  return { Authorization: `Bearer ${apiKey}` };
}

function requireKeyIfNeeded(provider, baseUrl, apiKey) {
  if (provider === "ollama") return;
  if (isOpenAiCompatibleProvider(provider) && isLocalBaseUrl(baseUrl)) return;
  if (!apiKey) {
    throw new Error("缺少 API 密钥。请打开设置，并为当前服务商保存密钥。");
  }
}

function normalizeMessages(store, session) {
  const systemPrompt = buildSystemPrompt(store, session);
  return [
    { role: "system", content: systemPrompt },
    ...session.messages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message) => ({ role: message.role, content: message.content })),
  ];
}

function buildSystemPrompt(store, session) {
  const systemPrompt = store.settings.systemPrompt || DEFAULT_SYSTEM_PROMPT;
  const project = store.activeProject || { name: session.project || "本地工作区", path: session.projectPath || "" };
  const enabledCapabilities = Object.entries({
    ...DEFAULT_CAPABILITIES,
    ...(store.settings.capabilities || {}),
  })
    .filter(([, enabled]) => enabled)
    .map(([key]) => CAPABILITY_CONTEXT[key])
    .filter(Boolean);
  const customMarketplaces = Array.isArray(store.settings.customMarketplaces)
    ? store.settings.customMarketplaces.filter(Boolean).slice(0, 12)
    : [];
  const claudexContext = [
    "Claudex 桌面端上下文：",
    `- 当前项目：${project.name || "本地工作区"}${project.path ? ` (${project.path})` : ""}`,
    enabledCapabilities.length ? "- 已启用能力：" : "",
    ...enabledCapabilities.map((item) => `  - ${item}`),
    customMarketplaces.length ? "- 自定义插件市场：" : "",
    ...customMarketplaces.map((item) => `  - ${item}`),
  ]
    .filter(Boolean)
    .join("\n");
  return `${systemPrompt}\n\n${claudexContext}`;
}

async function requestOpenAiCompatible(store, session, apiKey, requestId) {
  const { provider, model, baseUrl, temperature } = store.settings;
  requireKeyIfNeeded(provider, baseUrl, apiKey);
  const response = await fetchWithTimeout(joinUrl(baseUrl, "/chat/completions"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...providerAuthHeaders(provider, apiKey),
    },
    body: JSON.stringify({
      model,
      messages: normalizeMessages(store, session),
      temperature: Number(temperature ?? 0.2),
      stream: false,
    }),
  }, store.settings.timeoutMs, requestId);

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `服务商返回 HTTP ${response.status}`);
  }
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) throw new Error("服务商响应中没有助手内容。");
  return content;
}

async function requestAnthropic(store, session, apiKey, requestId) {
  const { model, baseUrl, temperature } = store.settings;
  const bearerToken = apiKey ? "" : envValue("ANTHROPIC_AUTH_TOKEN");
  requireKeyIfNeeded("anthropic", baseUrl, apiKey || bearerToken);
  const response = await fetchWithTimeout(joinUrl(baseUrl || "https://api.anthropic.com/v1", "/messages"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : { "x-api-key": apiKey }),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      temperature: Number(temperature ?? 0.2),
      system: buildSystemPrompt(store, session),
      messages: session.messages
        .filter((message) => message.role === "user" || message.role === "assistant")
        .map((message) => ({ role: message.role, content: message.content })),
    }),
  }, store.settings.timeoutMs, requestId);

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Anthropic 返回 HTTP ${response.status}`);
  }
  const text = (payload?.content || [])
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
  if (!text) throw new Error("Anthropic 响应中没有文本内容。");
  return text;
}

async function requestOllama(store, session, requestId) {
  const { model, baseUrl, temperature } = store.settings;
  const response = await fetchWithTimeout(joinUrl(baseUrl || "http://localhost:11434", "/api/chat"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      options: { temperature: Number(temperature ?? 0.2) },
      messages: normalizeMessages(store, session),
    }),
  }, store.settings.timeoutMs, requestId);

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || `Ollama 返回 HTTP ${response.status}`);
  }
  const content = payload?.message?.content;
  if (!content) throw new Error("Ollama 响应中没有助手内容。");
  return content;
}

async function requestAssistant(store, session, requestId) {
  if (store.settings.claudeCode?.executionMode !== "api") {
    return requestClaudeCode(store, session, requestId);
  }
  const provider = store.settings.provider;
  const apiKey =
    decryptSecret(store.settings.apiKeys?.[provider]) ||
    providerEnvKey(provider);
  if (provider === "anthropic") return requestAnthropic(store, session, apiKey, requestId);
  if (provider === "ollama") return requestOllama(store, session, requestId);
  return requestOpenAiCompatible(store, session, apiKey, requestId);
}

function cleanOption(value) {
  return String(value ?? "").trim();
}

function splitLineValues(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function pushOption(args, flag, value) {
  const next = cleanOption(value);
  if (next) args.push(flag, next);
}

function pushFlag(args, flag, enabled) {
  if (enabled) args.push(flag);
}

function pushRepeatable(args, flag, value) {
  for (const item of splitLineValues(value)) args.push(flag, item);
}

function pushVariadic(args, flag, value) {
  const items = splitLineValues(value);
  if (items.length) args.push(flag, ...items);
}

function appendClaudeCodeOptions(args, store, session, { stream = false } = {}) {
  const claudeCode = { ...CLAUDE_CODE_SETTINGS, ...(store.settings.claudeCode || {}) };
  pushOption(args, "--model", store.settings.model || "claude-sonnet-4-5-20250929");
  pushOption(args, "--permission-mode", claudeCode.permissionMode || "default");
  pushOption(args, "--append-system-prompt", buildSystemPrompt(store, session));
  pushOption(args, "--effort", claudeCode.effort);
  pushOption(args, "--agent", claudeCode.agent);
  pushOption(args, "--allowedTools", claudeCode.allowedTools);
  pushOption(args, "--disallowedTools", claudeCode.disallowedTools);
  pushOption(args, "--tools", claudeCode.tools);
  pushOption(args, "--fallback-model", claudeCode.fallbackModel);
  pushOption(args, "--max-budget-usd", claudeCode.maxBudgetUsd);
  pushOption(args, "--name", claudeCode.sessionName);
  pushOption(args, "--settings", claudeCode.settings);
  pushOption(args, "--setting-sources", claudeCode.settingSources);
  pushVariadic(args, "--add-dir", claudeCode.addDirs);
  pushVariadic(args, "--mcp-config", claudeCode.mcpConfig);
  pushRepeatable(args, "--plugin-dir", claudeCode.pluginDir);
  pushRepeatable(args, "--plugin-url", claudeCode.pluginUrl);
  pushFlag(args, "--strict-mcp-config", claudeCode.strictMcpConfig);
  pushFlag(args, "--safe-mode", claudeCode.safeMode);
  pushFlag(args, "--bare", claudeCode.bareMode);
  pushFlag(args, "--ide", claudeCode.ide);
  pushFlag(args, "--no-session-persistence", claudeCode.noSessionPersistence);
  pushFlag(args, "--ax-screen-reader", claudeCode.axScreenReader);
  if (claudeCode.chromeMode === "on") args.push("--chrome");
  if (claudeCode.chromeMode === "off") args.push("--no-chrome");
  if (claudeCode.verbose && !args.includes("--verbose")) args.push("--verbose");
  if (session.claudeSessionId) args.push("--resume", session.claudeSessionId);
  const extraArgs = splitArgs(claudeCode.extraArgs);
  if (extraArgs.length) args.push(...extraArgs);
  if (stream && !args.includes("--verbose")) args.push("--verbose");
  return claudeCode;
}

function buildClaudeChatArgs(store, session, { stream = false } = {}) {
  const args = [
    "-p",
    session.messages[session.messages.length - 1]?.content || "",
    "--output-format",
    stream ? "stream-json" : "json",
  ];
  if (stream) {
    args.push("--include-partial-messages", "--include-hook-events");
  }
  appendClaudeCodeOptions(args, store, session, { stream });
  return args;
}

async function requestClaudeCode(store, session, requestId) {
  const project = store.activeProject || { path: session.projectPath || "" };
  const cwd = project.path && fs.existsSync(project.path) ? project.path : app.getPath("home");
  const claudeCode = { ...CLAUDE_CODE_SETTINGS, ...(store.settings.claudeCode || {}) };
  const args = buildClaudeChatArgs(store, session);
  const result = await runClaudeCommand(claudeCode.claudeCommand || "claude", args, {
    cwd,
    requestId,
    timeoutMs: Number(store.settings.timeoutMs || CLAUDE_TIMEOUT_MS),
    env: { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" },
  });
  const payload = parseJsonOutput(result.stdout);
  if (result.code !== 0 || payload?.is_error) {
    const message = payload?.result || payload?.error || result.stderr || result.stdout || `Claude Code 已退出，代码 ${result.code}`;
    throw new Error(stripAnsi(message));
  }
  if (!payload?.result) {
    throw new Error(stripAnsi(result.stdout || "Claude Code 没有返回结果。"));
  }
  if (payload.session_id) {
    session.claudeSessionId = payload.session_id;
  }
  return payload.result;
}

function emitClaudeStreamLine(sender, requestId, session, line) {
  const payload = parseJsonOutput(line);
  if (!payload) return;
  const base = { requestId, sessionId: session.id };
  const emitActivity = (text, extra = {}) => {
    if (!text) return;
    sender.send("chat:stream-event", {
      ...base,
      type: "activity",
      text: stripAnsi(String(text)),
      ...extra,
    });
  };
  if (payload.type === "system" && payload.subtype === "init") {
    sender.send("chat:stream-event", {
      ...base,
      type: "status",
      text: `Claude Code ${payload.claude_code_version || ""}`.trim(),
      claudeSessionId: payload.session_id,
    });
    emitActivity(`Claude Code ${payload.claude_code_version || ""}`.trim(), { claudeSessionId: payload.session_id });
    return;
  }
  if (payload.type === "system" && payload.subtype === "status") {
    sender.send("chat:stream-event", {
      ...base,
      type: "status",
      text: payload.status || "正在处理",
    });
    emitActivity(payload.status || "正在处理");
    return;
  }
  if (payload.type === "system" && payload.subtype) {
    emitActivity(payload.subtype);
    return;
  }
  if (payload.type === "assistant" && Array.isArray(payload.message?.content)) {
    for (const block of payload.message.content) {
      if (block?.type === "tool_use") emitActivity(`正在使用 ${block.name || "工具"}`);
    }
    return;
  }
  if (payload.type === "stream_event" && payload.event?.type === "content_block_delta") {
    const delta = payload.event.delta;
    if (delta?.type === "text_delta" && delta.text) {
      sender.send("chat:stream-event", {
        ...base,
        type: "delta",
        text: delta.text,
      });
    }
    return;
  }
  if (payload.type === "stream_event" && payload.event?.type === "content_block_start") {
    const block = payload.event.content_block;
    if (block?.type === "tool_use") emitActivity(`正在使用 ${block.name || "工具"}`);
    return;
  }
  if (payload.type === "hook_event") {
    emitActivity(payload.hook_event_name || payload.name || "钩子事件");
    return;
  }
  if (payload.type === "tool_result") {
    emitActivity(payload.is_error ? "工具返回错误" : "工具已完成");
    return;
  }
  if (payload.type === "result") {
    sender.send("chat:stream-event", {
      ...base,
      type: payload.is_error ? "error" : "done",
      text: payload.result || "",
      claudeSessionId: payload.session_id,
      durationMs: payload.duration_ms,
    });
    emitActivity(payload.is_error ? "运行结束但有错误" : "运行已完成");
  }
}

async function requestClaudeCodeStream(store, session, requestId, sender) {
  const project = store.activeProject || { path: session.projectPath || "" };
  const cwd = project.path && fs.existsSync(project.path) ? project.path : app.getPath("home");
  const claudeCode = { ...CLAUDE_CODE_SETTINGS, ...(store.settings.claudeCode || {}) };
  const args = buildClaudeChatArgs(store, session, { stream: true });

  let finalPayload = null;
  const result = await runStreamingProcess(commandCandidates(claudeCode.claudeCommand || "claude")[0], args, {
    cwd,
    requestId,
    timeoutMs: Number(store.settings.timeoutMs || CLAUDE_TIMEOUT_MS),
    env: claudeProcessEnv({ CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" }),
    onLine: (line) => {
      const payload = parseJsonOutput(line);
      if (payload?.type === "result") finalPayload = payload;
      emitClaudeStreamLine(sender, requestId, session, line);
    },
  });
  const payload = finalPayload || parseJsonOutput(result.stdout);
  if (result.code !== 0 || payload?.is_error) {
    const message = payload?.result || payload?.error || result.stderr || `Claude Code exited with ${result.code}`;
    throw new Error(stripAnsi(message));
  }
  if (!payload?.result) {
    throw new Error(stripAnsi(result.stdout || "Claude Code 没有返回结果。"));
  }
  if (payload.session_id) {
    session.claudeSessionId = payload.session_id;
  }
  return {
    text: payload.result,
    permissionDenials: Array.isArray(payload.permission_denials) ? payload.permission_denials : [],
  };
}

function createWindow() {
  const iconPath = path.join(__dirname, "..", "dist", "assets", "claudex-mark.png");
  const window = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1040,
    minHeight: 720,
    show: false,
    backgroundColor: "#111111",
    autoHideMenuBar: true,
    title: "Claudex",
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: false,
    },
  });

  window.setMenuBarVisibility(false);
  window.once("ready-to-show", () => window.show());
  window.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  return window;
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("app:get-state", () => sanitizeStore(readStore()));

ipcMain.handle("app:save-settings", (_event, nextSettings) => {
  const store = readStore();
  const provider = nextSettings.provider || store.settings.provider;
  const claudeCode = {
    ...CLAUDE_CODE_SETTINGS,
    ...(store.settings.claudeCode || {}),
    ...(nextSettings.claudeCode || {}),
  };
  store.settings = {
    ...store.settings,
    provider,
    model: nextSettings.model || store.settings.model,
    baseUrl: nextSettings.baseUrl || store.settings.baseUrl,
    temperature: Number(nextSettings.temperature ?? store.settings.temperature ?? 0.2),
    timeoutMs: Number(nextSettings.timeoutMs ?? store.settings.timeoutMs ?? 600000),
    language: nextSettings.language || store.settings.language || "zh",
    appearance: {
      ...(store.settings.appearance || {}),
      ...(nextSettings.appearance || {}),
    },
    systemPrompt: nextSettings.systemPrompt ?? store.settings.systemPrompt,
    capabilities: { ...(store.settings.capabilities || DEFAULT_CAPABILITIES) },
    customMarketplaces: Array.isArray(nextSettings.customMarketplaces)
      ? nextSettings.customMarketplaces.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 12)
      : Array.isArray(store.settings.customMarketplaces)
        ? store.settings.customMarketplaces
        : [],
    claudeCode,
    apiKeys: { ...(store.settings.apiKeys || {}) },
  };

  if (typeof nextSettings.apiKey === "string" && nextSettings.apiKey.trim()) {
    store.settings.apiKeys[provider] = encryptSecret(nextSettings.apiKey.trim());
  }

  writeStore(store);
  return sanitizeStore(store);
});

ipcMain.handle("app:save-capabilities", (_event, capabilities) => {
  const store = readStore();
  store.settings.capabilities = {
    ...DEFAULT_CAPABILITIES,
    ...(store.settings.capabilities || {}),
    ...(capabilities || {}),
  };
  writeStore(store);
  return sanitizeStore(store);
});

ipcMain.handle("app:select-project", async () => {
  const result = await dialog.showOpenDialog({
    title: "选择项目文件夹",
    properties: ["openDirectory"],
  });
  if (result.canceled || !result.filePaths[0]) return null;

  const store = readStore();
  addProject(store, projectFromPath(result.filePaths[0]));
  ensureActiveProjectDraftSession(store);
  writeStore(store);
  return sanitizeStore(store);
});

ipcMain.handle("app:set-active-project", (_event, project) => {
  const store = readStore();
  const nextProject = project?.path ? projectFromPath(project.path) : { name: project?.name || "本地工作区", path: "" };
  addProject(store, nextProject);
  ensureActiveProjectDraftSession(store);
  writeStore(store);
  return sanitizeStore(store);
});

ipcMain.handle("chat:create-session", (_event, title = "新聊天") => {
  const store = readStore();
  const createdAt = now();
  const project = store.activeProject || { name: "本地工作区", path: "" };
  const currentProjectKey = String(project.path || project.name || "").trim().toLowerCase();
  const reusableIndex = store.sessions.findIndex(
    (item) => !hasSessionMessages(item) && isGenericSessionTitle(item.title) && sessionProjectKey(item) === currentProjectKey,
  );
  if (reusableIndex >= 0) {
    const [reusable] = store.sessions.splice(reusableIndex, 1);
    reusable.title = "新聊天";
    reusable.project = project.name;
    reusable.projectPath = project.path;
    reusable.updatedAt = createdAt;
    store.sessions.unshift(reusable);
    writeStore(store);
    return sanitizeStore(store);
  }

  const session = {
    id: id("session"),
    title: isGenericSessionTitle(title) ? "新聊天" : title,
    project: project.name,
    projectPath: project.path,
    createdAt,
    updatedAt: createdAt,
    messages: [],
  };
  store.sessions.unshift(session);
  writeStore(store);
  return sanitizeStore(store);
});

ipcMain.handle("chat:update-session", (_event, { sessionId, title, pinned, archived } = {}) => {
  const store = readStore();
  const session = store.sessions.find((item) => item.id === sessionId);
  if (!session) throw new Error("没有找到这个聊天。");
  const updatedAt = now();
  if (typeof title === "string") {
    const nextTitle = title.trim();
    if (nextTitle) session.title = nextTitle;
  }
  if (typeof pinned === "boolean") session.pinned = pinned;
  if (typeof archived === "boolean") session.archived = archived;
  session.updatedAt = updatedAt;
  ensureActiveProjectDraftSession(store);
  writeStore(store);
  return sanitizeStore(store);
});

ipcMain.handle("chat:delete-session", (_event, sessionId) => {
  const store = readStore();
  const before = store.sessions.length;
  store.sessions = store.sessions.filter((session) => session.id !== sessionId);
  if (store.sessions.length === before) throw new Error("没有找到这个聊天。");
  ensureActiveProjectDraftSession(store);
  writeStore(store);
  return sanitizeStore(store);
});

ipcMain.handle("chat:fork-session", (_event, sessionId) => {
  const store = readStore();
  const source = store.sessions.find((item) => item.id === sessionId);
  if (!source) throw new Error("没有找到这个聊天。");
  const createdAt = now();
  const fork = {
    ...source,
    id: id("session"),
    title: `Fork: ${sessionDisplayTitleForStore(source)}`,
    createdAt,
    updatedAt: createdAt,
    pinned: false,
    archived: false,
    messages: sessionMessages(source).map((message) => ({ ...message })),
  };
  store.sessions.unshift(fork);
  writeStore(store);
  return {
    ...sanitizeStore(store),
    selectedSessionId: fork.id,
  };
});

ipcMain.handle("chat:send-message", async (_event, { sessionId, content, requestId }) => {
  if (!content || !String(content).trim()) throw new Error("消息为空。");
  const store = readStore();
  const session = store.sessions.find((item) => item.id === sessionId) || store.sessions[0];
  if (!session) throw new Error("没有可用的聊天会话。");

  const createdAt = now();
  const userContent = String(content).trim();
  session.messages.push({ role: "user", content: userContent, createdAt });
  if (isGenericSessionTitle(session.title)) {
    session.title = titleFromUserContent(userContent);
  }
  session.updatedAt = createdAt;
  writeStore(store);

  try {
    const assistantResult =
      store.settings.claudeCode?.executionMode !== "api"
        ? await requestClaudeCodeStream(store, session, requestId, _event.sender)
        : await requestAssistant(store, session, requestId);
    const assistantText = typeof assistantResult === "string" ? assistantResult : assistantResult.text;
    const permissionDenials = typeof assistantResult === "object" && Array.isArray(assistantResult.permissionDenials) ? assistantResult.permissionDenials : [];
    session.messages.push({
      role: "assistant",
      content: assistantText,
      createdAt: now(),
      ...(permissionDenials.length ? { permissionDenials } : {}),
    });
    session.updatedAt = now();
    writeStore(store);
    return sanitizeStore(store);
  } catch (error) {
    session.messages.push({
      role: "error",
      content: error.message || "模型请求失败。",
      createdAt: now(),
    });
    session.updatedAt = now();
    writeStore(store);
    return sanitizeStore(store);
  }
});

ipcMain.handle("chat:cancel-request", (_event, requestId) => {
  const request = activeRequests.get(requestId);
  if (request) {
    if (typeof request.abort === "function") request.abort();
    else if (typeof request.kill === "function") request.kill();
    activeRequests.delete(requestId);
  }
  return true;
});

ipcMain.handle("app:open-data-file", async () => {
  await shell.showItemInFolder(dataPath());
  return true;
});

ipcMain.handle("app:open-project", async (_event, projectPath) => {
  const target = projectPath && fs.existsSync(projectPath) ? projectPath : app.getPath("home");
  await shell.openPath(target);
  return true;
});

ipcMain.handle("app:open-terminal", async (_event, projectPath) => {
  const cwd = projectPath && fs.existsSync(projectPath) ? projectPath : app.getPath("home");
  const child = openExternalTerminal(cwd);
  child.unref();
  return true;
});

ipcMain.handle("app:open-claude-terminal", async (_event, { projectPath, prompt = "" } = {}) => {
  const cwd = projectPath && fs.existsSync(projectPath) ? projectPath : app.getPath("home");
  const command = String(prompt || "").trim()
    ? `claude ${JSON.stringify(String(prompt).trim())}`
    : "claude";
  const child = openExternalTerminal(cwd, command);
  child.unref();
  return true;
});

ipcMain.handle("app:open-browser-url", async (_event, value) => {
  const raw = String(value || "").trim();
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw || "docs.anthropic.com"}`;
  await shell.openExternal(url);
  return true;
});

ipcMain.handle("app:list-ide-options", () => ideOptions());

ipcMain.handle("app:open-ide", async (_event, { projectPath, ideId } = {}) => {
  const options = ideOptions();
  const selected = options.find((item) => item.id === ideId) || options[0];
  const cwd = projectPath && fs.existsSync(projectPath) ? projectPath : app.getPath("home");
  if (!selected) {
    await shell.openPath(cwd);
    return { opened: "folder" };
  }
  const child = spawn(selected.executable, [cwd], {
    cwd,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  return { opened: selected.id };
});

ipcMain.handle("app:get-environment", async (_event, { projectPath } = {}) => {
  const cwd = projectPath && fs.existsSync(projectPath) ? projectPath : app.getPath("home");
  const git = await loadGitEnvironment(cwd);
  return {
    cwd,
    git,
    ideOptions: ideOptions(),
  };
});

ipcMain.handle("claude:status", async (_event, { projectPath } = {}) => {
  const cwd = projectPath && fs.existsSync(projectPath) ? projectPath : app.getPath("home");
  const claudeCommand = configuredClaudeCommand();
  const [version, auth, plugins, pluginsJson, mcp, marketplaces, marketplacesJson] = await Promise.all([
    runClaudeCommand(claudeCommand, ["--version"], { cwd, timeoutMs: 20000 }),
    runClaudeCommand(claudeCommand, ["auth", "status"], { cwd, timeoutMs: 30000 }),
    runClaudeCommand(claudeCommand, ["plugin", "list"], { cwd, timeoutMs: 30000 }),
    runClaudeCommand(claudeCommand, ["plugin", "list", "--json"], { cwd, timeoutMs: 30000 }),
    runClaudeCommand(claudeCommand, ["mcp", "list"], { cwd, timeoutMs: 30000 }),
    runClaudeCommand(claudeCommand, ["plugin", "marketplace", "list"], { cwd, timeoutMs: 30000 }),
    runClaudeCommand(claudeCommand, ["plugin", "marketplace", "list", "--json"], { cwd, timeoutMs: 30000 }),
  ]);
  const pluginItems = normalizeClaudePluginItems(pluginsJson.stdout, plugins.stdout || plugins.stderr);
  const marketplaceItems = normalizeMarketplaceItems(marketplacesJson.stdout, marketplaces.stdout || marketplaces.stderr);
  const mcpRaw = stripAnsi(mcp.stdout || mcp.stderr).trim();
  return {
    available: version.code === 0,
    version: stripAnsi(version.stdout || version.stderr).trim(),
    auth: parseJsonOutput(auth.stdout) || { raw: stripAnsi(auth.stdout || auth.stderr).trim(), code: auth.code },
    plugins: stripAnsi(plugins.stdout || plugins.stderr).trim(),
    pluginItems,
    pluginCommand: { code: plugins.code, jsonCode: pluginsJson.code, error: stripAnsi(pluginsJson.stderr || plugins.stderr).trim() },
    mcp: mcpRaw,
    mcpServers: parseMcpServers(mcpRaw),
    mcpCommand: { code: mcp.code, error: stripAnsi(mcp.stderr).trim() },
    marketplaces: marketplaceItems,
    marketplacePlugins: loadMarketplacePluginCatalog(marketplaceItems, pluginItems),
    marketplaceOutput: stripAnsi(marketplaces.stdout || marketplaces.stderr).trim(),
    marketplaceCommand: { code: marketplaces.code, jsonCode: marketplacesJson.code, error: stripAnsi(marketplacesJson.stderr || marketplaces.stderr).trim() },
  };
});

ipcMain.handle("claude:run", async (_event, { projectPath, args, requestId } = {}) => {
  const cwd = projectPath && fs.existsSync(projectPath) ? projectPath : app.getPath("home");
  const argv = Array.isArray(args) ? args.map(String).filter(Boolean) : splitArgs(args);
  if (!argv.length) throw new Error("Claude 命令为空。");
  const claudeCommand = configuredClaudeCommand();
  let lastResult = null;
  for (const candidate of commandCandidates(claudeCommand)) {
    const result = await runStreamingProcess(candidate, argv, {
      cwd,
      requestId,
      timeoutMs: CLAUDE_TIMEOUT_MS,
      env: claudeProcessEnv({ CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" }),
      onChunk: (stream, text) => emitProcessChunk(_event.sender, "claude:run-stream-event", requestId, stream, text),
    });
    lastResult = result;
    if (!(result.code === 1 && /ENOENT/i.test(result.stderr || ""))) break;
  }
  const result = lastResult || {
    command: "claude",
    args: argv,
    cwd,
    code: 1,
    stdout: "",
    stderr: "未找到 Claude 命令。",
    durationMs: 0,
  };
  return {
    ...result,
    args: argv,
    stdout: stripAnsi(result.stdout),
    stderr: stripAnsi(result.stderr),
  };
});

ipcMain.handle("workspace:list-files", (_event, { projectPath, relativePath = "", depth = 2 } = {}) => {
  const { root, target } = resolveInsideProject(projectPath, relativePath);
  const walk = (folder, currentDepth) => {
    const entries = fs
      .readdirSync(folder, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith(".") || entry.name === ".env")
      .filter((entry) => !(entry.isDirectory() && isIgnoredWorkspaceDir(entry.name)))
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
      .slice(0, 120);

    return entries.map((entry) => {
      const fullPath = path.join(folder, entry.name);
      const relative = slashPath(path.relative(root, fullPath));
      const item = {
        name: entry.name,
        path: relative,
        type: entry.isDirectory() ? "directory" : "file",
      };
      if (entry.isFile()) {
        const stat = fs.statSync(fullPath);
        item.size = stat.size;
      }
      if (entry.isDirectory() && currentDepth > 0) {
        item.children = walk(fullPath, currentDepth - 1);
      }
      return item;
    });
  };

  return {
    root,
    path: slashPath(path.relative(root, target)),
    files: walk(target, Number(depth || 2)),
  };
});

ipcMain.handle("workspace:read-file", (_event, { projectPath, relativePath } = {}) => {
  const { target, relative } = resolveInsideProject(projectPath, relativePath);
  const stat = fs.statSync(target);
  if (!stat.isFile()) throw new Error("所选路径不是文件。");
  if (stat.size > MAX_TEXT_FILE_BYTES) throw new Error("文件太大，无法预览。");
  const buffer = fs.readFileSync(target);
  if (buffer.includes(0)) throw new Error("这里不能编辑二进制文件。");
  return {
    ...fileSnapshot(target, buffer),
    path: relative,
  };
});

ipcMain.handle("workspace:save-file", (_event, { projectPath, relativePath, content, baseUpdatedAt, baseSha256 } = {}) => {
  const { target, relative } = resolveInsideProject(projectPath, relativePath);
  const stat = fs.existsSync(target) ? fs.statSync(target) : null;
  if (stat && !stat.isFile()) throw new Error("所选路径不是文件。");
  if (stat && (baseUpdatedAt || baseSha256)) {
    const currentBuffer = fs.readFileSync(target);
    const currentUpdatedAt = stat.mtime.toISOString();
    const currentSha256 = hashBuffer(currentBuffer);
    const mtimeChanged = baseUpdatedAt && baseUpdatedAt !== currentUpdatedAt;
    const hashChanged = baseSha256 && baseSha256 !== currentSha256;
    if (mtimeChanged || hashChanged) {
      const error = new Error("文件已被外部修改。请重新读取后再保存，避免覆盖别人的改动。");
      error.code = "WORKSPACE_FILE_CONFLICT";
      error.details = {
        currentUpdatedAt,
        currentSha256,
      };
      throw error;
    }
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, String(content ?? ""), "utf8");
  return {
    ...fileSnapshot(target),
    path: relative,
  };
});

ipcMain.handle("workspace:cancel-command", (_event, { requestId } = {}) => {
  if (!String(requestId || "").startsWith("workspace_")) return { cancelled: false };
  const request = activeRequests.get(requestId);
  if (request) {
    if (typeof request.abort === "function") request.abort();
    else if (typeof request.kill === "function") request.kill();
    activeRequests.delete(requestId);
  }
  return { cancelled: Boolean(request) };
});

ipcMain.handle("workspace:run-command", async (_event, { projectPath, command, requestId } = {}) => {
  const cwd = resolveProjectRoot(projectPath);
  const cmd = String(command || "").trim();
  if (!cmd) throw new Error("命令为空。");

  return await new Promise((resolve) => {
    const startedAt = Date.now();
    const shellCommand = shellCommandForPlatform(cmd);
    const child = spawn(shellCommand.command, shellCommand.args, {
      cwd,
      windowsHide: process.platform === "win32",
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    let cancelled = false;
    if (requestId) {
      activeRequests.set(requestId, {
        kill: () => {
          cancelled = true;
          killChildProcess(child);
        },
      });
    }
    const timeout = setTimeout(() => {
      killChildProcess(child);
      stderr += "\n命令运行超过 120 秒，已停止。";
    }, 120000);

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stdout = trimOutput(stdout + text);
      emitProcessChunk(_event.sender, "workspace:command-stream-event", requestId, "stdout", text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stderr = trimOutput(stderr + text);
      emitProcessChunk(_event.sender, "workspace:command-stream-event", requestId, "stderr", text);
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      if (requestId) activeRequests.delete(requestId);
      resolve({
        command: cmd,
        cwd,
        code: cancelled ? 130 : 1,
        stdout,
        stderr: trimOutput(cancelled ? `${stderr}\n命令已取消。` : `${stderr}\n${error.message}`),
        durationMs: Date.now() - startedAt,
        cancelled,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (requestId) activeRequests.delete(requestId);
      resolve({
        command: cmd,
        cwd,
        code: cancelled ? 130 : code,
        stdout,
        stderr: trimOutput(cancelled ? `${stderr}\n命令已取消。` : stderr),
        durationMs: Date.now() - startedAt,
        cancelled,
      });
    });
  });
});
