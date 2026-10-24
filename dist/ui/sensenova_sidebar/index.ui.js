// SenseNova 生图 UI v10 - 纯 Compose + IPC 后台任务 + 轮询 list_draws 预览
// 关键：不依赖 tasks.json（子包沙箱写不可靠），提交后轮询 list_draws（main 进程可靠）出图即显示
const SUBPACKAGE_ID = "sensenova_sidebar";

function resolveRuntimePackageName(ctx) {
  try {
    if (typeof ctx.getCurrentPackageName === "function") {
      const p = ctx.getCurrentPackageName();
      if (p) return p;
    }
  } catch (e) {}
  return SUBPACKAGE_ID;
}

function buildToolCandidates(packageName, toolName) {
  return [
    packageName + ":" + toolName,
    "com.operit." + packageName + ":" + toolName,
    SUBPACKAGE_ID + ":" + toolName,
    "com.operit." + SUBPACKAGE_ID + ":" + toolName,
  ];
}

function getText(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && typeof v.message === "string") return v.message;
  return JSON.stringify(v);
}

// 调用：纯 ctx.callTool（官方 md_reader 同款）。工具名用子包 ID 前缀
async function callMain(ctx, channel, toolName, params) {
  params = params || {};
  // 1) IPC 优先 -> 落在 main 上下文（后台任务持续运行，切走界面不中断）
  try {
    if (typeof ToolPkg !== "undefined" && ToolPkg.ipc && typeof ToolPkg.ipc.call === "function") {
      const r = await ToolPkg.ipc.call(channel, params);
      if (r !== null && r !== undefined) return r;
    }
  } catch (e) { console.warn("ipc fail", channel, getText(e)); }
  // 2) 兜底 callTool
  const candidates = [
    SUBPACKAGE_ID + ":" + toolName,
    "com.operit." + SUBPACKAGE_ID + ":" + toolName,
  ];
  let lastError = null;
  for (const cand of candidates) {
    try {
      const raw = await ctx.callTool(cand, params);
      if (typeof raw === "string") {
        const t = raw.trim();
        if (!t) continue;
        try { return JSON.parse(t); } catch (e) { return t; }
      }
      return raw;
    } catch (e) { lastError = e; console.warn("callTool fail", cand, getText(e)); }
  }
  throw lastError || new Error("无法调用插件工具");
}

function Screen(ctx) {
  const [tab, setTab] = ctx.useState("tab", "gen");
  const [prompt, setPrompt] = ctx.useState("prompt", "");
  const [pickUri, setPickUri] = ctx.useState("pickUri", "");
  const [pickName, setPickName] = ctx.useState("pickName", "");
  const [busy, setBusy] = ctx.useState("busy", false);
  const [polling, setPolling] = ctx.useState("polling", false);
  const [progress, setProgress] = ctx.useState("progress", 0);
  const [statusMsg, setStatusMsg] = ctx.useState("statusMsg", "");
  const [errorMsg, setErrorMsg] = ctx.useState("errorMsg", "");
  const [resultMd, setResultMd] = ctx.useState("resultMd", "");
  const [lastResult, setLastResult] = ctx.useState("lastResult", null);
  const [draws, setDraws] = ctx.useState("draws", []);
  const [configured, setConfigured] = ctx.useState("configured", false);
  const [apiKey, setApiKey] = ctx.useState("apiKey", "");
  const [savingCfg, setSavingCfg] = ctx.useState("savingCfg", false);
  const [cfgMsg, setCfgMsg] = ctx.useState("cfgMsg", "");
  const [hasInit, setHasInit] = ctx.useState("hasInit", false);
  const [previewItem, setPreviewItem] = ctx.useState("previewItem", null);
  const startDrawsRef = ctx.useRef("startDraws", []);
  const pollTimerRef = ctx.useRef("pollTimer", null);

  // ---- 初始化 ----
  async function init() {
    try {
      const cfg = await callMain(ctx, "sensenova.load_config", "load_config", {});
      setConfigured(!!(cfg && (cfg.configured || cfg.has_key || cfg.has_env_key)));
      if (cfg && cfg.api_key) setApiKey(cfg.api_key);
      const list = await callMain(ctx, "sensenova.list_draws", "list_draws", {});
      const files = list && Array.isArray(list.files) ? list.files : [];
      setDraws(files);
    } catch (e) {
      setErrorMsg("初始化失败: " + getText(e));
    }
  }
  function onLoad() {
    if (!hasInit) {
      setHasInit(true);
      return init();
    }
    return null;
  }

  // ---- 轮询 list_draws，直到出现新文件 ----
  function startPolling() {
    if (pollTimerRef.current) { try { clearTimeout(pollTimerRef.current); } catch (e) {} }
    setPolling(true);
    let ticks = 0;
    function tick() {
      if (!polling && ticks === 0) { /* first */ }
      callMain(ctx, "sensenova.list_draws", "list_draws", {}).then(function (list) {
        const files = list && Array.isArray(list.files) ? list.files : [];
        const startNames = startDrawsRef.current || [];
        // 出现新文件 -> 完成
        const newFiles = files.filter(function (f) {
          return startNames.indexOf(f.name) < 0;
        });
        if (newFiles.length > 0) {
          const top = newFiles[0];
          const uri = top.uri || ("file://" + top.path);
          setResultMd("![生成的图片](" + uri + ")");
          setLastResult({ file_uri: uri, markdown: "![生成的图片](" + uri + ")", file_path: top.path, name: top.name });
          setDraws(files);
          setProgress(100);
          setStatusMsg("生成完成");
          setBusy(false);
          setPolling(false);
          return;
        }
        // 未完成 -> 继续轮询
        ticks += 1;
        const p = Math.min(10 + ticks * 8, 90);
        setProgress(p);
        setStatusMsg("生成中 " + p + "%...（生图约 20-60 秒）");
        if (ticks < 60) {
          pollTimerRef.current = setTimeout(tick, 2500);
        } else {
          setBusy(false);
          setPolling(false);
          setErrorMsg("等待超时，请稍后在「历史」页查看最新图片");
          setProgress(0);
          setStatusMsg("");
        }
      }).catch(function (e) {
        ticks += 1;
        if (ticks < 40) {
          pollTimerRef.current = setTimeout(tick, 2500);
        } else {
          setBusy(false);
          setPolling(false);
          setErrorMsg("轮询失败: " + getText(e));
          setProgress(0);
          setStatusMsg("");
        }
      });
    }
    // 延迟 3 秒后开始轮询（给任务启动时间）
    pollTimerRef.current = setTimeout(tick, 3000);
  }

  // ---- 提交生图/编辑 ----
  async function doGenerate() {
    const p = (prompt || "").trim();
    if (!p) { setErrorMsg("请先输入提示词"); return; }
    setBusy(true);
    setErrorMsg("");
    setStatusMsg("正在提交生成任务...");
    setProgress(5);
    setResultMd("");
    setLastResult(null);
    try {
      // 记录当前已有文件（用于识别新图）
      const pre = await callMain(ctx, "sensenova.list_draws", "list_draws", {});
      const preFiles = pre && Array.isArray(pre.files) ? pre.files : [];
      startDrawsRef.current = preFiles.map(function (f) { return f.name; });
      setDraws(preFiles);
      // 提交后台任务
      const params = { prompt: p };
      if (pickUri) params.image_path = pickUri;
      const r = await callMain(ctx, "sensenova.submit_generate", "submit_generate", params);
      setProgress(8);
      setStatusMsg(pickUri ? "编辑任务已提交..." : "生成任务已提交...");
      startPolling();
    } catch (e) {
      setBusy(false);
      setProgress(0);
      setStatusMsg("");
      setErrorMsg("提交失败: " + getText(e));
    }
  }

  // ---- 添加图片 ----
  async function pickImage() {
    if (!ctx.openFilePicker) { setErrorMsg("当前宿主不支持文件选择器"); return; }
    setErrorMsg("");
    try {
      const picked = await ctx.openFilePicker({
        mimeTypes: ["image/png", "image/jpeg", "image/jpg", "image/webp"],
        allowMultiple: false,
      });
      if (picked && !picked.cancelled && Array.isArray(picked.files) && picked.files.length > 0) {
        const f = picked.files[0];
        setPickUri(f.uri || f.path || "");
        setPickName(f.name || "已选择图片");
      }
    } catch (e) {
      setErrorMsg("选择图片失败: " + getText(e));
    }
  }

  // ---- 发送到聊天 ----
  async function sendCurrent() {
    if (!lastResult || !lastResult.markdown) { setErrorMsg("没有可发送的图片"); return; }
    try {
      await callMain(ctx, "sensenova.send_to_chat", "send_to_chat", { markdown: lastResult.markdown, file_path: lastResult.file_path || "" });
      setStatusMsg("已发送到聊天");
    } catch (e) {
      setErrorMsg("发送失败: " + getText(e));
    }
  }

  // ---- 保存配置 ----
  async function saveCfg() {
    const key = (apiKey || "").trim();
    if (!key) { setCfgMsg("请输入 API Key"); return; }
    setSavingCfg(true);
    setCfgMsg("");
    try {
      const r = await callMain(ctx, "sensenova.save_config", "save_config", { api_key: key });
      setConfigured(true);
      setCfgMsg("已保存，API Key 配置成功");
    } catch (e) {
      setCfgMsg("保存失败: " + getText(e));
    } finally {
      setSavingCfg(false);
    }
  }

  // ---- 打开历史图片（历史页内预览大图）----
  function openDraw(item) {
    if (!item) return;
    setPreviewItem(item);
  }
  // ---- 发送历史预览图片到聊天 ----
  async function sendPreview(item) {
    if (!item) return;
    try {
      const uri = item.uri || ("file://" + item.path);
      await callMain(ctx, "sensenova.send_to_chat", "send_to_chat", { markdown: "![图片](" + uri + ")", file_path: item.path || "" });
      setStatusMsg("已发送到聊天");
    } catch (e) {
      setErrorMsg("发送失败: " + getText(e));
    }
  }

  // ---- UI 组装 ----
  const title = ctx.UI.Text({ text: "商汤生图", style: "titleMedium", fontWeight: "bold", padding: { horizontal: 12 } });
  const tabBar = ctx.UI.Row({ fillMaxWidth: true, spacing: 4, padding: { horizontal: 12 }, horizontalArrangement: "spaceEvenly" }, [
    ctx.UI.TextButton({ text: "生图", enabled: tab !== "gen", onClick: function () { setTab("gen"); } }),
    ctx.UI.TextButton({ text: "历史", enabled: tab !== "history", onClick: function () { setTab("history"); } }),
    ctx.UI.TextButton({ text: "设置", enabled: tab !== "settings", onClick: function () { setTab("settings"); } }),
  ]);

  let body = null;
  if (tab === "gen") {
    const promptField = ctx.UI.TextField({
      fillMaxWidth: true,
      label: "输入想要生成的图片描述",
      placeholder: "例如：一只橘猫在窗台上晒太阳，电影光",
      value: prompt,
      onValueChange: function (v) { setPrompt(v); },
      minLines: 3,
      maxLines: 6,
    });
    const pickRow = ctx.UI.Row({ fillMaxWidth: true, spacing: 8, verticalAlignment: "center" }, [
      ctx.UI.OutlinedButton({ text: pickName || "添加图片（可选，图生图）", onClick: function () { return pickImage(); }, fillMaxWidth: true }),
    ]);
    const progressBlock = busy
      ? ctx.UI.Column({ fillMaxWidth: true, spacing: 6, padding: { vertical: 8 } }, [
          ctx.UI.LinearProgressIndicator({ progress: progress / 100, fillMaxWidth: true }),
          ctx.UI.Text({ text: statusMsg || ("生成中 " + progress + "%..."), style: "bodySmall", color: "onSurfaceVariant" }),
        ])
      : null;
    const errBlock = errorMsg
      ? ctx.UI.Text({ text: errorMsg, style: "bodySmall", color: "#C62828", fillMaxWidth: true })
      : null;
    const previewBlock = resultMd
      ? ctx.UI.Card({ fillMaxWidth: true, padding: 8 }, [
          ctx.UI.Markdown({ text: resultMd, fillMaxWidth: true }),
          ctx.UI.Row({ fillMaxWidth: true, spacing: 8, padding: { top: 8 } }, [
            ctx.UI.OutlinedButton({ text: "发送到聊天", onClick: function () { return sendCurrent(); } }),
            ctx.UI.TextButton({ text: "清空", onClick: function () { setResultMd(""); setLastResult(null); setPickUri(""); setPickName(""); } }),
          ]),
        ])
      : null;
    body = ctx.UI.Column({ fillMaxWidth: true, spacing: 10, padding: { horizontal: 12, vertical: 8 } }, [
      promptField,
      pickRow,
      progressBlock,
      errBlock,
      ctx.UI.Button({ text: busy ? "生成中..." : "开始生成", enabled: !busy, onClick: function () { return doGenerate(); }, fillMaxWidth: true }),
      previewBlock,
    ]);
  } else if (tab === "history") {
    // 预览大图（点击历史项后显示）
    const previewBlock = previewItem
      ? ctx.UI.Card({ fillMaxWidth: true, padding: 8 }, [
          ctx.UI.Text({ text: previewItem.name || "图片", style: "titleSmall", fontWeight: "bold" }),
          ctx.UI.Markdown({ text: previewItem.uri ? "![图片](" + previewItem.uri + ")" : "![图片](file://" + (previewItem.path || "") + ")", fillMaxWidth: true }),
          ctx.UI.Row({ fillMaxWidth: true, spacing: 8, padding: { top: 8 } }, [
            ctx.UI.OutlinedButton({ text: "发送到聊天", onClick: function () { return sendPreview(previewItem); } }),
            ctx.UI.TextButton({ text: "关闭", onClick: function () { setPreviewItem(null); } }),
          ]),
        ])
      : null;
    const items = draws.length > 0
      ? draws.map(function (item) {
          return ctx.UI.Row({
            fillMaxWidth: true,
            padding: { horizontal: 12, vertical: 10 },
            background: previewItem && previewItem.path === item.path ? "primaryContainer" : "surfaceVariant",
            backgroundShape: { type: "rounded", cornerRadius: 12 },
            verticalAlignment: "center",
            onClick: function () { openDraw(item); },
          }, [
            ctx.UI.Column({ weight: 1, spacing: 1 }, [
              ctx.UI.Text({ text: item.name || "图片", style: "bodyMedium", fontWeight: "semiBold", maxLines: 1 }),
              ctx.UI.Text({ text: item.path || "", style: "bodySmall", color: "onSurfaceVariant", maxLines: 1 }),
            ]),
            ctx.UI.Icon({ name: "chevron_right", tint: "onSurfaceVariant", size: 18 }),
          ]);
        })
      : [ctx.UI.Text({ text: "还没有生成记录", style: "bodyMedium", color: "onSurfaceVariant", padding: { vertical: 12 } })];
    body = ctx.UI.Column({ fillMaxWidth: true, spacing: 8, padding: { horizontal: 12 } }, [previewBlock, ctx.UI.Column({ spacing: 8 }, items)]);
  } else {
    const keyField = ctx.UI.TextField({
      fillMaxWidth: true,
      label: "商汤 SenseNova API Key",
      placeholder: "sk-...",
      value: apiKey,
      onValueChange: function (v) { setApiKey(v); },
    });
    const cfgStatus = ctx.UI.Text({
      text: configured ? "已配置 API Key" : "未配置 API Key",
      style: "bodyMedium",
      color: configured ? "#2E7D32" : "#C62828",
      fillMaxWidth: true,
    });
    const cfgMsgBlock = cfgMsg ? ctx.UI.Text({ text: cfgMsg, style: "bodySmall", color: "#2E7D32" }) : null;
    body = ctx.UI.Column({ fillMaxWidth: true, spacing: 10, padding: { horizontal: 12, vertical: 8 } }, [
      cfgStatus,
      keyField,
      ctx.UI.Button({ text: savingCfg ? "保存中..." : "保存配置", enabled: !savingCfg, onClick: function () { return saveCfg(); }, fillMaxWidth: true }),
      cfgMsgBlock,
      ctx.UI.Text({ text: "图片将保存在插件配置目录 draws/ 下，可在「历史」页查看。", style: "bodySmall", color: "onSurfaceVariant" }),
    ]);
  }

  const kids = [title, tabBar, body];
  return ctx.UI.Column({ key: "sn_v10", fillMaxWidth: true, spacing: 8, padding: { vertical: 12 }, onLoad: onLoad }, kids);
}Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Screen;
