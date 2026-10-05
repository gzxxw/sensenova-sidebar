/// <reference path="../../types/index.d.ts" />
// SenseNova 生图 UI v8 - 薄壳 + WebView，IPC 双通道 + 防御性加载
// 服务启动：优先 ToolPkg.ipc，失败回退 ctx.callTool，再失败也直接加载 WebView（服务可能已在跑）

const SERVICE_PORT = 8899;
const SERVICE_URL = "http://127.0.0.1:" + SERVICE_PORT + "/";

function Screen(ctx) {
  const [state, setState] = ctx.useState("state", "checking"); // checking|ready|error
  const [msg, setMsg] = ctx.useState("msg", "正在检查本地服务...");
  const [reloadKey, setReloadKey] = ctx.useState("reloadKey", 0);

  // IPC 双通道调用
  function ipcCall(channel, payload) {
    const params = payload === undefined ? {} : payload;
    try {
      if (typeof ToolPkg !== "undefined" && ToolPkg.ipc && typeof ToolPkg.ipc.call === "function") {
        return ToolPkg.ipc.call(channel, params);
      }
    } catch (e) { console.warn("ipc fallback:", channel, String(e && e.message || e)); }
    return ctx.callTool("sensenova_sidebar:" + channel.replace("sensenova.", ""), params);
  }

  // 启动服务（幂等：已在跑就返回 ok）
  async function ensureServer() {
    setState("checking");
    setMsg("正在启动本地服务...");
    try {
      const r = await ipcCall("sensenova.start_service", { port: SERVICE_PORT });
      const d = r && r.data ? r.data : r;
      if (d && d.ok) {
        setState("ready");
        setMsg("");
        return;
      }
      // 启动调用失败，但服务可能已在跑：直接尝试加载 WebView，由 onReceivedError 兜底
      setMsg("服务启动接口未确认，尝试直接加载...");
      setState("ready");
    } catch (e) {
      // 调用异常：也直接尝试加载 WebView（服务可能已在跑），失败由 onReceivedError 兜底
      console.warn("ensureServer error:", String(e && e.message || e));
      setMsg("服务启动接口异常，尝试直接加载...");
      setState("ready");
    }
  }

  function onLoad() {
    return ensureServer();
  }

  let body = null;
  if (state === "checking") {
    body = ctx.UI.Row({
      fillMaxWidth: true, padding: 24, spacing: 10,
      verticalAlignment: "center", horizontalArrangement: "center",
    }, [
      ctx.UI.CircularProgressIndicator({ width: 28, height: 28, strokeWidth: 3, color: "primary" }),
      ctx.UI.Text({ text: msg, style: "bodyMedium" }),
    ]);
  } else if (state === "error") {
    body = ctx.UI.Column({ fillMaxWidth: true, padding: 24, spacing: 12 }, [
      ctx.UI.Text({ text: msg, style: "bodyMedium", color: "#C62828" }),
      ctx.UI.Button({ text: "重试", onClick: function () { return ensureServer(); }, fillMaxWidth: true }),
    ]);
  } else {
    body = ctx.UI.WebView({
      key: "webview_" + reloadKey,
      url: SERVICE_URL,
      fillMaxWidth: true,
      javaScriptEnabled: true,
      domStorageEnabled: true,
      useWideViewPort: true,
      onPageStarted: function () { },
      onReceivedError: function (e) {
        // WebView 加载失败：给一次重试机会
        setState("error");
        setMsg("页面加载失败，请检查服务是否在运行");
      },
    });
  }

  const kids = [];
  kids.push(ctx.UI.Text({ text: "商汤生图", style: "titleMedium", fontWeight: "bold", padding: { horizontal: 12 } }));
  kids.push(body);
  return ctx.UI.Column({ key: "sn_v8", fillMaxWidth: true, spacing: 8, padding: { vertical: 12 }, onLoad: onLoad }, kids);
}

exports.default = Screen;