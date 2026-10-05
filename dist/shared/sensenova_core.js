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
      if (result.successful && result.content) {
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
      if (!result.successful) lastError = result.details || lastError;
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
  const response = await request.build().execute();
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
  if (!bin.successful || !bin.base64) throw new Error("读取本地图片失败: " + (bin.details || "未知错误"));
  const body = {
    model,
    images: [{ image_url: fileToDataUrl(bin.base64, bin.mimeType || "image/png") }],
    prompt, n: 1, size: "auto", watermark: false, prompt_extend: true, response_format: "url",
  };
  const headers = {
    "accept": "application/json", "content-type": "application/json",
    "Authorization": "Bearer " + apiKey,
  };
  const request = client.newRequest().url(joinUrl(DEFAULT_BASE_URL, EDIT_ENDPOINT))
    .method("POST").headers(headers).body(JSON.stringify(body), "json");
  const response = await request.build().execute();
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
    if (!listing.successful || !listing.entries) return { files: [] };
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

async function startService(params) {
  params = params || {};
  const port = params.port || 8899;
  let sid = "";
  // 创建/复用终端会话
  try {
    const sess = await Tools.System.terminal.create("sensenova_svc");
    sid = sess && (sess.sessionId || sess.id) ? String(sess.sessionId || sess.id) : "";
  } catch (e) { console.warn("startService create session:", getErrorMessage(e)); }
  // 幂等：先检查端口是否已在服务
  if (sid) {
    try {
      const check = await Tools.System.terminal.exec(sid, "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:" + port + "/api/config || echo 'DOWN'", 8000);
      const out = String(check && check.output || "");
      if (out.indexOf("200") >= 0) {
        return { success: true, ok: true, message: "服务已在运行", port: port };
      }
    } catch (e) { console.warn("startService check:", getErrorMessage(e)); }
  }
  // 启动服务（后台脱离 terminal 生命周期）
  try {
    const cmd = "cd /sdcard/Download/Operit/dev_package/com.operit.sensenova_sidebar && (setsid nohup python3 server.py " + port + " >/tmp/snserver.log 2>&1 &) && sleep 2 && curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:" + port + "/api/config";
    const r = await Tools.System.terminal.exec(sid, cmd, 15000);
    const out = String(r && r.output || "");
    if (out.indexOf("200") >= 0) {
      return { success: true, ok: true, message: "服务已启动", port: port };
    }
    return { success: false, ok: false, error: "服务启动失败: " + out, output: out };
  } catch (e) {
    return { success: false, ok: false, error: "启动异常: " + getErrorMessage(e) };
  }
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
  ToolPkg.ipc.on("sensenova.start_service", async function (payload) { return startService(payload || {}); });
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
  startService: startService,
};