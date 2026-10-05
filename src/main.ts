// 商汤生图 - ToolPkg 主入口
// 注册侧边栏入口 + UI 路由
// screen 必须传可序列化的字符串引用（包内 UI 脚本路径），不能传函数对象

export function registerToolPkg(): boolean {
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