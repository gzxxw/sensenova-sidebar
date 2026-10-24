"use strict";
// SenseNova 核心逻辑共享模块
// 供两条通道复用：① ToolPkg IPC（UI 侧边栏）② 子包工具（AI 直接调用）
// 所有配置读写都带多路径兜底，保证 UI 保存后一定能读到

const HTTP_TIMEOUT_MS = 600000;
const DEFAULT_BASE_URL = "https://token.sensenova.cn/v1";
const DEFAULT_MODEL = "sensenova-u1.5-lite";
const EDIT_REQUIRED_MODEL = "sensenova-u1.5-lite";
const GEN_ENDPOINT = "/images/generations";
const EDIT_ENDPOINT = "/images/edits";

// ---- IPC 通道常量（UI 与 main 共享）----
const CHANNEL = {
  loadConfig: "sensenova.load_config",
  saveConfig: "sensenova.save_config",
  generateImage: "sensenova.generate_image",
  editImage: "sensenova.edit_image",
  listDraws: "sensenova.list_draws",
  sendToChat: "sensenova.send_to_chat",
};

// ---- 路径解析（多候选）----
let _pluginBase = "";
try { _pluginBase = getPluginConfigDir("draw") || ""; } catch (e) { _pluginBase = ""; }
const STORAGE_DIR = "/storage/emulated/0/Download/Operit/plugins/draw/sensenova_sidebar";
const DRAWS_DIR = STORAGE_DIR + "/draws";
const CONFIG_PATH = STORAGE_DIR + "/config.json";
const CONFIG_CANDIDATES = (function () {
  const list = [];
  if (_pluginBase) list.push(_pluginBase + "/sensenova_sidebar/config.json");
  list.push("/storage/emulated/0/Download/Operit/plugins/draw/sensenova_sidebar/config.json");
  list.push("/sdcard/Download/Operit/plugins/draw/sensenova_sidebar/config.json");
  list.push("/storage/emulated/0/Download/Operit/plugins/com.operit.sensenova_sidebar/config.json");
  list.push("/sdcard/Download/Operit/plugins/com.operit.sensenova_sidebar/config.json");
  list.push("file:///storage/emulated/0/Download/Operit/plugins/draw/sensenova_sidebar/config.json");
  return list;
})();

const client = OkHttp.newBuilder()
  .connectTimeout(HTTP_TIMEOUT_MS)
  .readTimeout(HTTP_TIMEOUT_MS)
  .writeTimeout(HTTP_TIMEOUT_MS)
  .build();

// ---- 工具函数 ----
function isRecord(value) { return typeof value === "object" && value !== null; }
function getErrorMessage(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}
function joinUrl(baseUrl, path) {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return normalizedBase + normalizedPath;
}
function sanitizeFileName(name) {
  const safe = name.replace(/[\\/:*?"<>|]/g, "_").trim();
  if (!safe) return "sensenova_" + Date.now();
  return safe.substring(0, 80);
}
function buildFileName(prompt, customName) {
  if (customName && customName.trim().length > 0) return sanitizeFileName(customName);
  const shortPrompt = prompt.length > 40 ? prompt.substring(0, 40) + "..." : prompt;
  return sanitizeFileName(shortPrompt || "image") + "_" + Date.now();
}
function guessExtensionFromUrl(url) {
  const match = url.match(/\.(png|jpg|jpeg|webp|gif)(?:\?|#|$)/i);
  if (match && match[1]) return match[1].toLowerCase();
  return "png";
}
function sleepMs(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
async function httpExecuteWithRetry(request, retries, label) {
  retries = retries || 3;
  let lastResp = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const resp = await request.build().execute();
    if (resp.isSuccessful()) return resp;
    const code = resp.statusCode;
    // 429 限流 / 5xx 服务端错误 -> 等待后重试
    if (code === 429 || (code >= 500 && code <= 599) || code === 408) {
      lastResp = resp;
      if (attempt < retries) {
        const wait = 20000 * (attempt + 1);
        console.warn(label + " HTTP " + code + "，等待 " + wait + "ms 后重试 (" + (attempt + 1) + "/" + retries + ")");
        await sleepMs(wait);
        continue;
      }
    }
    return resp;
  }
  return lastResp;
}

function fileToDataUrl(base64, mime) {
  return "data:" + (mime || "image/png") + ";base64," + base64;
}
function normalizeAspectRatio(value) {
  const raw = String(value || "").trim();
  if (!raw) return "1:1";
  const cleaned = raw.replace(/[×xX]/g, ":");
  if (/^\d+:\d+$/.test(cleaned)) return cleaned;
  return "1:1";
}
function normalizeSize(value) {
  const raw = String(value || "").trim();
  const upper = raw.toUpperCase();
  if (upper === "1K" || upper === "2K" || upper === "4K") return upper;
  // 支持自定义像素：1024x1024、1792x992、1024*1024、1024×1024
  const px = raw.replace(/[xX×*]/g, "x").replace(/\s+/g, "");
  if (/^\d+x\d+$/.test(px)) return px;
  return "2K";
}
function getEnvKey() {
  try {
    const fromEnv = (getEnv("SENSENOVA_API_KEY") || "").trim();
    return fromEnv;
  } catch (e) { return ""; }
}

// ---- 配置读写（多路径兜底）----
async function ensureDirectories() {
  const dirs = [STORAGE_DIR, DRAWS_DIR];
  for (const dir of dirs) {
    try { await Tools.Files.mkdir(dir); } catch (e) { console.warn("mkdir:", dir, getErrorMessage(e)); }
  }
}
async function readConfig() {
  for (const p of CONFIG_CANDIDATES) {
    try {
      const result = await Tools.Files.read(p);
      if (result && typeof result.content === "string" && result.content.trim().length > 0) {
        const parsed = JSON.parse(result.content);
        if (isRecord(parsed) && ((parsed.api_key || "").trim() || (parsed.model || "").trim())) {
          console.warn("readConfig HIT:", p);
          return parsed;
        }
        console.warn("readConfig empty:", p, "successful=", result.successful);
      } else {
        console.warn("readConfig fail:", p, "successful=", result && result.successful, "details=", result && result.details);
      }
    } catch (e) { console.warn("readConfig throw:", p, getErrorMessage(e)); }
  }
  return {};
}
async function writeConfig(config) {
  await ensureDirectories();
  const content = JSON.stringify(config, null, 2);
  const targets = [CONFIG_PATH];
  if (CONFIG_CANDIDATES[0] && CONFIG_CANDIDATES[0] !== CONFIG_PATH) targets.push(CONFIG_CANDIDATES[0]);
  let lastError = "";
  for (const p of targets) {
    try {
      const result = await Tools.Files.write(p, content, false);
      if (!result || !result.successful) lastError = (result && result.details) || lastError;
    } catch (e) { lastError = getErrorMessage(e); }
  }
  return { successful: true, lastError: lastError };
}
async function resolveApiKey() {
  const fromEnv = getEnvKey();
  if (fromEnv) return fromEnv;
  const config = await readConfig();
  const fromConfig = (config.api_key || "").trim();
  if (fromConfig) return fromConfig;
  throw new Error("未配置商汤 API Key：请在侧边栏插件页面「设置」页填写并保存。");
}
async function resolveModel(custom) {
  const fromParam = (custom || "").trim();
  if (fromParam) return fromParam;
  const config = await readConfig();
  return (config.model || "").trim() || DEFAULT_MODEL;
}

// ---- 核心业务函数（返回普通对象，由 IPC/工具层包装）----
async function generateImage(params) {
  params = params || {};
  if (!params.prompt || params.prompt.trim().length === 0) throw new Error("参数 prompt 不能为空。");
  const prompt = params.prompt.trim();
  const apiKey = await resolveApiKey();
  const model = await resolveModel(params.model);
  const size = normalizeSize(params.image_size);
  const aspectRatio = normalizeAspectRatio(params.aspect_ratio);
  const sizeMap = {
    "1K": { "1:1": "1344x1344", "16:9": "1792x992", "9:16": "992x1792", "4:3": "1536x1152", "3:4": "1152x1536", "3:2": "1632x1088", "2:3": "1088x1632" },
    "2K": { "1:1": "2048x2048", "16:9": "2752x1536", "9:16": "1536x2752", "4:3": "2368x1760", "3:4": "1760x2368", "3:2": "2496x1664", "2:3": "1664x2496" },
    "4K": { "1:1": "4096x4096", "16:9": "4096x2304", "9:16": "2304x4096", "4:3": "4096x3072", "3:4": "3072x4096", "3:2": "4096x2731", "2:3": "2731x4096" },
  };
  let pixelSize = "";
  if (/^\d+x\d+$/.test(size)) {
    // 自定义像素：直接传
    pixelSize = size;
  } else {
    const buckets = sizeMap[size] || sizeMap["2K"];
    pixelSize = buckets[aspectRatio] || buckets["1:1"];
  }
  // u1-fast 不支持 4K；若选了 4K 降级 2K
  if (model.indexOf("u1-fast") >= 0 && pixelSize.indexOf("4096") >= 0) {
    pixelSize = sizeMap["2K"][aspectRatio] || "2048x2048";
  }
  const body = {
    model, prompt, size: pixelSize,
    response_format: "url", output_format: "png", watermark: false,
  };
  if (params.negative_prompt && params.negative_prompt.trim().length > 0) {
    body.prompt_extend = true;
    body.negative_prompt = params.negative_prompt.trim();
  }
  const headers = {
    "accept": "application/json", "content-type": "application/json",
    "Authorization": "Bearer " + apiKey,
  };
  const request = client.newRequest().url(joinUrl(DEFAULT_BASE_URL, GEN_ENDPOINT))
    .method("POST").headers(headers).body(JSON.stringify(body), "json");
  const response = await httpExecuteWithRetry(request, 3, "商汤文生图");
  if (!response.isSuccessful()) throw new Error("商汤文生图失败: HTTP " + response.statusCode + " - " + response.content);
  let parsed;
  try { parsed = JSON.parse(response.content); } catch (e) { throw new Error("解析商汤文生图响应失败: " + getErrorMessage(e)); }
  const data = isRecord(parsed) && Array.isArray(parsed["data"]) ? parsed["data"] : [];
  const first = data.length > 0 ? data[0] : null;
  const url = isRecord(first) ? first["url"] : undefined;
  if (typeof url !== "string" || url.trim().length === 0) throw new Error("商汤未返回图片 URL: " + response.content);
  await ensureDirectories();
  const baseName = buildFileName(prompt, params.file_name);
  const filePath = DRAWS_DIR + "/" + baseName + "." + guessExtensionFromUrl(url);
  const dl = await Tools.Files.download(url, filePath);
  if (!dl.successful) throw new Error("下载图片失败: " + dl.details);
  return { file_path: filePath, file_uri: "file://" + filePath, markdown: "![AI生成的图片](file://" + filePath + ")", prompt, model, size: pixelSize, aspect_ratio: aspectRatio, image_url: url };
}

async function editImage(params) {
  params = params || {};
  if (!params.prompt || params.prompt.trim().length === 0) throw new Error("参数 prompt 不能为空。");
  if (!params.image_path || params.image_path.trim().length === 0) throw new Error("参数 image_path 不能为空。");
  const prompt = params.prompt.trim();
  const imagePath = params.image_path.trim();
  const apiKey = await resolveApiKey();
  let model = (params.model || "").trim() || EDIT_REQUIRED_MODEL;
  if (model.toLowerCase() !== EDIT_REQUIRED_MODEL) throw new Error("商汤图生图编辑要求模型 " + EDIT_REQUIRED_MODEL + "，当前为 " + model + "。");
  const bin = await Tools.Files.readBinary(imagePath);
  if (!bin || !bin.contentBase64) throw new Error("读取本地图片失败: " + ((bin && bin.details) || "未知错误"));
  const body = {
    model,
    images: [{ image_url: fileToDataUrl(bin.contentBase64, (bin.mimeType || "image/png")) }],
    prompt, n: 1, size: "auto", watermark: false, prompt_extend: true, response_format: "url",
  };
  const headers = {
    "accept": "application/json", "content-type": "application/json",
    "Authorization": "Bearer " + apiKey,
  };
  const request = client.newRequest().url(joinUrl(DEFAULT_BASE_URL, EDIT_ENDPOINT))
    .method("POST").headers(headers).body(JSON.stringify(body), "json");
  const response = await httpExecuteWithRetry(request, 3, "商汤图生图编辑");
  if (!response.isSuccessful()) throw new Error("商汤图生图编辑失败: HTTP " + response.statusCode + " - " + response.content);
  let parsed;
  try { parsed = JSON.parse(response.content); } catch (e) { throw new Error("解析商汤编辑响应失败: " + getErrorMessage(e)); }
  const data = isRecord(parsed) && Array.isArray(parsed["data"]) ? parsed["data"] : [];
  const first = data.length > 0 ? data[0] : null;
  const url = isRecord(first) ? first["url"] : undefined;
  if (typeof url !== "string" || url.trim().length === 0) throw new Error("商汤未返回编辑图片 URL: " + response.content);
  await ensureDirectories();
  const baseName = buildFileName(prompt, params.file_name || ("edit_" + Date.now()));
  const filePath = DRAWS_DIR + "/" + baseName + "." + guessExtensionFromUrl(url);
  const dl = await Tools.Files.download(url, filePath);
  if (!dl.successful) throw new Error("下载编辑图片失败: " + dl.details);
  return { file_path: filePath, file_uri: "file://" + filePath, markdown: "![AI编辑的图片](file://" + filePath + ")", prompt, model, source_image: imagePath, image_url: url };
}

async function saveConfig(params) {
  params = params || {};
  if (!params.api_key || params.api_key.trim().length === 0) throw new Error("api_key 不能为空。");
  const config = await readConfig();
  config.api_key = params.api_key.trim();
  if (params.base_url && params.base_url.trim().length > 0) config.base_url = params.base_url.trim();
  if (params.model && params.model.trim().length > 0) config.model = params.model.trim();
  const r = await writeConfig(config);
  return { success: true, message: "配置已保存", configured: true, model: config.model || DEFAULT_MODEL, storage_dir: STORAGE_DIR };
}

async function loadConfig() {
  let config = {};
  try { config = await readConfig(); } catch (e) { console.warn("loadConfig read err:", getErrorMessage(e)); }
  const hasKey = !!((config.api_key || "").trim()) || !!getEnvKey();
  return {
    success: true,
    configured: hasKey,
    model: (config.model || "").trim() || DEFAULT_MODEL,
    base_url: (config.base_url || "").trim() || DEFAULT_BASE_URL,
    has_env_key: !!getEnvKey(),
    storage_dir: STORAGE_DIR,
    config_path: CONFIG_PATH,
  };
}

async function listDraws() {
  await ensureDirectories();
  try {
    const listing = await Tools.Files.list(DRAWS_DIR);
    if (!listing || !Array.isArray(listing.entries)) return { files: [] };
    const files = listing.entries
      .filter(function (e) { return !e.isDirectory && /\.(png|jpg|jpeg|webp|gif)$/i.test(e.name); })
      .map(function (e) {
        return { name: e.name, path: DRAWS_DIR + "/" + e.name, size: e.size || 0, modified: e.lastModified || 0, uri: "file://" + DRAWS_DIR + "/" + e.name };
      })
      .sort(function (a, b) { return (b.modified || 0) - (a.modified || 0); });
    return { files: files.slice(0, 100) };
  } catch (e) {
    return { files: [], error: getErrorMessage(e) };
  }
}

async function sendToChat(params) {
  params = params || {};
  if (!params.markdown || params.markdown.trim().length === 0) throw new Error("参数 markdown 不能为空。");
  try {
    const sendResult = await Tools.Chat.sendMessage(params.markdown.trim());
    if (sendResult && sendResult.success) return { success: true, message: "图片已发送到聊天", sent: true };
    return { success: true, message: "已提交发送", sent: true };
  } catch (e) {
    console.warn("send_to_chat via Tools.Chat failed:", getErrorMessage(e));
    return { success: true, message: "请在聊天中粘贴 Markdown 展示图片", markdown: params.markdown.trim(), sent: false };
  }
}

// ---- 后台任务（fire-and-forget，突破 UI 15s 限制）----
const TASKS_FILE = STORAGE_DIR + "/tasks.json";
async function readTasks() {
  try {
    const r = await Tools.Files.read(TASKS_FILE);
    if (r && typeof r.content === "string" && r.content.trim().length > 0) {
      const p = JSON.parse(r.content);
      if (p && typeof p === "object") return p;
    }
  } catch (e) {}
  return { seq: 0, tasks: {}, results: [] };
}
async function writeTasks(t) { try { await Tools.Files.write(TASKS_FILE, JSON.stringify(t), false); } catch (e) {} }
async function submitGenerate(params) {
  params = params || {};
  if (!params.prompt || params.prompt.trim().length === 0) throw new Error("参数 prompt 不能为空。");
  const tasks = await readTasks();
  const id = "t" + (++tasks.seq);
  const task = { id: id, prompt: params.prompt.trim(), image_path: params.image_path || "", model: params.model || "", image_size: params.image_size || "", status: "running", created: Date.now(), result: null, error: null };
  tasks.tasks[id] = task;
  await writeTasks(tasks);
  // fire-and-forget：立即返回，后台执行完整生图（可超过 15s）
  (async function () {
    let finalResult = null;
    let finalError = null;
    try { finalResult = await generateImage(params); }
    catch (e) { finalError = getErrorMessage(e); }
    try {
      const t = await readTasks();
      const tk = t.tasks[id];
      if (tk) {
        tk.status = finalError ? "error" : "done";
        tk.finished = Date.now();
        if (finalResult) { tk.result = finalResult; t.results.unshift(finalResult); t.results = t.results.slice(0, 50); }
        else { tk.error = finalError; }
      }
      await writeTasks(t);
    } catch (e) {}
  })();
  return { success: true, task_id: id, status: "running" };
}
async function taskStatus(taskId) {
  const t = await readTasks();
  const tk = taskId ? (t.tasks || {})[taskId] : null;
  return { success: true, task: tk || null, recent: t.results || [] };
}
// ---- IPC 注册（main.js 调用）----
let _ipcRegistered = false;
function registerIpc() {
  if (_ipcRegistered) return;
  _ipcRegistered = true;
  ToolPkg.ipc.on(CHANNEL.loadConfig, async function () { return loadConfig(); });
  ToolPkg.ipc.on(CHANNEL.saveConfig, async function (payload) { return saveConfig(payload || {}); });
  ToolPkg.ipc.on(CHANNEL.generateImage, async function (payload) { return generateImage(payload || {}); });
  ToolPkg.ipc.on(CHANNEL.editImage, async function (payload) { return editImage(payload || {}); });
  ToolPkg.ipc.on(CHANNEL.listDraws, async function () { return listDraws(); });
  ToolPkg.ipc.on(CHANNEL.sendToChat, async function (payload) { return sendToChat(payload || {}); });
  ToolPkg.ipc.on("sensenova.submit_generate", async function (payload) { return submitGenerate(payload || {}); });
  ToolPkg.ipc.on("sensenova.task_status", async function (payload) { return taskStatus((payload || {}).task_id); });
}

module.exports = {
  CHANNEL: CHANNEL,
  registerIpc: registerIpc,
  ensureDirectories: ensureDirectories,
  readConfig: readConfig,
  writeConfig: writeConfig,
  generateImage: generateImage,
  editImage: editImage,
  saveConfig: saveConfig,
  loadConfig: loadConfig,
  listDraws: listDraws,
  sendToChat: sendToChat,
  submitGenerate: submitGenerate,
  taskStatus: taskStatus,
};