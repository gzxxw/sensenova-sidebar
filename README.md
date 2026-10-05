# 商汤生图侧边栏插件 (SenseNova Draw Sidebar)

一个 Operit 平台侧边栏插件：配置商汤 SenseNova API Key 后，可在侧边栏通过文字生成图片、对本地图片进行 AI 编辑，生成结果支持进度条显示、页面内预览。

## 功能

- 🎨 **文生图**：输入提示词，调用商汤 SenseNova `sensenova-u1.5-lite` 生成图片
- 🖌 **图生图编辑**：添加本地图片 + 编辑指令，AI 按指令修改图片
- ⏳ **进度条**：生成过程显示进度（不是一直转圈）
- 🖼 **预览**：生成/编辑完成后直接在页面内显示图片
- 🔑 **API Key 配置**：存于插件本地 `config.json`（不会上传）

## 架构

采用 Operit 官方推荐的 **薄 Compose 壳 + WebView + 本地服务** 架构，突破 compose_dsl 15 秒 action 窗口限制：

```
侧边栏入口 → Compose 薄壳 → 启动本地 Python 服务（幂等）
                            → WebView 加载 http://127.0.0.1:8899/
                            → HTML 页面（提示词/添加图片/进度条/预览）
                            → Python 服务调商汤 API（不受 15 秒限制，带自动重试）
```

## 目录结构

```
com.operit.sensenova_sidebar/
├── manifest.json              # ToolPkg 清单
├── server.py                  # 本地 Python 服务（调商汤 API + 出图）
├── src/
│   ├── main.ts                # 主入口（注册侧边栏 + UI 路由 + IPC）
│   ├── packages/
│   │   └── sensenova_sidebar.ts  # 子包工具（7 个）
│   ├── shared/
│   │   └── sensenova_core.js     # 核心逻辑（IPC 通道 + 生图/编辑）
│   └── ui/
│       └── sensenova_sidebar/
│           └── index.ui.ts       # Compose 薄壳（WebView 加载）
└── dist/                      # 编译产物
```

## 工具清单（7 个）

| 工具 | 说明 |
|---|---|
| `generate_image` | 文生图 |
| `edit_image` | 图生图编辑 |
| `save_config` / `load_config` | API Key 配置读写 |
| `list_draws` | 历史图片列表 |
| `send_to_chat` | 发送图片到聊天 |
| `start_service` | 启动/检查本地服务（幂等） |

## 配置

在 Operit 设置（或 AI 对话）中配置商汤 API Key：

- 获取地址：https://platform.sensenova.cn/token-plan
- 保存位置：`/sdcard/Download/Operit/plugins/draw/sensenova_sidebar/config.json`
- 图片输出：`/sdcard/Download/Operit/plugins/draw/sensenova_sidebar/draws/`

## 开发

```bash
# 编译（TS → dist）
# 检查语法
node --check dist/main.js
node --check dist/packages/sensenova_sidebar.js
node --check dist/ui/sensenova_sidebar/index.ui.js

# 启动本地服务（调试）
python3 server.py 8899
```

## 安全

- API Key 只存在本地 `config.json`（已加入 .gitignore，绝不提交）
- 服务只绑定 `127.0.0.1`，不对外网开放
