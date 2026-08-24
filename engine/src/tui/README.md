# TUI 原型

当前 TUI 使用 `blessed`，负责开发阶段的终端显示、键盘交互和 Lua 场景
快速体验。它不执行跨 Scene 路由，场景结束后由调用方决定下一步。

## 启动演示

在 `engine` 目录执行：

```text
npm run tui:demo
```

直接运行 Lua 场景：

```text
npm run tui:play -- ..\test_game\dist.lua
```

`TuiLuaApp` 会读取 Lua 文件，使用 `LuaRuntime` 执行；Enter/Space 确认
台词和等待，方向键移动选项，B/Backspace 回退显示，Q 退出。Lua 发出的
`stage.*` 命令会应用到当前 TUI 舞台，`dialogue`、`choice` 和 `wait` 请求
会等待真实键盘输入。

按键：

```text
Enter / Space       推进演示帧
Up / Down           移动选项焦点
B / Backspace       回退到上一帧显示
Q / Ctrl-C          退出
```

演示包含以下状态：

- Alice 单独在左侧登场
- Alice 和 Bob 同时登场
- 没有说话人的独白
- 角色下场后的旁白
- 角色显式登场、下场、聚焦和回退

`TuiSession` 保存领域状态，`BlessedRenderer` 只负责把状态绘制到终端。
当前回退只恢复内存中的 TUI 视图，尚未回退 Lua 协程或剧情变量。

## 打包当前剧情

在 `engine` 目录执行：

```text
npm run package:story
```

该命令会把 `test_game/dist.lua`、Lua runtime、TUI 和终端描述数据一起嵌入
Node SEA，生成 `test_game/GELStory.exe`。成品可直接启动，不读取外部 Lua，
也不要求目标机器安装 Node.js 或 Lua。

需要指定其他剧本或输出路径时，可以直接调用构建脚本：

```text
node ../tools/build-exe.mjs --source ../game/story.lua --output ../game/Story.exe --title "Story"
```
