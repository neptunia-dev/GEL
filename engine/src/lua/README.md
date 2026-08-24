# GEL Lua 场景语言

GEL 不重新设计 Lua 语法，而是定义一套面向 Galgame 场景的宿主 API。
Lua 代码负责剧情逻辑，宿主负责状态、输入和表现适配。Lua 脚本不依赖
TUI、Blessed 或任何图形渲染器。

## 目录职责

```text
src/lua/
├─ api/
│  ├─ implementations/ # 各命名空间 API 类
│  └─ registry/        # API 注册器和 API 清单
├─ protocol/  # 请求、响应、表现命令和校验
├─ runtime/   # VM、协程和脚本加载
├─ values/    # Lua 可序列化值及转换
├─ sandbox/   # 标准库和指令限制
└─ errors/    # Lua 错误和 traceback
```

`api/` 的开发约定：一个 Lua 命名空间对应一个 `LuaApi` 子类。类的构造
函数用 `expose()` 自注册方法；不要在 `context.ts` 里重复维护方法列表。
核心类只在 `registry/core-api-catalog.ts` 集中列出一次，开发期扩展类则由
`registry/development-api-catalog.ts` 统一组装。

## 开发期新增 API

每个命名空间使用一个 `LuaApi` 子类。API 方法在构造函数里通过
`expose()` 自注册，错误包装和 Lua 函数挂载由基类与注册器统一完成：

```ts
class DebugApi extends LuaApi {
  public readonly namespace = "debug";
  public readonly capability = "debug";

  public constructor(host: LuaApiHost) {
    super(host);
    this.expose("mark", "sync", this.mark);
  }

  private mark(state: LuaState): number {
    // 参数解析和业务逻辑只写在这里
    return 0;
  }
}
```

开发期扩展只需要写这个类并提供一个 factory，不需要修改 `context.ts` 或
注册器：

```ts
const runtime = new LuaRuntime();
runtime.run(source, handler, {
  apiFactories: [(host) => new DebugApi(host)]
});
```

所有 API 错误都会统一带上调用路径、错误码和可读消息，例如：

```text
ctx.stage.show: options.side must be 'left' or 'right' [E_ARGUMENT]
```

## 脚本入口

每个场景脚本返回一个接收 `ctx` 的函数：

```lua
return function(ctx)
  -- 场景逻辑
  return ctx.flow:exit("next")
end
```

场景 ID、角色表和出口表属于 `SceneDefinition`，由引擎在创建 runtime
时传入并校验。

## 上下文 API

### `ctx.stage`

舞台变化是显式的。台词不会自动让角色登场，也不会自动改变角色位置。

```lua
ctx.stage:show("alice", {
  side = "left",
  expression = "smile",
  role = "同班同学"
})
ctx.stage:move("alice", "right")
ctx.stage:focus("alice")
ctx.stage:focus(nil) -- 取消聚焦
ctx.stage:hide("alice")
```

`show` 的 `side` 只能是 `left` 或 `right`。如果 runtime 提供了场景角色
表，未声明的角色会在 Lua 边界被拒绝。

### `ctx.dialogue`

台词请求会暂停 Lua 协程，宿主显示内容后再恢复协程。

```lua
ctx.dialogue:say("alice", "今天一起回家吗？")
ctx.dialogue:monologue("我该怎么回答？")
ctx.dialogue:narrate("走廊重新安静下来。")
ctx.dialogue:offscreen("bob", "我在这里。")

local answer = ctx.dialogue:choice({
  { id = "accept", text = "一起回家" },
  { id = "decline", text = "还有事情", enabled = false }
})
```

台词协议中的 `mode` 有四种：`character`、`monologue`、`narration` 和
`offscreen`。选项 ID 必须非空且不能重复；宿主只能回复一个启用中的
选项 ID。

### `ctx.state`

剧情变量只接受可序列化值：`nil`、布尔值、有限数字、字符串、数组和
对象表。建议使用带领域前缀的键名：

```lua
ctx.state:set("route.alice.seen", true)
ctx.state:add("affection.alice", 1)
local score = ctx.state:get("score", 0)
if ctx.state:has("flags.intro") then
  ctx.state:remove("flags.intro")
end
```

### `ctx.time`

等待请求会暂停协程，由宿主决定真实时间或开发模式下的立即确认：

```lua
ctx.time:wait(0.5)
```

### `ctx.flow`

场景只返回出口结果，不直接跳转其他场景。实际路线由场景路由表解析：

```lua
return ctx.flow:exit("accept")
-- 或
return ctx.flow:end_story()
```

## 宿主协议

`stage` 方法产生非阻塞的 `LuaPresentationCommand`，由宿主通过
`onPresentation` 接收。`dialogue`、`choice` 和 `wait` 产生 `LuaRequest`，
由 `LuaRuntime.run` 的 handler 回复：

```ts
const result = await runtime.run(source, async (request) => {
  // TUI 或图形渲染器处理 request
  return request.type === "choice" ? selectedOptionId : undefined;
}, {
  characterIds: ["alice", "bob"],
  exits: ["accept", "decline"],
  onPresentation: (event) => presentation.apply(event.command)
});
```

对话和等待请求只能收到 `undefined` 或 `null`；选项请求必须收到当前
启用选项的字符串 ID。runtime 会在恢复 Lua 前校验回复。

## 沙箱

默认保留 `table`、`string`、`math` 和 `utf8` 库。文件、进程、模块加载、
调试和动态代码加载相关的全局对象会被移除。可以通过
`sandbox.instructionLimit` 设置每个协程的指令上限。

后续如果需要公共 Lua 库，应由游戏包提供受控模块解析器，而不是重新开放
任意文件系统访问。
