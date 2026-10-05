"use strict";
// 商汤生图 - ToolPkg 主入口
// 注册侧边栏入口 + UI 路由；IPC 必须在模块加载时注册（官方 plan_mode 同款）

const sensenovaCore = require("./shared/sensenova_core.js");

// 顶层注册 IPC（关键：不能在 registerToolPkg 里注册，宿主在注册阶段不可用 IPC）
sensenovaCore.registerIpc();

function registerToolPkg() {
  ToolPkg.registerUiRoute({
    id: "sensenova_draw",
    route: "toolpkg:com.operit.sensenova_sidebar:ui:sensenova_draw",
    runtime: "compose_dsl",
    screen: "dist/ui/sensenova_sidebar/index.ui.js",
    title: {
      zh: "商汤生图",
      en: "SenseNova Draw",
    },
  });

  ToolPkg.registerNavigationEntry({
    id: "sensenova_draw_sidebar",
    route: "toolpkg:com.operit.sensenova_sidebar:ui:sensenova_draw",
    surface: "main_sidebar_plugins",
    title: {
      zh: "商汤生图",
      en: "SenseNova Draw",
    },
    icon: "palette",
    order: 1,
  });

  return true;
}

module.exports = { registerToolPkg };
