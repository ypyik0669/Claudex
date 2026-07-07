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
const AUTOMATION_HISTORY_LIMIT = 8;
const AUTOMATION_LIMIT = 80;
const AUTOMATION_POLL_MS = 15000;
const AUTOMATION_REPEAT_MS = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};
const SUBAGENT_RUN_LIMIT = 40;
const COMMAND_RUN_LIMIT = 80;
const RUN_EVENT_LIMIT = 120;
const SOURCE_REF_LIMIT = 80;
const BROWSER_VISIT_LIMIT = 60;
const NOTICE_LIMIT = 80;
const MAX_SKILL_REGISTRY_ITEMS = 500;
const MAX_SKILL_SCAN_DEPTH = 10;
const MAX_SKILL_FILE_BYTES = 64 * 1024;
const automationRunLocks = new Set();
const cancelledSubagentRuns = new Set();
let automationSchedulerTimer = null;
let automationSchedulerRunning = false;

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

function sessionMatchesProject(session, project) {
  const key = projectKeyForStore(project);
  if (!key) return true;
  return sessionProjectKey(session) === key;
}

function visibleProjectSessions(store, project = store?.activeProject) {
  const key = projectKeyForStore(project);
  return (store?.sessions || []).filter((session) => !session.archived && (!key || sessionProjectKey(session) === key));
}

function ensureProjectDraftSession(store, project = store.activeProject || localWorkspaceProject()) {
  project = project || localWorkspaceProject();
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
    pinnedAt: "",
    archivedAt: "",
    renamedAt: "",
    forkedAt: "",
    forkedFromId: "",
    forkedFromTitle: "",
    forkedFromClaudeSessionId: "",
    claudeSessionId: "",
  };
  store.sessions = [session, ...(store.sessions || [])];
  return session;
}

function ensureActiveProjectDraftSession(store) {
  return ensureProjectDraftSession(store, store.activeProject || localWorkspaceProject());
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

function isoOrEmpty(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

function automationHasScheduledRun(automation) {
  return (automation.history || []).some((entry) => entry?.trigger === "scheduled" && entry?.endedAt);
}

function latestScheduledAutomationRunMs(automation) {
  return (automation.history || [])
    .filter((entry) => entry?.trigger === "scheduled")
    .map((entry) => new Date(entry.endedAt || entry.startedAt || "").getTime())
    .filter(Number.isFinite)
    .reduce((latest, value) => Math.max(latest, value), 0);
}

function normalizeAutomationScheduleType(type) {
  const value = String(type || "once").trim().toLowerCase();
  return ["once", "daily", "weekly"].includes(value) ? value : "once";
}

function automationNextRun(automation) {
  const runAt = isoOrEmpty(automation?.schedule?.runAt || automation?.runAt || automation?.time);
  if (!automation?.enabled || !runAt) return "";
  const type = normalizeAutomationScheduleType(automation.schedule?.type);
  if (type === "once") {
    if (automationHasScheduledRun(automation)) return "";
    return runAt;
  }
  const repeatMs = AUTOMATION_REPEAT_MS[type];
  if (!repeatMs) return runAt;
  const runAtMs = new Date(runAt).getTime();
  if (!Number.isFinite(runAtMs)) return "";
  const at = Date.now();
  if (runAtMs > at) return runAt;
  const latestDueMs = runAtMs + Math.floor((at - runAtMs) / repeatMs) * repeatMs;
  const latestRunMs = latestScheduledAutomationRunMs(automation);
  if (!latestRunMs || latestRunMs < latestDueMs) return new Date(latestDueMs).toISOString();
  return new Date(latestDueMs + repeatMs).toISOString();
}

function normalizeAutomationProject(project, store) {
  const fallback = store?.activeProject || localWorkspaceProject();
  if (project?.path) return projectFromPath(project.path);
  if (project?.name || project?.path) {
    return {
      name: project.name || path.basename(project.path || "") || fallback.name,
      path: project.path || "",
    };
  }
  return fallback;
}

function normalizeAutomationHistoryEntry(entry, item, createdAt) {
  return {
    id: entry?.id || id("automation_run"),
    trigger: entry?.trigger || "manual",
    status: entry?.status || "succeeded",
    startedAt: isoOrEmpty(entry?.startedAt) || createdAt,
    endedAt: isoOrEmpty(entry?.endedAt),
    durationMs: Number(entry?.durationMs || 0),
    sessionId: entry?.sessionId || item?.threadId || "",
    detail: String(entry?.detail || ""),
    error: String(entry?.error || ""),
    summary: String(entry?.summary || entry?.detail || ""),
    stdout: trimOutput(entry?.stdout || "", MAX_COMMAND_OUTPUT_CHARS),
    stderr: trimOutput(entry?.stderr || "", MAX_COMMAND_OUTPUT_CHARS),
    code: typeof entry?.code === "number" ? entry.code : null,
  };
}

function normalizeAutomation(item, store) {
  const createdAt = isoOrEmpty(item?.createdAt) || now();
  const schedule = {
    type: normalizeAutomationScheduleType(item?.schedule?.type || item?.scheduleType || item?.repeat),
    runAt: isoOrEmpty(item?.schedule?.runAt || item?.runAt || item?.time),
  };
  const history = Array.isArray(item?.history)
    ? item.history.slice(0, AUTOMATION_HISTORY_LIMIT).map((entry) => normalizeAutomationHistoryEntry(entry, item, createdAt))
    : [];
  const lastRun = item?.lastRun
    ? normalizeAutomationHistoryEntry(item.lastRun, item, createdAt)
    : history[0] || null;
  const automation = {
    id: item?.id || id("automation"),
    prompt: String(item?.prompt || "").trim(),
    schedule,
    project: normalizeAutomationProject(item?.project, store),
    threadId: item?.threadId || "",
    enabled: typeof item?.enabled === "boolean" ? item.enabled : Boolean(schedule.runAt),
    status: item?.status || (schedule.runAt ? "scheduled" : "idle"),
    createdAt,
    updatedAt: isoOrEmpty(item?.updatedAt) || createdAt,
    lastRun,
    nextRun: "",
    history,
  };
  automation.nextRun = automationNextRun(automation);
  if (automation.status !== "running") {
    if (automation.nextRun) automation.status = "scheduled";
    else if (!automation.enabled && automation.schedule.runAt && !automation.lastRun) automation.status = "paused";
    else if (automation.lastRun?.status === "failed") automation.status = "failed";
    else if (automation.lastRun?.status === "succeeded") automation.status = "succeeded";
    else if (automation.status === "paused") automation.status = "paused";
    else automation.status = automation.schedule.runAt && !automation.enabled ? "paused" : "idle";
  }
  return automation;
}

function updateAutomationAfterMutation(automation) {
  automation.updatedAt = now();
  automation.nextRun = automationNextRun(automation);
  if (automation.status !== "running") {
    if (automation.nextRun) automation.status = "scheduled";
    else if (!automation.enabled && automation.schedule?.runAt && !automation.lastRun) automation.status = "paused";
    else if (automation.lastRun?.status === "failed") automation.status = "failed";
    else if (automation.lastRun?.status === "succeeded") automation.status = "succeeded";
    else automation.status = automation.schedule?.runAt && !automation.enabled ? "paused" : "idle";
  }
  return automation;
}

function prependAutomationHistory(automation, entry) {
  automation.history = [
    entry,
    ...(automation.history || []).filter((item) => item.id !== entry.id),
  ].slice(0, AUTOMATION_HISTORY_LIMIT);
  automation.lastRun = entry;
}

function automationRunEventTitle(automation) {
  return `自动化：${titleFromUserContent(automation?.prompt || "计划任务")}`;
}

function automationRunEventDetail(automation, entry) {
  const trigger = entry?.trigger === "scheduled" ? "计划触发" : "手动触发";
  const project = automation?.project?.name || automation?.project?.path || "本地工作区";
  const output = entry?.error || entry?.detail || "";
  return [trigger, project, output].filter(Boolean).join(" · ");
}

function upsertAutomationRunEvent(store, automation, entry, status) {
  return upsertRunEvent(store, {
    id: entry.id,
    type: "automation",
    status,
    title: automationRunEventTitle(automation),
    detail: automationRunEventDetail(automation, entry),
    cwd: automation.project?.path || "",
    stdout: entry.stdout || "",
    stderr: entry.stderr || "",
    project: automation.project,
    sessionId: entry.sessionId || automation.threadId || "",
    code: typeof entry.code === "number" ? entry.code : null,
    durationMs: typeof entry.durationMs === "number" ? entry.durationMs : null,
    createdAt: entry.startedAt || now(),
  });
}

function upsertAutomationActionRunEvent(store, automation, action, detail = "") {
  const labels = {
    create: "创建",
    pause: "暂停",
    resume: "恢复",
    delete: "删除",
  };
  const actionLabel = labels[action] || action || "更新";
  const eventId = `automation:${automation.id}:${action}:${Date.now()}`;
  const project = automation?.project || store.activeProject || localWorkspaceProject();
  const actionDetail = detail || [
    project?.name || project?.path || "本地工作区",
    automation?.schedule?.runAt ? `下次运行: ${automation.schedule.runAt}` : "",
    automation?.threadId ? `线程: ${automation.threadId}` : "",
  ].filter(Boolean).join(" · ");
  return upsertRunEvent(store, {
    id: eventId,
    type: "automation-action",
    status: "ok",
    title: `自动化：${actionLabel} · ${titleFromUserContent(automation?.prompt || "计划任务")}`,
    detail: actionDetail,
    commandLine: "",
    cwd: project?.path || "",
    code: null,
    durationMs: 0,
    stdout: automation?.prompt || "",
    stderr: "",
    project,
    sessionId: automation?.threadId || "",
    createdAt: now(),
  });
}

function threadProjectForEvent(store, session = {}) {
  return {
    name: session?.project || store.activeProject?.name || "本地工作区",
    path: session?.projectPath || store.activeProject?.path || "",
  };
}

function upsertThreadActionRunEvent(store, session, action, detail = "", options = {}) {
  const labels = {
    rename: "重命名",
    pin: "置顶",
    unpin: "取消置顶",
    archive: "归档",
    restore: "恢复",
    fork: "Fork",
    delete: "删除",
    resume: "继续",
  };
  const actionLabel = labels[action] || action || "更新";
  const eventId = `thread:${session?.id || "unknown"}:${action}:${Date.now()}`;
  const title = sessionDisplayTitleForStore(session);
  const project = threadProjectForEvent(store, session);
  const targetSession = options.targetSession || null;
  const messageCount = sessionMessages(session).length;
  const actionDetail = detail || [
    project?.name || project?.path || "本地工作区",
    `${messageCount} 条消息`,
    targetSession?.id ? `目标聊天: ${targetSession.id}` : "",
  ].filter(Boolean).join(" · ");
  const stdout = [
    `action=${action}`,
    `sessionId=${session?.id || ""}`,
    `title=${title}`,
    `project=${project?.name || ""}`,
    project?.path ? `projectPath=${project.path}` : "",
    `messageCount=${messageCount}`,
    session?.claudeSessionId ? `claudeSessionId=${session.claudeSessionId}` : "",
    targetSession?.id ? `targetSessionId=${targetSession.id}` : "",
    targetSession?.title ? `targetTitle=${sessionDisplayTitleForStore(targetSession)}` : "",
  ].filter(Boolean).join("\n");
  return upsertRunEvent(store, {
    id: eventId,
    type: "thread-action",
    status: "ok",
    title: `聊天：${actionLabel} · ${title}`,
    detail: actionDetail,
    commandLine: "",
    cwd: project?.path || "",
    code: null,
    durationMs: 0,
    stdout,
    stderr: "",
    project,
    sessionId: session?.id || "",
    createdAt: now(),
  });
}

function normalizeSubagentRun(item, store) {
  const startedAt = isoOrEmpty(item?.startedAt) || now();
  const status = ["running", "done", "error", "cancelled"].includes(item?.status) ? item.status : "done";
  const project = normalizeAutomationProject(item?.project, store);
  return {
    id: item?.id || id("subagent"),
    requestId: item?.requestId || "",
    nickname: String(item?.nickname || "Subagent").trim() || "Subagent",
    task: String(item?.task || "").trim(),
    status,
    sessionId: item?.sessionId || "",
    project,
    cwd: item?.cwd || project?.path || "",
    command: item?.command || "",
    args: Array.isArray(item?.args) ? item.args.map(String) : [],
    stdout: trimOutput(item?.stdout || "", MAX_COMMAND_OUTPUT_CHARS),
    stderr: trimOutput(item?.stderr || "", MAX_COMMAND_OUTPUT_CHARS),
    summary: String(item?.summary || ""),
    code: typeof item?.code === "number" ? item.code : null,
    durationMs: Number(item?.durationMs || 0),
    startedAt,
    endedAt: isoOrEmpty(item?.endedAt),
    artifacts: Array.isArray(item?.artifacts) ? item.artifacts.slice(0, 12) : [],
    archivedAt: isoOrEmpty(item?.archivedAt),
    continuedAt: isoOrEmpty(item?.continuedAt),
    continuedSessionId: String(item?.continuedSessionId || ""),
  };
}

function upsertSubagentRun(store, run) {
  store.subagentRuns = [
    run,
    ...(store.subagentRuns || []).filter((item) => item.id !== run.id),
  ].slice(0, SUBAGENT_RUN_LIMIT);
  return run;
}

function subagentRunEventTitle(run) {
  return `子代理：${titleFromUserContent(run?.nickname || "Subagent")}`;
}

function subagentRunEventDetail(run) {
  const project = run?.project?.name || run?.project?.path || "本地工作区";
  const output = run?.summary || run?.stderr || run?.stdout || run?.task || "";
  return [project, output].filter(Boolean).join(" · ");
}

function upsertSubagentRunEvent(store, run, status) {
  return upsertRunEvent(store, {
    id: run.requestId || run.id,
    type: "subagent",
    status,
    title: subagentRunEventTitle(run),
    detail: subagentRunEventDetail(run),
    commandLine: [run.command, ...(run.args || [])].filter(Boolean).join(" "),
    cwd: run.cwd || run.project?.path || "",
    code: typeof run.code === "number" ? run.code : null,
    durationMs: typeof run.durationMs === "number" ? run.durationMs : null,
    stdout: run.stdout || "",
    stderr: run.stderr || "",
    project: run.project,
    sessionId: run.sessionId || "",
    createdAt: run.startedAt || now(),
  });
}

function upsertSubagentActionRunEvent(store, run, action) {
  const labels = {
    archive: "关闭记录",
    restore: "恢复记录",
    continue: "续写到聊天",
  };
  const actionLabel = labels[action] || action || "更新";
  const eventId = `${run.requestId || run.id}:${action}`;
  const targetSessionId = action === "continue" && run.continuedSessionId ? run.continuedSessionId : run.sessionId || "";
  return upsertRunEvent(store, {
    id: eventId,
    type: "subagent-action",
    status: "ok",
    title: `子代理：${actionLabel} · ${titleFromUserContent(run?.nickname || "Subagent")}`,
    detail: [
      run?.project?.name || run?.project?.path || "本地工作区",
      targetSessionId ? `聊天: ${targetSessionId}` : "",
      run?.summary || run?.stderr || run?.task || "",
    ].filter(Boolean).join(" · "),
    commandLine: [run.command, ...(run.args || [])].filter(Boolean).join(" "),
    cwd: run.cwd || run.project?.path || "",
    code: typeof run.code === "number" ? run.code : null,
    durationMs: typeof run.durationMs === "number" ? run.durationMs : null,
    stdout: run.stdout || "",
    stderr: run.stderr || "",
    project: run.project,
    sessionId: targetSessionId,
    createdAt: now(),
  });
}

function persistSubagentChunk({ runId, requestId, stream, text }) {
  const cleanText = stripAnsi(text || "");
  if (!cleanText) return null;
  const store = readStore();
  const existing = findSubagentRun(store, { runId, requestId });
  if (!existing || existing.status !== "running") return null;
  const key = stream === "stderr" ? "stderr" : "stdout";
  const nextRun = normalizeSubagentRun({
    ...existing,
    [key]: trimOutput(`${existing[key] || ""}${cleanText}`, MAX_COMMAND_OUTPUT_CHARS),
  }, store);
  upsertSubagentRun(store, nextRun);
  upsertSubagentRunEvent(store, nextRun, "running");
  writeStore(store);
  broadcastStoreUpdate(store);
  return nextRun;
}

function findSubagentRun(store, { runId, requestId } = {}) {
  const byRunId = String(runId || "");
  const byRequestId = String(requestId || "");
  return (store.subagentRuns || []).find((item) => (
    (byRunId && item.id === byRunId) || (byRequestId && item.requestId === byRequestId)
  ));
}

function subagentContinuationMessage(run) {
  const artifacts = Array.isArray(run?.artifacts) ? run.artifacts : [];
  const artifactLabels = artifacts
    .map((artifact, index) => artifact?.label || artifact?.path || artifact?.type || `Artifact ${index + 1}`)
    .filter(Boolean)
    .join(", ");
  return [
    `子代理结果：${run?.nickname || "Subagent"}`,
    "",
    `任务：${run?.task || ""}`,
    `状态：${run?.status || ""}`,
    `退出码：${typeof run?.code === "number" ? run.code : "-"}`,
    run?.cwd ? `工作目录：${run.cwd}` : "",
    run?.sessionId ? `会话：${run.sessionId}` : "",
    artifactLabels ? `产物：${artifactLabels}` : "",
    "",
    run?.summary || "",
    run?.stderr ? `[stderr]\n${run.stderr}` : "",
  ].filter(Boolean).join("\n");
}

function normalizeCommandRun(item, store) {
  const project = normalizeAutomationProject(item?.project, store);
  const startedAt = isoOrEmpty(item?.startedAt) || now();
  const endedAt = isoOrEmpty(item?.endedAt) || startedAt;
  const command = String(item?.command || item?.commandLine || "").trim();
  const rawKind = String(item?.kind || "workspace").trim();
  const kind = ["workspace", "claude", "capability"].includes(rawKind) ? rawKind : "workspace";
  return {
    id: item?.id || id("command"),
    requestId: item?.requestId || "",
    kind,
    command,
    commandLine: command,
    cwd: item?.cwd || project?.path || "",
    project,
    code: typeof item?.code === "number" ? item.code : null,
    durationMs: Number(item?.durationMs || 0),
    stdout: trimOutput(item?.stdout || "", MAX_COMMAND_OUTPUT_CHARS),
    stderr: trimOutput(item?.stderr || "", MAX_COMMAND_OUTPUT_CHARS),
    cancelled: Boolean(item?.cancelled),
    startedAt,
    endedAt,
  };
}

function upsertCommandRun(store, run) {
  const normalized = normalizeCommandRun(run, store);
  store.commandRuns = [
    normalized,
    ...(store.commandRuns || []).filter((item) => item.id !== normalized.id),
  ].slice(0, COMMAND_RUN_LIMIT);
  return normalized;
}

function commandRunEventType(run, fallbackType = "workspace-command") {
  const runId = String(run?.requestId || run?.id || "");
  if (runId.startsWith("git_command_")) return "git-command";
  return fallbackType;
}

function upsertCommandRunEvent(store, run, status, fallbackType = "workspace-command") {
  const normalized = normalizeCommandRun(run, store);
  const eventType = commandRunEventType(normalized, fallbackType);
  const commandLine = normalized.commandLine || normalized.command || "";
  const codeLabel = typeof normalized.code === "number" ? normalized.code : "-";
  const detail = status === "running"
    ? normalized.cwd
    : status === "cancelled" || normalized.cancelled
      ? "命令已取消。"
      : `退出码: ${codeLabel}`;
  return upsertRunEvent(store, {
    id: normalized.requestId || normalized.id,
    type: eventType,
    status,
    title: `${eventType === "git-command" ? "Git" : "Workspace"}: ${titleFromUserContent(commandLine || "command")}`,
    detail,
    commandLine,
    cwd: normalized.cwd,
    code: typeof normalized.code === "number" ? normalized.code : null,
    durationMs: typeof normalized.durationMs === "number" ? normalized.durationMs : null,
    stdout: normalized.stdout || "",
    stderr: normalized.stderr || "",
    project: normalized.project,
    sessionId: String(run?.sessionId || normalized.requestId || normalized.id || ""),
    createdAt: normalized.startedAt || now(),
  });
}

function normalizeRunEvent(item, store) {
  const project = normalizeAutomationProject(item?.project, store);
  const status = ["running", "ok", "error", "cancelled"].includes(item?.status) ? item.status : "ok";
  return {
    id: item?.id || id("run_event"),
    type: String(item?.type || "run").trim() || "run",
    status,
    title: String(item?.title || "").trim(),
    detail: String(item?.detail || ""),
    commandLine: String(item?.commandLine || ""),
    cwd: String(item?.cwd || project?.path || ""),
    code: typeof item?.code === "number" ? item.code : null,
    durationMs: typeof item?.durationMs === "number" ? item.durationMs : null,
    stdout: String(item?.stdout || ""),
    stderr: String(item?.stderr || ""),
    project,
    sessionId: String(item?.sessionId || ""),
    createdAt: isoOrEmpty(item?.createdAt) || now(),
  };
}

function upsertRunEvent(store, event) {
  const existing = (store.runEvents || []).find((item) => item.id && item.id === event?.id);
  const incomingIsStaleStart = existing && existing.status !== "running" && event?.status === "running";
  const normalized = normalizeRunEvent({
    ...existing,
    ...event,
    ...(incomingIsStaleStart ? existing : {}),
    createdAt: existing?.createdAt || event?.createdAt,
  }, store);
  store.runEvents = [
    normalized,
    ...(store.runEvents || []).filter((item) => item.id !== normalized.id),
  ].slice(0, RUN_EVENT_LIMIT);
  return normalized;
}

function normalizeSourceRef(item, store) {
  const project = normalizeAutomationProject(item?.project, store);
  const sourcePath = slashPath(item?.path || item?.relativePath || "");
  const type = item?.type || "file";
  return {
    id: item?.id || `${type}:${project?.path || project?.name || "workspace"}:${sourcePath}`,
    type,
    path: sourcePath,
    title: item?.title || path.basename(sourcePath) || sourcePath,
    project,
    size: Number(item?.size || 0),
    sha256: item?.sha256 || "",
    updatedAt: isoOrEmpty(item?.updatedAt),
    lastOpenedAt: isoOrEmpty(item?.lastOpenedAt) || now(),
  };
}

function upsertSourceRef(store, source) {
  const normalized = normalizeSourceRef(source, store);
  store.sourceRefs = [
    normalized,
    ...(store.sourceRefs || []).filter((item) => item.id !== normalized.id),
  ].slice(0, SOURCE_REF_LIMIT);
  return normalized;
}

function normalizeUrlForStore(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function normalizeBrowserVisit(item, store) {
  const url = normalizeUrlForStore(item?.url);
  const status = ["loading", "ready", "error", "external", "idle"].includes(item?.status) ? item.status : "idle";
  const project = normalizeAutomationProject(item?.project, store);
  const startedAt = isoOrEmpty(item?.startedAt) || now();
  const endedAt = isoOrEmpty(item?.endedAt) || (status === "loading" ? "" : now());
  const finalUrl = normalizeUrlForStore(item?.finalUrl || item?.resolvedUrl || item?.validatedUrl || item?.url);
  return {
    id: item?.id || id("browser"),
    url,
    finalUrl,
    title: trimOutput(String(item?.title || ""), 400),
    excerpt: trimOutput(String(item?.excerpt || item?.snapshot?.text || ""), 1200),
    status,
    error: String(item?.error || ""),
    httpStatus: item?.httpStatus ? Number(item.httpStatus) : null,
    errorCode: Number.isFinite(Number(item?.errorCode)) ? Number(item.errorCode) : null,
    validatedUrl: normalizeUrlForStore(item?.validatedUrl || item?.validatedURL || item?.validatedURLString),
    isMainFrame: Boolean(item?.isMainFrame),
    project,
    startedAt,
    endedAt,
    lastEventAt: isoOrEmpty(item?.lastEventAt) || now(),
    snapshotCapturedAt: isoOrEmpty(item?.snapshotCapturedAt) || (item?.title || item?.excerpt ? now() : ""),
    external: Boolean(item?.external || status === "external"),
  };
}

function upsertBrowserVisit(store, visit) {
  const normalized = normalizeBrowserVisit(visit, store);
  store.browserVisits = [
    normalized,
    ...(store.browserVisits || []).filter((item) => item.id !== normalized.id),
  ].slice(0, BROWSER_VISIT_LIMIT);
  return normalized;
}

function normalizeNotice(item, store) {
  const level = ["error", "warning", "info", "success"].includes(item?.level) ? item.level : "info";
  const createdAt = isoOrEmpty(item?.createdAt) || now();
  const project = normalizeAutomationProject(item?.project, store);
  return {
    id: item?.id || id("notice"),
    key: String(item?.key || ""),
    level,
    source: String(item?.source || "Claudex"),
    title: String(item?.title || item?.message || "Notice").trim(),
    detail: trimOutput(String(item?.detail || item?.error || ""), 6000),
    action: String(item?.action || ""),
    runEventId: String(item?.runEventId || ""),
    sessionId: String(item?.sessionId || ""),
    project,
    count: Math.max(1, Number(item?.count || 1)),
    createdAt,
    lastSeenAt: isoOrEmpty(item?.lastSeenAt) || createdAt,
    dismissedAt: isoOrEmpty(item?.dismissedAt),
  };
}

function upsertNotice(store, notice) {
  const normalized = normalizeNotice(notice, store);
  const existing = normalized.key
    ? (store.notices || []).find((item) => item.key === normalized.key && !item.dismissedAt)
    : null;
  const nextNotice = existing
    ? {
      ...existing,
      ...normalized,
      id: existing.id,
      count: Math.max(1, Number(existing.count || 1)) + 1,
      createdAt: existing.createdAt || normalized.createdAt,
      lastSeenAt: now(),
      dismissedAt: "",
    }
    : normalized;
  store.notices = [
    nextNotice,
    ...(store.notices || []).filter((item) => item.id !== nextNotice.id),
  ].slice(0, NOTICE_LIMIT);
  return nextNotice;
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
    automations: [],
    subagentRuns: [],
    commandRuns: [],
    runEvents: [],
    sourceRefs: [],
    browserVisits: [],
    notices: [],
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
        pinnedAt: session.pinned ? isoOrEmpty(session.pinnedAt) : "",
        archivedAt: session.archived ? isoOrEmpty(session.archivedAt) : "",
        renamedAt: isoOrEmpty(session.renamedAt),
        forkedAt: isoOrEmpty(session.forkedAt),
        forkedFromId: String(session.forkedFromId || ""),
        forkedFromTitle: String(session.forkedFromTitle || ""),
        forkedFromClaudeSessionId: String(session.forkedFromClaudeSessionId || ""),
      };
    }),
    automations: Array.isArray(store.automations)
      ? store.automations.map((automation) => normalizeAutomation(automation, { ...store, activeProject }))
          .filter((automation) => automation.prompt)
          .slice(0, AUTOMATION_LIMIT)
      : [],
    subagentRuns: Array.isArray(store.subagentRuns)
      ? store.subagentRuns.map((run) => normalizeSubagentRun(run, { ...store, activeProject }))
          .filter((run) => run.task)
          .slice(0, SUBAGENT_RUN_LIMIT)
      : [],
    commandRuns: Array.isArray(store.commandRuns)
      ? store.commandRuns.map((run) => normalizeCommandRun(run, { ...store, activeProject }))
          .filter((run) => run.command)
          .slice(0, COMMAND_RUN_LIMIT)
      : [],
    runEvents: Array.isArray(store.runEvents)
      ? store.runEvents.map((event) => normalizeRunEvent(event, { ...store, activeProject }))
          .filter((event) => event.title)
          .slice(0, RUN_EVENT_LIMIT)
      : [],
    sourceRefs: Array.isArray(store.sourceRefs)
      ? store.sourceRefs.map((source) => normalizeSourceRef(source, { ...store, activeProject }))
          .filter((source) => source.path)
          .slice(0, SOURCE_REF_LIMIT)
      : [],
    browserVisits: Array.isArray(store.browserVisits)
      ? store.browserVisits.map((visit) => normalizeBrowserVisit(visit, { ...store, activeProject }))
          .filter((visit) => visit.url)
          .slice(0, BROWSER_VISIT_LIMIT)
      : [],
    notices: Array.isArray(store.notices)
      ? store.notices.map((notice) => normalizeNotice(notice, { ...store, activeProject }))
          .filter((notice) => notice.title)
          .slice(0, NOTICE_LIMIT)
      : [],
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

function resolveNodeCommandShim(command, args = []) {
  if (process.platform !== "win32") return null;
  if (!/\.(?:cmd|bat)$/i.test(String(command || "")) || !fs.existsSync(command)) return null;
  const dir = path.dirname(command);
  let text = "";
  try {
    text = fs.readFileSync(command, "utf8");
  } catch {
    return null;
  }
  const match = text.match(/["']%~dp0([^"']+\.(?:cjs|mjs|js))["']\s+%[*]/i)
    || text.match(/["']%dp0%\\?([^"']+\.(?:cjs|mjs|js))["']\s+%[*]/i)
    || text.match(/["']([A-Za-z]:[^"']+\.(?:cjs|mjs|js))["']\s+%[*]/i);
  if (!match) return null;

  const scriptPath = path.isAbsolute(match[1])
    ? match[1]
    : path.resolve(dir, match[1].replace(/^[\\/]+/, ""));
  if (!fs.existsSync(scriptPath)) return null;

  const localNode = path.join(dir, "node.exe");
  return {
    command: fs.existsSync(localNode) ? localNode : "node",
    args: [scriptPath, ...args],
  };
}

function spawnDescriptor(command, args = []) {
  const nodeShim = resolveNodeCommandShim(command, args);
  if (nodeShim) return nodeShim;
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

function parseJsonListOutput(output, keys = []) {
  const parsed = parseJsonOutput(output);
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== "object") return [];
  const candidateKeys = [...keys, "items", "data", "results", "plugins", "marketplaces", "servers"];
  for (const key of candidateKeys) {
    if (Array.isArray(parsed[key])) return parsed[key];
  }
  return [];
}

function stripAnsi(value) {
  return String(value || "").replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

function commandOutputExcerpt(result) {
  return stripAnsi([result?.stderr, result?.stdout].filter(Boolean).join("\n")).trim();
}

function statusCommandState(result, jsonResult = null) {
  const plain = result || {};
  const json = jsonResult || null;
  const plainError = commandOutputExcerpt(plain);
  const jsonError = json ? commandOutputExcerpt(json) : "";
  return {
    code: typeof plain.code === "number" ? plain.code : null,
    jsonCode: json && typeof json.code === "number" ? json.code : undefined,
    stdout: stripAnsi(plain.stdout || "").trim(),
    stderr: stripAnsi(plain.stderr || "").trim(),
    jsonStdout: json ? stripAnsi(json.stdout || "").trim() : undefined,
    jsonStderr: json ? stripAnsi(json.stderr || "").trim() : undefined,
    error: jsonError || plainError,
  };
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

function summarizeStructuredList(value, separator = ", ") {
  if (Array.isArray(value)) return value
    .map((item) => summarizeStructuredList(item, separator))
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join(", ");
  if (value && typeof value === "object") {
    return Object.entries(value)
      .filter(([, itemValue]) => itemValue !== false && itemValue !== null && itemValue !== undefined && itemValue !== "")
      .map(([key, itemValue]) => itemValue === true ? key : `${key}:${summarizeStructuredList(itemValue, separator)}`)
      .join(separator);
  }
  return String(value || "").trim();
}

function pluginToolsSummary(plugin) {
  return summarizeStructuredList(plugin?.tools || plugin?.toolNames || plugin?.commands || plugin?.slashCommands || plugin?.mcpTools);
}

function pluginPermissionsSummary(plugin) {
  return summarizeStructuredList(plugin?.permissions || plugin?.allowedTools || plugin?.capabilities || plugin?.permissionSummary);
}

function pluginErrorSummary(plugin) {
  const error = plugin?.error || plugin?.lastError || plugin?.errors || plugin?.diagnostics;
  return summarizeStructuredList(error, " · ");
}

function normalizeClaudePluginItems(jsonOutput, rawOutput) {
  const jsonItems = parseJsonListOutput(jsonOutput, ["plugins", "installedPlugins"]);
  const sourceItems = jsonItems.length ? jsonItems : parseClaudePluginText(rawOutput);
  return sourceItems.map((plugin) => {
    const idText = String(plugin.id || plugin.name || "").trim();
    const statusText = String(plugin.status || plugin.state || "").trim();
    const enabled = typeof plugin.enabled === "boolean"
      ? plugin.enabled
      : typeof plugin.disabled === "boolean"
        ? !plugin.disabled
        : /enabled|active|ready|ok|connected/i.test(statusText);
    const source = plugin.source || plugin.installSource || plugin.registry || plugin.repository || plugin.repo || plugin.url || "claude-code";
    return {
      id: idText,
      name: String(plugin.name || pluginNameFromId(idText)).trim() || idText,
      marketplace: String(plugin.marketplace || pluginMarketplaceFromId(idText)).trim(),
      version: String(plugin.version || "unknown"),
      description: String(plugin.description || plugin.summary || ""),
      scope: String(plugin.scope || ""),
      enabled,
      status: statusText || (enabled ? "enabled" : "disabled"),
      installPath: String(plugin.installPath || plugin.path || plugin.location || ""),
      installedAt: String(plugin.installedAt || ""),
      lastUpdated: String(plugin.lastUpdated || ""),
      source: marketplacePluginSourceSummary(source) || "claude-code",
      tools: pluginToolsSummary(plugin),
      permissions: pluginPermissionsSummary(plugin),
      error: pluginErrorSummary(plugin),
    };
  }).filter((plugin) => plugin.id);
}

function normalizeMarketplaceItems(jsonOutput, rawOutput) {
  const jsonItems = parseJsonListOutput(jsonOutput, ["marketplaces"]);
  if (jsonItems.length) {
    return jsonItems.map((item) => ({
      name: String(item.name || "").trim(),
      source: String(item.source || ""),
      repo: String(item.repo || item.url || item.path || ""),
      installLocation: String(item.installLocation || item.path || ""),
      version: String(item.version || item.release || item.revision || ""),
      status: String(item.status || item.state || (item.enabled === true ? "enabled" : item.enabled === false ? "disabled" : "")),
      description: String(item.description || item.summary || ""),
      tools: summarizeStructuredList(item.tools || item.toolNames || item.commands || item.capabilities),
      permissions: summarizeStructuredList(item.permissions || item.allowedTools || item.permissionSummary),
      error: pluginErrorSummary(item),
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
    const pair = line.match(/^([^:]+):\s*(.+)$/);
    if (!current || !pair) continue;
    const key = pair[1].trim().toLowerCase();
    const value = pair[2].trim();
    if (key === "version") current.version = value;
    if (key === "status" || key === "state") current.status = value;
    if (key === "description" || key === "summary") current.description = value;
    if (key === "repo" || key === "repository" || key === "url") current.repo = value;
    if (key === "install location" || key === "install path" || key === "location" || key === "path") current.installLocation = value;
    if (key === "tools" || key === "commands") current.tools = value;
    if (key === "permissions" || key === "allowed tools") current.permissions = value;
    if (key === "error" || key === "last error") current.error = value;
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

function marketplacePluginPermissionsSummary(plugin) {
  const permissions = plugin?.permissions || plugin?.allowedTools || plugin?.tools || plugin?.capabilities;
  return summarizeStructuredList(permissions);
}

function marketplacePluginRiskSummary(plugin) {
  const explicit = plugin?.risk || plugin?.risks || plugin?.security || plugin?.warning;
  return summarizeStructuredList(explicit, " · ");
}

function marketplacePluginName(plugin) {
  return String(plugin?.name || plugin?.id || plugin?.slug || plugin?.packageName || "").trim();
}

function marketplacePluginAuthor(plugin, manifest) {
  const author = plugin?.author || plugin?.owner || plugin?.publisher || manifest?.owner || manifest?.author;
  return typeof author === "string" ? author : author?.name || "";
}

function marketplacePluginSource(plugin) {
  return plugin?.source || plugin?.repository || plugin?.repo || plugin?.url || plugin?.homepage || "";
}

function marketplacePluginCatalogItem(plugin, manifest, marketplace, root, installedIds) {
  const name = marketplacePluginName(plugin);
  if (!name) return null;
  const idText = `${name}@${marketplace.name}`;
  const installed = installedIds.has(idText.toLowerCase()) || installedIds.has(name.toLowerCase());
  return {
    id: idText,
    name,
    marketplace: marketplace.name,
    version: String(plugin.version || manifest?.version || "unknown"),
    description: String(plugin.description || plugin.summary || manifest?.description || manifest?.metadata?.description || ""),
    category: String(plugin.category || plugin.type || ""),
    author: String(marketplacePluginAuthor(plugin, manifest) || ""),
    homepage: String(plugin.homepage || plugin.url || ""),
    source: marketplacePluginSourceSummary(marketplacePluginSource(plugin)),
    permissions: marketplacePluginPermissionsSummary(plugin),
    risk: marketplacePluginRiskSummary(plugin),
    installLocation: root,
    installed,
  };
}

function marketplaceManifestRootCandidates(marketplace) {
  return [
    marketplace?.installLocation,
    marketplace?.repo,
    marketplace?.path,
    marketplace?.source,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value) => (
      fs.existsSync(value) &&
      fs.statSync(value).isDirectory()
    ));
}

function readMarketplaceManifest(marketplace) {
  for (const root of marketplaceManifestRootCandidates(marketplace)) {
    const direct = readJsonFileSafe(path.join(root, ".claude-plugin", "marketplace.json"));
    if (direct) return { manifest: direct, root };
    const nested = readJsonFileSafe(path.join(root, "marketplace.json"));
    if (nested) return { manifest: nested, root };
  }
  return { manifest: null, root: "" };
}

function marketplacePluginManifestRoot(manifestFile) {
  const dir = path.dirname(manifestFile);
  return path.basename(dir) === ".claude-plugin" ? path.dirname(dir) : dir;
}

function readMarketplacePluginManifests(root) {
  const manifests = [];
  const queue = [{ dir: root, depth: 0 }];
  const seenFiles = new Set();
  let inspectedDirs = 0;
  while (queue.length && manifests.length < 240 && inspectedDirs < 1200) {
    const { dir, depth } = queue.shift();
    inspectedDirs += 1;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isFile() && entry.name === "plugin.json") {
        const file = path.join(dir, entry.name);
        if (seenFiles.has(file)) continue;
        seenFiles.add(file);
        const plugin = readJsonFileSafe(file);
        if (plugin && typeof plugin === "object") {
          manifests.push({
            plugin,
            root: marketplacePluginManifestRoot(file),
            manifestPath: file,
          });
          if (manifests.length >= 240) break;
        }
      }
    }
    if (depth >= 5 || manifests.length >= 240) continue;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (IGNORED_DIRS.has(entry.name) || IGNORED_DIR_PATTERNS.some((pattern) => pattern.test(entry.name))) continue;
      queue.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
    }
  }
  return manifests;
}

function loadMarketplacePluginCatalog(marketplaces, installedPlugins) {
  const installedIds = new Set();
  for (const plugin of installedPlugins || []) {
    if (plugin.id) installedIds.add(String(plugin.id).toLowerCase());
    if (plugin.name) installedIds.add(String(plugin.name).toLowerCase());
    if (plugin.name && plugin.marketplace) installedIds.add(`${plugin.name}@${plugin.marketplace}`.toLowerCase());
  }
  const catalog = [];
  const seenCatalogIds = new Set();
  function addCatalogItem(plugin, manifest, marketplace, root) {
    const item = marketplacePluginCatalogItem(plugin, manifest, marketplace, root, installedIds);
    if (!item?.id || seenCatalogIds.has(item.id.toLowerCase())) return false;
    seenCatalogIds.add(item.id.toLowerCase());
    catalog.push(item);
    return catalog.length >= 240;
  }
  for (const marketplace of marketplaces || []) {
    const roots = marketplaceManifestRootCandidates(marketplace);
    const { manifest, root } = readMarketplaceManifest(marketplace);
    const plugins = Array.isArray(manifest?.plugins) ? manifest.plugins : [];
    for (const plugin of plugins) {
      if (addCatalogItem(plugin, manifest, marketplace, root)) return catalog;
    }
    for (const candidateRoot of roots) {
      for (const pluginManifest of readMarketplacePluginManifests(candidateRoot)) {
        if (addCatalogItem(pluginManifest.plugin, pluginManifest.plugin, marketplace, pluginManifest.root)) return catalog;
      }
    }
  }
  return catalog;
}

function normalizeSkillId(value, fallback) {
  const text = String(value || fallback || "skill")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return text || "skill";
}

function parseYamlScalar(value) {
  const text = String(value || "").trim();
  return text.replace(/^["']|["']$/g, "");
}

function parseSkillFrontmatter(content) {
  const text = String(content || "").replace(/^\uFEFF/, "");
  const match = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const result = {};
  const stack = [{ indent: -1, target: result }];
  for (const rawLine of match[1].split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trim().startsWith("#")) continue;
    const lineMatch = rawLine.match(/^(\s*)([A-Za-z0-9_.-]+)\s*:\s*(.*)$/);
    if (!lineMatch) continue;
    const indent = lineMatch[1].length;
    const key = lineMatch[2];
    const rawValue = lineMatch[3];
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].target;
    if (rawValue.trim() === "") {
      parent[key] = parent[key] && typeof parent[key] === "object" ? parent[key] : {};
      stack.push({ indent, target: parent[key] });
      continue;
    }
    parent[key] = parseYamlScalar(rawValue);
  }
  return result;
}

function firstMarkdownParagraph(content) {
  const body = String(content || "").replace(/^---\s*\r?\n[\s\S]*?\r?\n---/, "");
  for (const block of body.split(/\r?\n\s*\r?\n/)) {
    const text = block
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && !line.startsWith("```"))
      .join(" ")
      .trim();
    if (text) return text.slice(0, 240);
  }
  return "";
}

function skillRootsForScan(cwd) {
  const envRoots = String(process.env.CLAUDEX_SKILL_ROOTS || "")
    .split(path.delimiter)
    .map((item) => item.trim())
    .filter(Boolean);
  const roots = envRoots.length
    ? envRoots
    : [
      path.join(app.getPath("home"), ".codex", "skills"),
      path.join(app.getPath("home"), ".codex", "plugins", "cache"),
      cwd ? path.join(cwd, ".codex", "skills") : "",
      cwd ? path.join(cwd, ".agents", "skills") : "",
    ].filter(Boolean);
  const seen = new Set();
  return roots
    .map((root) => path.resolve(root))
    .filter((root) => {
      const key = root.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return fs.existsSync(root);
    });
}

function findSkillFiles(root) {
  const files = [];
  const queue = [{ dir: root, depth: 0 }];
  const ignored = new Set([".git", "node_modules", "dist", "build", "release", ".next", "coverage"]);
  while (queue.length && files.length < MAX_SKILL_REGISTRY_ITEMS) {
    const { dir, depth } = queue.shift();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === "SKILL.md") {
        files.push(fullPath);
        if (files.length >= MAX_SKILL_REGISTRY_ITEMS) break;
        continue;
      }
      if (!entry.isDirectory()) continue;
      if (ignored.has(entry.name)) continue;
      if (entry.name.startsWith(".") && entry.name !== ".system") continue;
      if (depth + 1 <= MAX_SKILL_SCAN_DEPTH) queue.push({ dir: fullPath, depth: depth + 1 });
    }
  }
  return files;
}

function loadSkillRegistry(cwd) {
  const roots = skillRootsForScan(cwd);
  const items = [];
  const seenPaths = new Set();
  for (const root of roots) {
    for (const file of findSkillFiles(root)) {
      const pathKey = file.toLowerCase();
      if (seenPaths.has(pathKey)) continue;
      seenPaths.add(pathKey);
      let stat = null;
      let content = "";
      try {
        stat = fs.statSync(file);
        content = fs.readFileSync(file, "utf8").slice(0, MAX_SKILL_FILE_BYTES);
      } catch {
        continue;
      }
      const meta = parseSkillFrontmatter(content);
      const metadata = meta.metadata && typeof meta.metadata === "object" ? meta.metadata : {};
      const name = String(meta.name || metadata.name || path.basename(path.dirname(file))).trim();
      const description = String(
        meta.description ||
        metadata["short-description"] ||
        metadata.shortDescription ||
        meta["short-description"] ||
        firstMarkdownParagraph(content) ||
        "本地 SKILL.md",
      ).trim();
      const relativePath = path.relative(root, file);
      items.push({
        id: normalizeSkillId(name, relativePath),
        name,
        description,
        path: file,
        root,
        relativePath,
        source: "local-skill",
        status: "installed",
        enabled: true,
        size: stat.size,
        updatedAt: stat.mtime.toISOString(),
      });
      if (items.length >= MAX_SKILL_REGISTRY_ITEMS) break;
    }
    if (items.length >= MAX_SKILL_REGISTRY_ITEMS) break;
  }
  items.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
  return {
    roots,
    items,
    truncated: items.length >= MAX_SKILL_REGISTRY_ITEMS,
  };
}

function mcpOutputSegments(value) {
  return String(value || "")
    .split(/\s*(?:·|\|)\s*/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function parseMcpTools(segments) {
  const segment = segments.find((item) => /\b\d+\s*(?:tools?|工具)/i.test(item));
  const match = segment?.match(/\b(\d+)\s*(?:tools?|工具)/i);
  return match ? Number(match[1]) : null;
}

function structuredToolLabels(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string" || typeof item === "number") return String(item).trim();
        if (!item || typeof item !== "object") return "";
        return String(item.name || item.id || item.tool || item.command || item.title || "").trim();
      })
      .filter(Boolean);
  }
  if (value && typeof value === "object") {
    return Object.entries(value)
      .filter(([, itemValue]) => itemValue !== false && itemValue !== null && itemValue !== undefined && itemValue !== "")
      .map(([key, itemValue]) => {
        if (itemValue === true) return key;
        if (itemValue && typeof itemValue === "object") {
          return String(itemValue.name || itemValue.id || itemValue.tool || itemValue.command || key).trim();
        }
        return key;
      })
      .filter(Boolean);
  }
  return String(value || "")
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function structuredToolCount(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") {
    return Object.values(value).filter((itemValue) => itemValue !== false && itemValue !== null && itemValue !== undefined && itemValue !== "").length;
  }
  return null;
}

function normalizeMcpStatusValue(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "unknown";
  if (/\b(?:ok|ready|connected|enabled|running|active|success|succeeded)\b/.test(text)) return "ok";
  if (/\b(?:error|failed|failure|disconnected|unavailable|denied|missing|timeout)\b/.test(text)) return "error";
  if (/\b(?:pending|starting|waiting|paused)\b/.test(text)) return "pending";
  return "unknown";
}

function parseMcpSource(segments) {
  const segment = segments.find((item) => (
    /https?:\/\/|wss?:\/\//i.test(item) ||
    /^[A-Za-z]:[\\/]/.test(item) ||
    /^[/~]/.test(item) ||
    /\.(?:c?js|mjs|py|ts|json)\b/i.test(item) ||
    /\b(?:npx|node|python|python3|uvx|docker)\b/i.test(item)
  ));
  return segment || "";
}

function parseMcpTransport(segments, source) {
  const explicit = segments.find((item) => /^(?:stdio|sse|http|https|websocket|ws|wss|tcp|ipc)$/i.test(item));
  if (explicit) return explicit.toLowerCase();
  const sourceText = String(source || "").toLowerCase();
  if (/^wss?:\/\//.test(sourceText)) return "ws";
  if (/\/sse\b|transport=sse/.test(sourceText)) return "sse";
  if (/^https?:\/\//.test(sourceText)) return "http";
  if (sourceText) return "stdio";
  return "";
}

function parseMcpError(segments, status, source) {
  if (status !== "error") return "";
  const sourceText = String(source || "");
  const segment = segments.find((item) => (
    item !== sourceText &&
    !/\b\d+\s*(?:tools?|工具)/i.test(item) &&
    !/^(?:stdio|sse|http|https|websocket|ws|wss|tcp|ipc)$/i.test(item) &&
    /\b(?:disconnected|not connected|failed|failure|error|unavailable|denied|missing|timeout|timed out|auth|token)\b/i.test(item)
  ));
  return String(segment || "")
    .replace(/^(?:error|failed|failure|disconnected|not connected)[:\s-]*/i, "")
    .trim();
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
      const clean = line.replace(/^(?:[✓✔✗✘×!⏸\-\*]|â\S+|Ã\S+)\s*/, "").trim();
      const pair = clean.match(/^([^:\s]+)\s*[:\s]\s*(.*)$/);
      const name = pair?.[1] || clean.split(/\s+/)[0] || clean;
      const detail = pair?.[2] || clean.replace(name, "").trim();
      const lower = line.toLowerCase();
      const status = /\b(pending|paused|waiting)\b|⏸/.test(lower)
        ? "pending"
        : /\b(disconnected|not connected|failed|failure|error|unavailable|denied|timeout|timed out)\b|[✗✘×!]/.test(lower)
          ? "error"
          : /\b(connected|ok|running|enabled)\b|[✓✔]/.test(lower)
            ? "ok"
            : "unknown";
      const segments = mcpOutputSegments(detail);
      const tools = parseMcpTools(segments);
      const source = parseMcpSource(segments);
      const transport = parseMcpTransport(segments, source);
      const error = parseMcpError(segments, status, source);
      return { name, detail, status, raw: line, tools, transport, source, error };
    })
    .filter((item) => item.name);
}

function normalizeMcpServers(jsonOutput, rawOutput) {
  const rawServers = parseMcpServers(rawOutput);
  const jsonItems = parseJsonListOutput(jsonOutput, ["mcpServers", "servers"]);
  if (!jsonItems.length) return rawServers;
  const rawByName = new Map(rawServers.map((server) => [String(server.name || "").toLowerCase(), server]));
  const seen = new Set();
  const normalized = jsonItems
    .map((item) => {
      const name = String(item?.name || item?.id || item?.server || item?.label || "").trim();
      if (!name) return null;
      const rawMatch = rawByName.get(name.toLowerCase()) || {};
      seen.add(name.toLowerCase());
      const toolSource = item?.toolNames || item?.tools || item?.availableTools || item?.capabilities || item?.commands;
      const toolNames = structuredToolLabels(toolSource);
      const explicitToolCount = Number(item?.toolCount ?? item?.toolsCount ?? item?.tool_count);
      const tools = Number.isFinite(explicitToolCount)
        ? explicitToolCount
        : structuredToolCount(toolSource) ?? (typeof rawMatch.tools === "number" ? rawMatch.tools : null);
      const status = normalizeMcpStatusValue(item?.status || item?.state || item?.connection || item?.connected || rawMatch.status);
      const source = String(item?.source || item?.path || item?.command || item?.url || item?.endpoint || rawMatch.source || "").trim();
      const transport = String(item?.transport || item?.type || rawMatch.transport || parseMcpTransport([source], source) || "").trim();
      const detail = String(item?.detail || item?.description || item?.summary || rawMatch.detail || "").trim();
      const error = pluginErrorSummary(item) || rawMatch.error || "";
      return {
        name,
        detail,
        status,
        raw: rawMatch.raw || JSON.stringify(item),
        tools,
        toolNames,
        toolsSummary: toolNames.join(", "),
        transport,
        source,
        error,
      };
    })
    .filter(Boolean);
  for (const rawServer of rawServers) {
    const key = String(rawServer.name || "").toLowerCase();
    if (key && !seen.has(key)) normalized.push(rawServer);
  }
  return normalized;
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

function parseGitBranchStatus(firstLine) {
  const first = String(firstLine || "");
  if (!first.startsWith("## ")) {
    return { branch: "", upstream: "", remote: "", ahead: 0, behind: 0, upstreamStatus: "" };
  }
  const raw = first.slice(3).trim();
  const statusMatch = raw.match(/\s+\[([^\]]+)\]$/);
  const upstreamStatus = statusMatch?.[1] || "";
  const head = statusMatch ? raw.slice(0, statusMatch.index).trim() : raw;
  const [branchPart, upstreamPart = ""] = head.split("...");
  const branch = branchPart.replace(/^No commits yet on\s+/, "").trim();
  const upstream = upstreamPart.trim();
  const remote = upstream.includes("/") ? upstream.split("/")[0] : "";
  const ahead = Number((upstreamStatus.match(/ahead\s+(\d+)/i) || [])[1] || 0);
  const behind = Number((upstreamStatus.match(/behind\s+(\d+)/i) || [])[1] || 0);
  return { branch, upstream, remote, ahead, behind, upstreamStatus };
}

function parseGitEnvironment(result) {
  const output = stripAnsi(`${result.stdout || ""}\n${result.stderr || ""}`).trim();
  if (result.code !== 0) {
    return {
      available: false,
      branch: "",
      upstream: "",
      remote: "",
      ahead: 0,
      behind: 0,
      upstreamStatus: "",
      changes: 0,
      files: [],
      summary: gitStatusSummary([]),
      raw: output,
    };
  }
  const lines = output.split(/\r?\n/).filter(Boolean);
  const first = lines[0] || "";
  const branchStatus = parseGitBranchStatus(first);
  const files = parseGitStatusFiles(lines.filter((line) => !line.startsWith("## ")));
  const changes = files.length;
  return {
    available: result.code === 0,
    ...branchStatus,
    changes,
    files,
    summary: gitStatusSummary(files),
    raw: output,
  };
}

function parseGitStatusFiles(lines) {
  return lines.map((line) => {
    const code = line.slice(0, 2);
    const pathPart = line.slice(3).trim();
    const [from, to] = pathPart.split(/\s+->\s+/);
    const isUntracked = code === "??";
    const staged = Boolean(code[0] && code[0] !== " " && code[0] !== "?");
    const unstaged = Boolean(code[1] && code[1] !== " " && code[1] !== "?");
    const conflict = /U|AA|DD/.test(code);
    const kind = isUntracked ? "untracked" : staged && unstaged ? "mixed" : staged ? "staged" : unstaged ? "unstaged" : "changed";
    return {
      status: code.trim() || code,
      staged,
      unstaged,
      untracked: isUntracked,
      conflict,
      kind,
      path: to || from || pathPart,
      previousPath: to ? from : "",
    };
  }).filter((item) => item.path);
}

function gitStatusSummary(files = []) {
  return {
    total: files.length,
    staged: files.filter((file) => file.staged).length,
    unstaged: files.filter((file) => file.unstaged).length,
    untracked: files.filter((file) => file.untracked).length,
    mixed: files.filter((file) => file.kind === "mixed").length,
    renamed: files.filter((file) => /R/.test(file.status || "") || file.previousPath).length,
    deleted: files.filter((file) => /D/.test(file.status || "")).length,
    conflicted: files.filter((file) => file.conflict).length,
  };
}

function gitText(result) {
  return stripAnsi(result.stdout || result.stderr).trim();
}

function parseGitRemotes(result) {
  const output = gitText(result);
  const byName = new Map();
  for (const line of output.split(/\r?\n/)) {
    const match = /^(\S+)\s+(\S+)\s+\((fetch|push)\)$/.exec(line.trim());
    if (!match) continue;
    const [, name, url, kind] = match;
    const existing = byName.get(name) || { name, fetchUrl: "", pushUrl: "" };
    if (kind === "fetch") existing.fetchUrl = url;
    if (kind === "push") existing.pushUrl = url;
    byName.set(name, existing);
  }
  return [...byName.values()];
}

function parseDiffGitPath(value) {
  const raw = String(value || "").trim().replace(/^"|"$/g, "");
  return raw.replace(/^[ab]\//, "");
}

function parseGitDiffFileHeader(line) {
  const match = /^diff --git\s+(.+?)\s+(.+)$/.exec(String(line || ""));
  if (!match) return null;
  const previousPath = parseDiffGitPath(match[1]);
  const nextPath = parseDiffGitPath(match[2]);
  return {
    path: nextPath || previousPath,
    previousPath: previousPath !== nextPath ? previousPath : "",
  };
}

function parseGitDiffFiles(diffText) {
  const lines = String(diffText || "").split(/\r?\n/);
  const files = [];
  let section = "";
  let current = null;
  const finish = () => {
    if (!current) return;
    const text = current.lines.join("\n").trim();
    if (!text) {
      current = null;
      return;
    }
    const diffLines = current.lines.filter((line) => !line.startsWith("+++ ") && !line.startsWith("--- "));
    files.push({
      id: `${current.section || "diff"}:${current.path}:${files.length}`,
      section: current.section,
      path: current.path,
      previousPath: current.previousPath,
      additions: diffLines.filter((line) => line.startsWith("+")).length,
      deletions: diffLines.filter((line) => line.startsWith("-")).length,
      text,
    });
    current = null;
  };

  for (const line of lines) {
    if (line.startsWith("# ")) {
      section = line.slice(2).trim();
      continue;
    }
    const header = parseGitDiffFileHeader(line);
    if (header) {
      finish();
      current = {
        ...header,
        section,
        lines: section ? [`# ${section}`, line] : [line],
      };
      continue;
    }
    if (current) current.lines.push(line);
  }
  finish();
  return files.slice(0, 80);
}

function resolveGitStatusPath(cwd, relativePath = "") {
  const root = path.resolve(cwd);
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return target;
}

function buildUntrackedFileDiffs(cwd, files = [], maxChars = MAX_GIT_DIFF_CHARS) {
  const sections = [];
  const stats = [];
  let usedChars = 0;
  for (const item of files.filter((file) => file.status === "??").slice(0, 24)) {
    const relativePath = slashPath(item.path || "");
    const target = resolveGitStatusPath(cwd, relativePath);
    if (!target || !fs.existsSync(target)) continue;
    const stat = fs.statSync(target);
    if (!stat.isFile()) continue;
    const header = [
      `diff --git a/${relativePath} b/${relativePath}`,
      "new file mode 100644",
      "--- /dev/null",
      `+++ b/${relativePath}`,
    ];
    let body = [];
    let additions = 0;
    let previewNote = "";
    if (stat.size > 65536) {
      previewNote = `# Untracked file is ${stat.size} bytes; preview skipped.`;
    } else {
      const buffer = fs.readFileSync(target);
      if (buffer.includes(0)) {
        previewNote = "# Binary file preview skipped.";
      } else {
        const lines = buffer.toString("utf8").split(/\r?\n/);
        if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
        additions = lines.length > 1 || lines[0] ? lines.length : 0;
        body = [
          `@@ -0,0 +1,${Math.max(additions, 1)} @@`,
          ...lines.map((line) => `+${line}`),
        ];
      }
    }
    if (previewNote) body = [previewNote];
    const text = [...header, ...body].join("\n");
    if (usedChars + text.length > maxChars) break;
    usedChars += text.length;
    sections.push(text);
    stats.push(`${relativePath} | ${additions || 0} ${additions ? "+".repeat(Math.min(additions, 40)) : ""}`);
  }
  return {
    stat: stats.join("\n"),
    text: sections.join("\n\n"),
  };
}

async function loadGitEnvironment(cwd) {
  const rootResult = await runProcess("git", ["rev-parse", "--show-toplevel"], { cwd, timeoutMs: 8000 });
  const gitRootRaw = rootResult.code === 0 ? gitText(rootResult).split(/\r?\n/)[0] || "" : "";
  const gitRoot = gitRootRaw ? path.resolve(gitRootRaw) : "";
  const gitCwd = gitRoot || cwd;
  const status = parseGitEnvironment(await runProcess("git", ["status", "--short", "--branch"], { cwd: gitCwd, timeoutMs: 8000 }));
  if (!status.available) {
    return {
      ...status,
      root: gitRoot,
      cwd,
      relativePath: gitRoot ? slashPath(path.relative(gitRoot, cwd)) || "." : "",
    };
  }
  const [remoteResult, worktreeStat, stagedStat, worktreeDiff, stagedDiff] = await Promise.all([
    runProcess("git", ["remote", "-v"], { cwd: gitCwd, timeoutMs: 8000 }),
    runProcess("git", ["diff", "--stat", "--no-ext-diff"], { cwd: gitCwd, timeoutMs: 8000 }),
    runProcess("git", ["diff", "--cached", "--stat", "--no-ext-diff"], { cwd: gitCwd, timeoutMs: 8000 }),
    runProcess("git", ["diff", "--no-ext-diff", "--find-renames", "--unified=3", "--"], {
      cwd: gitCwd,
      timeoutMs: 10000,
      maxOutputChars: MAX_GIT_DIFF_CHARS,
    }),
    runProcess("git", ["diff", "--cached", "--no-ext-diff", "--find-renames", "--unified=3", "--"], {
      cwd: gitCwd,
      timeoutMs: 10000,
      maxOutputChars: MAX_GIT_DIFF_CHARS,
    }),
  ]);
  const remotes = parseGitRemotes(remoteResult);
  const primaryRemote = status.remote
    ? remotes.find((remote) => remote.name === status.remote) || remotes[0]
    : remotes[0];
  const untrackedDiff = buildUntrackedFileDiffs(gitCwd, status.files);
  const statParts = [
    gitText(stagedStat),
    gitText(worktreeStat),
    untrackedDiff.stat,
  ].filter(Boolean);
  const diffSections = [
    { label: "Staged changes", text: gitText(stagedDiff) },
    { label: "Working tree changes", text: gitText(worktreeDiff) },
    { label: "Untracked files", text: untrackedDiff.text },
  ].filter((section) => section.text);
  const diffText = diffSections.map((section) => `# ${section.label}\n${section.text}`).join("\n\n");
  const fileDiffs = parseGitDiffFiles(diffText);
  const filesWithDiffStats = status.files.map((file) => {
    const diff = fileDiffs.find((item) => item.path === file.path || item.previousPath === file.path);
    return diff ? {
      ...file,
      additions: diff.additions,
      deletions: diff.deletions,
      hasDiff: true,
    } : file;
  });
  return {
    ...status,
    root: gitRoot,
    cwd,
    relativePath: gitRoot ? slashPath(path.relative(gitRoot, cwd)) || "." : "",
    remotes,
    remote: status.remote || primaryRemote?.name || "",
    remoteUrl: primaryRemote?.pushUrl || primaryRemote?.fetchUrl || "",
    files: filesWithDiffStats,
    stat: statParts.join("\n"),
    diff: {
      text: trimOutput(diffText, MAX_GIT_DIFF_CHARS),
      truncated: diffText.length > MAX_GIT_DIFF_CHARS || /\[输出已截断\]/.test(diffText),
      files: status.files.length,
      fileDiffs,
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

function broadcastStoreUpdate(store) {
  const payload = sanitizeStore(store);
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("app:state-updated", payload);
  }
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
    const error = new Error(stripAnsi(message));
    error.stdout = stripAnsi(result.stdout || "");
    error.stderr = stripAnsi(result.stderr || "");
    error.code = typeof result.code === "number" ? result.code : 1;
    throw error;
  }
  if (!payload?.result) {
    const error = new Error(stripAnsi(result.stdout || "Claude Code 没有返回结果。"));
    error.stdout = stripAnsi(result.stdout || "");
    error.stderr = stripAnsi(result.stderr || "");
    error.code = typeof result.code === "number" ? result.code : 1;
    throw error;
  }
  if (payload.session_id) {
    session.claudeSessionId = payload.session_id;
  }
  return {
    text: payload.result,
    stdout: stripAnsi(result.stdout || ""),
    stderr: stripAnsi(result.stderr || ""),
    code: typeof result.code === "number" ? result.code : 0,
    claudeSessionId: payload.session_id || "",
  };
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

function automationProjectFromPayload(store, payload = {}) {
  const candidatePath = String(payload.projectPath || "").trim();
  if (candidatePath && fs.existsSync(candidatePath)) return projectFromPath(candidatePath);
  const active = store.activeProject || localWorkspaceProject();
  return active?.path ? projectFromPath(active.path) : active;
}

function ensureAutomationSession(store, automation) {
  const existing = (store.sessions || []).find((session) => session.id === automation.threadId);
  const project = automation.project || store.activeProject || localWorkspaceProject();
  if (existing && sessionMatchesProject(existing, project)) return existing;
  const createdAt = now();
  const session = {
    id: id("session"),
    title: `自动化：${titleFromUserContent(automation.prompt)}`,
    project: project.name,
    projectPath: project.path,
    createdAt,
    updatedAt: createdAt,
    messages: [],
    pinned: false,
    archived: false,
  };
  store.sessions = [session, ...(store.sessions || [])];
  automation.threadId = session.id;
  return session;
}

function findAutomationOrThrow(store, automationId) {
  const automation = (store.automations || []).find((item) => item.id === automationId);
  if (!automation) throw new Error("没有找到这个自动化任务。");
  return automation;
}

function findAutomationRunEntry(store, runId) {
  const targetId = String(runId || "");
  if (!targetId) return null;
  for (const automation of store.automations || []) {
    const history = Array.isArray(automation.history) ? automation.history : [];
    const entry = history.find((item) => item?.id === targetId)
      || (automation.lastRun?.id === targetId ? automation.lastRun : null);
    if (entry) return { automation, entry };
  }
  return null;
}

async function runAutomationById(automationId, { requestId = "", trigger = "manual" } = {}) {
  if (automationRunLocks.has(automationId)) {
    throw new Error("这个自动化任务正在运行。");
  }
  automationRunLocks.add(automationId);
  const runId = requestId || id("automation_run");
  const startedAt = now();
  const startedMs = Date.now();
  let store = readStore();
  let automation = findAutomationOrThrow(store, automationId);
  if (!automation.prompt) {
    automationRunLocks.delete(automationId);
    throw new Error("自动化提示词为空。");
  }
  const session = ensureAutomationSession(store, automation);
  const runningEntry = {
    id: runId,
    trigger,
    status: "running",
    startedAt,
    endedAt: "",
    durationMs: 0,
    sessionId: session.id,
    detail: "",
    error: "",
    summary: "",
    stdout: "",
    stderr: "",
    code: null,
  };
  automation.status = "running";
  prependAutomationHistory(automation, runningEntry);
  upsertAutomationRunEvent(store, automation, runningEntry, "running");
  writeStore(store);
  if (trigger === "scheduled") broadcastStoreUpdate(store);

  try {
    const userContent = automation.prompt.trim();
    session.messages.push({
      role: "user",
      content: userContent,
      createdAt: startedAt,
      automationId: automation.id,
      automationRunId: runId,
    });
    if (isGenericSessionTitle(session.title)) {
      session.title = titleFromUserContent(userContent);
    }
    session.updatedAt = startedAt;
    writeStore(store);

    const runtimeStore = {
      ...store,
      activeProject: automation.project || store.activeProject || localWorkspaceProject(),
    };
    const assistantResult = await requestAssistant(runtimeStore, session, requestId || runId);
    const assistantText = typeof assistantResult === "string" ? assistantResult : assistantResult.text;
    const stdout = typeof assistantResult === "object" ? assistantResult.stdout || "" : "";
    const stderr = typeof assistantResult === "object" ? assistantResult.stderr || "" : "";
    const code = typeof assistantResult === "object" && typeof assistantResult.code === "number" ? assistantResult.code : 0;
    session.messages.push({
      role: "assistant",
      content: assistantText || "自动化任务已完成。",
      createdAt: now(),
      automationId: automation.id,
      automationRunId: runId,
    });
    session.updatedAt = now();

    const finalEntry = {
      ...runningEntry,
      status: "succeeded",
      endedAt: now(),
      durationMs: Date.now() - startedMs,
      detail: titleFromUserContent(assistantText || "自动化任务已完成。"),
      summary: titleFromUserContent(assistantText || "自动化任务已完成。"),
      stdout,
      stderr,
      code,
    };
    prependAutomationHistory(automation, finalEntry);
    if (trigger === "scheduled" && automation.schedule?.type === "once") automation.enabled = false;
    automation.status = "succeeded";
    updateAutomationAfterMutation(automation);
    upsertAutomationRunEvent(store, automation, finalEntry, "ok");
    writeStore(store);
    if (trigger === "scheduled") broadcastStoreUpdate(store);
    return {
      ...sanitizeStore(store),
      automationRun: finalEntry,
    };
  } catch (error) {
    const message = error.message || String(error);
    session.messages.push({
      role: "error",
      content: message,
      createdAt: now(),
      automationId: automation.id,
      automationRunId: runId,
    });
    session.updatedAt = now();
    const finalEntry = {
      ...runningEntry,
      status: "failed",
      endedAt: now(),
      durationMs: Date.now() - startedMs,
      detail: "",
      error: message,
      summary: "",
      stdout: error.stdout || "",
      stderr: error.stderr || "",
      code: typeof error.code === "number" ? error.code : 1,
    };
    prependAutomationHistory(automation, finalEntry);
    if (trigger === "scheduled" && automation.schedule?.type === "once") automation.enabled = false;
    automation.status = "failed";
    updateAutomationAfterMutation(automation);
    if (trigger === "scheduled") {
      upsertNotice(store, {
        level: "error",
        source: "automation",
        title: "Scheduled automation failed",
        detail: message,
        key: `automation:${automation.id}:scheduled-failure`,
        action: `automation:${automation.id}`,
        sessionId: session.id,
        project: automation.project,
      });
    }
    upsertAutomationRunEvent(store, automation, finalEntry, "error");
    writeStore(store);
    if (trigger === "scheduled") broadcastStoreUpdate(store);
    return {
      ...sanitizeStore(store),
      automationRun: finalEntry,
    };
  } finally {
    automationRunLocks.delete(automationId);
  }
}

function dueAutomations(store) {
  const at = Date.now();
  return (store.automations || []).filter((automation) => {
    if (automationRunLocks.has(automation.id)) return false;
    const nextRun = automationNextRun(automation);
    if (!nextRun) return false;
    return new Date(nextRun).getTime() <= at;
  });
}

function startAutomationScheduler() {
  if (automationSchedulerTimer) return;
  const tick = async () => {
    if (automationSchedulerRunning) return;
    automationSchedulerRunning = true;
    let store;
    try {
      store = readStore();
    } catch {
      automationSchedulerRunning = false;
      return;
    }
    try {
      for (const automation of dueAutomations(store).slice(0, 2)) {
        await runAutomationById(automation.id, { trigger: "scheduled", requestId: id("automation") }).catch(() => {});
      }
    } finally {
      automationSchedulerRunning = false;
    }
  };
  automationSchedulerTimer = setInterval(tick, AUTOMATION_POLL_MS);
  setTimeout(tick, 2500);
}

function subagentProjectFromPayload(store, payload = {}) {
  return automationProjectFromPayload(store, payload);
}

function subagentPrompt(task, nickname) {
  return [
    `你是 Claudex 子代理 ${nickname || "Subagent"}。`,
    "请独立完成下面这个子任务，输出简洁的状态、证据和下一步。",
    "",
    String(task || "").trim(),
  ].join("\n");
}

function subagentArtifactsFromResult({ summary = "", stdout = "", stderr = "" } = {}) {
  const artifacts = [];
  if (String(summary || "").trim()) {
    artifacts.push({
      type: "summary",
      label: "Summary",
      content: trimOutput(String(summary || ""), 6000),
    });
  }
  if (String(stdout || "").trim()) {
    artifacts.push({
      type: "stdout",
      label: "stdout",
      content: trimOutput(String(stdout || ""), 6000),
    });
  }
  if (String(stderr || "").trim()) {
    artifacts.push({
      type: "stderr",
      label: "stderr",
      content: trimOutput(String(stderr || ""), 6000),
    });
  }
  return artifacts.slice(0, 12);
}

function emitSubagentEvent(sender, payload) {
  if (!sender || sender.isDestroyed?.()) return;
  sender.send("subagent:stream-event", payload);
}

async function runSubagent(payload = {}, sender) {
  const task = String(payload.task || "").trim();
  if (!task) throw new Error("子代理任务为空。");
  const store = readStore();
  const project = subagentProjectFromPayload(store, payload);
  const cwd = project?.path && fs.existsSync(project.path) ? project.path : app.getPath("home");
  const runId = id("subagent");
  const requestId = payload.requestId || id("subagent_request");
  const startedAt = now();
  const nickname = String(payload.nickname || "Subagent").trim() || "Subagent";
  const session = {
    id: payload.sessionId || "",
    title: nickname,
    project: project?.name || store.activeProject?.name || "本地工作区",
    projectPath: project?.path || "",
    messages: [{ role: "user", content: task, createdAt: startedAt }],
  };
  const args = buildClaudeChatArgs({ ...store, activeProject: project }, session);
  const claudeCommand = configuredClaudeCommand(store);
  const run = normalizeSubagentRun({
    id: runId,
    requestId,
    nickname,
    task,
    status: "running",
    sessionId: payload.sessionId || "",
    project,
    cwd,
    command: claudeCommand,
    args,
    startedAt,
    artifacts: [],
  }, store);
  upsertSubagentRun(store, run);
  upsertSubagentRunEvent(store, run, "running");
  writeStore(store);
  emitSubagentEvent(sender, { type: "start", run });

  let stdout = "";
  let stderr = "";
  const result = await runStreamingProcess(commandCandidates(claudeCommand)[0], args, {
    cwd,
    requestId,
    timeoutMs: Number(store.settings.timeoutMs || CLAUDE_TIMEOUT_MS),
    env: claudeProcessEnv({ CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" }),
    onChunk: (stream, text) => {
      if (stream === "stderr") stderr = trimOutput(`${stderr}${text || ""}`);
      else stdout = trimOutput(`${stdout}${text || ""}`);
      persistSubagentChunk({ runId, requestId, stream, text });
      emitSubagentEvent(sender, {
        type: "chunk",
        runId,
        requestId,
        stream,
        text: stripAnsi(text || ""),
      });
    },
  });
  const parsed = parseJsonOutput(result.stdout);
  const wasCancelled = cancelledSubagentRuns.delete(runId) || cancelledSubagentRuns.delete(requestId);
  const finalStatus = wasCancelled ? "cancelled" : result.code === 0 && !parsed?.is_error ? "done" : "error";
  const summary = parsed?.result || (result.stdout || result.stderr || "").trim();
  const cleanStdout = stripAnsi(result.stdout || stdout);
  const cleanStderr = stripAnsi(result.stderr || stderr);
  const cleanSummary = stripAnsi(summary);
  const nextStore = readStore();
  const existing = (nextStore.subagentRuns || []).find((item) => item.id === runId) || run;
  const finalRun = normalizeSubagentRun({
    ...existing,
    status: finalStatus,
    stdout: cleanStdout,
    stderr: cleanStderr,
    summary: cleanSummary,
    code: wasCancelled ? 130 : result.code,
    durationMs: result.durationMs,
    endedAt: now(),
    artifacts: subagentArtifactsFromResult({
      summary: cleanSummary,
      stdout: cleanStdout,
      stderr: cleanStderr,
    }),
  }, nextStore);
  upsertSubagentRun(nextStore, finalRun);
  upsertSubagentRunEvent(
    nextStore,
    finalRun,
    finalStatus === "done" ? "ok" : finalStatus === "cancelled" ? "cancelled" : "error",
  );
  writeStore(nextStore);
  emitSubagentEvent(sender, { type: finalStatus, run: finalRun });
  return {
    ...sanitizeStore(nextStore),
    subagentRun: finalRun,
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
  startAutomationScheduler();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (automationSchedulerTimer) clearInterval(automationSchedulerTimer);
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

ipcMain.handle("notice:record", (_event, payload = {}) => {
  const store = readStore();
  const project = payload.projectPath && fs.existsSync(payload.projectPath)
    ? projectFromPath(payload.projectPath)
    : payload.project || store.activeProject || localWorkspaceProject();
  const notice = upsertNotice(store, {
    ...payload,
    project,
    lastSeenAt: now(),
  });
  writeStore(store);
  return {
    ...sanitizeStore(store),
    notice,
  };
});

ipcMain.handle("run-event:record", (_event, payload = {}) => {
  const store = readStore();
  const automationRun = payload.type === "automation" ? findAutomationRunEntry(store, payload.id) : null;
  const eventPayload = automationRun
    ? {
        ...payload,
        projectPath: automationRun.automation.project?.path || payload.projectPath || "",
        project: automationRun.automation.project,
        cwd: automationRun.automation.project?.path || payload.cwd || "",
        sessionId: automationRun.entry.sessionId || automationRun.automation.threadId || payload.sessionId || "",
        stdout: payload.stdout || automationRun.entry.stdout || "",
        stderr: payload.stderr || automationRun.entry.stderr || "",
        code: typeof payload.code === "number" ? payload.code : automationRun.entry.code,
        durationMs: typeof payload.durationMs === "number" ? payload.durationMs : automationRun.entry.durationMs,
      }
    : payload;
  const project = eventPayload.projectPath && fs.existsSync(eventPayload.projectPath)
    ? projectFromPath(eventPayload.projectPath)
    : eventPayload.project || store.activeProject || localWorkspaceProject();
  const runEvent = upsertRunEvent(store, {
    ...eventPayload,
    project,
  });
  writeStore(store);
  broadcastStoreUpdate(store);
  return {
    ...sanitizeStore(store),
    runEvent,
  };
});

ipcMain.handle("notice:dismiss", (_event, { noticeId } = {}) => {
  const store = readStore();
  const dismissedAt = now();
  store.notices = (store.notices || []).map((notice) => (
    notice.id === noticeId ? { ...notice, dismissedAt } : notice
  ));
  writeStore(store);
  return sanitizeStore(store);
});

ipcMain.handle("notice:clear", () => {
  const store = readStore();
  const dismissedAt = now();
  store.notices = (store.notices || []).map((notice) => (
    notice.dismissedAt ? notice : { ...notice, dismissedAt }
  ));
  writeStore(store);
  return sanitizeStore(store);
});

ipcMain.handle("automation:create", (_event, payload = {}) => {
  const prompt = String(payload.prompt || "").trim();
  if (!prompt) throw new Error("自动化提示词为空。");
  const store = readStore();
  const createdAt = now();
  const project = automationProjectFromPayload(store, payload);
  const runAt = isoOrEmpty(payload.runAt);
  const scheduleType = normalizeAutomationScheduleType(payload.scheduleType || payload.schedule?.type || payload.repeat);
  const automation = normalizeAutomation({
    id: id("automation"),
    prompt,
    schedule: {
      type: scheduleType,
      runAt,
    },
    project,
    threadId: payload.threadId || "",
    enabled: Boolean(runAt),
    status: runAt ? "scheduled" : "idle",
    createdAt,
    updatedAt: createdAt,
    history: [],
  }, store);
  store.automations = [automation, ...(store.automations || [])].slice(0, AUTOMATION_LIMIT);
  const runEvent = upsertAutomationActionRunEvent(store, automation, "create");
  writeStore(store);
  return {
    ...sanitizeStore(store),
    automation,
    runEvent,
  };
});

ipcMain.handle("automation:set-enabled", (_event, { automationId, enabled } = {}) => {
  const store = readStore();
  const automation = findAutomationOrThrow(store, automationId);
  automation.enabled = Boolean(enabled);
  automation.status = automation.enabled ? "scheduled" : "paused";
  updateAutomationAfterMutation(automation);
  const runEvent = upsertAutomationActionRunEvent(store, automation, automation.enabled ? "resume" : "pause");
  writeStore(store);
  return {
    ...sanitizeStore(store),
    automation,
    runEvent,
  };
});

ipcMain.handle("automation:delete", (_event, { automationId } = {}) => {
  const store = readStore();
  const automation = findAutomationOrThrow(store, automationId);
  const runEvent = upsertAutomationActionRunEvent(store, automation, "delete");
  store.automations = (store.automations || []).filter((automation) => automation.id !== automationId);
  writeStore(store);
  return {
    ...sanitizeStore(store),
    automation,
    runEvent,
  };
});

ipcMain.handle("automation:run-now", async (_event, { automationId, requestId } = {}) => {
  return runAutomationById(automationId, { requestId, trigger: "manual" });
});

ipcMain.handle("subagent:run", async (_event, payload = {}) => {
  return runSubagent(payload, _event.sender);
});

ipcMain.handle("subagent:cancel", (_event, { runId, requestId } = {}) => {
  const key = requestId || runId;
  const request = activeRequests.get(key);
  if (request) {
    if (typeof request.abort === "function") request.abort();
    else if (typeof request.kill === "function") request.kill();
    activeRequests.delete(key);
  }
  if (runId) cancelledSubagentRuns.add(runId);
  if (requestId) cancelledSubagentRuns.add(requestId);
  const store = readStore();
  const run = (store.subagentRuns || []).find((item) => item.id === runId || item.requestId === requestId);
  if (run) {
    run.status = "cancelled";
    run.endedAt = now();
    run.stderr = trimOutput(`${run.stderr || ""}\n子代理已停止。`);
    const cancelledRun = upsertSubagentRun(store, normalizeSubagentRun(run, store));
    upsertSubagentRunEvent(store, cancelledRun, "cancelled");
    writeStore(store);
  }
  return sanitizeStore(store);
});

ipcMain.handle("subagent:archive", (_event, { runId, requestId, archived = true } = {}) => {
  const store = readStore();
  const run = findSubagentRun(store, { runId, requestId });
  if (!run) throw new Error("没有找到这个子代理记录。");
  const normalized = normalizeSubagentRun({
    ...run,
    archivedAt: archived ? now() : "",
  }, store);
  upsertSubagentRun(store, normalized);
  const runEvent = upsertSubagentActionRunEvent(store, normalized, archived ? "archive" : "restore");
  writeStore(store);
  return {
    ...sanitizeStore(store),
    subagentRun: normalized,
    runEvent,
  };
});

ipcMain.handle("subagent:continue", (_event, { runId, requestId, sessionId, projectPath } = {}) => {
  const store = readStore();
  const run = findSubagentRun(store, { runId, requestId });
  if (!run) throw new Error("没有找到这个子代理记录。");
  const normalized = normalizeSubagentRun(run, store);
  const requestedProjectPath = String(projectPath || "").trim();
  const runProject = requestedProjectPath && fs.existsSync(requestedProjectPath)
    ? projectFromPath(requestedProjectPath)
    : normalized.cwd && fs.existsSync(normalized.cwd)
      ? projectFromPath(normalized.cwd)
      : normalized.project || store.activeProject || localWorkspaceProject();
  const originalSession = store.sessions.find((item) => item.id === normalized.sessionId && sessionMatchesProject(item, runProject));
  const requestedSession = store.sessions.find((item) => item.id === sessionId && sessionMatchesProject(item, runProject));
  const session = originalSession
    || requestedSession
    || visibleProjectSessions(store, runProject)[0]
    || ensureProjectDraftSession(store, runProject)
    || store.sessions[0];
  if (!session) throw new Error("没有可用的聊天会话。");
  const targetProject = {
    name: session.project || runProject?.name || localWorkspaceProject().name,
    path: session.projectPath || runProject?.path || "",
  };
  if (projectKeyForStore(targetProject)) addProject(store, targetProject);
  const continuedAt = now();
  if (!(normalized.continuedAt && normalized.continuedSessionId === session.id)) {
    session.messages = sessionMessages(session);
    session.messages.push({
      role: "assistant",
      content: subagentContinuationMessage(normalized),
      createdAt: continuedAt,
      source: {
        type: "subagent",
        runId: normalized.id,
        requestId: normalized.requestId,
      },
    });
  }
  session.updatedAt = continuedAt;
  const continuedRun = normalizeSubagentRun({
    ...normalized,
    project: runProject,
    cwd: normalized.cwd || runProject?.path || "",
    continuedAt,
    continuedSessionId: session.id,
  }, store);
  upsertSubagentRun(store, continuedRun);
  const runEvent = upsertSubagentActionRunEvent(store, continuedRun, "continue");
  writeStore(store);
  return {
    ...sanitizeStore(store),
    selectedSessionId: session.id,
    subagentRun: continuedRun,
    runEvent,
  };
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
  const projectName = String(project?.name || "").trim();
  const nextProject = project?.path
    ? { name: projectName || path.basename(project.path) || project.path, path: project.path }
    : { name: projectName || "本地工作区", path: "" };
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
    (item) => !item.archived && !hasSessionMessages(item) && isGenericSessionTitle(item.title) && sessionProjectKey(item) === currentProjectKey,
  );
  if (reusableIndex >= 0) {
    const [reusable] = store.sessions.splice(reusableIndex, 1);
    reusable.title = "新聊天";
    reusable.project = project.name;
    reusable.projectPath = project.path;
    reusable.updatedAt = createdAt;
    reusable.pinned = false;
    reusable.archived = false;
    reusable.pinnedAt = "";
    reusable.archivedAt = "";
    reusable.renamedAt = "";
    reusable.forkedAt = "";
    reusable.forkedFromId = "";
    reusable.forkedFromTitle = "";
    reusable.forkedFromClaudeSessionId = "";
    reusable.claudeSessionId = "";
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
    pinned: false,
    archived: false,
    pinnedAt: "",
    archivedAt: "",
    renamedAt: "",
    forkedAt: "",
    forkedFromId: "",
    forkedFromTitle: "",
    forkedFromClaudeSessionId: "",
    claudeSessionId: "",
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
  const previousTitle = sessionDisplayTitleForStore(session);
  if (typeof title === "string") {
    const nextTitle = title.trim();
    if (nextTitle && nextTitle !== session.title) {
      session.title = nextTitle;
      session.renamedAt = updatedAt;
      upsertThreadActionRunEvent(store, session, "rename", [
        `原标题: ${previousTitle}`,
        `新标题: ${sessionDisplayTitleForStore(session)}`,
      ].join(" · "));
    }
  }
  if (typeof pinned === "boolean" && session.pinned !== pinned) {
    session.pinned = pinned;
    session.pinnedAt = pinned ? updatedAt : "";
    upsertThreadActionRunEvent(store, session, pinned ? "pin" : "unpin");
  }
  if (typeof archived === "boolean" && session.archived !== archived) {
    session.archived = archived;
    session.archivedAt = archived ? updatedAt : "";
    upsertThreadActionRunEvent(store, session, archived ? "archive" : "restore");
  }
  session.updatedAt = updatedAt;
  ensureActiveProjectDraftSession(store);
  writeStore(store);
  return sanitizeStore(store);
});

ipcMain.handle("chat:delete-session", (_event, sessionId) => {
  const store = readStore();
  const session = store.sessions.find((item) => item.id === sessionId);
  if (!session) throw new Error("没有找到这个聊天。");
  upsertThreadActionRunEvent(store, session, "delete", [
    threadProjectForEvent(store, session)?.name || "本地工作区",
    `${sessionMessages(session).length} 条消息`,
    "原聊天已从本地列表删除，审计事件保留",
  ].filter(Boolean).join(" · "));
  store.sessions = store.sessions.filter((item) => item.id !== sessionId);
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
    pinnedAt: "",
    archivedAt: "",
    renamedAt: "",
    forkedAt: createdAt,
    forkedFromId: source.id,
    forkedFromTitle: sessionDisplayTitleForStore(source),
    forkedFromClaudeSessionId: String(source.claudeSessionId || ""),
    claudeSessionId: "",
    messages: sessionMessages(source).map((message) => ({ ...message })),
  };
  store.sessions.unshift(fork);
  upsertThreadActionRunEvent(store, source, "fork", [
    `源聊天: ${source.id}`,
    `目标聊天: ${fork.id}`,
    `${sessionMessages(source).length} 条消息`,
  ].join(" · "), { targetSession: fork });
  writeStore(store);
  return {
    ...sanitizeStore(store),
    selectedSessionId: fork.id,
  };
});

ipcMain.handle("chat:send-message", async (_event, { sessionId, content, requestId, claudeSessionId }) => {
  if (!content || !String(content).trim()) throw new Error("消息为空。");
  const store = readStore();
  const session = store.sessions.find((item) => item.id === sessionId) || store.sessions[0];
  if (!session) throw new Error("没有可用的聊天会话。");
  const resumeId = String(claudeSessionId || "").trim();
  if (resumeId && !session.claudeSessionId) session.claudeSessionId = resumeId;

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

ipcMain.handle("browser:record-visit", (_event, payload = {}) => {
  const store = readStore();
  const project = payload.projectPath && fs.existsSync(payload.projectPath)
    ? projectFromPath(payload.projectPath)
    : store.activeProject || localWorkspaceProject();
  const visit = upsertBrowserVisit(store, {
    ...payload,
    project,
    url: payload.url,
    lastEventAt: now(),
  });
  writeStore(store);
  return {
    ...sanitizeStore(store),
    browserVisit: visit,
  };
});

ipcMain.handle("app:open-browser-url", async (_event, value) => {
  const payload = typeof value === "object" && value !== null ? value : { url: value };
  const url = normalizeUrlForStore(payload.url || "docs.anthropic.com");
  const store = readStore();
  const project = payload.projectPath && fs.existsSync(payload.projectPath)
    ? projectFromPath(payload.projectPath)
    : store.activeProject || localWorkspaceProject();
  upsertBrowserVisit(store, {
    id: payload.visitId || id("browser"),
    url,
    finalUrl: url,
    status: "external",
    external: true,
    project,
    startedAt: now(),
    endedAt: now(),
    lastEventAt: now(),
  });
  writeStore(store);
  await shell.openExternal(url);
  return sanitizeStore(store);
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
  const requestedProjectPath = String(projectPath || "").trim();
  const hasRequestedProject = Boolean(requestedProjectPath);
  let projectExists = false;
  if (hasRequestedProject) {
    try {
      projectExists = fs.statSync(requestedProjectPath).isDirectory();
    } catch {
      projectExists = false;
    }
  }
  const projectMissing = hasRequestedProject && !projectExists;
  const cwd = projectExists ? requestedProjectPath : app.getPath("home");
  const git = await loadGitEnvironment(cwd);
  return {
    cwd,
    requestedProjectPath,
    projectExists,
    projectMissing,
    fallbackCwd: projectMissing ? cwd : "",
    git,
    ideOptions: ideOptions(),
  };
});

ipcMain.handle("claude:status", async (_event, { projectPath } = {}) => {
  const cwd = projectPath && fs.existsSync(projectPath) ? projectPath : app.getPath("home");
  const claudeCommand = configuredClaudeCommand();
  const skillRegistry = loadSkillRegistry(cwd);
  const [version, auth, plugins, pluginsJson, mcp, mcpJson, marketplaces, marketplacesJson] = await Promise.all([
    runClaudeCommand(claudeCommand, ["--version"], { cwd, timeoutMs: 20000 }),
    runClaudeCommand(claudeCommand, ["auth", "status"], { cwd, timeoutMs: 30000 }),
    runClaudeCommand(claudeCommand, ["plugin", "list"], { cwd, timeoutMs: 30000 }),
    runClaudeCommand(claudeCommand, ["plugin", "list", "--json"], { cwd, timeoutMs: 30000 }),
    runClaudeCommand(claudeCommand, ["mcp", "list"], { cwd, timeoutMs: 30000 }),
    runClaudeCommand(claudeCommand, ["mcp", "list", "--json"], { cwd, timeoutMs: 30000 }),
    runClaudeCommand(claudeCommand, ["plugin", "marketplace", "list"], { cwd, timeoutMs: 30000 }),
    runClaudeCommand(claudeCommand, ["plugin", "marketplace", "list", "--json"], { cwd, timeoutMs: 30000 }),
  ]);
  const pluginItems = normalizeClaudePluginItems(pluginsJson.stdout, plugins.stdout || plugins.stderr);
  const marketplaceItems = normalizeMarketplaceItems(marketplacesJson.stdout, marketplaces.stdout || marketplaces.stderr);
  const mcpRaw = stripAnsi(mcp.stdout || mcp.stderr).trim();
  const mcpJsonItems = mcpJson.code === 0 ? parseJsonListOutput(mcpJson.stdout, ["mcpServers", "servers"]) : [];
  const mcpJsonOutput = mcpJsonItems.length ? mcpJson.stdout : "";
  const mcpJsonStatus = mcpJsonItems.length ? mcpJson : null;
  return {
    available: version.code === 0,
    version: stripAnsi(version.stdout || version.stderr).trim(),
    versionCommand: statusCommandState(version),
    auth: parseJsonOutput(auth.stdout) || { raw: stripAnsi(auth.stdout || auth.stderr).trim(), code: auth.code },
    authCommand: statusCommandState(auth),
    plugins: stripAnsi(plugins.stdout || plugins.stderr).trim(),
    pluginItems,
    pluginCommand: statusCommandState(plugins, pluginsJson),
    skills: skillRegistry.items,
    skillItems: skillRegistry.items,
    skillRoots: skillRegistry.roots,
    skillsTruncated: skillRegistry.truncated,
    mcp: mcpRaw,
    mcpServers: normalizeMcpServers(mcpJsonOutput, mcpRaw),
    mcpCommand: statusCommandState(mcp, mcpJsonStatus),
    marketplaces: marketplaceItems,
    marketplacePlugins: loadMarketplacePluginCatalog(marketplaceItems, pluginItems),
    marketplaceOutput: stripAnsi(marketplaces.stdout || marketplaces.stderr).trim(),
    marketplaceCommand: statusCommandState(marketplaces, marketplacesJson),
  };
});

ipcMain.handle("claude:run", async (_event, { projectPath, args, requestId, persistCommandRun = false, commandRunKind = "claude" } = {}) => {
  const cwd = projectPath && fs.existsSync(projectPath) ? projectPath : app.getPath("home");
  const argv = Array.isArray(args) ? args.map(String).filter(Boolean) : splitArgs(args);
  if (!argv.length) throw new Error("Claude 命令为空。");
  const claudeCommand = configuredClaudeCommand();
  const runId = requestId || id("claude_command");
  const startedAtIso = now();
  let lastResult = null;
  for (const candidate of commandCandidates(claudeCommand)) {
    const result = await runStreamingProcess(candidate, argv, {
      cwd,
      requestId: runId,
      timeoutMs: CLAUDE_TIMEOUT_MS,
      env: claudeProcessEnv({ CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" }),
      onChunk: (stream, text) => emitProcessChunk(_event.sender, "claude:run-stream-event", runId, stream, text),
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
  const sanitizedResult = {
    ...result,
    requestId: runId,
    args: argv,
    stdout: stripAnsi(result.stdout),
    stderr: stripAnsi(result.stderr),
  };
  if (!persistCommandRun) return sanitizedResult;
  const store = readStore();
  const persisted = upsertCommandRun(store, {
    ...sanitizedResult,
    id: runId,
    requestId: runId,
    kind: commandRunKind === "capability" ? "capability" : "claude",
    command: `claude ${argv.join(" ")}`,
    project: projectFromPath(cwd),
    startedAt: startedAtIso,
    endedAt: now(),
  });
  writeStore(store);
  broadcastStoreUpdate(store);
  return {
    ...sanitizedResult,
    commandRun: persisted,
    commandRuns: sanitizeStore(store).commandRuns,
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
  const { root, target, relative } = resolveInsideProject(projectPath, relativePath);
  const stat = fs.statSync(target);
  if (!stat.isFile()) throw new Error("所选路径不是文件。");
  if (stat.size > MAX_TEXT_FILE_BYTES) throw new Error("文件太大，无法预览。");
  const buffer = fs.readFileSync(target);
  if (buffer.includes(0)) throw new Error("这里不能编辑二进制文件。");
  const snapshot = fileSnapshot(target, buffer);
  const store = readStore();
  const project = root ? projectFromPath(root) : store.activeProject || localWorkspaceProject();
  const sourceRef = upsertSourceRef(store, {
    type: "file",
    path: relative,
    title: path.basename(relative),
    project,
    size: stat.size,
    sha256: snapshot.sha256,
    updatedAt: snapshot.updatedAt,
    lastOpenedAt: now(),
  });
  writeStore(store);
  return {
    ...snapshot,
    path: relative,
    sourceRef,
    sourceRefs: sanitizeStore(store).sourceRefs,
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
  let snapshot = null;
  if (request) {
    if (typeof request.cancel === "function") snapshot = request.cancel();
    else if (typeof request.abort === "function") request.abort();
    else if (typeof request.kill === "function") request.kill();
    activeRequests.delete(requestId);
    if (snapshot && request.kind === "workspace-command") {
      const store = readStore();
      const persisted = upsertCommandRun(store, {
        ...snapshot,
        kind: "workspace",
        project: projectFromPath(snapshot.cwd),
      });
      const runEvent = upsertCommandRunEvent(store, persisted, "cancelled");
      writeStore(store);
      broadcastStoreUpdate(store);
      const sanitized = sanitizeStore(store);
      return {
        ...snapshot,
        commandRun: persisted,
        commandRuns: sanitized.commandRuns,
        runEvent,
        runEvents: sanitized.runEvents,
        cancelled: true,
      };
    }
  }
  return { cancelled: Boolean(request) };
});

ipcMain.handle("workspace:run-command", async (_event, { projectPath, command, requestId } = {}) => {
  const cwd = resolveProjectRoot(projectPath);
  const cmd = String(command || "").trim();
  if (!cmd) throw new Error("命令为空。");
  const runId = requestId || id("workspace_command");
  const startedAtIso = now();
  const project = projectFromPath(cwd);
  const startStore = readStore();
  upsertCommandRunEvent(startStore, {
    id: runId,
    requestId: runId,
    kind: "workspace",
    command: cmd,
    cwd,
    project,
    startedAt: startedAtIso,
  }, "running");
  writeStore(startStore);
  broadcastStoreUpdate(startStore);

  const result = await new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(cmd, [], {
      cwd,
      windowsHide: process.platform === "win32",
      env: process.env,
      shell: process.platform === "win32" ? process.env.ComSpec || true : true,
    });
    let stdout = "";
    let stderr = "";
    let cancelled = false;
    const cancelledSnapshot = () => ({
      id: runId,
      requestId: runId,
      command: cmd,
      cwd,
      code: 130,
      stdout,
      stderr: trimOutput(`${stderr}\n命令已取消。`),
      durationMs: Date.now() - startedAt,
      cancelled: true,
      startedAt: startedAtIso,
      endedAt: now(),
    });
    if (requestId) {
      activeRequests.set(requestId, {
        kind: "workspace-command",
        cancel: () => {
          cancelled = true;
          killChildProcess(child);
          return cancelledSnapshot();
        },
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
        id: runId,
        requestId: runId,
        command: cmd,
        cwd,
        code: cancelled ? 130 : 1,
        stdout,
        stderr: trimOutput(cancelled ? `${stderr}\n命令已取消。` : `${stderr}\n${error.message}`),
        durationMs: Date.now() - startedAt,
        cancelled,
        startedAt: startedAtIso,
        endedAt: now(),
      });
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (requestId) activeRequests.delete(requestId);
      resolve({
        id: runId,
        requestId: runId,
        command: cmd,
        cwd,
        code: cancelled ? 130 : code,
        stdout,
        stderr: trimOutput(cancelled ? `${stderr}\n命令已取消。` : stderr),
        durationMs: Date.now() - startedAt,
        cancelled,
        startedAt: startedAtIso,
        endedAt: now(),
      });
    });
  });
  const store = readStore();
  const persisted = upsertCommandRun(store, {
    ...result,
    id: runId,
    requestId: runId,
    kind: "workspace",
    project,
  });
  const runEvent = upsertCommandRunEvent(
    store,
    persisted,
    result.cancelled ? "cancelled" : result.code === 0 ? "ok" : "error",
  );
  writeStore(store);
  broadcastStoreUpdate(store);
  const sanitized = sanitizeStore(store);
  return {
    ...result,
    commandRun: persisted,
    commandRuns: sanitized.commandRuns,
    runEvent,
    runEvents: sanitized.runEvents,
  };
});
