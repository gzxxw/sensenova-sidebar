# 商汤生图侧边栏插件 (SenseNova Draw Sidebar)

一个 Operit 平台侧边栏插件：配置商汤 SenseNova API Key 后，可在侧边栏通过文字生成图片、对本地图片进行 AI 编辑，生成结果支持后台任务、进度显示、历史预览与一键发送到聊天。

> **纯 JS 架构，无 Python / 无本地服务 / 无固定路径依赖** —— 换手机、装给其他人都能用，可直接打包上传 Operit 插件市场。

## 功能

- 🎨 **文生图**：输入提示词，调用商汤 SenseNova `sensenova-u1.5-lite` 生成图片
- 🖌 **图生图编辑**：选择本地图片 + 编辑指令，AI 按指令修改图片
- ⏳ **后台任务**：提交后立即返回（突破 15 秒限制），切到对话界面也持续生成
- 🔁 **429 自动重试**：遇到限流自动等待重试（20/40/60 秒），不用手动重发
- 🖼 **历史预览**：历史列表点击即可预览大图，可一键发送到聊天
- 🔑 **API Key 配置**：存于插件本地 `config.json`（不会上传）

## 架构

采用 Operit 官方推荐的 **纯 Compose UI + IPC 后台任务** 架构：

```
侧边栏入口 → Compose UI（生图/历史/设置 三页签）
                 ↓ ToolPkg.ipc（main 上下文，跟 Operit 进程同生共死）
            main 上下文后台任务（提交后 fire-and-forget，切走界面不中断）
                 ↓ OkHttp 直调商汤 API（带 429 自动重试）
            本地 draws/ 目录 → 轮询 list_draws 出图即预览
```

关键设计：
- **后台任务跑在 `main` 上下文**（官方文档 3.2.5 规定：可跨 UI/子包共享且持续运行的逻辑放 main，用 `ToolPkg.ipc` 访问）——这是"切走界面仍继续生成"的关键。
- **不依赖 WebView / 本地服务 / 固定路径**，任何手机装上可用。

## 目录结构

```
com.operit.sensenova_sidebar/
├── manifest.json                      # ToolPkg 清单
├── dist/
│   ├── main.js                        # 主入口（注册侧边栏 + UI 路由 + IPC）
│   ├── packages/
│   │   └── sensenova_sidebar.js       # 子包工具（8 个）
│   ├── shared/
│   │   └── sensenova_core.js          # 核心逻辑（IPC 通道 + 生图/编辑 + 重试）
│   └── ui/
│       └── sensenova_sidebar/
│           └── index.ui.js            # Compose UI（生图/历史/设置）
├── package.json
├── tsconfig.json
└── README.md
```

## 工具清单（8 个）

| 工具 | 说明 |
|---|---|
| `generate_image` | 文生图 |
| `edit_image` | 图生图编辑 |
| `save_config` / `load_config` | API Key 配置读写 |
| `list_draws` | 历史图片列表 |
| `send_to_chat` | 发送图片到聊天 |
| `submit_generate` | 提交后台生图/编辑任务（秒回 task_id） |
| `task_status` | 查询后台任务状态 |

## 打包 / 烧录

```bash
# 审查源码
node --check dist/main.js
node --check dist/packages/sensenova_sidebar.js
node --check dist/shared/sensenova_core.js
node --check dist/ui/sensenova_sidebar/index.ui.js

# 打包 .toolpkg
python3 -c "import zipfile,os; z=zipfile.ZipFile('sensenova_sidebar.toolpkg','w',zipfile.ZIP_DEFLATED); [z.write(os.path.join(r,f),os.path.relpath(os.path.join(r,f),'.')) for r,ds,fs in os.walk('.') for f in fs if '.git' not in r]; z.close()"
```

## 配置

在插件的「设置」页配置商汤 API Key：

- 获取地址：https://platform.sensenova.cn/token-plan
- 保存位置：`/sdcard/Download/Operit/plugins/draw/sensenova_sidebar/config.json`
- 图片输出：`/sdcard/Download/Operit/plugins/draw/sensenova_sidebar/draws/`

## 安全

- API Key 只存在本地 `config.json`（已加入 .gitignore，绝不提交）
- 插件为纯 JS，不启动任何本地网络服务
- 无 server.py、无固定路径依赖，换机/市场用户开箱即用
