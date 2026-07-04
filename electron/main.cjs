const { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const DEFAULT_SYSTEM_PROMPT =
  "You are a pragmatic senior coding assistant. Be concise, factual, and implementation-focused.";
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
  "project-context": "Use the active project folder as the working context when the user asks for coding or file work.",
  "code-review": "When reviewing code, prioritize bugs, regressions, risks, and missing tests before summaries.",
  "implementation-plan": "For non-trivial implementation work, give concrete steps and verification commands.",
  "terminal-helper": "When suggesting terminal commands, make them explicit and tie them to the active project path.",
  "mcp-runtime": "Expose Claude Code MCP status and route MCP setup work through Claude Code CLI commands.",
  "plugin-router": "Consider enabled plugins, skills, and tools automatically; do not require the user to type slash commands.",
  "marketplace-router": "Use Claude Code plugin marketplace commands when the user asks to discover or install plugins.",
  "custom-marketplaces": "Consider saved custom marketplace URLs as user-provided plugin sources.",
  debugger: "For debugging, reproduce the issue, form hypotheses, and focus on root-cause fixes.",
  "docs-writer": "When documentation is requested, write concise operational usage notes.",
  "test-writer": "When tests are requested, prefer behavior tests through public interfaces.",
};
const activeRequests = new Map();
const IGNORED_DIRS = new Set([".git", "node_modules", "dist", "build", "release", ".npm-cache", ".next", "coverage"]);
const IGNORED_DIR_PATTERNS = [/^release/i, /^out$/i, /^tmp$/i, /^temp$/i];
const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;
const MAX_COMMAND_OUTPUT_CHARS = 30000;
const CLAUDE_TIMEOUT_MS = 10 * 60 * 1000;

const CLAUDE_CODE_SETTINGS = {
  executionMode: "claude-code",
  claudeCommand: "claude",
  permissionMode: "default",
  outputFormat: "json",
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

function titleFromUserContent(content) {
  const text = String(content || "").replace(/\s+/g, " ").trim();
  if (!text) return "New chat";
  return text.length > 64 ? `${text.slice(0, 61)}...` : text;
}

function dataPath() {
  return path.join(app.getPath("userData"), "desktop-data.json");
}

function legacyDataPath() {
  return path.join(app.getPath("appData"), "Claude Code App", "desktop-data.json");
}

function defaultStore() {
  const createdAt = now();
  const env = envBag();
  const hasAnthropicEnv = Boolean(
    env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_BASE_URL || env.ANTHROPIC_MODEL,
  );
  const hasOpenAiEnv = Boolean(env.OPENAI_API_KEY || env.OPENAI_BASE_URL || env.OPENAI_MODEL);
  const provider = hasAnthropicEnv ? "anthropic" : "openai-compatible";
  const activeProject = {
    name: "local workspace",
    path: "",
  };
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
      language: "system",
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
        title: "New chat",
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
  const activeProject = store.activeProject || {
    name: store.sessions?.[0]?.project || fallback.activeProject.name,
    path: store.sessions?.[0]?.projectPath || "",
  };
  const projects = Array.isArray(store.projects) && store.projects.length ? store.projects : [activeProject];
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
    sessions: (store.sessions || fallback.sessions).map((session) => ({
      ...session,
      project: session.project || activeProject.name,
      projectPath: session.projectPath || activeProject.path || "",
      messages: Array.isArray(session.messages) ? session.messages : [],
    })),
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
    throw new Error("Select a project folder first.");
  }
  const root = path.resolve(candidate);
  const stat = fs.statSync(root);
  if (!stat.isDirectory()) throw new Error("Project path is not a folder.");
  return root;
}

function resolveInsideProject(projectPath, relativePath = "") {
  const root = resolveProjectRoot(projectPath);
  const target = path.resolve(root, relativePath || ".");
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path is outside the selected project.");
  }
  return { root, target, relative: slashPath(relative) };
}

function trimOutput(value) {
  const text = String(value || "");
  if (text.length <= MAX_COMMAND_OUTPUT_CHARS) return text;
  return `${text.slice(0, MAX_COMMAND_OUTPUT_CHARS)}\n\n[output truncated]`;
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

function runProcess(command, args = [], options = {}) {
  const timeoutMs = Number(options.timeoutMs || CLAUDE_TIMEOUT_MS);
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let child;
    try {
      const childEnv = { ...process.env, ...(options.env || {}) };
      for (const [key, value] of Object.entries(childEnv)) {
        if (value === undefined || value === null) delete childEnv[key];
      }
      child = spawn(command, args, {
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
        stdout: trimOutput(stdout),
        stderr: trimOutput(stderr),
        ...result,
      });
    };
    const timeout = setTimeout(() => {
      child.kill();
      finish({ code: 124, stderr: trimOutput(`${stderr}\nCommand timed out after ${timeoutMs}ms.`) });
    }, timeoutMs);

    if (options.requestId) activeRequests.set(options.requestId, child);
    child.stdout.on("data", (chunk) => {
      stdout = trimOutput(stdout + chunk.toString("utf8"));
    });
    child.stderr.on("data", (chunk) => {
      stderr = trimOutput(stderr + chunk.toString("utf8"));
    });
    child.on("error", (error) => {
      finish({ code: 1, stderr: trimOutput(`${stderr}\n${error.message}`) });
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
      child = spawn(command, args, {
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
      child.kill();
      finish({ code: 124, stderr: trimOutput(`${stderr}\nCommand timed out after ${timeoutMs}ms.`) });
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
  const candidates = [trimmed, ...trimmed.split(/\r?\n/).filter((line) => line.trim().startsWith("{"))].reverse();
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Keep trying later lines because Claude Code may print diagnostics before JSON.
    }
  }
  return null;
}

function stripAnsi(value) {
  return String(value || "").replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");
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
  const lines = output.split(/\r?\n/).filter(Boolean);
  const first = lines[0] || "";
  const branch = first.startsWith("## ") ? first.slice(3).split("...")[0].trim() : "";
  const changes = lines.filter((line) => !line.startsWith("## ")).length;
  return {
    available: result.code === 0,
    branch,
    changes,
    raw: output,
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
  return lastResult || { code: 1, stdout: "", stderr: "Claude command was not found.", durationMs: 0 };
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
    return normalizeStore({ ...defaultStore(), ...parsed });
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

function requireKeyIfNeeded(provider, baseUrl, apiKey) {
  if (provider === "ollama") return;
  if (provider === "openai-compatible" && isLocalBaseUrl(baseUrl)) return;
  if (!apiKey) {
    throw new Error("Missing API key. Open Settings and save a key for this provider.");
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
  const project = store.activeProject || { name: session.project || "local workspace", path: session.projectPath || "" };
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
    "Claudex desktop context:",
    `- Active project: ${project.name || "local workspace"}${project.path ? ` (${project.path})` : ""}`,
    enabledCapabilities.length ? "- Enabled capabilities:" : "",
    ...enabledCapabilities.map((item) => `  - ${item}`),
    customMarketplaces.length ? "- Custom plugin marketplaces:" : "",
    ...customMarketplaces.map((item) => `  - ${item}`),
  ]
    .filter(Boolean)
    .join("\n");
  return `${systemPrompt}\n\n${claudexContext}`;
}

async function requestOpenAiCompatible(store, session, apiKey, requestId) {
  const { model, baseUrl, temperature } = store.settings;
  requireKeyIfNeeded("openai-compatible", baseUrl, apiKey);
  const response = await fetchWithTimeout(joinUrl(baseUrl, "/chat/completions"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
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
    throw new Error(payload?.error?.message || `Provider returned HTTP ${response.status}`);
  }
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Provider response did not include assistant content.");
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
    throw new Error(payload?.error?.message || `Anthropic returned HTTP ${response.status}`);
  }
  const text = (payload?.content || [])
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
  if (!text) throw new Error("Anthropic response did not include text content.");
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
    throw new Error(payload?.error || `Ollama returned HTTP ${response.status}`);
  }
  const content = payload?.message?.content;
  if (!content) throw new Error("Ollama response did not include assistant content.");
  return content;
}

async function requestAssistant(store, session, requestId) {
  if (store.settings.claudeCode?.executionMode !== "api") {
    return requestClaudeCode(store, session, requestId);
  }
  const provider = store.settings.provider;
  const apiKey =
    decryptSecret(store.settings.apiKeys?.[provider]) ||
    (provider === "anthropic" ? envValue("ANTHROPIC_API_KEY") : envValue("OPENAI_API_KEY"));
  if (provider === "anthropic") return requestAnthropic(store, session, apiKey, requestId);
  if (provider === "ollama") return requestOllama(store, session, requestId);
  return requestOpenAiCompatible(store, session, apiKey, requestId);
}

async function requestClaudeCode(store, session, requestId) {
  const project = store.activeProject || { path: session.projectPath || "" };
  const cwd = project.path && fs.existsSync(project.path) ? project.path : app.getPath("home");
  const claudeCode = { ...CLAUDE_CODE_SETTINGS, ...(store.settings.claudeCode || {}) };
  const args = [
    "-p",
    session.messages[session.messages.length - 1]?.content || "",
    "--output-format",
    "json",
    "--model",
    store.settings.model || "claude-sonnet-4-5-20250929",
    "--permission-mode",
    claudeCode.permissionMode || "default",
    "--append-system-prompt",
    buildSystemPrompt(store, session),
  ];
  if (session.claudeSessionId) {
    args.push("--resume", session.claudeSessionId);
  }
  const result = await runClaudeCommand(claudeCode.claudeCommand || "claude", args, {
    cwd,
    requestId,
    timeoutMs: Number(store.settings.timeoutMs || CLAUDE_TIMEOUT_MS),
    env: { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" },
  });
  const payload = parseJsonOutput(result.stdout);
  if (result.code !== 0 || payload?.is_error) {
    const message = payload?.result || payload?.error || result.stderr || result.stdout || `Claude Code exited with ${result.code}`;
    throw new Error(stripAnsi(message));
  }
  if (!payload?.result) {
    throw new Error(stripAnsi(result.stdout || "Claude Code did not return a result."));
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
      text: payload.status || "working",
    });
    emitActivity(payload.status || "working");
    return;
  }
  if (payload.type === "system" && payload.subtype) {
    emitActivity(payload.subtype);
    return;
  }
  if (payload.type === "assistant" && Array.isArray(payload.message?.content)) {
    for (const block of payload.message.content) {
      if (block?.type === "tool_use") emitActivity(`Using ${block.name || "tool"}`);
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
    if (block?.type === "tool_use") emitActivity(`Using ${block.name || "tool"}`);
    return;
  }
  if (payload.type === "hook_event") {
    emitActivity(payload.hook_event_name || payload.name || "hook event");
    return;
  }
  if (payload.type === "tool_result") {
    emitActivity(payload.is_error ? "Tool returned an error" : "Tool completed");
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
    emitActivity(payload.is_error ? "Run finished with error" : "Run completed");
  }
}

async function requestClaudeCodeStream(store, session, requestId, sender) {
  const project = store.activeProject || { path: session.projectPath || "" };
  const cwd = project.path && fs.existsSync(project.path) ? project.path : app.getPath("home");
  const claudeCode = { ...CLAUDE_CODE_SETTINGS, ...(store.settings.claudeCode || {}) };
  const args = [
    "-p",
    session.messages[session.messages.length - 1]?.content || "",
    "--output-format",
    "stream-json",
    "--include-partial-messages",
    "--include-hook-events",
    "--verbose",
    "--model",
    store.settings.model || "claude-sonnet-4-5-20250929",
    "--permission-mode",
    claudeCode.permissionMode || "default",
    "--append-system-prompt",
    buildSystemPrompt(store, session),
  ];
  if (session.claudeSessionId) {
    args.push("--resume", session.claudeSessionId);
  }

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
    throw new Error(stripAnsi(result.stdout || "Claude Code did not return a result."));
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
    language: nextSettings.language || store.settings.language || "system",
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
    title: "Select project folder",
    properties: ["openDirectory"],
  });
  if (result.canceled || !result.filePaths[0]) return null;

  const store = readStore();
  addProject(store, projectFromPath(result.filePaths[0]));
  writeStore(store);
  return sanitizeStore(store);
});

ipcMain.handle("app:set-active-project", (_event, project) => {
  const store = readStore();
  const nextProject = project?.path ? projectFromPath(project.path) : { name: project?.name || "local workspace", path: "" };
  addProject(store, nextProject);
  writeStore(store);
  return sanitizeStore(store);
});

ipcMain.handle("chat:create-session", (_event, title = "New chat") => {
  const store = readStore();
  const createdAt = now();
  const project = store.activeProject || { name: "local workspace", path: "" };
  const currentProjectKey = String(project.path || project.name || "").trim().toLowerCase();
  const reusableIndex = store.sessions.findIndex(
    (item) => !hasSessionMessages(item) && isGenericSessionTitle(item.title) && sessionProjectKey(item) === currentProjectKey,
  );
  if (reusableIndex >= 0) {
    const [reusable] = store.sessions.splice(reusableIndex, 1);
    reusable.title = "New chat";
    reusable.project = project.name;
    reusable.projectPath = project.path;
    reusable.updatedAt = createdAt;
    store.sessions.unshift(reusable);
    writeStore(store);
    return sanitizeStore(store);
  }

  const session = {
    id: id("session"),
    title: isGenericSessionTitle(title) ? "New chat" : title,
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

ipcMain.handle("chat:send-message", async (_event, { sessionId, content, requestId }) => {
  if (!content || !String(content).trim()) throw new Error("Message is empty.");
  const store = readStore();
  const session = store.sessions.find((item) => item.id === sessionId) || store.sessions[0];
  if (!session) throw new Error("No chat session exists.");

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
      content: error.message || "Model request failed.",
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
  const git = parseGitEnvironment(await runProcess("git", ["status", "--short", "--branch"], { cwd, timeoutMs: 8000 }));
  return {
    cwd,
    git,
    ideOptions: ideOptions(),
  };
});

ipcMain.handle("claude:status", async (_event, { projectPath } = {}) => {
  const cwd = projectPath && fs.existsSync(projectPath) ? projectPath : app.getPath("home");
  const [version, auth, plugins, mcp] = await Promise.all([
    runClaudeCommand("claude", ["--version"], { cwd, timeoutMs: 20000 }),
    runClaudeCommand("claude", ["auth", "status"], { cwd, timeoutMs: 30000 }),
    runClaudeCommand("claude", ["plugin", "list"], { cwd, timeoutMs: 30000 }),
    runClaudeCommand("claude", ["mcp", "list"], { cwd, timeoutMs: 30000 }),
  ]);
  return {
    available: version.code === 0,
    version: stripAnsi(version.stdout || version.stderr).trim(),
    auth: parseJsonOutput(auth.stdout) || { raw: stripAnsi(auth.stdout || auth.stderr).trim(), code: auth.code },
    plugins: stripAnsi(plugins.stdout || plugins.stderr).trim(),
    mcp: stripAnsi(mcp.stdout || mcp.stderr).trim(),
  };
});

ipcMain.handle("claude:run", async (_event, { projectPath, args, requestId } = {}) => {
  const cwd = projectPath && fs.existsSync(projectPath) ? projectPath : app.getPath("home");
  const argv = Array.isArray(args) ? args.map(String).filter(Boolean) : splitArgs(args);
  if (!argv.length) throw new Error("Claude command is empty.");
  let lastResult = null;
  for (const candidate of commandCandidates("claude")) {
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
    stderr: "Claude command was not found.",
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
  if (!stat.isFile()) throw new Error("Selected path is not a file.");
  if (stat.size > MAX_TEXT_FILE_BYTES) throw new Error("File is too large to preview.");
  const buffer = fs.readFileSync(target);
  if (buffer.includes(0)) throw new Error("Binary files cannot be edited here.");
  return {
    path: relative,
    name: path.basename(target),
    content: buffer.toString("utf8"),
    size: stat.size,
    updatedAt: stat.mtime.toISOString(),
  };
});

ipcMain.handle("workspace:save-file", (_event, { projectPath, relativePath, content } = {}) => {
  const { target, relative } = resolveInsideProject(projectPath, relativePath);
  const stat = fs.existsSync(target) ? fs.statSync(target) : null;
  if (stat && !stat.isFile()) throw new Error("Selected path is not a file.");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, String(content ?? ""), "utf8");
  const nextStat = fs.statSync(target);
  return {
    path: relative,
    name: path.basename(target),
    content: String(content ?? ""),
    size: nextStat.size,
    updatedAt: nextStat.mtime.toISOString(),
  };
});

ipcMain.handle("workspace:run-command", async (_event, { projectPath, command, requestId } = {}) => {
  const cwd = resolveProjectRoot(projectPath);
  const cmd = String(command || "").trim();
  if (!cmd) throw new Error("Command is empty.");

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
    const timeout = setTimeout(() => {
      child.kill();
      stderr += "\nCommand timed out after 120s.";
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
      resolve({
        command: cmd,
        cwd,
        code: 1,
        stdout,
        stderr: trimOutput(`${stderr}\n${error.message}`),
        durationMs: Date.now() - startedAt,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({
        command: cmd,
        cwd,
        code,
        stdout,
        stderr,
        durationMs: Date.now() - startedAt,
      });
    });
  });
});
