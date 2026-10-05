/* METADATA
{
  "name": "sensenova_sidebar",

  "display_name": {
      "zh": "商汤生图工具",
      "en": "SenseNova Draw Tools"
  },
  "description": {
      "zh": "调用商汤 SenseNova 接口进行文生图与图生图编辑（sensenova-u1.5-lite），支持配置 API Key，图片保存到本地并返回 Markdown 图片提示，供侧边栏预览与发送。",
      "en": "Generate and edit images via SenseNova APIs (sensenova-u1.5-lite). Configure an API key, save images locally, and return Markdown image references for sidebar preview and sending."
  },
  "env": [
    {
      "name": "SENSENOVA_API_KEY",
      "description": {
        "zh": "商汤 SenseNova API Key（可在侧边栏插件页面配置）",
        "en": "SenseNova API key (configurable in the sidebar plugin page)"
      },
      "required": false
    }
  ],
  "category": "Draw",
  "tools": [
    {
      "name": "generate_image",
      "description": {
        "zh": "根据提示词调用商汤 SenseNova 文生图接口生成图片，保存到本地并返回 Markdown 图片提示。",
        "en": "Generate an image via SenseNova text-to-image API using a prompt, save it locally, and return a Markdown image reference."
      },
      "parameters": [
        { "name": "prompt", "description": { "zh": "绘图提示词（英文或中文皆可）", "en": "Prompt for image generation (Chinese or English)" }, "type": "string", "required": true },
        { "name": "negative_prompt", "description": { "zh": "负面提示词（可选）", "en": "Negative prompt (optional)" }, "type": "string", "required": false },
        { "name": "aspect_ratio", "description": { "zh": "输出比例，如 '1:1', '16:9', '9:16'（可选，默认 1:1）", "en": "Aspect ratio, e.g. '1:1', '16:9', '9:16' (optional; default 1:1)" }, "type": "string", "required": false },
        { "name": "image_size", "description": { "zh": "输出分辨率档位：1K / 2K / 4K（可选，默认 2K；仅 u1.5-lite 支持 4K）", "en": "Image size tier: 1K / 2K / 4K (optional; default 2K; 4K requires u1.5-lite)" }, "type": "string", "required": false },
        { "name": "model", "description": { "zh": "模型名（可选，默认 sensenova-u1.5-lite）", "en": "Model name (optional; default sensenova-u1.5-lite)" }, "type": "string", "required": false },
        { "name": "file_name", "description": { "zh": "自定义保存到本地的文件名（不含路径和扩展名）", "en": "Custom output file name (without path or extension)" }, "type": "string", "required": false }
      ]
    },
    {
      "name": "edit_image",
      "description": {
        "zh": "对本地图片进行商汤 SenseNova 图生图编辑（如改背景、改风格、加元素），保存结果并返回 Markdown 图片提示。",
        "en": "Edit a local image via SenseNova image-edit API (background/style/element changes), save the result, and return a Markdown image reference."
      },
      "parameters": [
        { "name": "prompt", "description": { "zh": "编辑指令，描述要如何修改图片", "en": "Edit instruction describing how to modify the image" }, "type": "string", "required": true },
        { "name": "image_path", "description": { "zh": "本地图片路径（必填）", "en": "Local image file path (required)" }, "type": "string", "required": true },
        { "name": "model", "description": { "zh": "模型名（可选，编辑固定要求 sensenova-u1.5-lite）", "en": "Model name (optional; editing requires sensenova-u1.5-lite)" }, "type": "string", "required": false },
        { "name": "file_name", "description": { "zh": "自定义保存到本地的文件名（不含路径和扩展名）", "en": "Custom output file name (without path or extension)" }, "type": "string", "required": false }
      ]
    },
    {
      "name": "save_config",
      "description": {
        "zh": "保存商汤 API Key 等配置到插件本地配置文件。",
        "en": "Save SenseNova API key and other config to the plugin local config file."
      },
      "parameters": [
        { "name": "api_key", "description": { "zh": "商汤 SenseNova API Key", "en": "SenseNova API key" }, "type": "string", "required": true },
        { "name": "base_url", "description": { "zh": "API Base URL（可选，默认 https://token.sensenova.cn/v1）", "en": "API base URL (optional; default https://token.sensenova.cn/v1)" }, "type": "string", "required": false },
        { "name": "model", "description": { "zh": "默认模型（可选，默认 sensenova-u1.5-lite）", "en": "Default model (optional; default sensenova-u1.5-lite)" }, "type": "string", "required": false }
      ]
    },
    {
      "name": "load_config",
      "description": {
        "zh": "读取已保存的商汤 API 配置（不含密钥明文以外的敏感信息，仅返回是否已配置及模型等）。",
        "en": "Read saved SenseNova API configuration (returns whether configured and model info)."
      },
      "parameters": []
    },
    {
      "name": "list_draws",
      "description": {
        "zh": "列出插件生成目录下的全部图片（新→旧）。",
        "en": "List all images in the plugin draws directory (newest first)."
      },
      "parameters": []
    },
    {
      "name": "send_to_chat",
      "description": {
        "zh": "将指定图片以 Markdown 图片形式发送到当前聊天。",
        "en": "Send an image to the current chat as a Markdown image reference."
      },
      "parameters": [
        { "name": "markdown", "description": { "zh": "Markdown 图片引用，如 ![图片](file:///path.png)", "en": "Markdown image reference" }, "type": "string", "required": true },
        { "name": "file_path", "description": { "zh": "图片本地路径（可选）", "en": "Local image path (optional)" }, "type": "string", "required": false }
      ]
    },
    {
      "name": "start_service",
      "description": {
        "zh": "启动/检查商汤生图本地 Python 服务（供侧边栏 WebView 加载，突破 15 秒限制）。幂等：已在运行则直接返回。",
        "en": "Start/check the SenseNova local Python service (for sidebar WebView, bypass 15s limit). Idempotent: returns ok if already running."
      },
      "parameters": [
        { "name": "port", "description": { "zh": "服务端口（可选，默认 8899）", "en": "Service port (optional, default 8899)" }, "type": "number", "required": false }
      ]
    }
  ]
}*/
const sensenovaSidebar = (function () {
    const HTTP_TIMEOUT_MS = 600000;
    const DEFAULT_BASE_URL = "https://token.sensenova.cn/v1";
    const DEFAULT_MODEL = "sensenova-u1.5-lite";
    const EDIT_REQUIRED_MODEL = "sensenova-u1.5-lite";
    const GEN_ENDPOINT = "/images/generations";
    const EDIT_ENDPOINT = "/images/edits";
    let _pluginBase = "";
    try { _pluginBase = getPluginConfigDir("draw") || ""; } catch (e) { _pluginBase = ""; }
    const CONFIG_CANDIDATES = (function () {
        const list = [];
        if (_pluginBase) list.push(_pluginBase + "/sensenova_sidebar/config.json");
        list.push("/sdcard/Download/Operit/plugins/draw/sensenova_sidebar/config.json");
        list.push("/sdcard/Download/Operit/plugins/com.operit.sensenova_sidebar/config.json");
        return list;
    })();
    const STORAGE_DIR = "/sdcard/Download/Operit/plugins/draw/sensenova_sidebar";
    const DRAWS_DIR = STORAGE_DIR + "/draws";
    const CONFIG_PATH = STORAGE_DIR + "/config.json";
    const client = OkHttp.newBuilder()
        .connectTimeout(HTTP_TIMEOUT_MS)
        .readTimeout(HTTP_TIMEOUT_MS)
        .writeTimeout(HTTP_TIMEOUT_MS)
        .build();
    function isRecord(value) {
        return typeof value === "object" && value !== null;
    }
    function getErrorMessage(error) {
        if (error instanceof Error)
            return error.message;
        return String(error);
    }
    function getErrorStack(error) {
        if (error instanceof Error)
            return error.stack;
        return undefined;
    }
    function joinUrl(baseUrl, path) {
        const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
        const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
        return `${normalizedBase}${normalizedPath}`;
    }
    function sanitizeFileName(name) {
        const safe = name.replace(/[\\/:*?"<>|]/g, "_").trim();
        if (!safe)
            return `sensenova_${Date.now()}`;
        return safe.substring(0, 80);
    }
    function buildFileName(prompt, customName) {
        if (customName && customName.trim().length > 0) {
            return sanitizeFileName(customName);
        }
        const shortPrompt = prompt.length > 40 ? `${prompt.substring(0, 40)}...` : prompt;
        const base = sanitizeFileName(shortPrompt || "image");
        return `${base}_${Date.now()}`;
    }
    function guessExtensionFromUrl(url) {
        const match = url.match(/\.(png|jpg|jpeg|webp|gif)(?:\?|#|$)/i);
        if (match && match[1])
            return match[1].toLowerCase();
        return "png";
    }
    async function ensureDirectories() {
        const dirs = [STORAGE_DIR, DRAWS_DIR];
        for (const dir of dirs) {
            try {
                const result = await Tools.Files.mkdir(dir);
                if (!result.successful) {
                    console.warn(`mkdir warn: ${dir} -> ${result.details}`);
                }
            }
            catch (e) {
                console.warn(`mkdir exception: ${dir} -> ${getErrorMessage(e)}`);
            }
        }
    }
    async function readConfig() {
        const errors = [];
        for (const p of CONFIG_CANDIDATES) {
            try {
                const result = await Tools.Files.read(p);
                if (result.successful && result.content) {
                    const parsed = JSON.parse(result.content);
                    if (isRecord(parsed) && ((parsed.api_key || "").trim() || (parsed.model || "").trim())) {
                        return parsed;
                    }
                }
            }
            catch (e) {
                errors.push(getErrorMessage(e));
            }
        }
        return {};
    }
    async function writeConfig(config) {
        await ensureDirectories();
        const content = JSON.stringify(config, null, 2);
        let lastError = "";
        const targets = [CONFIG_PATH];
        if (CONFIG_CANDIDATES[0] && CONFIG_CANDIDATES[0] !== CONFIG_PATH) targets.push(CONFIG_CANDIDATES[0]);
        for (const p of targets) {
            try {
                const result = await Tools.Files.write(p, content, false);
                if (!result.successful) lastError = result.details || lastError;
            } catch (e) {
                lastError = getErrorMessage(e);
            }
        }
        if (lastError) {
            console.warn("writeConfig partial error:", lastError);
        }
        return { successful: true };
    }
    function getApiKey() {
        const fromEnv = (getEnv("SENSENOVA_API_KEY") || "").trim();
        if (fromEnv)
            return fromEnv;
        return "";
    }
    function getBaseUrl(custom) {
        const fromParam = (custom || "").trim();
        if (fromParam)
            return fromParam;
        return DEFAULT_BASE_URL;
    }
    async function resolveApiKey() {
        const fromEnv = getApiKey();
        if (fromEnv)
            return fromEnv;
        const config = await readConfig();
        const fromConfig = (config.api_key || "").trim();
        if (fromConfig)
            return fromConfig;
        throw new Error("未配置商汤 API Key：请在侧边栏插件页面点击「设置 API Key」填入，或在环境变量中设置 SENSENOVA_API_KEY。");
    }
    async function resolveModel(custom) {
        const fromParam = (custom || "").trim();
        if (fromParam)
            return fromParam;
        const config = await readConfig();
        const fromConfig = (config.model || "").trim();
        if (fromConfig)
            return fromConfig;
        return DEFAULT_MODEL;
    }
    function normalizeAspectRatio(value) {
        const raw = String(value || "").trim();
        if (!raw)
            return "1:1";
        const cleaned = raw.replace(/[×xX]/g, ":");
        if (/^\d+:\d+$/.test(cleaned))
            return cleaned;
        return "1:1";
    }
    function normalizeSize(value) {
        const raw = String(value || "").trim().toUpperCase();
        if (raw === "1K" || raw === "2K" || raw === "4K")
            return raw;
        return "2K";
    }
    function fileToDataUrl(base64, mime) {
        return `data:${mime || "image/png"};base64,${base64}`;
    }
    async function generate_image(params) {
        if (!params || !params.prompt || params.prompt.trim().length === 0) {
            throw new Error("参数 prompt 不能为空。");
        }
        const prompt = params.prompt.trim();
        const apiKey = await resolveApiKey();
        const model = await resolveModel(params.model);
        const baseUrl = getBaseUrl(undefined);
        const size = normalizeSize(params.image_size);
        const aspectRatio = normalizeAspectRatio(params.aspect_ratio);
        const sizeMap = {
            "1K": { "1:1": "1344x1344", "16:9": "1792x992", "9:16": "992x1792", "4:3": "1536x1152", "3:4": "1152x1536", "3:2": "1632x1088", "2:3": "1088x1632" },
            "2K": { "1:1": "2048x2048", "16:9": "2752x1536", "9:16": "1536x2752", "4:3": "2368x1760", "3:4": "1760x2368", "3:2": "2496x1664", "2:3": "1664x2496" },
            "4K": { "1:1": "4096x4096", "16:9": "4096x2304", "9:16": "2304x4096", "4:3": "4096x3072", "3:4": "3072x4096", "3:2": "4096x2731", "2:3": "2731x4096" },
        };
        const buckets = sizeMap[size] || sizeMap["2K"];
        const pixelSize = buckets[aspectRatio] || buckets["1:1"];
        const body = {
            model,
            prompt,
            size: pixelSize,
            response_format: "url",
            output_format: "png",
            watermark: false,
        };
        if (params.negative_prompt && params.negative_prompt.trim().length > 0) {
            body["prompt_extend"] = true;
            body["negative_prompt"] = params.negative_prompt.trim();
        }
        const headers = {
            "accept": "application/json",
            "content-type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
        };
        const endpoint = joinUrl(baseUrl, GEN_ENDPOINT);
        const request = client
            .newRequest()
            .url(endpoint)
            .method("POST")
            .headers(headers)
            .body(JSON.stringify(body), "json");
        const response = await request.build().execute();
        if (!response.isSuccessful()) {
            throw new Error(`商汤文生图失败: HTTP ${response.statusCode} - ${response.content}`);
        }
        let parsed;
        try {
            parsed = JSON.parse(response.content);
        }
        catch (e) {
            throw new Error(`解析商汤文生图响应失败: ${getErrorMessage(e)}`);
        }
        const data = isRecord(parsed) && Array.isArray(parsed["data"]) ? parsed["data"] : [];
        const first = data.length > 0 ? data[0] : null;
        const url = isRecord(first) ? first["url"] : undefined;
        if (typeof url !== "string" || url.trim().length === 0) {
            throw new Error(`商汤未返回图片 URL: ${response.content}`);
        }
        await ensureDirectories();
        const ext = guessExtensionFromUrl(url);
        const baseName = buildFileName(prompt, params.file_name);
        const filePath = `${DRAWS_DIR}/${baseName}.${ext}`;
        const downloadResult = await Tools.Files.download(url, filePath);
        if (!downloadResult.successful) {
            throw new Error(`下载图片失败: ${downloadResult.details}`);
        }
        const fileUri = `file://${filePath}`;
        const markdown = `![AI生成的图片](${fileUri})`;
        return {
            file_path: filePath,
            file_uri: fileUri,
            markdown,
            prompt,
            model,
            size: pixelSize,
            aspect_ratio: aspectRatio,
            image_url: url,
        };
    }
    async function edit_image(params) {
        if (!params || !params.prompt || params.prompt.trim().length === 0) {
            throw new Error("参数 prompt 不能为空。");
        }
        if (!params.image_path || params.image_path.trim().length === 0) {
            throw new Error("参数 image_path 不能为空。");
        }
        const prompt = params.prompt.trim();
        const imagePath = params.image_path.trim();
        const apiKey = await resolveApiKey();
        const baseUrl = getBaseUrl(undefined);
        let model = (params.model || "").trim() || EDIT_REQUIRED_MODEL;
        if (model.toLowerCase() !== EDIT_REQUIRED_MODEL) {
            throw new Error(`商汤图生图编辑要求模型 ${EDIT_REQUIRED_MODEL}，当前为 ${model}。`);
        }
        const binResult = await Tools.Files.readBinary(imagePath);
        if (!binResult.successful || !binResult.base64) {
            throw new Error(`读取本地图片失败: ${binResult.details || "未知错误"}`);
        }
        const mime = binResult.mimeType || "image/png";
        const dataUrl = fileToDataUrl(binResult.base64, mime);
        const body = {
            model,
            images: [{ image_url: dataUrl }],
            prompt,
            n: 1,
            size: "auto",
            watermark: false,
            prompt_extend: true,
            response_format: "url",
        };
        const headers = {
            "accept": "application/json",
            "content-type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
        };
        const endpoint = joinUrl(baseUrl, EDIT_ENDPOINT);
        const request = client
            .newRequest()
            .url(endpoint)
            .method("POST")
            .headers(headers)
            .body(JSON.stringify(body), "json");
        const response = await request.build().execute();
        if (!response.isSuccessful()) {
            throw new Error(`商汤图生图编辑失败: HTTP ${response.statusCode} - ${response.content}`);
        }
        let parsed;
        try {
            parsed = JSON.parse(response.content);
        }
        catch (e) {
            throw new Error(`解析商汤编辑响应失败: ${getErrorMessage(e)}`);
        }
        const data = isRecord(parsed) && Array.isArray(parsed["data"]) ? parsed["data"] : [];
        const first = data.length > 0 ? data[0] : null;
        const url = isRecord(first) ? first["url"] : undefined;
        if (typeof url !== "string" || url.trim().length === 0) {
            throw new Error(`商汤未返回编辑图片 URL: ${response.content}`);
        }
        await ensureDirectories();
        const ext = guessExtensionFromUrl(url);
        const baseName = buildFileName(prompt, params.file_name || `edit_${Date.now()}`);
        const filePath = `${DRAWS_DIR}/${baseName}.${ext}`;
        const downloadResult = await Tools.Files.download(url, filePath);
        if (!downloadResult.successful) {
            throw new Error(`下载编辑图片失败: ${downloadResult.details}`);
        }
        const fileUri = `file://${filePath}`;
        const markdown = `![AI编辑的图片](${fileUri})`;
        return {
            file_path: filePath,
            file_uri: fileUri,
            markdown,
            prompt,
            model,
            source_image: imagePath,
            image_url: url,
        };
    }
    async function save_config(params) {
        if (!params || !params.api_key || params.api_key.trim().length === 0) {
            throw new Error("api_key 不能为空。");
        }
        const config = await readConfig();
        config.api_key = params.api_key.trim();
        if (params.base_url && params.base_url.trim().length > 0) {
            config.base_url = params.base_url.trim();
        }
        if (params.model && params.model.trim().length > 0) {
            config.model = params.model.trim();
        }
        await writeConfig(config);
        return { success: true, message: "配置已保存", configured: true, model: config.model || DEFAULT_MODEL };
    }
    async function load_config() {
        const config = await readConfig();
        const hasKey = !!((config.api_key || "").trim()) || !!getApiKey();
        return {
            success: true,
            configured: hasKey,
            model: (config.model || "").trim() || DEFAULT_MODEL,
            base_url: (config.base_url || "").trim() || DEFAULT_BASE_URL,
            has_env_key: !!getApiKey(),
            storage_dir: STORAGE_DIR,
            config_path: CONFIG_PATH,
        };
    }
    async function list_draws() {
        await ensureDirectories();
        try {
            const listing = await Tools.Files.list(DRAWS_DIR);
            if (!listing.successful || !listing.entries) {
                return { files: [] };
            }
            const imageEntries = listing.entries
                .filter((entry) => !entry.isDirectory && /\.(png|jpg|jpeg|webp|gif)$/i.test(entry.name))
                .map((entry) => ({
                    name: entry.name,
                    path: `${DRAWS_DIR}/${entry.name}`,
                    size: entry.size || 0,
                    modified: entry.lastModified || 0,
                    uri: `file://${DRAWS_DIR}/${entry.name}`,
                }))
                .sort((a, b) => (b.modified || 0) - (a.modified || 0));
            return { files: imageEntries.slice(0, 100) };
        }
        catch (e) {
            return { files: [], error: getErrorMessage(e) };
        }
    }
    async function send_to_chat(params) {
        if (!params || !params.markdown || params.markdown.trim().length === 0) {
            throw new Error("参数 markdown 不能为空。");
        }
        const markdown = params.markdown.trim();
        try {
            const sendResult = await Tools.Chat.sendMessage(markdown);
            if (sendResult && sendResult.success) {
                return { success: true, message: "图片已发送到聊天", sent: true };
            }
            return { success: true, message: "已提交发送", sent: true };
        }
        catch (e) {
            console.warn("send_to_chat via Tools.Chat failed, returning markdown:", getErrorMessage(e));
            return { success: true, message: "请在聊天中粘贴以下 Markdown 以展示图片", markdown, sent: false };
        }
    }
    async function start_service(params) {
        params = params || {};
        const port = params.port || 8899;
        let sid = "";
        try {
            const sess = await Tools.System.terminal.create("sensenova_svc");
            sid = sess && (sess.sessionId || sess.id) ? String(sess.sessionId || sess.id) : "";
        } catch (e) { console.warn("start_service create:", getErrorMessage(e)); }
        // 幂等检查
        if (sid) {
            try {
                const check = await Tools.System.terminal.exec(sid, "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:" + port + "/api/config || echo 'DOWN'", 8000);
                const out = String(check && check.output || "");
                if (out.indexOf("200") >= 0) {
                    return { ok: true, message: "服务已在运行", port: port };
                }
            } catch (e) { console.warn("start_service check:", getErrorMessage(e)); }
        }
        // 启动
        try {
            const cmd = "cd /sdcard/Download/Operit/dev_package/com.operit.sensenova_sidebar && (setsid nohup python3 server.py " + port + " >/tmp/snserver.log 2>&1 &) && sleep 2 && curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:" + port + "/api/config";
            const r = await Tools.System.terminal.exec(sid, cmd, 15000);
            const out = String(r && r.output || "");
            if (out.indexOf("200") >= 0) {
                return { ok: true, message: "服务已启动", port: port };
            }
            return { ok: false, error: "服务启动失败: " + out };
        } catch (e) {
            return { ok: false, error: "启动异常: " + getErrorMessage(e) };
        }
    }
    function wrapper(fn) {
        return async function (params) {
            try {
                const result = await fn(params || {});
                complete({ success: true, data: result });
            }
            catch (error) {
                console.error("sensenova_sidebar error:", error);
                complete({ success: false, message: getErrorMessage(error), error_stack: getErrorStack(error) });
            }
        };
    }
    return {
        generate_image: wrapper(generate_image),
        edit_image: wrapper(edit_image),
        save_config: wrapper(save_config),
        load_config: wrapper(load_config),
        start_service: wrapper(start_service),
        list_draws: wrapper(list_draws),
        send_to_chat: wrapper(send_to_chat),
    };
})();
exports.generate_image = sensenovaSidebar.generate_image;
exports.edit_image = sensenovaSidebar.edit_image;
exports.save_config = sensenovaSidebar.save_config;
exports.load_config = sensenovaSidebar.load_config;
exports.start_service = sensenovaSidebar.start_service;
exports.list_draws = sensenovaSidebar.list_draws;
exports.send_to_chat = sensenovaSidebar.send_to_chat;